import { z } from "zod";

export const signupSchema = z
  .object({
    email: z.string().trim().toLowerCase().email("Enter a valid email."),
    password: z
      .string()
      .min(8, "Password must be at least 8 characters.")
      .max(128, "Password is too long."),
    role: z.enum(["STUDENT", "COMPANY"], {
      message: "Choose either Student or Company.",
    }),
  });

export type SignupInput = z.infer<typeof signupSchema>;

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email."),
  password: z.string().min(1, "Password is required."),
});

export type LoginInput = z.infer<typeof loginSchema>;
