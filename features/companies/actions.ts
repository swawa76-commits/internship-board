"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireRole } from "@/lib/auth/guards";
import { prisma } from "@/lib/db/client";
import { companyBasicsSchema } from "@/features/companies/schemas";
import { storage } from "@/server/adapters/storage";
import {
  setLogoStorageKey,
  upsertCompanyProfile,
} from "@/server/services/company-service";

export type CompanyFormState =
  | { status: "idle" }
  | { status: "ok"; message?: string }
  | { status: "error"; message: string };

function pathnamesToRevalidate() {
  // Onboarding gate, dashboard, and the profile page itself all read
  // the same row. Revalidating the layout covers the protected area.
  revalidatePath("/company", "layout");
}

function pickFormString(formData: FormData, key: string): string {
  const v = formData.get(key);
  return typeof v === "string" ? v : "";
}

export async function saveCompanyProfileAction(
  _prev: CompanyFormState,
  formData: FormData,
): Promise<CompanyFormState> {
  const user = await requireRole("COMPANY");

  const parsed = companyBasicsSchema.safeParse({
    companyName: pickFormString(formData, "companyName"),
    industry: pickFormString(formData, "industry"),
    companySize: pickFormString(formData, "companySize"),
    headquarters: pickFormString(formData, "headquarters"),
    shortDescription: pickFormString(formData, "shortDescription"),
    description: pickFormString(formData, "description"),
    contactEmail: pickFormString(formData, "contactEmail"),
    websiteUrl: pickFormString(formData, "websiteUrl"),
    programTag: pickFormString(formData, "programTag"),
  });

  if (!parsed.success) {
    return {
      status: "error",
      message:
        parsed.error.issues[0]?.message ??
        "Please check the highlighted fields.",
    };
  }

  const result = await upsertCompanyProfile(user.id, parsed.data);
  if (!result.ok) {
    return {
      status: "error",
      message:
        "That company name produced a slug that's already taken. Try a slightly different name.",
    };
  }

  pathnamesToRevalidate();

  // First-time creation that completes onboarding routes the user out
  // of the profile page and into the normal dashboard. Returning
  // companies stay where they are so they can review their changes.
  if (result.isFirstSave && result.isComplete) {
    redirect("/company/dashboard");
  }

  return {
    status: "ok",
    message: result.isComplete
      ? "Profile saved."
      : "Profile saved. Fill the remaining fields to finish onboarding.",
  };
}

const MAX_LOGO_BYTES = 2 * 1024 * 1024; // 2 MB

export async function uploadLogoAction(
  _prev: CompanyFormState,
  formData: FormData,
): Promise<CompanyFormState> {
  const user = await requireRole("COMPANY");
  const file = formData.get("logo");

  if (!(file instanceof File) || file.size === 0) {
    return { status: "error", message: "Choose a logo file to upload." };
  }
  if (file.size > MAX_LOGO_BYTES) {
    return { status: "error", message: "Logo must be 2 MB or smaller." };
  }

  const profile = await prisma.companyProfile.findFirst({
    where: { userId: user.id, deletedAt: null },
    select: { logoStorageKey: true },
  });

  try {
    const bytes = Buffer.from(await file.arrayBuffer());
    const { storageKey } = await storage.put({
      prefix: "logos",
      filename: file.name,
      contentType: file.type || "application/octet-stream",
      bytes,
    });
    await setLogoStorageKey(user.id, storageKey);
    if (profile?.logoStorageKey && profile.logoStorageKey !== storageKey) {
      try {
        await storage.delete(profile.logoStorageKey);
      } catch {
        console.warn("Orphaned logo left at", profile.logoStorageKey);
      }
    }
  } catch (err) {
    return {
      status: "error",
      message:
        err instanceof Error
          ? err.message
          : "Could not save your logo. Try again.",
    };
  }

  pathnamesToRevalidate();
  return { status: "ok", message: "Logo uploaded." };
}

export async function deleteLogoAction(): Promise<void> {
  const user = await requireRole("COMPANY");
  const profile = await prisma.companyProfile.findFirst({
    where: { userId: user.id, deletedAt: null },
    select: { logoStorageKey: true },
  });
  if (profile?.logoStorageKey) {
    try {
      await storage.delete(profile.logoStorageKey);
    } catch {
      // tolerate missing files
    }
  }
  await setLogoStorageKey(user.id, null);
  pathnamesToRevalidate();
}
