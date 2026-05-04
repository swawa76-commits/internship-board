# ARCHITECTURE.md

## Purpose

This document defines how the application should be structured so the codebase stays maintainable as features are added.

The goal is to keep:

- business logic out of UI components
- authorization enforced on the server
- Prisma queries centralized and predictable
- external services isolated behind adapters
- routes thin and easy to reason about

This is a V1 architecture for a small team. Prefer simple, boring patterns over clever abstractions.

---

## Core architectural principles

### 1. Keep UI, business logic, and data access separate

Do not mix:

- React rendering
- permission logic
- Prisma queries
- third-party service calls

Each should live in a clear layer.

### 2. Server is the source of truth

Never trust client-side role or approval checks.
All authorization and approval rules must be enforced server-side.

### 3. Prefer feature-oriented organization with shared infrastructure

Organize most code by feature domain, while keeping shared infrastructure in common folders.

### 4. Keep routes thin

Pages, layouts, route handlers, and server actions should mostly:

- parse input
- call services
- return UI or response data

Do not put complex business logic directly in route files.

### 5. External services must be replaceable

Email, file storage, and similar integrations must go through adapters so local development and production can use different implementations.

### 6. Avoid premature abstraction

Create reusable helpers when patterns repeat.
Do not invent complex generic frameworks for a V1 product.

### 7. Folder responsibilities

The repo uses a clear separation between feature-facing code and backend logic.

- `/features` contains domain-specific frontend and feature-facing glue code
- `/server` contains backend-only business logic, repositories, and adapters
- `/components` contains shared, domain-agnostic presentation components

Route handlers and server actions in `/app` or `/features` must call `/server/services` for non-trivial business logic rather than querying the database directly.

---

## Recommended top-level structure

```txt
/app
  /(public)
  /(auth)
  /(student)
  /(company)
  /(admin)
  /api

/components
  /ui
  /shared
  /layout
  /forms
  /tables
  /charts

/features
  /auth
  /students
  /companies
  /job-postings
  /applications
  /messages
  /admin
  /activity
  /saved-job-postings
  /notifications

/lib
  /auth
  /db
  /env
  /validation
  /permissions
  /utils

/server
  /services
  /repositories
  /adapters

/prisma
  schema.prisma
  seed.ts

/tests
  /unit
  /integration
  /e2e

/public

/scripts
```
