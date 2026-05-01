// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

import type { CompletenessInput } from "@/lib/students/completeness";

// The dashboard is a server component. We mock everything outside the
// page's own UX logic — guards, onboarding gate, and the three data
// services — so we can drive the render tree from the test.

vi.mock("@/lib/auth/guards", () => ({
  requireRole: vi.fn(),
}));
vi.mock("@/server/services/onboarding-service", () => ({
  needsStudentOnboarding: vi.fn(),
}));
vi.mock("@/server/services/student-service", () => ({
  getStudentProfileByUserId: vi.fn(),
}));
vi.mock("@/server/services/application-service", () => ({
  listApplicationsForStudent: vi.fn(),
}));
vi.mock("@/server/services/saved-job-service", () => ({
  listSavedJobsForStudent: vi.fn(),
}));
// LogoutButton pulls in next-auth via its server action; stub it out.
vi.mock("@/features/auth/logout-button", () => ({
  LogoutButton: () => <button type="button">Log out</button>,
}));
// next/navigation.redirect throws by default so the page must not call it.
vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw new Error(`unexpected redirect to ${path}`);
  },
}));

import { requireRole } from "@/lib/auth/guards";
import { listApplicationsForStudent } from "@/server/services/application-service";
import { needsStudentOnboarding } from "@/server/services/onboarding-service";
import { listSavedJobsForStudent } from "@/server/services/saved-job-service";
import { getStudentProfileByUserId } from "@/server/services/student-service";
import StudentDashboardPage from "@/app/(student)/student/dashboard/page";

const SESSION_USER = {
  id: "u-stud-1",
  role: "STUDENT" as const,
  email: "me@test.local",
};

const COMPLETE_PROFILE_INPUT = {
  fullName: "Sam",
  headline: "Headline",
  university: "State U",
  graduationYear: 2027,
  degree: "B.S.",
  major: "CS",
  location: "Remote",
  workAuthorization: "US citizen",
  bio: "Bio",
  resumeStorageKey: "resumes/me.pdf",
  skills: [{ id: "sk1", name: "TS" }],
  experiences: [{ id: "e1" }],
  projects: [{ id: "p1" }],
} as Record<string, unknown>;

const INCOMPLETE_PROFILE_INPUT = {
  fullName: "Sam",
  headline: null,
  university: null,
  graduationYear: null,
  degree: null,
  major: null,
  location: null,
  workAuthorization: null,
  bio: null,
  resumeStorageKey: null,
  skills: [],
  experiences: [],
  projects: [],
} as Record<string, unknown>;

// Sanity: completeness is pure logic; verify our shapes drive the
// expected branches before we trust them in render assertions.
import { calculateCompleteness } from "@/lib/students/completeness";
function asCompletenessInput(p: Record<string, unknown>): CompletenessInput {
  return {
    fullName: p.fullName as string | null,
    headline: p.headline as string | null,
    university: p.university as string | null,
    graduationYear: p.graduationYear as number | null,
    degree: p.degree as string | null,
    major: p.major as string | null,
    location: p.location as string | null,
    workAuthorization: p.workAuthorization as string | null,
    bio: p.bio as string | null,
    resumeStorageKey: p.resumeStorageKey as string | null,
    skillCount: (p.skills as unknown[]).length,
    experienceCount: (p.experiences as unknown[]).length,
    projectCount: (p.projects as unknown[]).length,
  };
}

beforeEach(() => {
  vi.mocked(requireRole).mockResolvedValue(SESSION_USER);
  vi.mocked(needsStudentOnboarding).mockResolvedValue(false);
  vi.mocked(listApplicationsForStudent).mockResolvedValue([]);
  vi.mocked(listSavedJobsForStudent).mockResolvedValue([]);
});

async function renderDashboard() {
  // Server component returns a Promise<JSX>; resolve and hand to RTL.
  const tree = await StudentDashboardPage();
  render(tree);
}

describe("Student dashboard render — profile CTA", () => {
  it("incomplete student sees CompletenessMeter and 'Complete your profile' CTA", async () => {
    expect(
      calculateCompleteness(asCompletenessInput(INCOMPLETE_PROFILE_INPUT)).isComplete,
    ).toBe(false);

    vi.mocked(getStudentProfileByUserId).mockResolvedValue(
      INCOMPLETE_PROFILE_INPUT as unknown as Awaited<
        ReturnType<typeof getStudentProfileByUserId>
      >,
    );

    await renderDashboard();

    expect(
      screen.getByRole("region", { name: "Profile completeness" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /complete your profile/i }),
    ).toBeInTheDocument();
  });

  it("complete student does NOT see the 'Complete your profile' CTA", async () => {
    expect(
      calculateCompleteness(asCompletenessInput(COMPLETE_PROFILE_INPUT)).isComplete,
    ).toBe(true);

    vi.mocked(getStudentProfileByUserId).mockResolvedValue(
      COMPLETE_PROFILE_INPUT as unknown as Awaited<
        ReturnType<typeof getStudentProfileByUserId>
      >,
    );

    await renderDashboard();

    expect(
      screen.queryByRole("region", { name: "Profile completeness" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: /complete your profile/i }),
    ).not.toBeInTheDocument();
  });
});

describe("Student dashboard render — Recent Applications widget", () => {
  it("shows zero-state when the student has no applications", async () => {
    vi.mocked(getStudentProfileByUserId).mockResolvedValue(
      COMPLETE_PROFILE_INPUT as unknown as Awaited<
        ReturnType<typeof getStudentProfileByUserId>
      >,
    );
    vi.mocked(listApplicationsForStudent).mockResolvedValue([]);

    await renderDashboard();

    expect(
      screen.getByText(/haven't applied to any internships yet/i),
    ).toBeInTheDocument();
    // Both the empty-state CTA inside the widget and the footer copy
    // link to /jobs with the same label. Asserting length proves the
    // widget rendered its empty-state link in addition to the footer.
    const browseLinks = screen.getAllByRole("link", {
      name: /browse open postings/i,
    });
    expect(browseLinks.length).toBeGreaterThanOrEqual(2);
    expect(browseLinks.every((l) => l.getAttribute("href") === "/jobs")).toBe(
      true,
    );
  });

  it("renders populated rows with title, company, and status pill", async () => {
    vi.mocked(getStudentProfileByUserId).mockResolvedValue(
      COMPLETE_PROFILE_INPUT as unknown as Awaited<
        ReturnType<typeof getStudentProfileByUserId>
      >,
    );
    vi.mocked(listApplicationsForStudent).mockResolvedValue([
      {
        id: "app1",
        status: "IN_REVIEW",
        appliedAt: new Date("2026-04-01T00:00:00Z"),
        jobPosting: {
          id: "job1",
          title: "Backend Intern",
          jobSlug: "backend-intern",
          workplaceType: "REMOTE",
          status: "PUBLISHED",
          company: {
            companyName: "Acme",
            companySlug: "acme",
          },
        },
      },
    ]);

    await renderDashboard();

    expect(screen.getByText("Backend Intern")).toBeInTheDocument();
    // Company + date are separate text nodes joined by " · " on the
    // same <p>. Locale formatting of the date varies, so match the
    // company side and the year only.
    expect(
      screen.getByText((_text, node) => {
        if (!node) return false;
        const collapsed = node.textContent?.replace(/\s+/g, " ").trim() ?? "";
        return /^Acme · .*2026$/.test(collapsed);
      }),
    ).toBeInTheDocument();
    expect(screen.getByText("In review")).toBeInTheDocument();
  });
});

describe("Student dashboard render — Saved Postings widget", () => {
  it("shows zero-state when the student hasn't saved anything", async () => {
    vi.mocked(getStudentProfileByUserId).mockResolvedValue(
      COMPLETE_PROFILE_INPUT as unknown as Awaited<
        ReturnType<typeof getStudentProfileByUserId>
      >,
    );
    vi.mocked(listSavedJobsForStudent).mockResolvedValue([]);

    await renderDashboard();

    expect(screen.getByText(/no saved postings yet/i)).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /find roles to save/i }),
    ).toBeInTheDocument();
  });

  it("renders an open saved row as a clickable title with 'Open' pill", async () => {
    vi.mocked(getStudentProfileByUserId).mockResolvedValue(
      COMPLETE_PROFILE_INPUT as unknown as Awaited<
        ReturnType<typeof getStudentProfileByUserId>
      >,
    );
    vi.mocked(listSavedJobsForStudent).mockResolvedValue([
      {
        id: "sav1",
        savedAt: new Date(),
        jobPosting: {
          id: "j1",
          title: "Open Internship",
          jobSlug: "open-intern",
          workplaceType: "REMOTE",
          status: "PUBLISHED",
          publishedAt: new Date(),
          applicationDeadline: null,
          isCurrentlyOpen: true,
          company: {
            companyName: "Acme",
            companySlug: "acme",
            logoStorageKey: null,
          },
        },
      },
    ]);

    await renderDashboard();

    const link = screen.getByRole("link", { name: "Open Internship" });
    expect(link).toBeInTheDocument();
    expect(link.getAttribute("href")).toBe("/companies/acme/jobs/open-intern");
    expect(screen.getByText("Open")).toBeInTheDocument();
    expect(screen.queryByText("Closed")).not.toBeInTheDocument();
  });

  it("renders a stale saved row with non-clickable title and 'Closed' pill", async () => {
    vi.mocked(getStudentProfileByUserId).mockResolvedValue(
      COMPLETE_PROFILE_INPUT as unknown as Awaited<
        ReturnType<typeof getStudentProfileByUserId>
      >,
    );
    vi.mocked(listSavedJobsForStudent).mockResolvedValue([
      {
        id: "sav-stale",
        savedAt: new Date(),
        jobPosting: {
          id: "j-stale",
          title: "Closed Internship",
          jobSlug: "closed-intern",
          workplaceType: "REMOTE",
          status: "PAUSED",
          publishedAt: new Date(),
          applicationDeadline: null,
          isCurrentlyOpen: false,
          company: {
            companyName: "Acme",
            companySlug: "acme",
            logoStorageKey: null,
          },
        },
      },
    ]);

    await renderDashboard();

    expect(screen.getByText("Closed Internship")).toBeInTheDocument();
    // Title is rendered as plain text, not a link.
    expect(
      screen.queryByRole("link", { name: "Closed Internship" }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("Closed")).toBeInTheDocument();
  });
});
