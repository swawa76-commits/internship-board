import { z } from "zod";

const messageBodySchema = z
  .string()
  .trim()
  .min(1, "Message can't be empty.")
  .max(4000, "Message is too long.");

export const startThreadSchema = z.object({
  applicationId: z.string().cuid(),
  body: messageBodySchema,
});

export const replyMessageSchema = z.object({
  threadId: z.string().cuid(),
  body: messageBodySchema,
});

export type StartThreadInput = z.infer<typeof startThreadSchema>;
export type ReplyMessageInput = z.infer<typeof replyMessageSchema>;
