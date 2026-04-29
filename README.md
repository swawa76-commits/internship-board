# Internship Job Board (V1)

Two-sided internship marketplace connecting students with companies, plus an admin dashboard for the program operator. See [`CLAUDE.md`](CLAUDE.md) for the full product spec and [`ARCHITECTURE.md`](ARCHITECTURE.md) for code organization.

> A complete README, deployment guide, and end-user docs are produced in **Task 21**. This file covers what's needed to run the project locally during development.

## Stack

- Next.js 16 (App Router, Turbopack)
- TypeScript, Tailwind CSS v4, shadcn-style UI primitives
- Prisma 7 (`prisma-client` provider) + PostgreSQL via the `@prisma/adapter-pg` driver adapter
- Auth.js v5 (Credentials provider, JWT sessions)
- Vitest + React Testing Library + Playwright

## Local setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Copy `.env.example` to `.env` and fill in:

   - `DATABASE_URL` — a PostgreSQL connection string
   - `AUTH_SECRET` — generate with `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`

3. Apply the database schema:

   ```bash
   npm run db:migrate
   ```

4. Seed development data (see below).

5. Start the dev server:

   ```bash
   npm run dev
   ```

   Visit [http://localhost:3000](http://localhost:3000).

## Seeding development data

```bash
npm run db:seed
```

The seed is **idempotent** — re-running won't duplicate rows. It creates:

- 1 admin
- 3 companies — one each in `APPROVED`, `PENDING`, `SUSPENDED`
- 10 students
- 12 job postings
- 15 applications across the lifecycle (`APPLIED`, `IN_REVIEW`, `INTERVIEWING`, `OFFER`, `REJECTED`, `WITHDRAWN`)
- 5 message threads (each company-initiated, with 2 messages each)
- Activity events covering signups, approvals, postings, and applications
- Multiple `programTag` values: `Cohort 2026`, `FellowsX`, `Returnship`, `ScholarsLab`

After seeding, the script prints the shared dev password and a table of login credentials.

### Seeded login credentials

All seeded users share the password **`Password123!`**.

| Role                    | Email                      |
| ----------------------- | -------------------------- |
| Admin                   | `admin@example.test`       |
| Company (APPROVED)      | `acme@example.test`        |
| Company (PENDING)       | `globex@example.test`      |
| Company (SUSPENDED)     | `initech@example.test`     |
| Student `01` … `10`     | `studentNN@example.test`   |

## Common scripts

| Command                       | What it does                                  |
| ----------------------------- | --------------------------------------------- |
| `npm run dev`                 | Start Next.js dev server                      |
| `npm run build` / `start`     | Production build / start                      |
| `npm run lint`                | ESLint                                        |
| `npm run typecheck`           | `tsc --noEmit`                                |
| `npm run format` / `format:check` | Prettier                                  |
| `npm run test`                | Vitest (unit + integration)                   |
| `npm run test:unit`           | Vitest unit suite only                        |
| `npm run test:integration`    | Vitest integration suite (hits the database)  |
| `npm run test:e2e`            | Playwright end-to-end                         |
| `npm run db:generate`         | Generate Prisma client                        |
| `npm run db:migrate`          | Apply schema migrations (dev)                 |
| `npm run db:migrate:deploy`   | Apply migrations (production)                 |
| `npm run db:seed`             | Seed development data                         |
| `npm run db:studio`           | Open Prisma Studio                            |
