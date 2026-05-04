// @vitest-environment node
import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import type {
  EmailAdapter,
  EmailMessage,
  EmailSendResult,
} from "@/server/adapters/email";
import { prisma } from "@/lib/db/client";
import { setCompanyApprovalStatus } from "@/server/services/admin-service";
import {
  submitApplication,
  transitionApplicationStatus,
} from "@/server/services/application-service";
import {
  createUserDirect,
  createUserWithCredentials,
} from "@/server/services/auth-service";
import { upsertCompanyProfile } from "@/server/services/company-service";
import {
  __resetEmailAdapter,
  __setEmailAdapter,
} from "@/server/services/email-service";
import { createJobPosting } from "@/server/services/job-posting-service";
import {
  sendMessageAsCompany,
  sendMessageAsStudent,
  startThreadAsCompany,
} from "@/server/services/message-service";
import {
  setResumeStorageKey,
  upsertProfileBasics,
  addExperience,
  addProject,
  addSkill,
} from "@/server/services/student-service";

const RUN_ID = `mail${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const createdUserIds: string[] = [];

afterAll(async () => {
  if (createdUserIds.length > 0) {
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  }
  await prisma.$disconnect();
});

const skip = !process.env.DATABASE_URL;

class CollectingAdapter implements EmailAdapter {
  readonly providerName = "test-collector";
  readonly sent: EmailMessage[] = [];
  async send(message: EmailMessage): Promise<EmailSendResult> {
    this.sent.push(message);
    return { ok: true, provider: this.providerName };
  }
  reset() {
    this.sent.length = 0;
  }
}

class FailingAdapter implements EmailAdapter {
  readonly providerName = "test-failing";
  async send(_message: EmailMessage): Promise<EmailSendResult> {
    throw new Error("simulated provider outage");
  }
}

let collector: CollectingAdapter;
let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
let consoleLogSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  collector = new CollectingAdapter();
  __setEmailAdapter(collector);
  consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});
});
afterEach(() => {
  __resetEmailAdapter();
  consoleErrorSpy.mockRestore();
  consoleLogSpy.mockRestore();
});

const STUDENT_FULL = {
  fullName: "",
  headline: "h",
  university: "U",
  graduationYear: 2027,
  degree: "B.S.",
  major: "CS",
  location: "Remote",
  workAuthorization: "US citizen",
  bio: "Bio",
  portfolioUrl: null,
  linkedinUrl: null,
  githubUrl: null,
  programTag: null,
};
const COMPANY_BASE = {
  companyName: "",
  industry: "Software",
  companySize: "11-50",
  headquarters: "Remote",
  shortDescription: "Co",
  description: "Co body.",
  contactEmail: "talent@test.local",
  websiteUrl: null,
  programTag: null,
};
const POSTING_BASE = {
  title: "",
  department: "Engineering",
  location: "Remote",
  workplaceType: "REMOTE" as const,
  internshipTerm: "SUMMER" as const,
  startDate: null as Date | null,
  duration: null as string | null,
  compensationType: null as null,
  compensationMin: null as number | null,
  compensationMax: null as number | null,
  description: "Body",
  responsibilities: null as string | null,
  qualifications: null as string | null,
  applicationDeadline: null as Date | null,
  programTag: null as string | null,
  status: "PUBLISHED" as const,
};

async function makeAdmin(suffix: string) {
  const u = await createUserDirect({
    email: `${RUN_ID}-admin-${suffix}@test.local`,
    password: "longenough",
    role: "ADMIN",
  });
  createdUserIds.push(u.id);
  return u;
}

async function makeStudent(suffix: string) {
  const r = await createUserWithCredentials({
    email: `${RUN_ID}-stud-${suffix}@test.local`,
    password: "longenough",
    role: "STUDENT",
  });
  if (!r.ok) throw new Error("setup");
  createdUserIds.push(r.userId);
  await upsertProfileBasics(r.userId, {
    ...STUDENT_FULL,
    fullName: `Stud ${suffix}`,
  });
  await setResumeStorageKey(r.userId, "resumes/test.pdf");
  await addSkill(r.userId, { name: "TypeScript" });
  await addExperience(r.userId, {
    title: "Intern",
    organization: "Acme",
    startDate: null,
    endDate: null,
    description: null,
  });
  await addProject(r.userId, {
    name: "P",
    url: null,
    description: null,
  });
  return r.userId;
}

async function makeCompany(
  suffix: string,
  adminId: string,
  contactEmail = "talent@test.local",
) {
  const r = await createUserWithCredentials({
    email: `${RUN_ID}-co-${suffix}@test.local`,
    password: "longenough",
    role: "COMPANY",
  });
  if (!r.ok) throw new Error("setup");
  createdUserIds.push(r.userId);
  const profile = await upsertCompanyProfile(r.userId, {
    ...COMPANY_BASE,
    companyName: `Co ${suffix}`,
    contactEmail,
  });
  if (!profile.ok) throw new Error("profile setup");
  await setCompanyApprovalStatus(adminId, profile.companyProfileId, "APPROVED");
  // Reset collector after the setup-time approval email so per-test
  // assertions only see what THIS test produced.
  collector.reset();
  return {
    companyUserId: r.userId,
    companyProfileId: profile.companyProfileId,
    companyEmail: r.userId,
  };
}

describe.skipIf(skip)("email triggers · welcome", () => {
  it("dispatches student welcome on signup", async () => {
    const r = await createUserWithCredentials({
      email: `${RUN_ID}-welcome-stud@test.local`,
      password: "longenough",
      role: "STUDENT",
    });
    if (!r.ok) throw new Error("setup");
    createdUserIds.push(r.userId);
    const welcome = collector.sent.find(
      (m) => m.to === `${RUN_ID}-welcome-stud@test.local`,
    );
    expect(welcome).toBeDefined();
    expect(welcome?.subject).toContain("Welcome");
    expect((welcome?.metadata as { kind: string }).kind).toBe(
      "student_welcome",
    );
  });

  it("dispatches company welcome on signup", async () => {
    const r = await createUserWithCredentials({
      email: `${RUN_ID}-welcome-co@test.local`,
      password: "longenough",
      role: "COMPANY",
    });
    if (!r.ok) throw new Error("setup");
    createdUserIds.push(r.userId);
    const welcome = collector.sent.find(
      (m) => m.to === `${RUN_ID}-welcome-co@test.local`,
    );
    expect(welcome).toBeDefined();
    expect((welcome?.metadata as { kind: string }).kind).toBe(
      "company_welcome",
    );
  });
});

describe.skipIf(skip)("email triggers · admin pending notification", () => {
  it("notifies all active admins on first company-profile save", async () => {
    const a1 = await makeAdmin("admin-pending-1");
    const a2 = await makeAdmin("admin-pending-2");
    collector.reset();

    const co = await createUserWithCredentials({
      email: `${RUN_ID}-pending-co@test.local`,
      password: "longenough",
      role: "COMPANY",
    });
    if (!co.ok) throw new Error("setup");
    createdUserIds.push(co.userId);
    await upsertCompanyProfile(co.userId, {
      ...COMPANY_BASE,
      companyName: `Pending Co ${RUN_ID}`,
    });

    const adminMails = collector.sent.filter(
      (m) =>
        (m.metadata as { kind?: string })?.kind === "admin_company_pending",
    );
    // The shared dev DB may include a seeded admin too; assert that
    // at least each of the two admins this test created received the
    // notification, rather than an exact count.
    const recipients = adminMails.map((m) => m.to);
    expect(recipients).toContain(a1.email);
    expect(recipients).toContain(a2.email);
    // And every notification we DID send is a real, currently-active
    // ADMIN — none escaped to a non-admin.
    const activeAdminEmails = new Set(
      (
        await prisma.user.findMany({
          where: { role: "ADMIN", deletedAt: null },
          select: { email: true },
        })
      ).map((u) => u.email),
    );
    for (const r of recipients) expect(activeAdminEmails.has(r)).toBe(true);
  });
});

describe.skipIf(skip)("email triggers · approval status change", () => {
  it("notifies the company on APPROVED, PENDING, SUSPENDED transitions", async () => {
    const admin = await makeAdmin("approve-flow");
    const co = await createUserWithCredentials({
      email: `${RUN_ID}-approve-co@test.local`,
      password: "longenough",
      role: "COMPANY",
    });
    if (!co.ok) throw new Error("setup");
    createdUserIds.push(co.userId);
    const profile = await upsertCompanyProfile(co.userId, {
      ...COMPANY_BASE,
      companyName: `Approve Co ${RUN_ID}`,
      contactEmail: `${RUN_ID}-approve-contact@test.local`,
    });
    if (!profile.ok) throw new Error("setup");
    collector.reset();

    await setCompanyApprovalStatus(
      admin.id,
      profile.companyProfileId,
      "APPROVED",
    );
    expect(
      collector.sent.find(
        (m) => (m.metadata as { newStatus?: string })?.newStatus === "APPROVED",
      ),
    ).toBeDefined();

    await setCompanyApprovalStatus(
      admin.id,
      profile.companyProfileId,
      "SUSPENDED",
    );
    expect(
      collector.sent.find(
        (m) =>
          (m.metadata as { newStatus?: string })?.newStatus === "SUSPENDED",
      ),
    ).toBeDefined();
  });
});

describe.skipIf(skip)(
  "email triggers · application submission + status change",
  () => {
    it("notifies the company on submit and the student on status change", async () => {
      const admin = await makeAdmin("app-flow");
      const co = await makeCompany("app-flow", admin.id);
      const stud = await makeStudent("app-flow");
      const job = await createJobPosting(co.companyUserId, {
        ...POSTING_BASE,
        title: "Email role",
      });
      if (!job.ok) throw new Error("setup");
      collector.reset();

      const a = await submitApplication(stud, {
        jobPostingId: job.id,
        coverLetter: null,
      });
      if (!a.ok) throw new Error("setup");
      expect(
        collector.sent.find(
          (m) =>
            (m.metadata as { kind?: string })?.kind ===
            "company_application_received",
        ),
      ).toBeDefined();

      collector.reset();
      await transitionApplicationStatus(
        co.companyUserId,
        a.applicationId,
        "IN_REVIEW",
      );
      const review = collector.sent.find(
        (m) =>
          (m.metadata as { kind?: string })?.kind ===
          "student_application_status_changed",
      );
      expect(review).toBeDefined();
      expect(review?.to).toBe(`${RUN_ID}-stud-app-flow@test.local`);

      collector.reset();
      await transitionApplicationStatus(
        co.companyUserId,
        a.applicationId,
        "INTERVIEWING",
      );
      await transitionApplicationStatus(
        co.companyUserId,
        a.applicationId,
        "OFFER",
      );
      const offer = collector.sent.find(
        (m) => (m.metadata as { newStatus?: string })?.newStatus === "OFFER",
      );
      expect(offer).toBeDefined();
    });
  },
);

describe.skipIf(skip)("email triggers · new message", () => {
  it("notifies the student when a company sends a new message", async () => {
    const admin = await makeAdmin("msg-flow");
    const co = await makeCompany("msg-flow", admin.id);
    const stud = await makeStudent("msg-flow");
    const job = await createJobPosting(co.companyUserId, {
      ...POSTING_BASE,
      title: "Email msg",
    });
    if (!job.ok) throw new Error("setup");
    const a = await submitApplication(stud, {
      jobPostingId: job.id,
      coverLetter: null,
    });
    if (!a.ok) throw new Error("setup");
    collector.reset();

    const t = await startThreadAsCompany(
      co.companyUserId,
      a.applicationId,
      "Hello!",
    );
    if (!t.ok) throw new Error("setup");
    const msgToStudent = collector.sent.find(
      (m) =>
        (m.metadata as { kind?: string })?.kind === "new_message" &&
        m.to === `${RUN_ID}-stud-msg-flow@test.local`,
    );
    expect(msgToStudent).toBeDefined();
    expect(msgToStudent?.body).toContain("Hello!");

    collector.reset();
    const reply = await sendMessageAsStudent(stud, t.threadId, "Thanks!");
    expect(reply.ok).toBe(true);
    const msgToCompany = collector.sent.find(
      (m) => (m.metadata as { kind?: string })?.kind === "new_message",
    );
    expect(msgToCompany).toBeDefined();

    collector.reset();
    const followUp = await sendMessageAsCompany(
      co.companyUserId,
      t.threadId,
      "Sure.",
    );
    expect(followUp.ok).toBe(true);
    expect(
      collector.sent.find(
        (m) => (m.metadata as { kind?: string })?.kind === "new_message",
      ),
    ).toBeDefined();
  });
});

describe.skipIf(skip)(
  "fault tolerance · provider failures don't roll back primary mutations",
  () => {
    it("an exploding adapter does not block student signup", async () => {
      __setEmailAdapter(new FailingAdapter());

      const r = await createUserWithCredentials({
        email: `${RUN_ID}-fault-stud@test.local`,
        password: "longenough",
        role: "STUDENT",
      });
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      createdUserIds.push(r.userId);

      const persisted = await prisma.user.findUnique({
        where: { id: r.userId },
      });
      expect(persisted).not.toBeNull();
      expect(consoleErrorSpy).toHaveBeenCalled(); // dispatchEmail logged the failure
    });

    it("an exploding adapter does not block message send; the message persists", async () => {
      const admin = await makeAdmin("fault-msg");
      const co = await makeCompany("fault-msg", admin.id);
      const stud = await makeStudent("fault-msg");
      const job = await createJobPosting(co.companyUserId, {
        ...POSTING_BASE,
        title: "Fault role",
      });
      if (!job.ok) throw new Error("setup");
      const a = await submitApplication(stud, {
        jobPostingId: job.id,
        coverLetter: null,
      });
      if (!a.ok) throw new Error("setup");

      __setEmailAdapter(new FailingAdapter());

      const t = await startThreadAsCompany(
        co.companyUserId,
        a.applicationId,
        "Hi.",
      );
      expect(t.ok).toBe(true);
      if (!t.ok) return;

      const stored = await prisma.message.findFirst({
        where: { threadId: t.threadId },
      });
      expect(stored).not.toBeNull();
      expect(consoleErrorSpy).toHaveBeenCalled();
    });

    it("an adapter that returns ok=false logs but doesn't throw", async () => {
      class SoftFailAdapter implements EmailAdapter {
        readonly providerName = "soft-fail";
        async send(): Promise<EmailSendResult> {
          return {
            ok: false,
            provider: this.providerName,
            error: "rate-limited",
          };
        }
      }
      __setEmailAdapter(new SoftFailAdapter());

      const r = await createUserWithCredentials({
        email: `${RUN_ID}-soft-fail@test.local`,
        password: "longenough",
        role: "STUDENT",
      });
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      createdUserIds.push(r.userId);

      const persisted = await prisma.user.findUnique({
        where: { id: r.userId },
      });
      expect(persisted).not.toBeNull();
      expect(consoleErrorSpy).toHaveBeenCalled();
    });
  },
);

describe.skipIf(skip)(
  "email QA · idempotency, state-change-only, counterparty",
  () => {
    it("admin pending email fires only on first company-profile save (not edits)", async () => {
      const a1 = await makeAdmin("idem-admin");
      const co = await createUserWithCredentials({
        email: `${RUN_ID}-idem-co@test.local`,
        password: "longenough",
        role: "COMPANY",
      });
      if (!co.ok) throw new Error("setup");
      createdUserIds.push(co.userId);
      collector.reset();

      // First save → fan-out fires.
      await upsertCompanyProfile(co.userId, {
        ...COMPANY_BASE,
        companyName: `Idem Co ${RUN_ID}`,
      });
      const firstFanOut = collector.sent.filter(
        (m) =>
          (m.metadata as { kind?: string })?.kind === "admin_company_pending",
      );
      expect(firstFanOut.length).toBeGreaterThanOrEqual(1);
      expect(firstFanOut.some((m) => m.to === a1.email)).toBe(true);

      collector.reset();

      // Edit pass: change profile fields. Must NOT re-fire the pending email.
      await upsertCompanyProfile(co.userId, {
        ...COMPANY_BASE,
        companyName: `Idem Co ${RUN_ID}`,
        industry: "Healthcare",
      });
      await upsertCompanyProfile(co.userId, {
        ...COMPANY_BASE,
        companyName: `Idem Co ${RUN_ID}`,
        industry: "Education",
      });
      const reFires = collector.sent.filter(
        (m) =>
          (m.metadata as { kind?: string })?.kind === "admin_company_pending",
      );
      expect(reFires.length).toBe(0);
    });

    it("approval-status email fires only when approvalStatus actually changes", async () => {
      const admin = await makeAdmin("nochange");
      const co = await createUserWithCredentials({
        email: `${RUN_ID}-nochange-co@test.local`,
        password: "longenough",
        role: "COMPANY",
      });
      if (!co.ok) throw new Error("setup");
      createdUserIds.push(co.userId);
      const profile = await upsertCompanyProfile(co.userId, {
        ...COMPANY_BASE,
        companyName: `NoChange Co ${RUN_ID}`,
      });
      if (!profile.ok) throw new Error("setup");
      collector.reset();

      // PENDING -> PENDING (no actual change) must not dispatch.
      await setCompanyApprovalStatus(
        admin.id,
        profile.companyProfileId,
        "PENDING",
      );
      expect(
        collector.sent.find(
          (m) =>
            (m.metadata as { kind?: string })?.kind ===
            "company_approval_changed",
        ),
      ).toBeUndefined();

      // PENDING -> APPROVED dispatches once.
      await setCompanyApprovalStatus(
        admin.id,
        profile.companyProfileId,
        "APPROVED",
      );
      let approvalMails = collector.sent.filter(
        (m) =>
          (m.metadata as { kind?: string })?.kind ===
          "company_approval_changed",
      );
      expect(approvalMails.length).toBe(1);
      expect(
        (approvalMails[0].metadata as { newStatus?: string }).newStatus,
      ).toBe("APPROVED");

      // APPROVED -> APPROVED is a no-op; no extra dispatch.
      await setCompanyApprovalStatus(
        admin.id,
        profile.companyProfileId,
        "APPROVED",
      );
      approvalMails = collector.sent.filter(
        (m) =>
          (m.metadata as { kind?: string })?.kind ===
          "company_approval_changed",
      );
      expect(approvalMails.length).toBe(1);

      // APPROVED -> SUSPENDED dispatches once more.
      await setCompanyApprovalStatus(
        admin.id,
        profile.companyProfileId,
        "SUSPENDED",
      );
      approvalMails = collector.sent.filter(
        (m) =>
          (m.metadata as { kind?: string })?.kind ===
          "company_approval_changed",
      );
      expect(approvalMails.length).toBe(2);
      expect(
        (approvalMails[1].metadata as { newStatus?: string }).newStatus,
      ).toBe("SUSPENDED");
    });

    it("new-message email always goes to the counterparty, never the sender", async () => {
      const admin = await makeAdmin("counterparty");
      const co = await makeCompany("counterparty", admin.id);
      const stud = await makeStudent("counterparty");
      const job = await createJobPosting(co.companyUserId, {
        ...POSTING_BASE,
        title: "Counterparty role",
      });
      if (!job.ok) throw new Error("setup");
      const a = await submitApplication(stud, {
        jobPostingId: job.id,
        coverLetter: null,
      });
      if (!a.ok) throw new Error("setup");

      const studentEmail = `${RUN_ID}-stud-counterparty@test.local`;
      const companyEmail = "talent@test.local"; // contactEmail from COMPANY_BASE

      collector.reset();
      const t = await startThreadAsCompany(
        co.companyUserId,
        a.applicationId,
        "Hi.",
      );
      if (!t.ok) throw new Error("setup");
      let msgMails = collector.sent.filter(
        (m) => (m.metadata as { kind?: string })?.kind === "new_message",
      );
      expect(msgMails.length).toBe(1);
      expect(msgMails[0].to).toBe(studentEmail);
      expect(msgMails.every((m) => m.to !== companyEmail)).toBe(true);

      collector.reset();
      await sendMessageAsStudent(stud, t.threadId, "Reply.");
      msgMails = collector.sent.filter(
        (m) => (m.metadata as { kind?: string })?.kind === "new_message",
      );
      expect(msgMails.length).toBe(1);
      expect(msgMails[0].to).toBe(companyEmail);
      expect(msgMails.every((m) => m.to !== studentEmail)).toBe(true);

      collector.reset();
      await sendMessageAsCompany(co.companyUserId, t.threadId, "Reply 2.");
      msgMails = collector.sent.filter(
        (m) => (m.metadata as { kind?: string })?.kind === "new_message",
      );
      expect(msgMails.length).toBe(1);
      expect(msgMails[0].to).toBe(studentEmail);
    });
  },
);
