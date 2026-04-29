# CLAUDE.md

## Mission

Build a two-sided internship job board for a program that connects students with companies.

The platform should let:

- **Companies** create a profile, publish internship job postings, review applicants, and communicate with applicants
- **Students** create a profile, browse open job postings, apply to roles, and communicate with companies when a company initiates contact
- **Program admins** monitor marketplace health, review activity, and manage the system

The product should feel clean, professional, and easy to use. V1 should be practical, reliable, and maintainable by a small team.

---

## Product Summary

This is a marketplace for internship programs.

### Core outcomes
- Companies can onboard quickly and publish internship job postings
- Students can create strong profiles and apply to relevant opportunities
- Program admins can track activity and intervene when needed

### V1 principles
- Prioritize shipping a complete working product over advanced features
- Choose simple, proven architecture
- Keep workflows clear and friction low
- Avoid unnecessary complexity
- Design for future extension, but do not overbuild

---

## User Roles

## 1. Student
A student can:
- Sign up and log in
- Create and edit a student profile
- Upload a resume
- Browse and search job postings
- Save job postings
- Apply to job postings
- Track application status
- Reply to companies only after a company has initiated a message thread

## 2. Company
A company user can:
- Sign up and log in
- Create and edit a company profile
- Publish and manage internship job postings
- Browse applicants to their own job postings
- Review applicant profiles and resumes
- Update application statuses
- Initiate and manage message threads with applicants tied to their own job postings

## 3. Admin
An admin can:
- Access the admin dashboard
- View students, companies, job postings, applications, and messages
- Approve, suspend, or soft-delete companies if moderation is enabled
- Review job postings and platform activity
- View operational metrics
- Manage basic platform settings and support workflows

---

## V1 Scope

## Student features
- Authentication
- Student profile creation and editing
- Resume upload
- Browse and search job postings
- Job posting detail page
- Save job posting
- Apply to job posting
- View applications
- View application statuses
- Reply in message threads initiated by companies

## Company features
- Authentication
- Company profile creation and editing
- Create, edit, publish, pause, close, and archive job postings
- View applicants per job posting
- Review applications
- Update application statuses
- Initiate messaging with applicants

## Admin features
- Admin dashboard with key marketplace metrics
- View companies, students, job postings, and applications
- Company approval workflow if enabled
- Basic moderation tools
- Recent activity visibility
- Operational alerts

---

## Non-Goals for V1

Do not build these in the first version:
- Full ATS replacement
- Payroll or internship tracking after placement
- Video interviewing
- Advanced AI matching
- Interview scheduling
- Deep analytics suite
- Multi-tenant white-labeling
- Complex permissions beyond the core role model

---

## Recommended Stack

Use a TypeScript-first stack with fast developer velocity.

### Frontend
- Next.js
- React
- TypeScript
- Tailwind CSS
- shadcn/ui for core UI patterns

### Frontend architecture requirement
- Use **Next.js App Router** with the `/app` directory
- Do not mix App Router and Pages Router patterns

### Backend
- Next.js App Router
- Route Handlers and server-side actions where appropriate
- Clear service layer for business logic
- Zod for validation

### Database
- PostgreSQL
- Prisma ORM

### Auth
Use one of:
- NextAuth
- Clerk

Choose one and implement it cleanly. Do not mix multiple auth systems.

### Auth session requirements
- Configure the auth system to securely include the user's `id` and `role` in the session or token
- Include company `approvalStatus` in the session only if the auth system supports safe refresh or revalidation
- Do not rely on possibly stale session data for sensitive actions like job posting publication
- For sensitive publish or approval-gated actions, verify the current approval state server-side against the database

### Storage
- Prefer a low-friction storage provider such as Vercel Blob or Supabase Storage
- S3-compatible storage is acceptable if implemented cleanly
- Store stable object keys or paths in the database, not expiring signed URLs
- Generate signed URLs only at read time for authorized users

### Deployment
- Vercel for app hosting
- Managed PostgreSQL
- Environment variables documented in `.env.example`
- Claude must generate a `DEPLOYMENT.md` file that explains:
  - local setup
  - environment variables
  - how to run Prisma migrations locally
  - how to deploy to Vercel
  - how to run Prisma migrations against production
  - how to seed development data
  - what to do if a deployment or migration fails

### Messaging
- Store messages in the database
- Realtime is optional
- Prefer simple async messaging in V1

---

## Product Requirements

## Authentication and onboarding

### Requirements
- Email/password auth
- Password reset
- Email verification preferred
- Role selection during onboarding: Student or Company
- Admin role seeded manually
- Redirect users into the correct dashboard after login

### Onboarding goals
- New students should quickly reach a usable profile
- New companies should quickly reach a publishable draft job posting
- Empty states should guide users clearly

---

## Approval and moderation workflow

If moderation is enabled, newly registered companies start in `PENDING`.

### Company approval statuses
Use:
- `PENDING`
- `APPROVED`
- `SUSPENDED`

### Rules
- A company in `PENDING` can create and edit its profile
- A company in `PENDING` can create and edit draft job postings
- Job postings belonging to a `PENDING` company are not publicly visible to students
- Only `APPROVED` companies can have publicly visible job postings
- A company in `SUSPENDED` cannot publish new job postings and its public job postings should be hidden
- Admins can approve or suspend companies from admin screens

If moderation is not enabled, companies may default to `APPROVED`.

---

## Student experience

### Student profile fields
- Full name
- Headline
- University
- Graduation year
- Degree
- Major
- Location
- Work authorization
- Bio
- Skills
- Experience
- Projects
- Resume storage key
- Portfolio URL
- LinkedIn URL
- GitHub URL
- Program tag

### Student profile behavior
- Show profile completeness
- Encourage required fields before application
- Permit later edits
- Resume files should be private and accessible only to authorized viewers
- Resume access should use generated signed URLs at read time when storage requires it

### Student job posting browsing
Support:
- Keyword search
- Filter by location
- Filter by remote / hybrid / onsite
- Filter by industry
- Filter by internship term
- Filter by paid / unpaid if compensation data exists
- Filter by program tag if useful for admins or segmented program views

### Student application flow
- Student opens a job posting detail page
- Student reviews role and company details
- Student applies using profile data
- Optional cover letter text field
- Snapshot the student's `resumeStorageKey` at time of application
- Student sees confirmation and application status

### Student application statuses
Use these statuses:
- Applied
- In Review
- Interviewing
- Offer
- Rejected
- Withdrawn

### Student messaging rule
- Students may not initiate free-form message threads with companies
- Students may reply only after a company has initiated a message thread tied to an existing application
- The cover letter is the student's only initial free-form text at application time

---

## Company experience

### Company profile fields
- Company name
- Slug
- Logo storage key
- Website
- Industry
- Company size
- Headquarters location
- Short description
- Full description
- Contact email
- Optional social links
- Program tag

### Job posting fields
- Title
- Department or team
- Location
- Workplace type
- Internship term
- Start date
- Duration
- Compensation type
- Compensation min
- Compensation max
- Description
- Responsibilities
- Qualifications
- Application deadline
- Status
- Program tag

### Job posting status values
Use:
- Draft
- Published
- Paused
- Closed
- Archived

### Company flow
1. Sign up
2. Create company profile
3. Create draft job posting(s)
4. If moderation is enabled, wait for admin approval before job postings become publicly visible
5. Once approved, publish job postings
6. Review applicants
7. Update application statuses
8. Initiate message threads with applicants when needed

### Company job posting management
A company can:
- Create a new job posting
- Save as draft
- Publish
- Edit
- Pause
- Close
- Archive

### Applicant review
A company can:
- View applicants per job posting
- Open applicant profile
- View uploaded resume
- Update application status
- Initiate messages within the message thread

### Company messaging rule
A company can message only applicants who applied to one of its job postings.

---

## Admin dashboard

Build a basic admin dashboard for the program administrator to understand platform health and operational status.

This should be useful on day one. It should not try to be a full analytics warehouse.

## Goals
The admin should be able to answer:
- How many students and companies are on the platform?
- How many student profiles are complete?
- How many companies are approved?
- How many job postings are published and currently open?
- How many applications have been submitted recently?
- Where are applicants in the funnel?
- Which job postings or companies need attention?
- What has happened recently on the platform?
- How is activity split across program tags?

## Route
- `/admin`

## Dashboard sections

### 1. Overview metrics
Show top-level KPI cards for:
- Total students
- Students with completed profiles
- Total companies
- Approved companies
- Pending companies
- Total published job postings
- Currently open job postings
- Total applications
- Applications in last 7 days

### 2. Funnel snapshot
Show a compact summary of:
- Published job postings
- Job postings with at least 1 applicant
- Total applications
- In Review
- Interviewing
- Offers
- Rejections

This can be cards or a simple bar chart.

### 3. Operational alerts
Show a "Needs Attention" section with:
- Companies pending approval
- Job postings still in draft
- Job postings closing in the next 7 days
- Job postings with zero applicants after 14 days
- Flagged items if moderation is enabled

### 4. Recent activity feed
Show the latest activity such as:
- New company sign-up
- New student sign-up
- New job posting published
- New application submitted
- Application status changed
- Company approval status changed

Limit to the most recent 20 events.

### 5. Top performing job postings
Show a compact table with:
- Job posting title
- Company
- Published date
- Number of applications
- Status
- Program tag

Sort by highest application count.

### 6. Company participation table
Show:
- Company name
- Approval status
- Number of open job postings
- Total applicants
- Last activity date
- Program tag

### 7. Program tag filter
Add simple filtering by:
- Last 7 days
- Last 30 days
- Last 90 days
- All time
- Program tag

Use filters where relevant for metrics and activity.

### Dashboard UX requirements
- Clarity over density
- First screen must be scannable
- Responsive on laptop-sized screens
- Use metric cards, simple charts, and compact tables
- Avoid advanced drill-down analytics in V1

### Access control
Only admins can access dashboard routes and metrics endpoints.

---

## Admin management pages

Build supporting admin pages:

- `/admin/companies`
- `/admin/job-postings`
- `/admin/students`
- `/admin/applications`

Each page should support table views with basic filters and searchable lists where sensible.

### Admin capabilities
- View all entities
- Review pending company approvals
- Review job postings
- View application activity
- Filter by program tag
- Suspend or soft-delete records where needed
- Leave internal notes if simple to implement

---

## Routes

## Public routes
- `/`
- `/job-postings`
- `/job-postings/[slug]`
- `/companies/[slug]`
- `/login`
- `/signup`

## Student routes
- `/student/dashboard`
- `/student/profile`
- `/student/applications`
- `/student/saved-job-postings`
- `/student/messages`

## Company routes
- `/company/dashboard`
- `/company/profile`
- `/company/job-postings`
- `/company/job-postings/new`
- `/company/job-postings/[id]`
- `/company/applications`
- `/company/applications/[id]`
- `/company/messages`

## Admin routes
- `/admin`
- `/admin/companies`
- `/admin/job-postings`
- `/admin/students`
- `/admin/applications`

---

## Data model

Design a clean relational schema.

## User
- id
- email
- password hash or auth provider fields
- role: STUDENT | COMPANY | ADMIN
- deletedAt
- createdAt
- updatedAt

### User uniqueness note
- Ensure unique constraints for soft-deletable fields such as `email` are compatible with soft deletes
- Prefer partial unique indexes or another safe strategy that does not block re-registration after soft deletion
- If partial indexes are not practical in the chosen tooling, mutate archived values on soft delete to preserve uniqueness

## StudentProfile
- id
- userId
- fullName
- headline
- university
- graduationYear
- degree
- major
- location
- workAuthorization
- bio
- resumeStorageKey
- portfolioUrl
- linkedinUrl
- githubUrl
- programTag
- isProfileComplete
- createdAt
- updatedAt

## StudentSkill
- id
- studentProfileId
- name

## StudentExperience
- id
- studentProfileId
- title
- organization
- startDate
- endDate
- description

## StudentProject
- id
- studentProfileId
- name
- url
- description

## CompanyProfile
- id
- userId
- companyName
- slug
- logoStorageKey
- websiteUrl
- industry
- companySize
- headquarters
- shortDescription
- description
- contactEmail
- programTag
- approvalStatus
- deletedAt
- createdAt
- updatedAt

### CompanyProfile uniqueness note
- Ensure unique constraints for soft-deletable fields such as `slug` are compatible with soft deletes
- Prefer partial unique indexes or another safe strategy that does not block reuse after soft deletion
- If partial indexes are not practical in the chosen tooling, mutate archived values on soft delete to preserve uniqueness

## JobPosting
- id
- companyProfileId
- slug
- title
- department
- location
- workplaceType
- internshipTerm
- startDate
- duration
- compensationType
- compensationMin
- compensationMax
- description
- responsibilities
- qualifications
- applicationDeadline
- status
- programTag
- publishedAt
- deletedAt
- createdAt
- updatedAt

## SavedJobPosting
- id
- studentProfileId
- jobPostingId
- createdAt

## Application
- id
- jobPostingId
- studentProfileId
- coverLetter
- resumeStorageKeySnapshot
- status
- appliedAt
- updatedAt

## MessageThread
- id
- applicationId
- initiatedByUserId
- createdAt
- updatedAt

## Message
- id
- threadId
- senderUserId
- body
- readAt
- createdAt

## ActivityEvent
- id
- type
- actorUserId
- entityType
- entityId
- metadataJson
- createdAt

## AdminNote
- id
- entityType
- entityId
- authorUserId
- body
- createdAt

Use enums for:
- user role
- company approval status
- job posting status
- application status
- workplace type
- compensation type

---

## Permissions and access rules

### Students
- Can edit only their own profile
- Can save job postings as themselves
- Can apply only as themselves
- Can view only their own applications
- Can reply only inside message threads tied to their own applications and only if a company has initiated the thread

### Companies
- Can edit only their own company profile
- Can create and manage only their own job postings
- Can view only applications for their own job postings
- Can initiate message threads only with applicants tied to their own job postings

### Admins
- Full access to admin routes and metrics
- Broad access to records for moderation and support

### Security rule
Never rely on client-side role checks alone.
All authorization must be enforced on the server.

---

## Search and filtering

For V1, use Postgres queries and indexes.
Do not introduce Elasticsearch or a search service.

### Job posting search support
- Keyword
- Location
- Workplace type
- Industry
- Internship term
- Status filtering for internal views
- Program tag filtering where needed

### Company-side applicant filtering
Keep it basic:
- By application status
- By job posting

---

## Messaging rules

Keep messaging intentionally constrained.

### Requirements
- Messages belong to a message thread tied to an application
- A message thread exists only if an application exists
- Students cannot cold-message companies
- Companies may initiate message threads with applicants to their own job postings
- Students may only reply after a message thread exists and the company initiated it
- Include read/unread state if straightforward
- Do not build a full chat product in V1

---

## Notifications

## Email notifications
Implement basic email notifications for:
- Welcome email
- Application submitted
- New applicant received
- New message received
- Application status changed
- Company approval decision if moderation is enabled

## Local development email behavior
- For V1 local development, mock email delivery by logging structured email payloads to the server console
- Do not block sign-up, application, messaging, or status update flows on a real SMTP or email provider
- Real email provider integration can be enabled later through environment variables

## In-app notifications
Optional for V1.
Only add them if simple and clean.

---

## File uploads and local development behavior

### Requirements
- Prefer a storage option with low setup friction in development
- If storage credentials are missing in local development, provide a safe fallback such as local filesystem storage or a clearly isolated mock storage mode
- Do not block core user flows because third-party storage credentials are missing
- Any local fallback should be clearly separated from production behavior and documented in `README` and `DEPLOYMENT.md`

### Resume and asset access
- Store object keys or paths in the database, not expiring signed URLs
- Generate signed URLs dynamically when an authorized user requests access
- Enforce permission checks before generating or returning access URLs

---

## API and backend requirements

Create backend functionality for:
- Authentication
- Role-aware onboarding
- Student profile CRUD
- Company profile CRUD
- Company approval flow
- Job posting CRUD
- Public job posting list and job posting detail
- Job posting search and filters
- Saved job postings
- Application creation
- Application status updates
- Message threads and messages
- Admin dashboard metrics
- Admin list pages and moderation actions

### Validation
Use Zod or equivalent validation on all inputs.

### Error handling
Return structured, predictable errors.
Handle auth failures, validation failures, and permission failures clearly.

### External service development mode
- For any feature that depends on external services, support a documented local development mode that works without production credentials
- Email, storage, and other integrations should fail gracefully in development
- Core product flows must remain testable locally without production service accounts

---

## Admin metrics queries

Support backend queries for:
- Count of students
- Count of profile-complete students
- Count of companies
- Count of approved companies
- Count of pending companies
- Count of published job postings
- Count of currently open job postings
- Count of total applications
- Count of applications in last 7 / 30 / 90 days
- Count of applications by status
- Job postings with zero applicants after 14 days
- Job postings closing soon
- Recent activity events
- Top job postings by application volume
- Company participation summary
- Optional filtering by program tag

---

## UX requirements

## General UX
- Clean and professional
- Mobile responsive
- Accessible forms and navigation
- Strong empty states
- Clear success and error states
- Minimal clutter

## Student UX
- Guided onboarding
- Profile completeness indicator
- Fast search and browse flow
- Easy apply flow
- Clear applications dashboard

## Company UX
- Guided profile setup
- Clear status messaging if approval is pending
- Job posting creation flow that is quick and obvious
- Straightforward applicant review
- Simple messaging UI
- Dashboard showing job postings and recent applicants

## Admin UX
- Operational, not flashy
- Key signals visible immediately
- Tables readable and searchable where appropriate
- Charts simple and minimal

---

## Security and privacy

### Requirements
- Protect private user data
- Resumes must not be public
- File access must be permission-aware
- Sanitize rich text if rich text is supported
- Rate limit sensitive endpoints
- Protect admin routes
- Store secrets in environment variables
- Follow secure upload practices

### Sensitive assets
- Resume files
- Company contact data
- Private messages
- Admin-only metrics and moderation data

### Deletion approach
- Use `deletedAt` for soft deletion on core tables
- Do not hard delete core records in normal admin workflows
- Exclude soft-deleted records from normal app queries

---

## Performance requirements

- Fast initial page loads
- Paginate large tables and lists
- Use server rendering where it helps performance or SEO
- Avoid premature microservices
- Use indexed database queries
- Optimize images and file access paths
- Avoid redundant database lookups for basic auth state when session or token data can safely provide `id` and `role`

---

## Analytics for V1

Track these core metrics and surface the important ones in the admin dashboard:
- Number of student sign-ups
- Number of completed student profiles
- Number of company sign-ups
- Number of approved companies
- Number of pending companies
- Number of published job postings
- Number of open job postings
- Number of applications
- Applications in last 7 / 30 days
- Applications by status
- Job postings with zero applicants
- Most viewed job postings
- Most applied-to job postings
- Activity by program tag if available

Do not build a heavy analytics platform in V1.
Focus on operational visibility for the program admin.

---

## Seed data

Create development seed data for:
- 1 admin
- 3 companies
- 10 students
- 12 job postings
- 15 applications
- Sample message threads
- Sample activity events
- Multiple program tags for realistic admin filtering

Seed data should make dashboards, workflows, and demos usable immediately.

---

## Testing expectations

At minimum include:

### Unit tests
- Validation logic
- Permission logic
- Application status transitions
- Company approval logic
- Messaging access rules

### Integration tests
- Student application flow
- Company job posting publication flow
- Company applicant review flow
- Messaging access rules
- Admin dashboard access control
- Approval workflow for pending companies
- Local development fallbacks for email and storage where practical

### End-to-end tests
- Student signs up and applies
- Company signs up and creates a draft job posting
- Admin approves company
- Company publishes a job posting
- Company reviews an applicant
- Company initiates a message thread
- Student replies
- Admin loads dashboard successfully

---

## Development phases

## Phase 1
- Initialize app
- Set up auth
- Set up Prisma and PostgreSQL
- Define schema
- Create base layouts and navigation
- Seed admin user

## Phase 2
- Student onboarding and profile
- Company onboarding and profile
- Approval status handling
- Public job posting list and detail
- Company job posting CRUD

## Phase 3
- Saved job postings
- Applications
- Company applicant review
- Application statuses

## Phase 4
- Messaging
- Admin dashboard
- Admin management pages
- Activity event tracking

## Phase 5
- Notifications
- Storage integration and local fallbacks
- Testing
- UX polish
- Documentation
- Deployment readiness

---

## Coding standards

- Use TypeScript everywhere
- Prefer server-side validation and authorization
- Keep components small and composable
- Separate UI, business logic, and data access
- Use Prisma migrations properly
- Keep naming consistent across DB, API, and UI
- Avoid over-abstracting early
- Write comments only where they add real clarity
- Remove dead code and placeholder scaffolding

---

## Build quality requirements

- Never leave `TODO` comments or placeholder UI for core V1 features
- If a feature is required for a primary user flow, build the complete UI, validation, server actions or API routes, and database wiring
- Do not stop at mock data for core flows unless explicitly asked
- Prefer a smaller complete implementation over a larger half-built one

---

## UI implementation guidance

Use a clean, modern UI with reusable patterns.

### Preferred patterns
- Metric cards
- Data tables
- Search/filter bars
- Dialogs for confirmation flows
- Empty states with clear next actions
- Toasts or inline alerts for feedback

### Avoid
- Overly dense dashboards
- Fancy animations that slow down development
- Massive form components with mixed responsibilities
- Premature design system complexity

---

## Deliverables

Claude Code should generate:
- A working full-stack app
- Clear folder structure
- Database schema and migrations
- Seed script
- Auth and onboarding flows
- Student dashboard and profile flows
- Company dashboard and job posting flows
- Public job posting browsing
- Job posting application flow
- Messaging flow
- Admin dashboard
- Admin list pages
- README with setup instructions
- `.env.example`
- `DEPLOYMENT.md`

---

## Definition of done for V1

V1 is done when:
- Students can sign up, complete profiles, browse job postings, save job postings, and apply
- Companies can sign up, complete profiles, create draft job postings, get approved if moderation is enabled, publish job postings, review applicants, and initiate messages
- Students can reply to company-initiated message threads
- Admin can access a dashboard and understand the program's current status
- Admin can approve pending companies
- Core permissions are enforced correctly
- Seeded data makes local testing easy
- Basic tests cover the main flows
- The app is deployable and documented
- Local development works even without production email and storage credentials

---

## What Claude should do first

1. Initialize a Next.js TypeScript app using App Router
2. Add Tailwind and UI components
3. Set up Prisma with PostgreSQL
4. Implement authentication and role selection
5. Create the schema and migrations
6. Build student and company onboarding flows
7. Add company approval logic
8. Build public job posting browsing and detail pages
9. Build applications and saved job postings
10. Build company applicant review
11. Build messaging
12. Build admin dashboard and admin pages
13. Add local development fallbacks for email and storage
14. Add seeds, tests, and docs
15. Generate `DEPLOYMENT.md`

---

## How Claude should work in this repo

When making changes:
- Briefly explain the plan before major edits
- Work in small, testable steps
- Summarize what changed after each major step
- Preserve existing working behavior
- Choose the simplest sensible V1 implementation when requirements are ambiguous
- Flag tradeoffs instead of hiding them

When generating code:
- Prefer complete working flows over vague stubs
- Use realistic placeholder content where needed
- Keep forms usable
- Make dashboards and tables functional, not decorative
- Never leave `TODO` comments for core V1 features
- If a component is required for the user flow, build the complete UI and wire it to the database

When proposing follow-up improvements:
- Separate must-have from nice-to-have
- Keep recommendations grounded in fast shipping

---

## Nice-to-have after V1

Defer these until the core product works well:
- AI-assisted matching
- Resume parsing
- Interview scheduling
- Bulk messaging
- Export to CSV
- Advanced analytics
- Program-based reporting with a relational data model
- Employer verification workflows
- Saved search alerts
- Recommendations engine