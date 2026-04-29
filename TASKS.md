# TASKS.md

## Goal

Build the V1 internship job board described in `CLAUDE.md`.

This file breaks the work into concrete implementation tasks. Complete tasks in order unless there is a strong reason to adjust sequence. Prefer shipping a smaller complete slice over partially scaffolding many areas.

## Execution rules

- Complete one task at a time
- Keep changes small and testable
- Do not leave placeholder UI or `TODO` comments for core V1 flows
- For every completed task, update the repo so the app still runs
- Preserve working functionality while adding new features
- Use real database wiring for core flows
- Use mock or fallback implementations only where explicitly allowed for local development
- If a task introduces auth, permissions, or approval logic, enforce it server-side
- Follow the folder structure and boundary rules in `ARCHITECTURE.md`
- Put domain-specific UI, hooks, and feature-facing server actions in `/features`
- Put core business logic in `/server/services`, data access in `/server/repositories`, and third-party integrations in `/server/adapters`
- Server actions and route handlers in `/app` or `/features` must call `/server/services` for non-trivial business logic rather than querying the database directly
- After completing each task and satisfying its acceptance criteria, run `git add .` and `git commit -m "Completed Task [X]: [Brief description]"`. Do not begin the next task until the current task has been committed successfully
- Make smaller checkpoint commits within a task when changes are large, risky, or span multiple files
- Write the relevant unit and integration tests as part of each feature task
- Do not defer core test coverage until the end
- Task 20 is for final end-to-end verification, regression checks, and filling small remaining test gaps, not for writing the entire test suite from scratch

---

## Task 1: Initialize app foundation

### Objective
Set up the base application and tooling.

### Requirements
- Create a Next.js app using App Router
- Use TypeScript
- Add Tailwind CSS
- Add shadcn/ui or equivalent reusable component setup
- Add Prisma
- Add linting and formatting defaults
- Create a clean base layout
- Create placeholder route groups for public, student, company, and admin areas
- Scaffold the exact folder structure defined in `ARCHITECTURE.md`
- Install and configure the testing frameworks:
  - Vitest and React Testing Library for unit and integration tests
  - Playwright for end-to-end tests
- Add baseline test scripts to `package.json`

### Testing for this task
- Add a basic smoke test or route render test
- Verify the app boots successfully in local development
- Verify unit test tooling runs successfully
- Verify Playwright is configured and can run a minimal smoke check if practical

### Acceptance criteria
- App runs locally
- App uses `/app` directory and App Router conventions only
- Tailwind works
- Prisma is configured
- Base layout renders
- Test frameworks are installed and runnable
- Core folder structure matches `ARCHITECTURE.md`
- Folder structure is clear and maintainable

---

## Task 2: Configure database schema and migrations

### Objective
Create the initial relational data model for V1.

### Requirements
Implement the core schema from `CLAUDE.md`:
- User
- StudentProfile
- StudentSkill
- StudentExperience
- StudentProject
- CompanyProfile
- JobPosting
- SavedJobPosting
- Application
- MessageThread
- Message
- ActivityEvent
- AdminNote

Include:
- enums for roles and statuses
- `deletedAt` fields where required
- `programTag` fields
- `approvalStatus` for companies
- storage key fields instead of signed URLs

### Important implementation notes
- Soft-delete-compatible uniqueness must be handled for fields like `User.email` and `CompanyProfile.slug`
- If partial unique indexes are not easy through Prisma alone, implement a safe fallback approach and document it

### Testing for this task
- Add a migration validation step
- Add schema-level tests or database integration tests where practical for core constraints
- Verify soft-delete uniqueness strategy works as intended

### Acceptance criteria
- Prisma schema is complete
- Initial migration runs successfully
- No core table or enum is missing
- Schema reflects soft delete and approval logic correctly

---

## Task 3: Implement authentication and role-aware sessions

### Objective
Add auth and make user identity available throughout the app.

### Requirements
- Implement auth with either NextAuth or Clerk
- Support email/password auth where practical for the selected auth provider
- Support login, signup, logout, and password reset flow if practical in V1
- Add role selection during onboarding
- Ensure session contains `user.id` and `user.role`
- Only include `approvalStatus` in session if safe to refresh or revalidate
- Verify approval state from the database for sensitive actions

### Testing for this task
- Add unit tests for auth helpers and session shaping logic
- Add integration tests for signup, login, logout, and protected route access

### Acceptance criteria
- Users can sign up and log in
- Session exposes user id and role
- Protected routes redirect correctly
- No sensitive action depends only on client-side checks

---

## Task 4: Seed development data

### Objective
Create realistic seed data for local development and demos using the actual chosen authentication approach.

### Requirements
Seed:
- 1 admin
- 3 companies
- 10 students
- 12 job postings
- 15 applications
- sample message threads
- sample activity events
- multiple `programTag` values

Include companies in different approval states where useful:
- approved
- pending
- suspended

### Important implementation notes
- Seed users must align with the selected auth provider and session model
- If the selected auth provider makes seeded login credentials impractical, seed database-backed demo records for app data and document a simple local flow for creating test login accounts

### Testing for this task
- Verify seed script runs on a fresh database
- Add a basic seed validation script or test that checks row counts and key relationships

### Acceptance criteria
- Seed script runs successfully
- Local database contains realistic data
- Seed data matches the actual auth implementation
- Dashboard and workflow screens are meaningfully populated

---

## Task 5: Build onboarding and role-based routing

### Objective
Route new users into the correct flow and help them complete first-run setup.

### Requirements
- After signup, route students to student onboarding
- After signup, route companies to company onboarding
- Seed admin user can access admin routes
- Add empty states and onboarding prompts

### Testing for this task
- Add integration tests for post-signup routing by role
- Add integration tests for admin access and non-admin rejection on admin routes

### Acceptance criteria
- Student users land in student flow
- Company users land in company flow
- Admin user lands in admin flow
- New users can understand what to do next

---

## Task 6: Build student profile flow

### Objective
Allow students to create and maintain a complete profile.

### Requirements
- Build `/student/profile`
- Support create and edit
- Implement fields from `CLAUDE.md`
- Support skills, experiences, and projects
- Support resume upload using the `resumeStorageKey` model
- Show profile completeness
- Server-side validation required

### Testing for this task
- Add unit tests for profile completeness calculation
- Add integration tests for create and edit flows
- Add permission tests to ensure only the owner can edit the profile

### Acceptance criteria
- Student can create and edit profile
- Resume upload works with configured provider or local fallback
- Profile completeness is calculated and shown
- Unauthorized users cannot edit another student’s profile

---

## Task 7: Build company profile flow

### Objective
Allow companies to create and maintain their company profile.

### Requirements
- Build `/company/profile`
- Support create and edit
- Implement fields from `CLAUDE.md`
- Support logo upload using the `logoStorageKey` model
- Surface `approvalStatus` clearly in UI
- If moderation is enabled, show that job postings are not public until approval

### Testing for this task
- Add integration tests for create and edit flows
- Add permission tests to ensure only the owner can edit the company profile
- Add tests for `approvalStatus` messaging in the UI where practical

### Acceptance criteria
- Company can create and edit profile
- `approvalStatus` is visible and understandable
- Unauthorized users cannot edit another company’s profile

---

## Task 8: Implement approval workflow

### Objective
Support admin approval and suspension of companies.

### Requirements
- Companies start as `PENDING` if moderation is enabled
- Admin can change `approvalStatus` to `APPROVED` or `SUSPENDED`
- `PENDING` and `SUSPENDED` companies cannot have publicly visible job postings
- Company UI clearly reflects `approvalStatus`
- Sensitive publish actions must check current DB approval state

### Testing for this task
- Add unit tests for approval logic
- Add integration tests for admin approval and suspension flows
- Add tests ensuring public visibility respects `approvalStatus`

### Acceptance criteria
- Admin can approve and suspend companies
- Public job posting visibility respects `approvalStatus`
- Company sees correct guidance in dashboard/profile flows
- Approval events are recorded in activity feed if implemented

---

## Task 9: Build job posting CRUD for companies

### Objective
Allow companies to create and manage internship job postings.

### Requirements
- Build `/company/job-postings`
- Build `/company/job-postings/new`
- Build `/company/job-postings/[id]`
- Support draft, publish, edit, pause, close, archive
- Implement all job posting fields from `CLAUDE.md`
- Respect approval rules
- Generate clean slugs if public job posting pages use them

### Testing for this task
- Add unit tests for job posting status transitions if needed
- Add integration tests for create, edit, publish, pause, close, and archive flows
- Add permission tests to ensure companies can only manage their own job postings

### Acceptance criteria
- Company can create and edit job postings
- Company can change job posting status
- Public visibility rules are enforced correctly
- Unauthorized users cannot modify another company’s job postings

---

## Task 10: Build public job posting browsing and job posting detail pages

### Objective
Let students and visitors browse available internship job postings.

### Requirements
- Build `/job-postings`
- Build `/job-postings/[slug]`
- Add search and filters:
  - keyword
  - location
  - workplace type
  - industry
  - internship term
  - program tag if appropriate
- Only show job postings that are publicly visible
- Show company details on the job posting page

### Testing for this task
- Add integration tests for job posting list and detail rendering
- Add tests for search/filter query behavior
- Add tests ensuring pending and suspended company job postings do not appear publicly

### Acceptance criteria
- Public job posting list loads with real data
- Search and filter work
- Pending and suspended company job postings do not appear publicly
- Job posting detail pages render correctly

---

## Task 11: Build saved job postings feature

### Objective
Allow students to save job postings for later review.

### Requirements
- Add save/unsave action on job postings
- Build `/student/saved-job-postings`
- Restrict saved job postings to authenticated student users

### Testing for this task
- Add integration tests for save and unsave actions
- Add permission tests ensuring users only see their own saved job postings

### Acceptance criteria
- Student can save and unsave job postings
- Saved job postings list shows correct data
- Other users cannot see another student’s saved job postings

---

## Task 12: Build application flow

### Objective
Allow students to apply to job postings and companies to review applicants.

### Requirements
- Student can apply from a job posting detail page
- Use profile data and optional cover letter
- Snapshot `resumeStorageKey` into the application record as `resumeStorageKeySnapshot`
- Prevent duplicate application to the same job posting if desired for V1
- Build `/student/applications`
- Build company-side application views
- Enforce permissions strictly

### Testing for this task
- Add unit tests for duplicate application prevention if implemented
- Add integration tests for student application submission
- Add integration tests for company applicant view access
- Add permission tests for application visibility

### Acceptance criteria
- Student can apply successfully
- Student sees application in dashboard
- Company can view applicants for its own job postings
- Application data is stored correctly
- Unauthorized access is blocked

---

## Task 13: Build application status management

### Objective
Allow companies to move applicants through the funnel.

### Requirements
Support statuses:
- Applied
- In Review
- Interviewing
- Offer
- Rejected
- Withdrawn

- Company can update status for applicants to its own job postings
- Student can view current status
- Status changes should create activity events if the activity feed exists
- Optional email notification should use a real provider or local logging fallback

### Testing for this task
- Add unit tests for valid and invalid status transitions
- Add integration tests for company status updates
- Add tests that students see updated status correctly

### Acceptance criteria
- Company can update statuses
- Student sees updated status
- Status transitions persist correctly
- Unauthorized status changes are blocked

---

## Task 14: Build messaging system with constrained permissions

### Objective
Support company-initiated communication tied to applications.

### Requirements
- Messages belong to a `MessageThread`
- A company can initiate a `MessageThread` with an applicant to its own job posting
- A student cannot initiate a free-form `MessageThread`
- A student can reply only after a `MessageThread` exists and was company-initiated
- Build `/company/messages`
- Build `/student/messages`
- Add unread/read state if straightforward

### Testing for this task
- Add unit tests for messaging permission rules
- Add integration tests for company message thread creation
- Add integration tests for student reply behavior
- Add tests ensuring unauthorized message thread access is blocked

### Acceptance criteria
- Company can initiate a message thread
- Student can reply only in an allowed message thread
- No one can message outside authorized application context
- Unauthorized access to message threads is blocked

---

## Task 15: Build admin dashboard

### Objective
Give program admins operational visibility.

### Requirements
Build `/admin` with:
- overview metrics
- funnel snapshot
- operational alerts
- recent activity feed
- top performing job postings table
- company participation table
- time filters
- program tag filter

### Testing for this task
- Add integration tests for admin-only access
- Add integration tests for core dashboard data loading
- Add query tests for major aggregations where practical

### Acceptance criteria
- Admin dashboard loads real aggregated data
- Dashboard is scannable and functional
- Non-admin users cannot access dashboard
- Metrics reflect seeded and live data correctly

---

## Task 16: Build admin management pages

### Objective
Let admins inspect and manage platform entities.

### Requirements
Build:
- `/admin/companies`
- `/admin/job-postings`
- `/admin/students`
- `/admin/applications`

Support:
- table views
- basic filtering
- search where sensible
- approval actions
- suspension or soft-delete flows where appropriate
- optional internal notes if straightforward

### Testing for this task
- Add integration tests for admin page access control
- Add tests for filtering and approval actions
- Add tests for soft-delete behavior where implemented

### Acceptance criteria
- Admin can view and manage all core entities
- Filtering works
- Soft-deleted items are handled correctly
- Non-admin users cannot access these pages

---

## Task 17: Add activity event tracking

### Objective
Track important system events for admin visibility and auditability.

### Requirements
Record events for actions such as:
- student signup
- company signup
- company approval status change
- job posting publication
- application submission
- application status change
- message thread creation

### Testing for this task
- Add integration tests verifying key events are created
- Add tests ensuring event creation does not block primary flows on failure if you choose asynchronous or best-effort behavior

### Acceptance criteria
- Events are persisted
- Admin recent activity feed reads from real data
- Event creation does not break primary flows

---

## Task 18: Implement email behavior with local fallback

### Objective
Support notifications without blocking local development.

### Requirements
- For local development, log structured email payloads to server console
- Do not block core flows on missing email credentials
- Support env-based provider integration later
- Document behavior clearly

### Testing for this task
- Add unit tests for email adapter selection or fallback logic
- Add integration tests ensuring user flows still succeed without provider credentials

### Acceptance criteria
- Core flows work without email provider credentials
- Email payload logging is readable in local dev
- Real provider can be enabled later without major refactor

---

## Task 19: Implement storage behavior with local fallback

### Objective
Support uploads without making local development fragile.

### Requirements
- Prefer Vercel Blob or Supabase Storage, or implement S3 cleanly
- If storage credentials are missing locally, support filesystem or mock fallback
- Store stable object keys in DB
- Generate signed URLs only when an authorized user requests file access
- Document local vs production behavior

### Testing for this task
- Add unit tests for storage adapter selection or fallback logic
- Add integration tests for upload and authorized file access
- Add permission tests to ensure unauthorized users cannot access protected files

### Acceptance criteria
- Resume and logo upload work in configured environments
- Local development still works without production credentials
- DB stores storage keys, not expiring signed URLs
- Access control is enforced before file access

---

## Task 20: Final end-to-end verification and regression pass

### Objective
Validate the whole product as an integrated system.

### Requirements
- Run end-to-end verification across all core user flows
- Run regression checks across auth, permissions, approval logic, applications, messaging, dashboard metrics, and local fallbacks
- Fill only small remaining test gaps discovered during final verification
- Fix broken or flaky tests
- Do not treat this task as the first time core unit and integration tests are written

### Required end-to-end coverage
- student signs up and applies
- company signs up and creates a draft job posting
- admin approves company
- company publishes a job posting
- company reviews an applicant
- company initiates a message thread
- student replies
- admin loads dashboard

### Acceptance criteria
- End-to-end tests pass
- Regression checks pass
- Core workflows function correctly as one integrated system
- Only small final testing gaps were addressed here

---

## Task 21: Write developer documentation

### Objective
Make the repo usable by a human developer after Claude finishes coding.

### Requirements
Create or update:
- `README.md`
- `.env.example`
- `DEPLOYMENT.md`

### README must include
- project overview
- local setup
- env vars
- prisma migration commands
- seed command
- auth setup notes
- email fallback behavior
- storage fallback behavior
- test commands

### DEPLOYMENT must include
- Vercel deployment flow
- managed Postgres setup
- Prisma production migration steps
- required env vars
- rollback/failure notes

### Testing for this task
- Verify documentation steps work on a clean environment where practical
- Verify all mentioned commands match the actual repo scripts

### Acceptance criteria
- A new developer can boot the app locally from docs
- Deployment steps are explicit
- Local development caveats are documented

---

## Task 22: Final polish and release readiness

### Objective
Make the app feel production-ready for V1.

### Requirements
- Improve empty states
- Improve error states
- Ensure loading states are reasonable
- Remove dead code
- Remove unused components and routes
- Verify permissions across all main flows
- Verify the seeded demo looks good
- Ensure soft-deleted content is excluded from standard queries

### Testing for this task
- Run full test suite one more time
- Run a quick manual QA pass on the main flows
- Confirm no critical regression was introduced during polish

### Acceptance criteria
- Main flows feel complete
- App is coherent visually and functionally
- No broken route or obvious unfinished core feature remains

---

## Definition of done

V1 is complete when all of the following are true:

- Students can sign up, create profiles, upload resumes, browse job postings, save job postings, and apply
- Companies can sign up, create profiles, create draft job postings, get approved if moderation is enabled, publish job postings, review applicants, update statuses, and initiate message threads
- Students can reply only in allowed message threads
- Admin can view the dashboard and management pages
- Approval logic works correctly
- Public job posting visibility works correctly
- Local development works without production email and storage credentials
- Seed data supports demos and testing
- Documentation is complete
- Core tests pass

---

## Suggested implementation order summary

1. Foundation
2. Schema
3. Auth
4. Seeds
5. Onboarding
6. Student profile
7. Company profile
8. Approval workflow
9. Job posting CRUD
10. Public job posting browsing
11. Saved job postings
12. Applications
13. Status management
14. Messaging
15. Admin dashboard
16. Admin pages
17. Activity events
18. Email fallback
19. Storage fallback
20. End-to-end verification and regression
21. Docs
22. Final polish