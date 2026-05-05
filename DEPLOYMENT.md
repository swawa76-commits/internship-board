# Deployment Guide

How to take the Internship Job Board (V1) from a local checkout to a working production deploy.

This guide assumes:

- **Vercel** for the Next.js app
- A **managed PostgreSQL** provider (Neon and Supabase are both fine; the project already runs against Neon in development)
- Production migrations via `prisma migrate deploy`

If you're new to the codebase, read [`README.md`](README.md) first for the local development flow.

---

## 1. Provision Postgres

1. Create a production database on your provider (Neon, Supabase, RDS, Railway, etc.).
2. Capture the **pooled** connection string for the app (`DATABASE_URL`).
   - Neon: use the "Pooled connection" string with `?sslmode=require`.
   - Supabase: use the connection-pooler URL (port `6543`) for the runtime; use the direct URL (port `5432`) only for migrations if your provider requires it.
3. Make sure the role the app uses has `CREATE`/`SELECT`/`INSERT`/`UPDATE`/`DELETE` on the public schema. Migrations also need `CREATE` on schema and types (the activity-event enum migration calls `ALTER TYPE ... ADD VALUE`).

---

## 2. Configure Vercel environment variables

In **Vercel → Project → Settings → Environment Variables**, set the following for the **Production** environment (and Preview if you want preview deploys to work end-to-end):

### Required

| Variable       | Value                                                                                                                                     |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL` | Production Postgres connection string (with `sslmode=require`)                                                                            |
| `AUTH_SECRET`  | A fresh secret, **different** from any dev value. Generate: `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"` |
| `AUTH_URL`     | The canonical production URL, e.g. `https://your-app.vercel.app`. Auth.js v5 warns if this is unset in production.                        |

### Storage adapter (recommended for production)

The S3 adapter uses `@aws-sdk/client-s3` and works against any S3-compatible
backend — AWS S3, Cloudflare R2, MinIO, etc. Required env vars are the same
across providers; the optional `S3_ENDPOINT` overrides the SDK's default
regional endpoint.

| Variable                    | Value                                                                                                                                                     |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `STORAGE_DRIVER`            | `s3`                                                                                                                                                      |
| `S3_BUCKET`                 | Bucket name, e.g. `internshipboard-uploads`                                                                                                               |
| `S3_REGION`                 | AWS region, e.g. `us-east-1`. For R2 use `auto`.                                                                                                          |
| `S3_ACCESS_KEY_ID`          | Access key with `s3:Put/Get/Delete/ListObject` on that bucket                                                                                             |
| `S3_SECRET_ACCESS_KEY`      | Secret access key                                                                                                                                         |
| `S3_SIGNED_URL_TTL_SECONDS` | Optional, defaults to `300` (5 min). Read URLs returned by the redirect branch live for this many seconds.                                                |
| `S3_ENDPOINT`               | Optional. **Required for Cloudflare R2.** Omit for AWS S3.                                                                                                |
| `S3_FORCE_PATH_STYLE`       | Optional, defaults to `false`. Set to `true` only if your provider needs path-style URLs (older MinIO, some self-hosted gateways). R2 does not need this. |

#### Cloudflare R2 setup

1. **Create the bucket.** In the Cloudflare dashboard → **R2** → **Create bucket**. Name it whatever the deploy uses (e.g. `internshipboard-uploads`). Keep public access **off** — the app generates short-lived presigned URLs at read time.
2. **Find your account-scoped endpoint.** R2 → **Manage R2 API Tokens** shows a "S3 API" endpoint of the form `https://<accountid>.r2.cloudflarestorage.com`. This is `S3_ENDPOINT`.
3. **Create an API token** with **Object Read & Write** scoped to that bucket. Capture the access key ID and secret access key — these are `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY`.
4. **Set env vars** on Vercel:
   ```
   STORAGE_DRIVER=s3
   S3_BUCKET=internshipboard-uploads
   S3_REGION=auto
   S3_ENDPOINT=https://<accountid>.r2.cloudflarestorage.com
   S3_ACCESS_KEY_ID=...
   S3_SECRET_ACCESS_KEY=...
   ```
5. **Optional smoke check.** With the same env loaded locally, run the gated R2 round-trip test:
   ```
   R2_TEST_BUCKET=$S3_BUCKET R2_TEST_REGION=$S3_REGION \
   R2_TEST_ENDPOINT=$S3_ENDPOINT \
   R2_TEST_ACCESS_KEY_ID=$S3_ACCESS_KEY_ID \
   R2_TEST_SECRET_ACCESS_KEY=$S3_SECRET_ACCESS_KEY \
   npm run test:integration -- r2-storage
   ```
   The test is skipped when these vars are absent, so day-to-day CI runs without R2 access never touch the network.

### Email adapter

| Variable         | Value                                                                                                  |
| ---------------- | ------------------------------------------------------------------------------------------------------ |
| `EMAIL_DRIVER`   | `resend` for production. `console` (the dev default) just logs to stdout and is unsafe for production. |
| `RESEND_API_KEY` | Required when `EMAIL_DRIVER=resend`. Generate at <https://resend.com/api-keys>.                        |
| `EMAIL_FROM`     | Required when `EMAIL_DRIVER=resend`. Bare address or `"Display Name <addr@domain>"`.                   |
| `EMAIL_REPLY_TO` | Optional. Single Reply-To address applied to every outbound message.                                   |

#### Resend setup

1. **Create a Resend account** at <https://resend.com> and add the domain you'll send from (e.g. `mail.yourdomain.com` as a subdomain so it's isolated from your apex MX).
2. **Verify the domain.** Resend prints SPF, DKIM, and (optionally) DMARC records. Add them at your DNS provider; verification typically completes within a few minutes. Production sends from an unverified domain will be rejected.
3. **Generate an API key** with **Sending access** scoped to that domain (`Restrict to the verified domain` in the Resend UI). This is `RESEND_API_KEY`.
4. **Pick a sender address.** Anything `@yourdomain.com` works once the domain is verified; using a no-reply alias such as `alerts@yourdomain.com` is conventional.
5. **Set env vars** on Vercel:
   ```
   EMAIL_DRIVER=resend
   RESEND_API_KEY=re_...
   EMAIL_FROM=InternshipBoard <alerts@yourdomain.com>
   # optional
   EMAIL_REPLY_TO=support@yourdomain.com
   ```
6. **Boot-time validation.** Setting `EMAIL_DRIVER=resend` without both `RESEND_API_KEY` and `EMAIL_FROM` will crash the app on import — by design, so a misconfigured deploy fails fast rather than silently dropping every notification. Roll back to `EMAIL_DRIVER=console` if you need to defer the migration.
7. **Failure semantics.** Provider-side failures (rate limits, validation errors) never roll back the primary mutation. `dispatchEmail` wraps every send in a try/catch and absorbs both `{ ok: false }` results and unexpected SDK throws — signups, applications, status changes, and messages all commit even if Resend is down.

#### Smoke test the live integration

Before flipping `EMAIL_DRIVER=resend` in Vercel production, send exactly one real test email from a workstation using the same env vars:

```bash
# Either export the vars in your shell:
export RESEND_API_KEY=re_...
export EMAIL_FROM='InternshipBoard <alerts@yourdomain.com>'
export SMOKE_EMAIL_TO=you@example.com
npm run smoke:email

# Or load them from a file with your preferred loader, e.g.:
#   set -a; source .env.production; set +a; npm run smoke:email
#   tsx --env-file=.env.production scripts/smoke-email.ts
#   dotenv -e .env.production -- npm run smoke:email
```

The script:

- Refuses to run unless `SMOKE_EMAIL_TO` is set.
- Sends exactly one plain-text message via the production `ResendEmailAdapter`.
- Bypasses `dispatchEmail`'s absorption wrapper on purpose so a `{ ok: false }` from Resend or an SDK throw exits non-zero — useful for chaining into a deploy gate (`npm run smoke:email && deploy`).
- Never prints `RESEND_API_KEY`, the raw `EMAIL_FROM` value, the message body, or the full recipient address (the recipient is partially masked in stdout).

If the recipient receives the test message and the script exits `0`, the integration is wired correctly. Domain-verification mistakes are the most common Resend onboarding failure — they only surface against the live API.

`NODE_ENV` is set to `production` automatically by Vercel during builds and at runtime. Do not override it manually.

---

## 3. Deploy the app

The first push to your production branch (typically `main`) triggers a Vercel build. Two notes:

- **`prisma generate` runs at install time.** The `postinstall` script in `package.json` regenerates the typed client into `lib/db/generated` after every `npm install`, so Vercel always has it before `next build` starts. The generated directory is git-ignored and is recreated on every install rather than committed.
- **The build step does NOT run migrations.** `prisma generate` only emits the typed client from `schema.prisma` — it makes no network call and never touches the database. Production migrations remain manual: run `npm run db:migrate:deploy` from a workstation or CI step with the production `DATABASE_URL` exported. See §4 below.
- The Vercel build will **fail loudly** if `STORAGE_DRIVER` is set to an unknown value in production. This is intentional — see "Failure modes" below.

Once the build succeeds, Vercel promotes the deployment to the production URL.

---

## 4. Apply migrations to production

Run migrations from a workstation (or a CI step) that has `DATABASE_URL` pointed at production. **Use `migrate deploy`, not `migrate dev`.**

```bash
# Authoritative production migration command:
npx prisma migrate deploy

# Or via the project script:
npm run db:migrate:deploy
```

`migrate deploy`:

- Applies any pending migrations in order
- Never opens a shadow database (safe against managed Postgres)
- Never tries to generate a new migration

After `migrate deploy` succeeds, run a quick smoke check:

```bash
# Confirm the schema is current and the app can boot.
npx prisma migrate status
```

---

## 5. Seed (or don't)

The dev seed in [`prisma/seed.ts`](prisma/seed.ts) is **for local development and demos only.** It creates fake users with a shared password (`Password123!`) and demo content. **Do not run `npm run db:seed` against production.**

For production:

- Create the first ADMIN user with `npm run admin:create` (see below).
- Companies and students self-register through the regular signup flow.

If you genuinely need demo data in a non-prod environment (staging), point `DATABASE_URL` at the staging DB and run the seed there.

### Production preflight check

The script in [`scripts/preflight-production.ts`](scripts/preflight-production.ts) is a read-only operator tool that checks whether the app is ready to run in production. Run it from a workstation (or a CI step) with the same env you'll set in Vercel:

```bash
npm run preflight:prod
```

**What it checks (read-only):**

- Required env vars: `DATABASE_URL`, `AUTH_SECRET`, `AUTH_URL`, `STORAGE_DRIVER`, `EMAIL_DRIVER`.
- `AUTH_SECRET` length ≥ 32 (security/config hygiene).
- `AUTH_URL` is a valid URL. Fatal if it uses `http:` while `NODE_ENV=production`; warning otherwise (e.g. local dev behind a TLS-terminating proxy).
- `STORAGE_DRIVER=s3` branch: `S3_BUCKET`, `S3_REGION`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` all set; optional `S3_SIGNED_URL_TTL_SECONDS` parses as a positive integer; warns if `S3_REGION=auto` but `S3_ENDPOINT` is unset (R2 needs a custom endpoint).
- `STORAGE_DRIVER=local` in production: warning (uploads are ephemeral on serverless platforms).
- `EMAIL_DRIVER=resend` branch: `RESEND_API_KEY` and `EMAIL_FROM` set; `EMAIL_FROM` parses as bare or RFC-2822 `Display Name <addr@host>`; optional `EMAIL_REPLY_TO` parses as bare email.
- `EMAIL_DRIVER=console` in production: warning (notifications are silently dropped).
- Prisma can connect (`SELECT 1` only — no schema mutation, no row writes).
- At least one active `ADMIN` user exists (read-only `count`).

**Optional opt-ins (off by default):**

| Var                       | Effect                                                                                                                                                |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PREFLIGHT_SEND_EMAIL=true` | When `EMAIL_DRIVER=resend` and `SMOKE_EMAIL_TO` is set, sends one Resend smoke email through the production adapter. Same path as `npm run smoke:email`. |
| `PREFLIGHT_STORAGE_WRITE=true` | When `STORAGE_DRIVER=s3`, performs a `put` + presigned `read` + `delete` round-trip against the configured bucket. Limited to `s3` by design.        |

**Migrations are NOT auto-checked.** Migration verification is intentionally manual to avoid coupling preflight to Prisma CLI internals. Run separately:

```bash
npx prisma migrate status
npm run db:migrate:deploy   # if migrations are pending
```

**Output:**

- One line per check, tagged `[ok]`, `[WARN]`, or `[FAIL]`.
- A summary line: `[preflight] N passed, M warnings, K failures`.
- Exit code `0` if no failures (warnings allowed); exit `1` if at least one fatal check failed.
- **Never prints** `RESEND_API_KEY`, `S3_SECRET_ACCESS_KEY`, `AUTH_SECRET`, `DATABASE_URL` credentials, or full email addresses. `EMAIL_FROM`, `EMAIL_REPLY_TO`, and `SMOKE_EMAIL_TO` are partially masked. `DATABASE_URL` is reduced to host + db name. `AUTH_URL` is reduced to host.

**Recommended sequence before flipping production traffic:**

```bash
npm run preflight:prod                                  # baseline
PREFLIGHT_STORAGE_WRITE=true npm run preflight:prod     # round-trip R2
PREFLIGHT_SEND_EMAIL=true SMOKE_EMAIL_TO=you@example.com npm run preflight:prod   # one real email
```

Each invocation is independent; you can chain them into a deploy gate (`npm run preflight:prod && vercel --prod`).

### Bootstrap the first admin user

The script in [`scripts/admin-create.ts`](scripts/admin-create.ts) creates exactly one `ADMIN` row using the same bcrypt helper the rest of the app uses. It is the only sanctioned production path — never use `npm run db:seed`.

**Required env:**

| Variable               | Value                                                                                                                        |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`         | The production Postgres URL (must already be migrated).                                                                      |
| `ADMIN_EMAIL`          | The admin's email address.                                                                                                   |
| `ADMIN_PASSWORD`       | At least **16 characters**, at most **72 UTF-8 bytes** (bcrypt's silent truncation point). Use a password manager.           |
| `CREATE_ADMIN_CONFIRM` | Must equal `ADMIN_EMAIL` exactly (after trim/lowercase). Forces you to retype the address and prevents accidental execution. |

**Run it:**

```bash
export DATABASE_URL=postgresql://...
export ADMIN_EMAIL=admin@yourdomain.com
export ADMIN_PASSWORD='use-a-real-password-manager-1234'
export CREATE_ADMIN_CONFIRM=admin@yourdomain.com
npm run admin:create
```

Or load the env from a file with your preferred wrapper (`set -a; source .env.production; set +a`, `tsx --env-file=...`, `dotenv-cli`, etc.).

**What the script does:**

- Validates `CREATE_ADMIN_CONFIRM === ADMIN_EMAIL`. If they don't match, it exits `1` without touching the DB.
- Validates the email format and password length/byte-cap.
- If an active `ADMIN` with that email already exists, prints an idempotent-noop log line and exits `0`. **Does NOT rotate the password** — if you forgot the password, that's a separate password-reset flow, not a re-bootstrap.
- If an active `STUDENT` or `COMPANY` with that email exists, refuses loudly and exits `1`. The script will not change another user's role.
- Otherwise creates the User row with `role=ADMIN` and a bcrypt-hashed password.
- Catches the `User_email_active_key` unique-constraint race (P2002) and re-queries to disambiguate.
- **Never logs** the password, the bcrypt hash, or any secret. The email is partially masked in stdout (`a***@yourdomain.com`).
- **Does NOT write an `ActivityEvent`.** The `ActivityEventType` enum has no system/bootstrap entry; adding one would require a migration, which is intentionally out of scope. The script's stdout line is the audit trail — capture it from your terminal session.

**Soft-delete edge case.** If a previous admin with the same email was soft-deleted (`deletedAt` is set), the script will create a new active admin row alongside it. The soft-deleted row stays soft-deleted. This matches the rest of the app's "soft-deleted means gone" convention.

---

## 6. Verification checklist

After a fresh deploy, verify:

- [ ] **Boot**: `https://<your-domain>/` returns 200 and renders the marketing page.
- [ ] **Auth**: `/login` accepts a valid credential and redirects to the role's dashboard.
- [ ] **Migrations applied**: `npx prisma migrate status` shows "Database schema is up to date!"
- [ ] **Storage round-trip**: Upload a logo on `/company/profile` and a resume on `/student/profile`. Both should succeed and the API routes (`/api/files/logo/[key]`, `/api/files/resume/[key]`) should return the file.
- [ ] **Email dispatch**: A test signup completes without timing out. Production email logs (or your provider dashboard) should show the welcome message attempt.
- [ ] **Admin approval flow**: An admin can flip a PENDING company to APPROVED via `/admin/companies` and the change appears on `/admin/activity` (event type `COMPANY_APPROVAL_CHANGED`).
- [ ] **Permissions**: A logged-in STUDENT receives a 302 to `/` when hitting `/admin`. A non-STUDENT receives the same on `/student/dashboard`.
- [ ] **Error logging**: A controlled bad request produces a structured server log, not a 500 with a stack trace in the response.

---

## 7. Failure modes

### `STORAGE_DRIVER` misconfigured in production

If `STORAGE_DRIVER` is set to an unknown value (`s3`, `local`, `noop` are the only known values) **in production**, the storage adapter selector throws on app boot:

```
Unknown STORAGE_DRIVER="<value>". Set STORAGE_DRIVER to one of: local, s3, noop.
```

This is by design: a misconfigured prod deploy should fail loudly on boot rather than silently writing resumes to an ephemeral container disk where they will be lost on the next deploy.

### `STORAGE_DRIVER=s3` with missing config

If `STORAGE_DRIVER=s3` and any of `S3_BUCKET`, `S3_REGION`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` are missing, the [`S3StorageAdapter`](server/adapters/storage/s3-adapter.ts) constructor throws:

```
S3StorageAdapter is missing required env: <names>. Set STORAGE_DRIVER=local for development, or provide all of: S3_BUCKET, S3_REGION, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY.
```

Set every required key, redeploy, and the adapter constructs cleanly.

### `S3StorageAdapter` is a skeleton in V1

The adapter validates configuration but its `put`/`read`/`delete` methods currently throw `not implemented`. Wire `@aws-sdk/client-s3` (`PutObjectCommand`, `GetObjectCommand` with `getSignedUrl`, `DeleteObjectCommand`) before enabling `STORAGE_DRIVER=s3` in a real production environment that handles uploads.

### Migration fails mid-deploy

If `prisma migrate deploy` fails, Postgres rolls back the failing migration's transaction (Prisma wraps each migration in one). The previous migration state stays valid; the app keeps running on the prior schema until you fix and re-deploy.

To recover:

1. **Don't** edit a migration that's already applied to production. Roll forward.
2. Inspect with `npx prisma migrate status` — Prisma will report which migration is in a failed state.
3. Either:
   - Fix the SQL in a **new** migration that compensates, then `migrate deploy` again.
   - Or, if the partial state can be cleaned up safely, run `npx prisma migrate resolve --rolled-back <migration_name>` and re-deploy.
4. Avoid `migrate reset` in production — it drops the database.

The `ALTER TYPE ... ADD VALUE IF NOT EXISTS` lines in [`prisma/migrations/20260503120000_activity_event_types/migration.sql`](prisma/migrations/20260503120000_activity_event_types/migration.sql) are **not transactional in Postgres** by design (Postgres commits each enum value individually). The migration is idempotent — safe to re-apply if it failed partway.

### Email dispatch failures

Email is **never inside `prisma.$transaction`**. Every send goes through [`dispatchEmail`](server/services/email-service.ts) which catches both adapter exceptions and `{ ok: false }` results, logs them, and absorbs the failure. Provider outages produce a console.error line and the primary mutation (signup, status change, message send) still commits. Monitor for `[email]` lines in your platform logs.

---

## 8. Rolling back

Vercel keeps every deployment. To roll back the **app**:

1. Vercel → Deployments → find the prior good deployment.
2. **Promote to Production**.

To roll back the **database**:

- Prisma does not generate down-migrations.
- Best practice: restore from a managed snapshot (Neon point-in-time, Supabase backup, etc.) taken before the bad migration.
- If the bad migration was additive (new column, new index), it's usually safer to deploy a _new_ migration that drops the offending object than to restore the whole DB.

Coordinate the app and DB rollbacks: an older app version against a newer schema is usually fine; a newer app against an older schema breaks immediately.
