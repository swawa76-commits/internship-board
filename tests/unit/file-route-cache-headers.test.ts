// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Pins the cache headers on file-serving routes when the storage adapter
 * returns a `redirect` (i.e., a presigned URL bounded by
 * S3_SIGNED_URL_TTL_SECONDS). A long-cached 302 would outlive its
 * Location header and start serving 403s, so this branch must be
 * `no-store`.
 *
 * Stream-branch headers are exercised indirectly by existing tests; we
 * focus here on the redirect path that's specific to cloud storage.
 */

const REDIRECT_KEY = "logos/8b4c7d2e-1234-4abc-9def-0123456789ab.png";
const PRESIGNED =
  "https://acct.r2.cloudflarestorage.com/bucket/logos/x.png?X-Amz-Signature=abc";

vi.mock("@/server/adapters/storage", () => ({
  storage: {
    name: "mock",
    put: vi.fn(),
    delete: vi.fn(),
    read: vi.fn(),
  },
}));

vi.mock("@/lib/auth/guards", () => ({
  getSessionUser: vi.fn(),
}));

vi.mock("@/server/services/student-service", () => ({
  canStudentReadResume: vi.fn(),
}));

vi.mock("@/server/services/application-service", () => ({
  canCompanyReadApplicationSnapshot: vi.fn(),
}));

beforeEach(async () => {
  const { storage } = await import("@/server/adapters/storage");
  vi.mocked(storage.read).mockResolvedValue({
    kind: "redirect",
    url: PRESIGNED,
  });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("public logo route — redirect cache header", () => {
  it("returns no-store on a redirect from cloud storage", async () => {
    const { GET } = await import("@/app/api/files/logo/[key]/route");
    const res = await GET(
      new Request(`http://localhost/api/files/logo/${REDIRECT_KEY}`),
      {
        params: Promise.resolve({ key: REDIRECT_KEY }),
      },
    );
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe(PRESIGNED);
    expect(res.headers.get("cache-control")).toBe("no-store");
  });
});

describe("private resume route — redirect cache header", () => {
  it("returns private, no-store on a redirect from cloud storage", async () => {
    const { getSessionUser } = await import("@/lib/auth/guards");
    const { canStudentReadResume } =
      await import("@/server/services/student-service");
    vi.mocked(getSessionUser).mockResolvedValue({
      id: "u1",
      role: "STUDENT",
    } as Awaited<ReturnType<typeof getSessionUser>>);
    vi.mocked(canStudentReadResume).mockResolvedValue(true);

    const key = "resumes/abc.pdf";
    const { GET } = await import("@/app/api/files/resume/[key]/route");
    const res = await GET(
      new Request(`http://localhost/api/files/resume/${key}`),
      {
        params: Promise.resolve({ key }),
      },
    );
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe(PRESIGNED);
    expect(res.headers.get("cache-control")).toBe("private, no-store");
  });
});

describe("snapshot resume route — redirect cache header", () => {
  it("returns private, no-store on a redirect from cloud storage", async () => {
    const { getSessionUser } = await import("@/lib/auth/guards");
    const { canCompanyReadApplicationSnapshot } =
      await import("@/server/services/application-service");
    vi.mocked(getSessionUser).mockResolvedValue({
      id: "co1",
      role: "COMPANY",
    } as Awaited<ReturnType<typeof getSessionUser>>);
    vi.mocked(canCompanyReadApplicationSnapshot).mockResolvedValue({
      ok: true,
      storageKey: "resumes/snapshot.pdf",
    } as Awaited<ReturnType<typeof canCompanyReadApplicationSnapshot>>);

    const { GET } =
      await import("@/app/api/files/resume/snapshot/[applicationId]/route");
    const res = await GET(
      new Request("http://localhost/api/files/resume/snapshot/app-1"),
      { params: Promise.resolve({ applicationId: "app-1" }) },
    );
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe(PRESIGNED);
    expect(res.headers.get("cache-control")).toBe("private, no-store");
  });
});
