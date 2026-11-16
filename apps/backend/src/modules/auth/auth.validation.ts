
import { z } from "zod";

export const loginSchema = z
  .object({
    identifier: z
      .string()
      .trim()
      .min(3, "Email or employee code is required")
      .max(254, "Identifier is too long")
      .optional(),

    email: z
      .string()
      .trim()
      .min(3, "Email is required")
      .max(254, "Email is too long")
      .optional(),

    password: z
      .string()
      .min(1, "Password is required")
      .max(128, "Password is too long"),
  })
  .refine((data:any) => Boolean(data.identifier || data.email), {
    message: "Email or employee code is required",
  });
