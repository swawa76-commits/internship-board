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

| Variable        | Value                                                                                          |
| --------------- | ---------------------------------------------------------------------------------------------- |
| `DATABASE_URL`  | Production Postgres connection string (with `sslmode=require`)                                 |
| `AUTH_SECRET`   | A fresh secret, **different** from any dev value. Generate: `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"` |
| `AUTH_URL`      | The canonical production URL, e.g. `https://your-app.vercel.app`. Auth.js v5 warns if this is unset in production. |

### Storage adapter (recommended for production)

| Variable                       | Value                                                |
| ------------------------------ | ---------------------------------------------------- |
| `STORAGE_DRIVER`               | `s3` (see warnings below)                            |
| `S3_BUCKET`                    | Bucket name, e.g. `internshipboard-uploads`          |
| `S3_REGION`                    | e.g. `us-east-1`                                     |
| `S3_ACCESS_KEY_ID`             | IAM access key with `s3:Put/Get/Delete/ListObject` on that bucket |
| `S3_SECRET_ACCESS_KEY`         | IAM secret                                           |
| `S3_SIGNED_URL_TTL_SECONDS`    | Optional, defaults to `300` (5 min)                  |

### Email adapter

| Variable        | Value                                                                       |
| --------------- | --------------------------------------------------------------------------- |
| `EMAIL_DRIVER`  | `console` is the only adapter that ships in V1. Wire a real provider behind the `EmailAdapter` interface before flipping this to `smtp`/`ses`/etc. |

`NODE_ENV` is set to `production` automatically by Vercel during builds and at runtime. Do not override it manually.

---

## 3. Deploy the app

The first push to your production branch (typically `main`) triggers a Vercel build. Two notes:

- The **build step does not run migrations.** `next build` does run `prisma generate` (via `postinstall` in many repos; this project relies on the generator output committed under `lib/db/generated`, so confirm the generator runs in your build pipeline if you ever delete those artefacts).
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

- Create the first ADMIN user manually via a one-shot script or a `psql` insert (the password column is `passwordHash`, bcrypt-hashed via [`hashPassword`](lib/auth/password.ts)).
- Companies and students self-register through the regular signup flow.

If you genuinely need demo data in a non-prod environment (staging), point `DATABASE_URL` at the staging DB and run the seed there.

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
- If the bad migration was additive (new column, new index), it's usually safer to deploy a *new* migration that drops the offending object than to restore the whole DB.

Coordinate the app and DB rollbacks: an older app version against a newer schema is usually fine; a newer app against an older schema breaks immediately.
