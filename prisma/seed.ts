/**
 * Development seed script.
 *
 * Idempotent — safe to re-run on the same database. Seeded rows are
 * tagged with `programTag` values from a known set and addressed by
 * stable email/slug keys, so re-running upserts rather than duplicating.
 *
 * Run with:
 *   npm run db:seed
 *
 * Output: Logs the shared dev password and a table of seeded login
 * credentials so you can sign in immediately.
 */

import "dotenv/config";

import { PrismaPg } from "@prisma/adapter-pg";

import { hashPassword } from "@/lib/auth/password";
import { PrismaClient } from "@/lib/db/generated/client";
import type {
  ApplicationStatus,
  CompanyApprovalStatus,
} from "@/lib/db/generated/enums";

// The seed runs as a standalone Node script (via tsx) so it instantiates
// its own Prisma client. `lib/db/client.ts` is guarded by `server-only` and
// is intended for the Next runtime, not for one-shot scripts.
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL is not set; seed aborted.");
}
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: databaseUrl }),
});

const SHARED_DEV_PASSWORD = "Password123!";

const PROGRAM_TAGS = [
  "Cohort 2026",
  "FellowsX",
  "Returnship",
  "ScholarsLab",
] as const;

type CompanySeed = {
  email: string;
  companyName: string;
  slug: string;
  approvalStatus: CompanyApprovalStatus;
  industry: string;
  programTag: string;
  shortDescription: string;
};

type StudentSeed = {
  email: string;
  fullName: string;
  university: string;
  major: string;
  graduationYear: number;
  programTag: string;
  skills: string[];
};

type JobPostingSeed = {
  companyEmail: string;
  slug: string;
  title: string;
  workplaceType: "REMOTE" | "HYBRID" | "ONSITE";
  internshipTerm: "SUMMER" | "FALL" | "WINTER" | "SPRING" | "YEAR_ROUND";
  description: string;
  status: "DRAFT" | "PUBLISHED" | "PAUSED" | "CLOSED" | "ARCHIVED";
  programTag: string;
  publishedDaysAgo?: number;
};

type ApplicationSeed = {
  studentEmail: string;
  jobSlug: string;
  status: ApplicationStatus;
  daysAgo: number;
  withMessageThread?: boolean;
};

const COMPANIES: CompanySeed[] = [
  {
    email: "acme@example.test",
    companyName: "Acme Robotics",
    slug: "acme-robotics",
    approvalStatus: "APPROVED",
    industry: "Robotics",
    programTag: PROGRAM_TAGS[0],
    shortDescription: "Industrial automation built for small factories.",
  },
  {
    email: "globex@example.test",
    companyName: "Globex Health",
    slug: "globex-health",
    approvalStatus: "PENDING",
    industry: "Healthcare",
    programTag: PROGRAM_TAGS[1],
    shortDescription: "Tools for community clinics.",
  },
  {
    email: "initech@example.test",
    companyName: "Initech Systems",
    slug: "initech-systems",
    approvalStatus: "SUSPENDED",
    industry: "Enterprise SaaS",
    programTag: PROGRAM_TAGS[2],
    shortDescription: "Internal IT for mid-sized firms.",
  },
];

const STUDENTS: StudentSeed[] = Array.from({ length: 10 }).map((_, i) => {
  const idx = i + 1;
  const programTag = PROGRAM_TAGS[i % PROGRAM_TAGS.length];
  return {
    email: `student${String(idx).padStart(2, "0")}@example.test`,
    fullName: `Student ${idx} Test`,
    university: ["State University", "Riverbend College", "Coastal Tech"][i % 3],
    major: [
      "Computer Science",
      "Mechanical Engineering",
      "Public Health",
      "Design",
    ][i % 4],
    graduationYear: 2026 + (i % 3),
    programTag,
    skills: [
      ["TypeScript", "React"],
      ["Python", "Pandas"],
      ["CAD", "MATLAB"],
      ["Figma", "User research"],
    ][i % 4],
  };
});

const JOB_POSTINGS: JobPostingSeed[] = [
  // Acme Robotics (APPROVED) — 6 postings, mostly published.
  {
    companyEmail: "acme@example.test",
    slug: "robotics-controls-intern",
    title: "Robotics Controls Intern",
    workplaceType: "ONSITE",
    internshipTerm: "SUMMER",
    description:
      "Work on real-time control loops for a new pick-and-place arm. Pair with senior engineers on firmware and motion planning.",
    status: "PUBLISHED",
    programTag: PROGRAM_TAGS[0],
    publishedDaysAgo: 30,
  },
  {
    companyEmail: "acme@example.test",
    slug: "manufacturing-data-intern",
    title: "Manufacturing Data Intern",
    workplaceType: "HYBRID",
    internshipTerm: "SUMMER",
    description:
      "Build dashboards for shop-floor metrics. SQL + light Python. Plenty of mentorship.",
    status: "PUBLISHED",
    programTag: PROGRAM_TAGS[0],
    publishedDaysAgo: 21,
  },
  {
    companyEmail: "acme@example.test",
    slug: "computer-vision-intern",
    title: "Computer Vision Intern",
    workplaceType: "ONSITE",
    internshipTerm: "FALL",
    description:
      "Tune detection models for a conveyor inspection rig. Bring curiosity; we'll teach the tooling.",
    status: "PUBLISHED",
    programTag: PROGRAM_TAGS[3],
    publishedDaysAgo: 14,
  },
  {
    companyEmail: "acme@example.test",
    slug: "design-systems-intern",
    title: "Design Systems Intern",
    workplaceType: "REMOTE",
    internshipTerm: "SPRING",
    description:
      "Grow our internal Figma library and write the docs that go with it.",
    status: "PUBLISHED",
    programTag: PROGRAM_TAGS[2],
    publishedDaysAgo: 7,
  },
  {
    companyEmail: "acme@example.test",
    slug: "operator-training-content",
    title: "Operator Training Content Intern",
    workplaceType: "REMOTE",
    internshipTerm: "SUMMER",
    description:
      "Help write and film training material for plant operators rolling out our new arm.",
    status: "PAUSED",
    programTag: PROGRAM_TAGS[0],
    publishedDaysAgo: 45,
  },
  {
    companyEmail: "acme@example.test",
    slug: "field-service-intern",
    title: "Field Service Intern",
    workplaceType: "ONSITE",
    internshipTerm: "WINTER",
    description:
      "Travel with our field engineers and learn how installations actually go.",
    status: "DRAFT",
    programTag: PROGRAM_TAGS[1],
  },

  // Globex Health (PENDING) — 3 postings; none publicly visible per CLAUDE.md.
  {
    companyEmail: "globex@example.test",
    slug: "clinical-research-intern",
    title: "Clinical Research Intern",
    workplaceType: "HYBRID",
    internshipTerm: "SUMMER",
    description:
      "Support a small team studying community-clinic outcomes. Strong on data hygiene.",
    status: "PUBLISHED",
    programTag: PROGRAM_TAGS[1],
    publishedDaysAgo: 10,
  },
  {
    companyEmail: "globex@example.test",
    slug: "patient-experience-intern",
    title: "Patient Experience Intern",
    workplaceType: "REMOTE",
    internshipTerm: "FALL",
    description:
      "Interview patients and translate findings into UX recommendations.",
    status: "PUBLISHED",
    programTag: PROGRAM_TAGS[3],
    publishedDaysAgo: 5,
  },
  {
    companyEmail: "globex@example.test",
    slug: "telehealth-engineering-intern",
    title: "Telehealth Engineering Intern",
    workplaceType: "REMOTE",
    internshipTerm: "SPRING",
    description: "Help us scale our video-visit infrastructure.",
    status: "DRAFT",
    programTag: PROGRAM_TAGS[1],
  },

  // Initech Systems (SUSPENDED) — 3 postings; should not be publicly visible.
  {
    companyEmail: "initech@example.test",
    slug: "platform-eng-intern",
    title: "Platform Engineering Intern",
    workplaceType: "REMOTE",
    internshipTerm: "SUMMER",
    description: "Internal-tools work on our deploy pipeline.",
    status: "PUBLISHED",
    programTag: PROGRAM_TAGS[2],
    publishedDaysAgo: 60,
  },
  {
    companyEmail: "initech@example.test",
    slug: "support-engineering-intern",
    title: "Support Engineering Intern",
    workplaceType: "HYBRID",
    internshipTerm: "FALL",
    description: "Front-line debugging across our enterprise customer base.",
    status: "PUBLISHED",
    programTag: PROGRAM_TAGS[2],
    publishedDaysAgo: 40,
  },
  {
    companyEmail: "initech@example.test",
    slug: "qa-automation-intern",
    title: "QA Automation Intern",
    workplaceType: "REMOTE",
    internshipTerm: "SUMMER",
    description: "Build out our Playwright suite and own its CI runtime.",
    status: "CLOSED",
    programTag: PROGRAM_TAGS[2],
    publishedDaysAgo: 90,
  },
];

const APPLICATIONS: ApplicationSeed[] = [
  // Robotics Controls Intern — popular role at the APPROVED company.
  {
    studentEmail: "student01@example.test",
    jobSlug: "robotics-controls-intern",
    status: "APPLIED",
    daysAgo: 6,
  },
  {
    studentEmail: "student02@example.test",
    jobSlug: "robotics-controls-intern",
    status: "IN_REVIEW",
    daysAgo: 8,
    withMessageThread: true,
  },
  {
    studentEmail: "student03@example.test",
    jobSlug: "robotics-controls-intern",
    status: "INTERVIEWING",
    daysAgo: 12,
    withMessageThread: true,
  },
  {
    studentEmail: "student04@example.test",
    jobSlug: "robotics-controls-intern",
    status: "REJECTED",
    daysAgo: 14,
  },

  // Manufacturing Data Intern — moderate volume, one offer.
  {
    studentEmail: "student05@example.test",
    jobSlug: "manufacturing-data-intern",
    status: "OFFER",
    daysAgo: 4,
    withMessageThread: true,
  },
  {
    studentEmail: "student06@example.test",
    jobSlug: "manufacturing-data-intern",
    status: "IN_REVIEW",
    daysAgo: 5,
  },
  {
    studentEmail: "student07@example.test",
    jobSlug: "manufacturing-data-intern",
    status: "WITHDRAWN",
    daysAgo: 10,
  },

  // Computer Vision Intern — new applications.
  {
    studentEmail: "student08@example.test",
    jobSlug: "computer-vision-intern",
    status: "APPLIED",
    daysAgo: 2,
  },
  {
    studentEmail: "student09@example.test",
    jobSlug: "computer-vision-intern",
    status: "APPLIED",
    daysAgo: 3,
  },

  // Design Systems Intern.
  {
    studentEmail: "student10@example.test",
    jobSlug: "design-systems-intern",
    status: "IN_REVIEW",
    daysAgo: 1,
    withMessageThread: true,
  },

  // Globex (PENDING) postings — applications still allowed (visibility is
  // separate from "can someone apply"); admin will see them in queues.
  {
    studentEmail: "student01@example.test",
    jobSlug: "clinical-research-intern",
    status: "APPLIED",
    daysAgo: 1,
  },
  {
    studentEmail: "student02@example.test",
    jobSlug: "patient-experience-intern",
    status: "APPLIED",
    daysAgo: 2,
  },

  // Initech (SUSPENDED) postings — pre-existing applications survive.
  {
    studentEmail: "student03@example.test",
    jobSlug: "platform-eng-intern",
    status: "REJECTED",
    daysAgo: 30,
  },
  {
    studentEmail: "student04@example.test",
    jobSlug: "support-engineering-intern",
    status: "INTERVIEWING",
    daysAgo: 20,
    withMessageThread: true,
  },
  {
    studentEmail: "student05@example.test",
    jobSlug: "qa-automation-intern",
    status: "WITHDRAWN",
    daysAgo: 50,
  },
];

function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

async function upsertUser(opts: {
  email: string;
  passwordHash: string;
  role: "ADMIN" | "STUDENT" | "COMPANY";
}): Promise<{ id: string }> {
  // findFirst against active rows so soft-deleted lookalikes don't collide.
  const existing = await prisma.user.findFirst({
    where: { email: opts.email, deletedAt: null },
    select: { id: true },
  });
  if (existing) {
    await prisma.user.update({
      where: { id: existing.id },
      data: { passwordHash: opts.passwordHash, role: opts.role },
    });
    return existing;
  }
  return prisma.user.create({
    data: {
      email: opts.email,
      passwordHash: opts.passwordHash,
      role: opts.role,
    },
    select: { id: true },
  });
}

async function main(): Promise<void> {
  const passwordHash = await hashPassword(SHARED_DEV_PASSWORD);

  // ---- Admin ----
  const admin = await upsertUser({
    email: "admin@example.test",
    passwordHash,
    role: "ADMIN",
  });

  // ---- Companies ----
  const companyByEmail = new Map<
    string,
    { userId: string; companyProfileId: string }
  >();

  for (const c of COMPANIES) {
    const user = await upsertUser({
      email: c.email,
      passwordHash,
      role: "COMPANY",
    });

    const existingProfile = await prisma.companyProfile.findFirst({
      where: { userId: user.id, deletedAt: null },
      select: { id: true },
    });

    let profileId: string;
    if (existingProfile) {
      await prisma.companyProfile.update({
        where: { id: existingProfile.id },
        data: {
          companyName: c.companyName,
          slug: c.slug,
          approvalStatus: c.approvalStatus,
          industry: c.industry,
          programTag: c.programTag,
          shortDescription: c.shortDescription,
        },
      });
      profileId = existingProfile.id;
    } else {
      const created = await prisma.companyProfile.create({
        data: {
          userId: user.id,
          companyName: c.companyName,
          slug: c.slug,
          approvalStatus: c.approvalStatus,
          industry: c.industry,
          programTag: c.programTag,
          shortDescription: c.shortDescription,
        },
        select: { id: true },
      });
      profileId = created.id;
    }
    companyByEmail.set(c.email, {
      userId: user.id,
      companyProfileId: profileId,
    });
  }

  // ---- Students ----
  const studentByEmail = new Map<
    string,
    { userId: string; studentProfileId: string }
  >();

  for (const s of STUDENTS) {
    const user = await upsertUser({
      email: s.email,
      passwordHash,
      role: "STUDENT",
    });

    const existingProfile = await prisma.studentProfile.findUnique({
      where: { userId: user.id },
      select: { id: true },
    });

    let profileId: string;
    if (existingProfile) {
      await prisma.studentProfile.update({
        where: { id: existingProfile.id },
        data: {
          fullName: s.fullName,
          university: s.university,
          major: s.major,
          graduationYear: s.graduationYear,
          programTag: s.programTag,
          isProfileComplete: true,
        },
      });
      profileId = existingProfile.id;
    } else {
      const created = await prisma.studentProfile.create({
        data: {
          userId: user.id,
          fullName: s.fullName,
          university: s.university,
          major: s.major,
          graduationYear: s.graduationYear,
          programTag: s.programTag,
          isProfileComplete: true,
        },
        select: { id: true },
      });
      profileId = created.id;
    }

    // Reset and re-create skills so the seed stays idempotent.
    await prisma.studentSkill.deleteMany({
      where: { studentProfileId: profileId },
    });
    await prisma.studentSkill.createMany({
      data: s.skills.map((name) => ({ studentProfileId: profileId, name })),
    });

    studentByEmail.set(s.email, {
      userId: user.id,
      studentProfileId: profileId,
    });
  }

  // ---- Job postings ----
  const jobByUniqueKey = new Map<
    string,
    { id: string; companyProfileId: string; companyUserId: string }
  >();

  for (const jp of JOB_POSTINGS) {
    const company = companyByEmail.get(jp.companyEmail);
    if (!company) throw new Error(`Missing company: ${jp.companyEmail}`);

    const existing = await prisma.jobPosting.findFirst({
      where: {
        companyProfileId: company.companyProfileId,
        slug: jp.slug,
        deletedAt: null,
      },
      select: { id: true },
    });

    const publishedAt =
      jp.status === "PUBLISHED" && jp.publishedDaysAgo != null
        ? daysAgo(jp.publishedDaysAgo)
        : null;

    let id: string;
    if (existing) {
      await prisma.jobPosting.update({
        where: { id: existing.id },
        data: {
          title: jp.title,
          workplaceType: jp.workplaceType,
          internshipTerm: jp.internshipTerm,
          description: jp.description,
          status: jp.status,
          programTag: jp.programTag,
          publishedAt,
        },
      });
      id = existing.id;
    } else {
      const created = await prisma.jobPosting.create({
        data: {
          companyProfileId: company.companyProfileId,
          slug: jp.slug,
          title: jp.title,
          workplaceType: jp.workplaceType,
          internshipTerm: jp.internshipTerm,
          description: jp.description,
          status: jp.status,
          programTag: jp.programTag,
          publishedAt,
        },
        select: { id: true },
      });
      id = created.id;
    }

    jobByUniqueKey.set(`${jp.companyEmail}::${jp.slug}`, {
      id,
      companyProfileId: company.companyProfileId,
      companyUserId: company.userId,
    });
  }

  // ---- Applications + sample message threads ----
  let appCount = 0;
  let threadCount = 0;
  let messageCount = 0;

  for (const a of APPLICATIONS) {
    const job = [...jobByUniqueKey.entries()].find(([k]) =>
      k.endsWith(`::${a.jobSlug}`),
    )?.[1];
    const student = studentByEmail.get(a.studentEmail);
    if (!job || !student)
      throw new Error(`Missing job or student for application ${a.jobSlug}`);

    const application = await prisma.application.upsert({
      where: {
        jobPostingId_studentProfileId: {
          jobPostingId: job.id,
          studentProfileId: student.studentProfileId,
        },
      },
      update: { status: a.status, appliedAt: daysAgo(a.daysAgo) },
      create: {
        jobPostingId: job.id,
        studentProfileId: student.studentProfileId,
        status: a.status,
        appliedAt: daysAgo(a.daysAgo),
        coverLetter:
          a.status === "OFFER" || a.status === "INTERVIEWING"
            ? "Excited to learn from your team — happy to share writing samples."
            : null,
      },
      select: { id: true },
    });
    appCount++;

    if (a.withMessageThread) {
      // Idempotent: first thread per application, company-initiated.
      const existingThread = await prisma.messageThread.findFirst({
        where: { applicationId: application.id },
        select: { id: true },
      });

      const threadId =
        existingThread?.id ??
        (
          await prisma.messageThread.create({
            data: {
              applicationId: application.id,
              initiatedByUserId: job.companyUserId,
            },
            select: { id: true },
          })
        ).id;

      threadCount++;

      // Reset messages so the seed is idempotent.
      await prisma.message.deleteMany({ where: { threadId } });
      await prisma.message.createMany({
        data: [
          {
            threadId,
            senderUserId: job.companyUserId,
            body: "Hi! Thanks for applying. Could you share a bit about your most recent project?",
            createdAt: daysAgo(Math.max(a.daysAgo - 2, 1)),
            readAt: daysAgo(Math.max(a.daysAgo - 2, 1)),
          },
          {
            threadId,
            senderUserId: student.userId,
            body: "Of course! Last quarter I built a small CV pipeline for a class project — happy to walk through it.",
            createdAt: daysAgo(Math.max(a.daysAgo - 1, 0)),
          },
        ],
      });
      messageCount += 2;
    }
  }

  // ---- Activity events ----
  await prisma.activityEvent.deleteMany({
    where: { metadataJson: { path: ["seed"], equals: true } },
  });

  const eventsToCreate: Array<Parameters<typeof prisma.activityEvent.create>[0]["data"]> = [];

  for (const c of COMPANIES) {
    const company = companyByEmail.get(c.email)!;
    eventsToCreate.push({
      type: "COMPANY_SIGNUP",
      actorUserId: company.userId,
      entityType: "CompanyProfile",
      entityId: company.companyProfileId,
      metadataJson: { seed: true, programTag: c.programTag },
      createdAt: daysAgo(45),
    });
    if (c.approvalStatus !== "PENDING") {
      eventsToCreate.push({
        type: "COMPANY_APPROVAL_CHANGED",
        actorUserId: admin.id,
        entityType: "CompanyProfile",
        entityId: company.companyProfileId,
        metadataJson: { seed: true, to: c.approvalStatus },
        createdAt: daysAgo(40),
      });
    }
  }

  for (const s of STUDENTS) {
    const student = studentByEmail.get(s.email)!;
    eventsToCreate.push({
      type: "STUDENT_SIGNUP",
      actorUserId: student.userId,
      entityType: "StudentProfile",
      entityId: student.studentProfileId,
      metadataJson: { seed: true, programTag: s.programTag },
      createdAt: daysAgo(30),
    });
  }

  for (const jp of JOB_POSTINGS) {
    if (jp.status !== "PUBLISHED" || jp.publishedDaysAgo == null) continue;
    const job = jobByUniqueKey.get(`${jp.companyEmail}::${jp.slug}`)!;
    const company = companyByEmail.get(jp.companyEmail)!;
    eventsToCreate.push({
      type: "JOB_POSTING_PUBLISHED",
      actorUserId: company.userId,
      entityType: "JobPosting",
      entityId: job.id,
      metadataJson: { seed: true, slug: jp.slug },
      createdAt: daysAgo(jp.publishedDaysAgo),
    });
  }

  for (const a of APPLICATIONS) {
    eventsToCreate.push({
      type: "APPLICATION_SUBMITTED",
      actorUserId: studentByEmail.get(a.studentEmail)!.userId,
      entityType: "Application",
      entityId: a.jobSlug,
      metadataJson: { seed: true, status: a.status },
      createdAt: daysAgo(a.daysAgo),
    });
  }

  for (const event of eventsToCreate) {
    await prisma.activityEvent.create({ data: event });
  }

  // ---- Summary ----
  const counts = {
    users: await prisma.user.count(),
    admins: await prisma.user.count({ where: { role: "ADMIN" } }),
    companies: await prisma.companyProfile.count(),
    students: await prisma.studentProfile.count(),
    jobPostings: await prisma.jobPosting.count(),
    applications: await prisma.application.count(),
    threads: await prisma.messageThread.count(),
    messages: await prisma.message.count(),
    activityEvents: await prisma.activityEvent.count(),
  };

  console.log("\nSeed complete.\n");
  console.log("Row counts:");
  console.table(counts);

  console.log(`\nShared dev password for all seeded users: ${SHARED_DEV_PASSWORD}\n`);

  console.log("Login credentials:");
  console.table([
    { role: "ADMIN", email: "admin@example.test" },
    ...COMPANIES.map((c) => ({
      role: `COMPANY (${c.approvalStatus})`,
      email: c.email,
    })),
    ...STUDENTS.map((s) => ({ role: "STUDENT", email: s.email })),
  ]);

  console.log(
    `\nUpserted ${appCount} applications · ${threadCount} message threads · ${messageCount} messages.\n`,
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
