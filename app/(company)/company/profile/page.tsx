import { CompanyApprovalBanner } from "@/features/companies/approval-banner";
import { CompanyCompletenessMeter } from "@/features/companies/completeness-meter";
import {
  CompanyProfileForm,
  type CompanyProfileDefaults,
} from "@/features/companies/company-profile-form";
import { LogoSection } from "@/features/companies/logo-section";
import { getFreshCompanyApprovalStatus } from "@/lib/auth/company-approval";
import { requireRole } from "@/lib/auth/guards";
import { calculateCompanyCompleteness } from "@/lib/companies/completeness";
import { getCompanyProfileByUserId } from "@/server/services/company-service";

export const metadata = {
  title: "Your company profile",
};

const EMPTY_DEFAULTS: CompanyProfileDefaults = {
  companyName: "",
  industry: "",
  companySize: "",
  headquarters: "",
  shortDescription: "",
  description: "",
  contactEmail: "",
  websiteUrl: "",
  programTag: "",
};

export default async function CompanyProfilePage() {
  const user = await requireRole("COMPANY");
  const [profile, approvalStatus] = await Promise.all([
    getCompanyProfileByUserId(user.id),
    getFreshCompanyApprovalStatus(user.id),
  ]);

  const defaults: CompanyProfileDefaults = profile
    ? {
        companyName: profile.companyName ?? "",
        industry: profile.industry ?? "",
        companySize: profile.companySize ?? "",
        headquarters: profile.headquarters ?? "",
        shortDescription: profile.shortDescription ?? "",
        description: profile.description ?? "",
        contactEmail: profile.contactEmail ?? "",
        websiteUrl: profile.websiteUrl ?? "",
        programTag: profile.programTag ?? "",
      }
    : EMPTY_DEFAULTS;

  const completeness = calculateCompanyCompleteness({
    companyName: profile?.companyName ?? null,
    slug: profile?.slug ?? null,
    industry: profile?.industry ?? null,
    companySize: profile?.companySize ?? null,
    headquarters: profile?.headquarters ?? null,
    shortDescription: profile?.shortDescription ?? null,
    description: profile?.description ?? null,
    contactEmail: profile?.contactEmail ?? null,
  });

  return (
    <main className="flex flex-1 flex-col gap-8 px-6 py-12">
      <header className="mx-auto w-full max-w-4xl space-y-3">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Company profile
        </p>
        <h1 className="text-3xl font-semibold tracking-tight">
          {profile?.companyName
            ? `${profile.companyName} profile`
            : "Your company profile"}
        </h1>
        <p className="text-muted-foreground">
          Students see this when you publish job postings. Save changes any
          time — sections update independently.
        </p>
      </header>

      {approvalStatus ? (
        <div className="mx-auto w-full max-w-4xl">
          <CompanyApprovalBanner status={approvalStatus} />
        </div>
      ) : null}

      <div className="mx-auto w-full max-w-4xl">
        <CompanyCompletenessMeter completeness={completeness} />
      </div>

      <Section
        title="Basics"
        description="Identity, location, and the descriptions students will read."
      >
        <CompanyProfileForm defaults={defaults} />
      </Section>

      <Section
        title="Logo"
        description="Public asset. Appears on your company page and in listings."
      >
        <LogoSection currentKey={profile?.logoStorageKey ?? null} />
      </Section>
    </main>
  );
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mx-auto w-full max-w-4xl space-y-4 rounded-lg border border-border bg-card p-6">
      <header>
        <h2 className="text-lg font-semibold">{title}</h2>
        {description ? (
          <p className="text-sm text-muted-foreground">{description}</p>
        ) : null}
      </header>
      {children}
    </section>
  );
}
