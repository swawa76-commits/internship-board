// @vitest-environment node
import { afterAll, describe, expect, it } from "vitest";

import { prisma } from "@/lib/db/client";
import { setCompanyApprovalStatus } from "@/server/services/admin-service";
import { submitApplication } from "@/server/services/application-service";
import {
  createUserDirect,
  createUserWithCredentials,
} from "@/server/services/auth-service";
import { upsertCompanyProfile } from "@/server/services/company-service";
import { createJobPosting } from "@/server/services/job-posting-service";
import {
  countUnreadForCompany,
  countUnreadForStudent,
  getThreadForCompany,
  getThreadForStudent,
  getThreadIdForApplicationAsCompany,
  listThreadsForCompany,
  listThreadsForStudent,
  sendMessageAsCompany,
  sendMessageAsStudent,
  startThreadAsCompany,
} from "@/server/services/message-service";
import {
  transitionApplicationStatus,
  withdrawApplicationByStudent,
} from "@/server/services/application-service";
import {
  setResumeStorageKey,
  upsertProfileBasics,
  addExperience,
  addProject,
  addSkill,
} from "@/server/services/student-service";

const RUN_ID = `msg${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const createdUserIds: string[] = [];

afterAll(async () => {
  if (createdUserIds.length > 0) {
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  }
  await prisma.$disconnect();
});

const skip = !process.env.DATABASE_URL;

const STUDENT_FULL = {
  fullName: "Msg Tester",
  headline: "Aspiring engineer",
  university: "State U",
  graduationYear: 2027,
  degree: "B.S.",
  major: "CS",
  location: "Remote",
  workAuthorization: "US citizen",
  bio: "Body",
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
  startDate: null,
  duration: null,
  compensationType: null,
  compensationMin: null,
  compensationMax: null,
  description: "Body",
  responsibilities: null,
  qualifications: null,
  applicationDeadline: null,
  programTag: null,
  status: "PUBLISHED" as const,
};

async function makeStudent(suffix: string) {
  const r = await createUserWithCredentials({
    email: `${RUN_ID}-stud-${suffix}@test.local`,
    password: "longenough",
    role: "STUDENT",
  });
  if (!r.ok) throw new Error("setup failed");
  createdUserIds.push(r.userId);
  await upsertProfileBasics(r.userId, STUDENT_FULL);
  await setResumeStorageKey(r.userId, "resumes/test.pdf");
  await addSkill(r.userId, { name: "TypeScript" });
  await addExperience(r.userId, {
    title: "Intern",
    organization: "Acme",
    startDate: null,
    endDate: null,
    description: null,
  });
  await addProject(r.userId, { name: "P", url: null, description: null });
  return r.userId;
}

async function makeApprovedCoWithJob(suffix: string) {
  const adminUser = await createUserDirect({
    email: `${RUN_ID}-admin-${suffix}@test.local`,
    password: "longenough",
    role: "ADMIN",
  });
  createdUserIds.push(adminUser.id);
  const r = await createUserWithCredentials({
    email: `${RUN_ID}-co-${suffix}@test.local`,
    password: "longenough",
    role: "COMPANY",
  });
  if (!r.ok) throw new Error("setup failed");
  createdUserIds.push(r.userId);
  const profile = await upsertCompanyProfile(r.userId, {
    ...COMPANY_BASE,
    companyName: `Co ${suffix}`,
  });
  if (!profile.ok) throw new Error("profile setup failed");
  await setCompanyApprovalStatus(adminUser.id, profile.companyProfileId, "APPROVED");
  const job = await createJobPosting(r.userId, {
    ...POSTING_BASE,
    title: `Job ${suffix}`,
  });
  if (!job.ok) throw new Error("job setup failed");
  return {
    adminId: adminUser.id,
    companyUserId: r.userId,
    companyProfileId: profile.companyProfileId,
    jobId: job.id,
  };
}

async function applicationFor(studentUserId: string, jobId: string) {
  const r = await submitApplication(studentUserId, {
    jobPostingId: jobId,
    coverLetter: null,
  });
  if (!r.ok) throw new Error(`apply failed: ${r.reason}`);
  return r.applicationId;
}

describe.skipIf(skip)("startThreadAsCompany", () => {
  it("creates a thread + first message for an applicant on this company's posting", async () => {
    const stud = await makeStudent("start-happy");
    const co = await makeApprovedCoWithJob("start-happy");
    const appId = await applicationFor(stud, co.jobId);

    const r = await startThreadAsCompany(co.companyUserId, appId, "Hi there!");
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    const thread = await prisma.messageThread.findUniqueOrThrow({
      where: { id: r.threadId },
      select: {
        applicationId: true,
        initiatedByUserId: true,
        messages: { select: { body: true, senderUserId: true } },
      },
    });
    expect(thread.applicationId).toBe(appId);
    expect(thread.initiatedByUserId).toBe(co.companyUserId);
    expect(thread.messages).toHaveLength(1);
    expect(thread.messages[0].body).toBe("Hi there!");
    expect(thread.messages[0].senderUserId).toBe(co.companyUserId);
  });

  it("is idempotent: starting twice for the same application appends to the existing thread", async () => {
    const stud = await makeStudent("start-idem");
    const co = await makeApprovedCoWithJob("start-idem");
    const appId = await applicationFor(stud, co.jobId);

    const r1 = await startThreadAsCompany(co.companyUserId, appId, "First.");
    const r2 = await startThreadAsCompany(co.companyUserId, appId, "Second.");
    expect(r1.ok && r2.ok).toBe(true);
    if (!r1.ok || !r2.ok) return;
    expect(r2.threadId).toBe(r1.threadId);

    const messages = await prisma.message.findMany({
      where: { threadId: r1.threadId },
      orderBy: { createdAt: "asc" },
      select: { body: true },
    });
    expect(messages.map((m) => m.body)).toEqual(["First.", "Second."]);
  });

  it("rejects empty body", async () => {
    const stud = await makeStudent("start-empty");
    const co = await makeApprovedCoWithJob("start-empty");
    const appId = await applicationFor(stud, co.jobId);

    const r = await startThreadAsCompany(co.companyUserId, appId, "   ");
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe("empty");
  });

  it("rejects with forbidden when the application belongs to another company", async () => {
    const stud = await makeStudent("start-cross");
    const owner = await makeApprovedCoWithJob("start-cross-owner");
    const attacker = await makeApprovedCoWithJob("start-cross-attacker");
    const appId = await applicationFor(stud, owner.jobId);

    const r = await startThreadAsCompany(
      attacker.companyUserId,
      appId,
      "Trying to talk.",
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe("forbidden");

    // Defensive: nothing was written.
    const count = await prisma.messageThread.count({ where: { applicationId: appId } });
    expect(count).toBe(0);
  });

  it("rejects with forbidden when the actor isn't a company", async () => {
    const stud = await makeStudent("start-non-co");
    const co = await makeApprovedCoWithJob("start-non-co");
    const appId = await applicationFor(stud, co.jobId);

    const r = await startThreadAsCompany(stud, appId, "Hello.");
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe("forbidden");
  });
});

describe.skipIf(skip)("sendMessageAsStudent · tenant isolation", () => {
  it("a student can reply to a thread on their own application after the company initiated it", async () => {
    const stud = await makeStudent("reply-own");
    const co = await makeApprovedCoWithJob("reply-own");
    const appId = await applicationFor(stud, co.jobId);
    const start = await startThreadAsCompany(co.companyUserId, appId, "Hi.");
    if (!start.ok) throw new Error("setup failed");

    const r = await sendMessageAsStudent(stud, start.threadId, "Reply.");
    expect(r.ok).toBe(true);
  });

  it("rejects another student trying to reply to someone else's thread", async () => {
    const owner = await makeStudent("reply-cross-owner");
    const attacker = await makeStudent("reply-cross-attacker");
    const co = await makeApprovedCoWithJob("reply-cross");
    const appId = await applicationFor(owner, co.jobId);
    const start = await startThreadAsCompany(co.companyUserId, appId, "Hi.");
    if (!start.ok) throw new Error("setup failed");

    const r = await sendMessageAsStudent(attacker, start.threadId, "Sneaky.");
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe("forbidden");

    // Verify the attacker's body was never persisted.
    const messages = await prisma.message.findMany({
      where: { threadId: start.threadId },
      select: { body: true, senderUserId: true },
    });
    expect(messages.some((m) => m.body === "Sneaky.")).toBe(false);
    expect(messages.some((m) => m.senderUserId === attacker)).toBe(false);
  });

  it("rejects with forbidden when the actor isn't a student", async () => {
    const stud = await makeStudent("reply-as-co");
    const co = await makeApprovedCoWithJob("reply-as-co");
    const appId = await applicationFor(stud, co.jobId);
    const start = await startThreadAsCompany(co.companyUserId, appId, "Hi.");
    if (!start.ok) throw new Error("setup failed");

    const r = await sendMessageAsStudent(
      co.companyUserId,
      start.threadId,
      "Reply as company through student rail.",
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe("forbidden");
  });
});

describe.skipIf(skip)("sendMessageAsCompany · tenant isolation", () => {
  it("a company can reply on threads tied to its own postings", async () => {
    const stud = await makeStudent("co-reply-own");
    const co = await makeApprovedCoWithJob("co-reply-own");
    const appId = await applicationFor(stud, co.jobId);
    const start = await startThreadAsCompany(co.companyUserId, appId, "Hi.");
    if (!start.ok) throw new Error("setup failed");

    const r = await sendMessageAsCompany(
      co.companyUserId,
      start.threadId,
      "Follow-up.",
    );
    expect(r.ok).toBe(true);
  });

  it("rejects another company trying to read or post into a thread it doesn't own", async () => {
    const stud = await makeStudent("co-reply-cross");
    const owner = await makeApprovedCoWithJob("co-reply-cross-owner");
    const attacker = await makeApprovedCoWithJob("co-reply-cross-attacker");
    const appId = await applicationFor(stud, owner.jobId);
    const start = await startThreadAsCompany(owner.companyUserId, appId, "Hi.");
    if (!start.ok) throw new Error("setup failed");

    const sendR = await sendMessageAsCompany(
      attacker.companyUserId,
      start.threadId,
      "Sneaky.",
    );
    expect(sendR.ok).toBe(false);
    if (sendR.ok) return;
    expect(sendR.reason).toBe("forbidden");

    const detail = await getThreadForCompany(
      attacker.companyUserId,
      start.threadId,
    );
    expect(detail).toBeNull();

    const messages = await prisma.message.findMany({
      where: { threadId: start.threadId },
      select: { body: true },
    });
    expect(messages.some((m) => m.body === "Sneaky.")).toBe(false);
  });
});

describe.skipIf(skip)("listThreadsFor* · tenant isolation", () => {
  it("students only see threads tied to their own applications", async () => {
    const studA = await makeStudent("list-A");
    const studB = await makeStudent("list-B");
    const co = await makeApprovedCoWithJob("list-target");
    const appA = await applicationFor(studA, co.jobId);
    const appB = await applicationFor(studB, co.jobId);

    const ta = await startThreadAsCompany(co.companyUserId, appA, "A!");
    const tb = await startThreadAsCompany(co.companyUserId, appB, "B!");
    if (!ta.ok || !tb.ok) throw new Error("setup failed");

    const aList = await listThreadsForStudent(studA);
    const bList = await listThreadsForStudent(studB);
    expect(aList.some((t) => t.threadId === ta.threadId)).toBe(true);
    expect(aList.some((t) => t.threadId === tb.threadId)).toBe(false);
    expect(bList.some((t) => t.threadId === tb.threadId)).toBe(true);
    expect(bList.some((t) => t.threadId === ta.threadId)).toBe(false);
  });

  it("companies only see threads tied to applications on their own postings", async () => {
    const stud = await makeStudent("list-co-iso");
    const coA = await makeApprovedCoWithJob("list-co-A");
    const coB = await makeApprovedCoWithJob("list-co-B");
    const appA = await applicationFor(stud, coA.jobId);
    const appB = await applicationFor(stud, coB.jobId);

    const ta = await startThreadAsCompany(coA.companyUserId, appA, "A side.");
    const tb = await startThreadAsCompany(coB.companyUserId, appB, "B side.");
    if (!ta.ok || !tb.ok) throw new Error("setup failed");

    const aList = await listThreadsForCompany(coA.companyUserId);
    const bList = await listThreadsForCompany(coB.companyUserId);
    expect(aList.some((t) => t.threadId === ta.threadId)).toBe(true);
    expect(aList.some((t) => t.threadId === tb.threadId)).toBe(false);
    expect(bList.some((t) => t.threadId === tb.threadId)).toBe(true);
    expect(bList.some((t) => t.threadId === ta.threadId)).toBe(false);
  });
});

describe.skipIf(skip)("getThread* · 404 collapse on cross-tenant access", () => {
  it("a student gets null for a thread on someone else's application", async () => {
    const owner = await makeStudent("detail-owner");
    const attacker = await makeStudent("detail-attacker");
    const co = await makeApprovedCoWithJob("detail-stud-cross");
    const appId = await applicationFor(owner, co.jobId);
    const t = await startThreadAsCompany(co.companyUserId, appId, "Hi.");
    if (!t.ok) throw new Error("setup failed");

    expect(await getThreadForStudent(owner, t.threadId)).not.toBeNull();
    expect(await getThreadForStudent(attacker, t.threadId)).toBeNull();
  });

  it("a company gets null for a thread on a posting it doesn't own", async () => {
    const stud = await makeStudent("detail-co-cross");
    const owner = await makeApprovedCoWithJob("detail-co-owner");
    const attacker = await makeApprovedCoWithJob("detail-co-attacker");
    const appId = await applicationFor(stud, owner.jobId);
    const t = await startThreadAsCompany(owner.companyUserId, appId, "Hi.");
    if (!t.ok) throw new Error("setup failed");

    expect(await getThreadForCompany(owner.companyUserId, t.threadId)).not.toBeNull();
    expect(await getThreadForCompany(attacker.companyUserId, t.threadId)).toBeNull();
  });
});

describe.skipIf(skip)("getThreadForStudent · marks company messages read", () => {
  it("flips readAt on counterparty messages on first load", async () => {
    const stud = await makeStudent("read-mark");
    const co = await makeApprovedCoWithJob("read-mark");
    const appId = await applicationFor(stud, co.jobId);
    const t = await startThreadAsCompany(co.companyUserId, appId, "Unread.");
    if (!t.ok) throw new Error("setup failed");

    const beforeUnread = await prisma.message.count({
      where: { threadId: t.threadId, readAt: null },
    });
    expect(beforeUnread).toBe(1);

    await getThreadForStudent(stud, t.threadId);

    const afterUnread = await prisma.message.count({
      where: { threadId: t.threadId, readAt: null },
    });
    expect(afterUnread).toBe(0);
  });
});

describe.skipIf(skip)("getThreadIdForApplicationAsCompany", () => {
  it("returns null for a foreign company and the id for the owner", async () => {
    const stud = await makeStudent("lookup");
    const owner = await makeApprovedCoWithJob("lookup-owner");
    const attacker = await makeApprovedCoWithJob("lookup-attacker");
    const appId = await applicationFor(stud, owner.jobId);
    const t = await startThreadAsCompany(owner.companyUserId, appId, "Hi.");
    if (!t.ok) throw new Error("setup failed");

    expect(
      await getThreadIdForApplicationAsCompany(owner.companyUserId, appId),
    ).toBe(t.threadId);
    expect(
      await getThreadIdForApplicationAsCompany(attacker.companyUserId, appId),
    ).toBeNull();
  });
});

describe.skipIf(skip)("Patch 1 · terminal-state read-only", () => {
  it("blocks student sends on a REJECTED application; reads still work", async () => {
    const stud = await makeStudent("closed-stud-rej");
    const co = await makeApprovedCoWithJob("closed-stud-rej");
    const appId = await applicationFor(stud, co.jobId);
    const start = await startThreadAsCompany(co.companyUserId, appId, "Hi.");
    if (!start.ok) throw new Error("setup failed");

    // Company moves the app to REJECTED.
    await transitionApplicationStatus(
      co.companyUserId,
      appId,
      "REJECTED",
    );

    const send = await sendMessageAsStudent(stud, start.threadId, "Hello?");
    expect(send.ok).toBe(false);
    if (send.ok) return;
    expect(send.reason).toBe("thread_closed");

    // Reads still work and the original messages remain.
    const detail = await getThreadForStudent(stud, start.threadId);
    expect(detail).not.toBeNull();
    expect(detail?.threadClosed).toBe(true);
    expect(detail?.canReply).toBe(false);
    expect(detail?.applicationStatus).toBe("REJECTED");
    expect(detail?.messages.map((m) => m.body)).toContain("Hi.");
  });

  it("blocks company sends on a REJECTED application; reads still work", async () => {
    const stud = await makeStudent("closed-co-rej");
    const co = await makeApprovedCoWithJob("closed-co-rej");
    const appId = await applicationFor(stud, co.jobId);
    const start = await startThreadAsCompany(co.companyUserId, appId, "Hi.");
    if (!start.ok) throw new Error("setup failed");

    await transitionApplicationStatus(
      co.companyUserId,
      appId,
      "REJECTED",
    );

    const send = await sendMessageAsCompany(
      co.companyUserId,
      start.threadId,
      "Follow-up.",
    );
    expect(send.ok).toBe(false);
    if (send.ok) return;
    expect(send.reason).toBe("thread_closed");

    const detail = await getThreadForCompany(
      co.companyUserId,
      start.threadId,
    );
    expect(detail).not.toBeNull();
    expect(detail?.threadClosed).toBe(true);
    expect(detail?.canReply).toBe(false);
  });

  it("blocks both sides on a WITHDRAWN application; reads still work", async () => {
    const stud = await makeStudent("closed-withdrawn");
    const co = await makeApprovedCoWithJob("closed-withdrawn");
    const appId = await applicationFor(stud, co.jobId);
    const start = await startThreadAsCompany(co.companyUserId, appId, "Hi.");
    if (!start.ok) throw new Error("setup failed");

    const w = await withdrawApplicationByStudent(stud, appId);
    expect(w.ok).toBe(true);

    const studSend = await sendMessageAsStudent(stud, start.threadId, "Hello?");
    expect(studSend.ok).toBe(false);
    if (!studSend.ok) expect(studSend.reason).toBe("thread_closed");

    const coSend = await sendMessageAsCompany(
      co.companyUserId,
      start.threadId,
      "Hi back.",
    );
    expect(coSend.ok).toBe(false);
    if (!coSend.ok) expect(coSend.reason).toBe("thread_closed");

    // Both sides still read the historical thread.
    const studDetail = await getThreadForStudent(stud, start.threadId);
    const coDetail = await getThreadForCompany(co.companyUserId, start.threadId);
    expect(studDetail?.threadClosed).toBe(true);
    expect(coDetail?.threadClosed).toBe(true);
    expect(studDetail?.applicationStatus).toBe("WITHDRAWN");
  });

  it("OFFER threads remain writable on both sides", async () => {
    const stud = await makeStudent("offer-open");
    const co = await makeApprovedCoWithJob("offer-open");
    const appId = await applicationFor(stud, co.jobId);
    const start = await startThreadAsCompany(co.companyUserId, appId, "Hi.");
    if (!start.ok) throw new Error("setup failed");

    // Walk the funnel to OFFER (legal forward path).
    await transitionApplicationStatus(co.companyUserId, appId, "IN_REVIEW");
    await transitionApplicationStatus(co.companyUserId, appId, "INTERVIEWING");
    await transitionApplicationStatus(co.companyUserId, appId, "OFFER");

    const studSend = await sendMessageAsStudent(
      stud,
      start.threadId,
      "Accepting!",
    );
    expect(studSend.ok).toBe(true);

    const coSend = await sendMessageAsCompany(
      co.companyUserId,
      start.threadId,
      "Welcome.",
    );
    expect(coSend.ok).toBe(true);

    const detail = await getThreadForCompany(co.companyUserId, start.threadId);
    expect(detail?.threadClosed).toBe(false);
    expect(detail?.canReply).toBe(true);
    expect(detail?.applicationStatus).toBe("OFFER");
  });

  it("rejects starting a brand-new thread on an already-closed application", async () => {
    const stud = await makeStudent("start-after-rej");
    const co = await makeApprovedCoWithJob("start-after-rej");
    const appId = await applicationFor(stud, co.jobId);
    await transitionApplicationStatus(co.companyUserId, appId, "REJECTED");

    const r = await startThreadAsCompany(co.companyUserId, appId, "Late hi.");
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe("thread_closed");
  });
});

describe.skipIf(skip)("Patch 2 · global unread counters", () => {
  it("student count is scoped to that student and excludes other students' threads", async () => {
    const studA = await makeStudent("unread-A");
    const studB = await makeStudent("unread-B");
    const co = await makeApprovedCoWithJob("unread-target");
    const appA = await applicationFor(studA, co.jobId);
    const appB = await applicationFor(studB, co.jobId);

    // Two unread messages for A, one for B.
    const tA = await startThreadAsCompany(co.companyUserId, appA, "A1");
    if (!tA.ok) throw new Error("setup failed");
    await sendMessageAsCompany(co.companyUserId, tA.threadId, "A2");
    const tB = await startThreadAsCompany(co.companyUserId, appB, "B1");
    if (!tB.ok) throw new Error("setup failed");

    expect(await countUnreadForStudent(studA)).toBe(2);
    expect(await countUnreadForStudent(studB)).toBe(1);
  });

  it("company count is scoped to that company; excludes its own outbound messages", async () => {
    const stud = await makeStudent("unread-co-scope");
    const coA = await makeApprovedCoWithJob("unread-coA");
    const coB = await makeApprovedCoWithJob("unread-coB");
    const appA = await applicationFor(stud, coA.jobId);
    const appB = await applicationFor(stud, coB.jobId);

    // CoA initiates; student has not replied. Company outbound shouldn't
    // count for the company itself.
    const tA = await startThreadAsCompany(coA.companyUserId, appA, "Hi A");
    if (!tA.ok) throw new Error("setup failed");
    const tB = await startThreadAsCompany(coB.companyUserId, appB, "Hi B");
    if (!tB.ok) throw new Error("setup failed");

    // Student replies once to coA only — that's the inbound message
    // that should bump coA's unread count, but not coB's.
    const reply = await sendMessageAsStudent(stud, tA.threadId, "Reply.");
    expect(reply.ok).toBe(true);

    expect(await countUnreadForCompany(coA.companyUserId)).toBe(1);
    expect(await countUnreadForCompany(coB.companyUserId)).toBe(0);
  });

  it("opening a thread decrements the unread count after read-on-load", async () => {
    const stud = await makeStudent("unread-read");
    const co = await makeApprovedCoWithJob("unread-read");
    const appId = await applicationFor(stud, co.jobId);
    const t = await startThreadAsCompany(co.companyUserId, appId, "Unread.");
    if (!t.ok) throw new Error("setup failed");

    expect(await countUnreadForStudent(stud)).toBe(1);

    await getThreadForStudent(stud, t.threadId);

    expect(await countUnreadForStudent(stud)).toBe(0);
  });

  it("returns 0 for non-students / non-companies", async () => {
    const stud = await makeStudent("unread-role-mismatch");
    const co = await makeApprovedCoWithJob("unread-role-mismatch");
    expect(await countUnreadForStudent(co.companyUserId)).toBe(0);
    expect(await countUnreadForCompany(stud)).toBe(0);
  });
});
