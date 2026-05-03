-- Task 17: extend ActivityEventType enum with the new triggers added by
-- the audit pass. ALTER TYPE ... ADD VALUE is not transactional in
-- Postgres (each value lands in its own commit) so each statement runs
-- standalone. `IF NOT EXISTS` keeps the migration idempotent across
-- environments where some values may already exist.

ALTER TYPE "ActivityEventType" ADD VALUE IF NOT EXISTS 'STUDENT_PROFILE_COMPLETED';
ALTER TYPE "ActivityEventType" ADD VALUE IF NOT EXISTS 'COMPANY_PROFILE_CREATED';
ALTER TYPE "ActivityEventType" ADD VALUE IF NOT EXISTS 'COMPANY_SOFT_DELETED';
ALTER TYPE "ActivityEventType" ADD VALUE IF NOT EXISTS 'STUDENT_SOFT_DELETED';
ALTER TYPE "ActivityEventType" ADD VALUE IF NOT EXISTS 'JOB_POSTING_CREATED';
ALTER TYPE "ActivityEventType" ADD VALUE IF NOT EXISTS 'JOB_POSTING_PAUSED';
ALTER TYPE "ActivityEventType" ADD VALUE IF NOT EXISTS 'JOB_POSTING_CLOSED';
ALTER TYPE "ActivityEventType" ADD VALUE IF NOT EXISTS 'JOB_POSTING_ARCHIVED';
ALTER TYPE "ActivityEventType" ADD VALUE IF NOT EXISTS 'JOB_POSTING_SOFT_DELETED';
ALTER TYPE "ActivityEventType" ADD VALUE IF NOT EXISTS 'APPLICATION_WITHDRAWN';
