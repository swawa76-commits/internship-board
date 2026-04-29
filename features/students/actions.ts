"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireRole } from "@/lib/auth/guards";
import {
  experienceSchema,
  profileBasicsSchema,
  projectSchema,
  skillSchema,
} from "@/features/students/schemas";
import { storage } from "@/server/adapters/storage";
import {
  addExperience,
  addProject,
  addSkill,
  removeExperience,
  removeProject,
  removeSkill,
  setResumeStorageKey,
  upsertProfileBasics,
} from "@/server/services/student-service";
import { prisma } from "@/lib/db/client";

export type ProfileFormState =
  | { status: "idle" }
  | { status: "ok"; message?: string }
  | { status: "error"; message: string };

function pathnamesToRevalidate() {
  // /student/dashboard reads the same profile / completeness data, and
  // /student/onboarding gates on it. Revalidating /student covers both.
  revalidatePath("/student", "layout");
}

function pickFormString(formData: FormData, key: string): string {
  const v = formData.get(key);
  return typeof v === "string" ? v : "";
}

export async function saveProfileBasicsAction(
  _prev: ProfileFormState,
  formData: FormData,
): Promise<ProfileFormState> {
  const user = await requireRole("STUDENT");

  const parsed = profileBasicsSchema.safeParse({
    fullName: pickFormString(formData, "fullName"),
    headline: pickFormString(formData, "headline"),
    university: pickFormString(formData, "university"),
    graduationYear: pickFormString(formData, "graduationYear"),
    degree: pickFormString(formData, "degree"),
    major: pickFormString(formData, "major"),
    location: pickFormString(formData, "location"),
    workAuthorization: pickFormString(formData, "workAuthorization"),
    bio: pickFormString(formData, "bio"),
    portfolioUrl: pickFormString(formData, "portfolioUrl"),
    linkedinUrl: pickFormString(formData, "linkedinUrl"),
    githubUrl: pickFormString(formData, "githubUrl"),
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

  await upsertProfileBasics(user.id, parsed.data);
  pathnamesToRevalidate();
  return { status: "ok", message: "Profile saved." };
}

// ---------- Skills ----------

export async function addSkillAction(formData: FormData): Promise<void> {
  const user = await requireRole("STUDENT");
  const parsed = skillSchema.safeParse({ name: pickFormString(formData, "name") });
  if (!parsed.success) return;
  await addSkill(user.id, parsed.data);
  pathnamesToRevalidate();
}

export async function removeSkillAction(formData: FormData): Promise<void> {
  const user = await requireRole("STUDENT");
  const id = pickFormString(formData, "id");
  if (!z.string().cuid().safeParse(id).success) return;
  await removeSkill(user.id, id);
  pathnamesToRevalidate();
}

// ---------- Experiences ----------

export async function addExperienceAction(formData: FormData): Promise<void> {
  const user = await requireRole("STUDENT");
  const parsed = experienceSchema.safeParse({
    title: pickFormString(formData, "title"),
    organization: pickFormString(formData, "organization"),
    startDate: pickFormString(formData, "startDate"),
    endDate: pickFormString(formData, "endDate"),
    description: pickFormString(formData, "description"),
  });
  if (!parsed.success) return;
  await addExperience(user.id, parsed.data);
  pathnamesToRevalidate();
}

export async function removeExperienceAction(formData: FormData): Promise<void> {
  const user = await requireRole("STUDENT");
  const id = pickFormString(formData, "id");
  if (!z.string().cuid().safeParse(id).success) return;
  await removeExperience(user.id, id);
  pathnamesToRevalidate();
}

// ---------- Projects ----------

export async function addProjectAction(formData: FormData): Promise<void> {
  const user = await requireRole("STUDENT");
  const parsed = projectSchema.safeParse({
    name: pickFormString(formData, "name"),
    url: pickFormString(formData, "url"),
    description: pickFormString(formData, "description"),
  });
  if (!parsed.success) return;
  await addProject(user.id, parsed.data);
  pathnamesToRevalidate();
}

export async function removeProjectAction(formData: FormData): Promise<void> {
  const user = await requireRole("STUDENT");
  const id = pickFormString(formData, "id");
  if (!z.string().cuid().safeParse(id).success) return;
  await removeProject(user.id, id);
  pathnamesToRevalidate();
}

// ---------- Resume ----------

const MAX_RESUME_BYTES = 5 * 1024 * 1024; // 5 MB

export async function uploadResumeAction(
  _prev: ProfileFormState,
  formData: FormData,
): Promise<ProfileFormState> {
  const user = await requireRole("STUDENT");
  const file = formData.get("resume");

  if (!(file instanceof File) || file.size === 0) {
    return { status: "error", message: "Choose a file to upload." };
  }
  if (file.size > MAX_RESUME_BYTES) {
    return { status: "error", message: "Resume must be 5 MB or smaller." };
  }

  // Replace any existing resume — keep storage from accumulating dead files.
  const profile = await prisma.studentProfile.findUnique({
    where: { userId: user.id },
    select: { resumeStorageKey: true },
  });

  try {
    const bytes = Buffer.from(await file.arrayBuffer());
    const { storageKey } = await storage.put({
      prefix: "resumes",
      filename: file.name,
      contentType: file.type || "application/octet-stream",
      bytes,
    });
    await setResumeStorageKey(user.id, storageKey);
    if (profile?.resumeStorageKey && profile.resumeStorageKey !== storageKey) {
      try {
        await storage.delete(profile.resumeStorageKey);
      } catch {
        // Don't fail the user-facing save just because the orphan delete
        // hiccuped — log via console so a future operator can clean up.
        console.warn("Orphaned resume left at", profile.resumeStorageKey);
      }
    }
  } catch (err) {
    return {
      status: "error",
      message:
        err instanceof Error
          ? err.message
          : "Could not save your resume. Try again.",
    };
  }

  pathnamesToRevalidate();
  return { status: "ok", message: "Resume uploaded." };
}

export async function deleteResumeAction(): Promise<void> {
  const user = await requireRole("STUDENT");
  const profile = await prisma.studentProfile.findUnique({
    where: { userId: user.id },
    select: { resumeStorageKey: true },
  });
  if (profile?.resumeStorageKey) {
    try {
      await storage.delete(profile.resumeStorageKey);
    } catch {
      // Same orphan-tolerance — clear the DB pointer regardless.
    }
  }
  await setResumeStorageKey(user.id, null);
  pathnamesToRevalidate();
}
