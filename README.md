# Internship Job Board (V1)

Two-sided internship marketplace connecting **students** with **companies**, plus an admin dashboard for the program operator. See [`CLAUDE.md`](CLAUDE.md) for the full product spec and [`ARCHITECTURE.md`](ARCHITECTURE.md) for code organisation. For deployment, see [`DEPLOYMENT.md`](DEPLOYMENT.md).

## Stack

- **Next.js 16** (App Router, Turbopack), React 19
- **TypeScript**, **Tailwind CSS v4**, shadcn/ui-style primitives
- **Prisma 7** (`prisma-client` provider) + **PostgreSQL** via the `@prisma/adapter-pg` driver adapter
- **Auth.js v5** (Credentials provider, JWT sessions, no `@auth/prisma-adapter`)
- Validation via **Zod**
- Tests: **Vitest** + React Testing Library (unit + integration), **Playwright** (E2E)

## Quick start

```bash
# 1. Install
npm install

# 2. Configure environment
cp .env.example .env
# Then edit .env and fill in DATABASE_URL + AUTH_SECRET (see below).

# 3. Apply migrations
npm run db:migrate

# 4. Generate the Prisma client
npm run db:generate

# 5. Seed dev data (idempotent)
npm run db:seed

# 6. Run the app
npm run dev
```

Visit [http://localhost:3000](http://localhost:3000).

## Configuration

### Required

- **`DATABASE_URL`** — PostgreSQL connection string. Any libpq-compatible URL works (the project uses Prisma's pg driver adapter, not the binary engine). Example for a local Postgres:

  ```
  postgresql://postgres:postgres@localhost:5432/internship_dev?schema=public
  ```

- **`AUTH_SECRET`** — JWT signing secret for Auth.js. Generate with:

  ```bash
  node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
  ```

  Use **different values per environment**.

### Optional (sensible defaults)

- `STORAGE_DRIVER` — `local` (default) | `noop` | `s3`. See [`.env.example`](.env.example) for full notes.
- `EMAIL_DRIVER` — `console` (default). The console adapter logs structured payloads to stdout. There is no real provider in V1; wire one behind the [`EmailAdapter`](server/adapters/email/email-adapter.ts) interface when ready.
- S3 keys (only required when `STORAGE_DRIVER=s3`): `S3_BUCKET`, `S3_REGION`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, optional `S3_SIGNED_URL_TTL_SECONDS`.

## Database migrations

Always use **migrations**, never `db push`.

```bash
# Apply all pending migrations to the local DB.
npm run db:migrate

# After editing prisma/schema.prisma, create a named migration.
npx prisma migrate dev --name what_changed

# Production / CI deploy.
npm run db:migrate:deploy
```

The schema lives in [`prisma/schema.prisma`](prisma/schema.prisma); generated client artefacts land in `lib/db/generated` (git-ignored). Soft-delete-safe uniqueness on `User.email`, `CompanyProfile.slug`, and `JobPosting.(companyProfileId, slug)` is implemented via partial unique indexes — see the original `prisma/migrations/*_init/migration.sql`.

## Seeded login credentials

```bash
npm run db:seed
```

The seed is **idempotent**: re-running upserts and never duplicates. It creates 1 admin, 3 companies (one each `APPROVED`/`PENDING`/`SUSPENDED`), 10 students, 12 postings across statuses, 15 applications spanning every funnel state, 5 message threads, activity events, and multiple `programTag` values. The script also prints the table of seeded credentials at the end.

All seeded users share the password **`Password123!`**.

| Role                | Email                    |
| ------------------- | ------------------------ |
| Admin               | `admin@example.test`     |
| Company (APPROVED)  | `acme@example.test`      |
| Company (PENDING)   | `globex@example.test`    |
| Company (SUSPENDED) | `initech@example.test`   |
| Student `01` … `10` | `studentNN@example.test` |

## Local fallback behavior

### Storage

`STORAGE_DRIVER` defaults to `local-fs`. The [`LocalFsStorageAdapter`](server/adapters/storage/local-fs-adapter.ts) writes uploads under `./storage-uploads/` (git-ignored). Resume + logo flows work end-to-end on a fresh checkout with no cloud credentials.

`STORAGE_DRIVER=s3` requires every S3 env var to be set; the [`S3StorageAdapter`](server/adapters/storage/s3-adapter.ts) constructor throws a precise missing-env error otherwise. The skeleton intentionally throws "not implemented" on each operation — wire `@aws-sdk/client-s3` before enabling in production.

### Email

`EMAIL_DRIVER` defaults to `console`. The [`ConsoleEmailAdapter`](server/adapters/email/console-adapter.ts) prints a structured payload (recipient, subject, metadata, body) to the dev server console for every notification. Sign-up, application status changes, new messages, and admin pending-review notifications all run through this in development.

Critically, every dispatch is wrapped in [`dispatchEmail`](server/services/email-service.ts), which catches both adapter exceptions and `{ ok: false }` results, logs them, and absorbs the failure. **A provider outage cannot roll back the underlying user signup, application submit, or message send.** Email is also never invoked inside `prisma.$transaction` — see [`server/services/email-service.ts`](server/services/email-service.ts) for the architectural rule.

## Architecture overview

```
app/                         Next.js App Router routes (UI + page-level actions)
features/                    Feature-grouped UI + feature-facing server actions
  applications/              apply form, applicant rows, withdraw flow
  saved-job-postings/        save/unsave toggle + list
  messages/                  thread list, thread view, reply form
  admin/                     admin tables, filter bars, pagination, soft-delete
  …
server/
  services/                  Business logic. Owns auth, validation, transactions.
                             Pages and actions call into here, never raw Prisma.
  repositories/              Pure data-access (Prisma queries).
                             admin-repository.ts, activity-repository.ts.
  adapters/
    email/                   EmailAdapter interface + ConsoleEmailAdapter
    storage/                 StorageAdapter interface + Local/Noop/S3 adapters
lib/
  auth/                      Auth.js config, password hashing, guards
  db/                        Prisma client + adapter wiring
  students/, companies/      Pure helpers (e.g. completeness calculation)
prisma/
  schema.prisma              Source of truth for data model + enums
  migrations/                Versioned SQL migrations
  seed.ts                    Idempotent dev seed script
tests/
  unit/                      Vitest unit (jsdom + node)
  integration/               Vitest integration (real DB, sequential)
  e2e/                       Playwright (real dev server + DB)
```

Key boundary rules (enforced by code review, not lint):

- **Page components and server actions never call Prisma directly.** They go through `/server/services`. Repositories handle the queries; services own auth + business rules.
- **The activity log is the only canonical audit trail.** Every mutation that admins or compliance might want to inspect emits an `ActivityEvent` (signups, approval changes, posting lifecycle, application submit/transition/withdraw, message thread creation, soft-deletes).
- **Soft-delete propagates through queries, not the data.** Normal app surfaces filter records owned by soft-deleted parents (e.g. company-side application lists hide apps from soft-deleted students), but admin pages and the audit log deliberately show everything.

## Common scripts

| Command                           | What it does                                        |
| --------------------------------- | --------------------------------------------------- |
| `npm run dev`                     | Start Next.js dev server                            |
| `npm run build` / `start`         | Production build / start                            |
| `npm run lint`                    | ESLint                                              |
| `npm run typecheck`               | `tsc --noEmit`                                      |
| `npm run format` / `format:check` | Prettier                                            |
| `npm run test`                    | Vitest (unit + integration)                         |
| `npm run test:unit`               | Vitest unit suite only                              |
| `npm run test:integration`        | Vitest integration suite (hits the database)        |
| `npm run test:e2e`                | Playwright end-to-end (requires the dev server)     |
| `npm run test:e2e:ui`             | Playwright UI mode for debugging                    |
| `npm run db:generate`             | Generate Prisma client                              |
| `npm run db:migrate`              | Apply schema migrations (dev — `migrate dev`)       |
| `npm run db:migrate:deploy`       | Apply migrations (CI/production — `migrate deploy`) |
| `npm run db:seed`                 | Seed development data                               |
| `npm run db:studio`               | Open Prisma Studio                                  |

## Testing notes

- **Vitest integration tests** run against the real `DATABASE_URL`. The Vitest config pins `fileParallelism: false` because the suite shares a single Neon connection pool on the free tier; parallel files exhaust it and trip spurious 5-second timeouts.

- **Playwright runs serially (`workers: 1`).** Several E2E specs mutate shared seeded canonical state (e.g. `globex-health` PENDING → APPROVED → PENDING in `admin-approval.spec.ts`) while other specs assert that canonical state. Parallel workers race those rows. Per-spec fixtures use unique-per-run signup emails so fresh-account contamination isn't an issue. **Do not flip `fullyParallel` back on without first isolating the seeded-state mutations** — the config has a prominent comment explaining what to fix first.

- E2E tests assume the dev server is running and the dev DB is freshly seeded. Re-run `npm run db:seed` if you've drifted the canonical seed state during exploration.
