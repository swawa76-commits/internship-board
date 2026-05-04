"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireRole } from "@/lib/auth/guards";
import {
  replyMessageSchema,
  startThreadSchema,
} from "@/features/messages/schemas";
import {
  sendMessageAsCompany,
  sendMessageAsStudent,
  startThreadAsCompany,
} from "@/server/services/message-service";

export type MessageFormState =
  | { status: "idle" }
  | { status: "ok" }
  | { status: "error"; message: string };

function pickFormString(formData: FormData, key: string): string {
  const v = formData.get(key);
  return typeof v === "string" ? v : "";
}

const FAILURE_MESSAGES: Record<string, string> = {
  forbidden: "You don't have access to that thread.",
  thread_not_found: "Thread not found.",
  application_not_found: "Application not found.",
  empty: "Message can't be empty.",
  students_cannot_initiate:
    "Students can't start a thread — wait for the company to reach out first.",
  thread_closed:
    "This conversation is closed and can no longer receive replies.",
};

/**
 * Company-initiated thread. Two outcomes:
 *  - Success: server-side redirect to /company/messages/[threadId].
 *  - Failure: stay put with a useActionState error message.
 *
 * Idempotent — if a thread already exists for the application, the
 * service appends to it rather than creating a duplicate.
 */
export async function startThreadAsCompanyAction(
  _prev: MessageFormState,
  formData: FormData,
): Promise<MessageFormState> {
  const user = await requireRole("COMPANY");
  const parsed = startThreadSchema.safeParse({
    applicationId: pickFormString(formData, "applicationId"),
    body: pickFormString(formData, "body"),
  });
  if (!parsed.success) {
    return {
      status: "error",
      message: parsed.error.issues[0]?.message ?? "Check your input.",
    };
  }

  const result = await startThreadAsCompany(
    user.id,
    parsed.data.applicationId,
    parsed.data.body,
  );
  if (!result.ok) {
    return {
      status: "error",
      message: FAILURE_MESSAGES[result.reason] ?? "Couldn't send message.",
    };
  }

  revalidatePath("/company/messages");
  revalidatePath("/company/applications");
  redirect(`/company/messages/${result.threadId}`);
}

export async function replyAsCompanyAction(
  _prev: MessageFormState,
  formData: FormData,
): Promise<MessageFormState> {
  const user = await requireRole("COMPANY");
  const parsed = replyMessageSchema.safeParse({
    threadId: pickFormString(formData, "threadId"),
    body: pickFormString(formData, "body"),
  });
  if (!parsed.success) {
    return {
      status: "error",
      message: parsed.error.issues[0]?.message ?? "Check your input.",
    };
  }

  const result = await sendMessageAsCompany(
    user.id,
    parsed.data.threadId,
    parsed.data.body,
  );
  if (!result.ok) {
    return {
      status: "error",
      message: FAILURE_MESSAGES[result.reason] ?? "Couldn't send message.",
    };
  }

  revalidatePath(`/company/messages/${parsed.data.threadId}`);
  revalidatePath("/company/messages");
  return { status: "ok" };
}

export async function replyAsStudentAction(
  _prev: MessageFormState,
  formData: FormData,
): Promise<MessageFormState> {
  const user = await requireRole("STUDENT");
  const parsed = replyMessageSchema.safeParse({
    threadId: pickFormString(formData, "threadId"),
    body: pickFormString(formData, "body"),
  });
  if (!parsed.success) {
    return {
      status: "error",
      message: parsed.error.issues[0]?.message ?? "Check your input.",
    };
  }

  const result = await sendMessageAsStudent(
    user.id,
    parsed.data.threadId,
    parsed.data.body,
  );
  if (!result.ok) {
    return {
      status: "error",
      message: FAILURE_MESSAGES[result.reason] ?? "Couldn't send message.",
    };
  }

  revalidatePath(`/student/messages/${parsed.data.threadId}`);
  revalidatePath("/student/messages");
  return { status: "ok" };
}
