import { z } from "zod";
import { isValidEthiopianPhone } from "./phone";
import { checkPasswordStrength } from "./password";

const usernameSchema = z
  .string()
  .trim()
  .min(3, "Username must be at least 3 characters.")
  .max(24, "Username must be at most 24 characters.")
  .regex(/^[a-zA-Z0-9_]+$/, "Username may only contain letters, numbers, and underscores.");

const passwordSchema = z.string().superRefine((value, ctx) => {
  const result = checkPasswordStrength(value);
  if (!result.valid) {
    for (const error of result.errors) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: error });
    }
  }
});

const phoneSchema = z
  .string()
  .trim()
  .refine((value) => isValidEthiopianPhone(value), {
    message: "Enter a valid Ethiopian mobile number, e.g. +251912345678.",
  });

export const registerSchema = z
  .object({
    fullName: z.string().trim().min(2, "Full name is required.").max(120),
    username: usernameSchema,
    email: z.string().trim().email("Enter a valid email address.").max(255),
    phone: phoneSchema,
    password: passwordSchema,
    confirmPassword: z.string(),
    referralCode: z.string().trim().max(32).optional().or(z.literal("")),
    acceptedTerms: z.literal(true, {
      errorMap: () => ({ message: "You must accept the Terms and Conditions." }),
    }),
    dateOfBirth: z.coerce.date().optional(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match.",
    path: ["confirmPassword"],
  });

export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  identifier: z.string().trim().min(3, "Enter your username, email, or phone."),
  password: z.string().min(1, "Password is required."),
});

export type LoginInput = z.infer<typeof loginSchema>;

export const forgotPasswordSchema = z.object({
  identifier: z.string().trim().min(3, "Enter your email or phone."),
});

export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

export const resetPasswordSchema = z
  .object({
    token: z.string().min(10),
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match.",
    path: ["confirmPassword"],
  });

export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

export const updateProfileSchema = z.object({
  fullName: z.string().trim().min(2).max(120),
});

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1),
    newPassword: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "Passwords do not match.",
    path: ["confirmPassword"],
  });

export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
