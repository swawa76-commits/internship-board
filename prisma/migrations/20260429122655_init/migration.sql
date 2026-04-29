-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('STUDENT', 'COMPANY', 'ADMIN');

-- CreateEnum
CREATE TYPE "CompanyApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "JobPostingStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'PAUSED', 'CLOSED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ApplicationStatus" AS ENUM ('APPLIED', 'IN_REVIEW', 'INTERVIEWING', 'OFFER', 'REJECTED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "WorkplaceType" AS ENUM ('REMOTE', 'HYBRID', 'ONSITE');

-- CreateEnum
CREATE TYPE "CompensationType" AS ENUM ('PAID', 'UNPAID', 'STIPEND');

-- CreateEnum
CREATE TYPE "InternshipTerm" AS ENUM ('SUMMER', 'FALL', 'WINTER', 'SPRING', 'YEAR_ROUND');

-- CreateEnum
CREATE TYPE "ActivityEventType" AS ENUM ('STUDENT_SIGNUP', 'COMPANY_SIGNUP', 'COMPANY_APPROVAL_CHANGED', 'JOB_POSTING_PUBLISHED', 'APPLICATION_SUBMITTED', 'APPLICATION_STATUS_CHANGED', 'MESSAGE_THREAD_CREATED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT,
    "role" "UserRole" NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudentProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "headline" TEXT,
    "university" TEXT,
    "graduationYear" INTEGER,
    "degree" TEXT,
    "major" TEXT,
    "location" TEXT,
    "workAuthorization" TEXT,
    "bio" TEXT,
    "resumeStorageKey" TEXT,
    "portfolioUrl" TEXT,
    "linkedinUrl" TEXT,
    "githubUrl" TEXT,
    "programTag" TEXT,
    "isProfileComplete" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StudentProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudentSkill" (
    "id" TEXT NOT NULL,
    "studentProfileId" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "StudentSkill_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudentExperience" (
    "id" TEXT NOT NULL,
    "studentProfileId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "organization" TEXT NOT NULL,
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "description" TEXT,

    CONSTRAINT "StudentExperience_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudentProject" (
    "id" TEXT NOT NULL,
    "studentProfileId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT,
    "description" TEXT,

    CONSTRAINT "StudentProject_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompanyProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "companyName" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "logoStorageKey" TEXT,
    "websiteUrl" TEXT,
    "industry" TEXT,
    "companySize" TEXT,
    "headquarters" TEXT,
    "shortDescription" TEXT,
    "description" TEXT,
    "contactEmail" TEXT,
    "programTag" TEXT,
    "approvalStatus" "CompanyApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanyProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobPosting" (
    "id" TEXT NOT NULL,
    "companyProfileId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "department" TEXT,
    "location" TEXT,
    "workplaceType" "WorkplaceType" NOT NULL,
    "internshipTerm" "InternshipTerm",
    "startDate" TIMESTAMP(3),
    "duration" TEXT,
    "compensationType" "CompensationType",
    "compensationMin" INTEGER,
    "compensationMax" INTEGER,
    "description" TEXT NOT NULL,
    "responsibilities" TEXT,
    "qualifications" TEXT,
    "applicationDeadline" TIMESTAMP(3),
    "status" "JobPostingStatus" NOT NULL DEFAULT 'DRAFT',
    "programTag" TEXT,
    "publishedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JobPosting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SavedJobPosting" (
    "id" TEXT NOT NULL,
    "studentProfileId" TEXT NOT NULL,
    "jobPostingId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SavedJobPosting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Application" (
    "id" TEXT NOT NULL,
    "jobPostingId" TEXT NOT NULL,
    "studentProfileId" TEXT NOT NULL,
    "coverLetter" TEXT,
    "resumeStorageKeySnapshot" TEXT,
    "status" "ApplicationStatus" NOT NULL DEFAULT 'APPLIED',
    "appliedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Application_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MessageThread" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "initiatedByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MessageThread_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Message" (
    "id" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "senderUserId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActivityEvent" (
    "id" TEXT NOT NULL,
    "type" "ActivityEventType" NOT NULL,
    "actorUserId" TEXT,
    "entityType" TEXT,
    "entityId" TEXT,
    "metadataJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActivityEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminNote" (
    "id" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "authorUserId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminNote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "User_role_idx" ON "User"("role");

-- CreateIndex
CREATE INDEX "User_deletedAt_idx" ON "User"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "StudentProfile_userId_key" ON "StudentProfile"("userId");

-- CreateIndex
CREATE INDEX "StudentProfile_programTag_idx" ON "StudentProfile"("programTag");

-- CreateIndex
CREATE INDEX "StudentProfile_isProfileComplete_idx" ON "StudentProfile"("isProfileComplete");

-- CreateIndex
CREATE INDEX "StudentSkill_studentProfileId_idx" ON "StudentSkill"("studentProfileId");

-- CreateIndex
CREATE UNIQUE INDEX "StudentSkill_studentProfileId_name_key" ON "StudentSkill"("studentProfileId", "name");

-- CreateIndex
CREATE INDEX "StudentExperience_studentProfileId_idx" ON "StudentExperience"("studentProfileId");

-- CreateIndex
CREATE INDEX "StudentProject_studentProfileId_idx" ON "StudentProject"("studentProfileId");

-- CreateIndex
CREATE UNIQUE INDEX "CompanyProfile_userId_key" ON "CompanyProfile"("userId");

-- CreateIndex
CREATE INDEX "CompanyProfile_approvalStatus_idx" ON "CompanyProfile"("approvalStatus");

-- CreateIndex
CREATE INDEX "CompanyProfile_programTag_idx" ON "CompanyProfile"("programTag");

-- CreateIndex
CREATE INDEX "CompanyProfile_deletedAt_idx" ON "CompanyProfile"("deletedAt");

-- CreateIndex
CREATE INDEX "JobPosting_companyProfileId_idx" ON "JobPosting"("companyProfileId");

-- CreateIndex
CREATE INDEX "JobPosting_status_idx" ON "JobPosting"("status");

-- CreateIndex
CREATE INDEX "JobPosting_programTag_idx" ON "JobPosting"("programTag");

-- CreateIndex
CREATE INDEX "JobPosting_publishedAt_idx" ON "JobPosting"("publishedAt");

-- CreateIndex
CREATE INDEX "JobPosting_deletedAt_idx" ON "JobPosting"("deletedAt");

-- CreateIndex
CREATE INDEX "JobPosting_workplaceType_idx" ON "JobPosting"("workplaceType");

-- CreateIndex
CREATE INDEX "JobPosting_internshipTerm_idx" ON "JobPosting"("internshipTerm");

-- CreateIndex
CREATE INDEX "SavedJobPosting_studentProfileId_idx" ON "SavedJobPosting"("studentProfileId");

-- CreateIndex
CREATE INDEX "SavedJobPosting_jobPostingId_idx" ON "SavedJobPosting"("jobPostingId");

-- CreateIndex
CREATE UNIQUE INDEX "SavedJobPosting_studentProfileId_jobPostingId_key" ON "SavedJobPosting"("studentProfileId", "jobPostingId");

-- CreateIndex
CREATE INDEX "Application_jobPostingId_idx" ON "Application"("jobPostingId");

-- CreateIndex
CREATE INDEX "Application_studentProfileId_idx" ON "Application"("studentProfileId");

-- CreateIndex
CREATE INDEX "Application_status_idx" ON "Application"("status");

-- CreateIndex
CREATE INDEX "Application_appliedAt_idx" ON "Application"("appliedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Application_jobPostingId_studentProfileId_key" ON "Application"("jobPostingId", "studentProfileId");

-- CreateIndex
CREATE INDEX "MessageThread_applicationId_idx" ON "MessageThread"("applicationId");

-- CreateIndex
CREATE INDEX "MessageThread_initiatedByUserId_idx" ON "MessageThread"("initiatedByUserId");

-- CreateIndex
CREATE INDEX "Message_threadId_idx" ON "Message"("threadId");

-- CreateIndex
CREATE INDEX "Message_senderUserId_idx" ON "Message"("senderUserId");

-- CreateIndex
CREATE INDEX "Message_createdAt_idx" ON "Message"("createdAt");

-- CreateIndex
CREATE INDEX "ActivityEvent_type_idx" ON "ActivityEvent"("type");

-- CreateIndex
CREATE INDEX "ActivityEvent_createdAt_idx" ON "ActivityEvent"("createdAt");

-- CreateIndex
CREATE INDEX "ActivityEvent_entityType_entityId_idx" ON "ActivityEvent"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "AdminNote_entityType_entityId_idx" ON "AdminNote"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "AdminNote_authorUserId_idx" ON "AdminNote"("authorUserId");

-- AddForeignKey
ALTER TABLE "StudentProfile" ADD CONSTRAINT "StudentProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentSkill" ADD CONSTRAINT "StudentSkill_studentProfileId_fkey" FOREIGN KEY ("studentProfileId") REFERENCES "StudentProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentExperience" ADD CONSTRAINT "StudentExperience_studentProfileId_fkey" FOREIGN KEY ("studentProfileId") REFERENCES "StudentProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentProject" ADD CONSTRAINT "StudentProject_studentProfileId_fkey" FOREIGN KEY ("studentProfileId") REFERENCES "StudentProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyProfile" ADD CONSTRAINT "CompanyProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobPosting" ADD CONSTRAINT "JobPosting_companyProfileId_fkey" FOREIGN KEY ("companyProfileId") REFERENCES "CompanyProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavedJobPosting" ADD CONSTRAINT "SavedJobPosting_studentProfileId_fkey" FOREIGN KEY ("studentProfileId") REFERENCES "StudentProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavedJobPosting" ADD CONSTRAINT "SavedJobPosting_jobPostingId_fkey" FOREIGN KEY ("jobPostingId") REFERENCES "JobPosting"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Application" ADD CONSTRAINT "Application_jobPostingId_fkey" FOREIGN KEY ("jobPostingId") REFERENCES "JobPosting"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Application" ADD CONSTRAINT "Application_studentProfileId_fkey" FOREIGN KEY ("studentProfileId") REFERENCES "StudentProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageThread" ADD CONSTRAINT "MessageThread_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageThread" ADD CONSTRAINT "MessageThread_initiatedByUserId_fkey" FOREIGN KEY ("initiatedByUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "MessageThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_senderUserId_fkey" FOREIGN KEY ("senderUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityEvent" ADD CONSTRAINT "ActivityEvent_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdminNote" ADD CONSTRAINT "AdminNote_authorUserId_fkey" FOREIGN KEY ("authorUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ----------------------------------------------------------------------------
-- Soft-delete-safe uniqueness (CLAUDE.md "uniqueness note")
--
-- Prisma can't model partial unique indexes natively, so they live here as
-- raw SQL. They constrain only "active" (non-soft-deleted) rows, which lets
-- a previously soft-deleted email/slug be reused by a new active record.
--
-- Pair this with: in application code, exclude `deletedAt IS NOT NULL`
-- from normal reads (a forthcoming repository convention).
-- ----------------------------------------------------------------------------

-- Active-only unique email
CREATE UNIQUE INDEX "User_email_active_key"
  ON "User" ("email")
  WHERE "deletedAt" IS NULL;

-- Active-only unique company slug
CREATE UNIQUE INDEX "CompanyProfile_slug_active_key"
  ON "CompanyProfile" ("slug")
  WHERE "deletedAt" IS NULL;

-- Active-only unique job posting slug per company
CREATE UNIQUE INDEX "JobPosting_companyProfileId_slug_active_key"
  ON "JobPosting" ("companyProfileId", "slug")
  WHERE "deletedAt" IS NULL;
