import { z } from "zod";

export const toggleSavedJobSchema = z.object({
  jobPostingId: z.string().cuid(),
  intent: z.enum(["save", "unsave"]),
});

export type ToggleSavedJobInput = z.infer<typeof toggleSavedJobSchema>;
