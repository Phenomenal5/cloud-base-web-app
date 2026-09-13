import * as yup from "yup";

// these mirror the frontend's form schemas, so the wording matches both ends

export const registerSchema = yup.object({
  email: yup.string().trim().lowercase().email("Enter a valid email").required("Email is required"),
  // capped at 72, bcrypt silently ignores anything past it, see utils/password.ts
  password: yup
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(72, "Password must be at most 72 characters")
    .required("Password is required"),
  displayName: yup
    .string()
    .trim()
    .min(1, "Name is required")
    .max(80, "Name must be at most 80 characters")
    .required("Name is required"),
});

export const loginSchema = yup.object({
  email: yup.string().trim().lowercase().email("Enter a valid email").required("Email is required"),
  password: yup.string().required("Password is required"),
});

export const verifyEmailSchema = yup.object({
  email: yup.string().trim().lowercase().email("Enter a valid email").required("Email is required"),
  code: yup
    .string()
    .trim()
    .matches(/^\d{6}$/, "Enter the 6-digit code")
    .required("Verification code is required"),
});

export const resendVerificationSchema = yup.object({
  email: yup.string().trim().lowercase().email("Enter a valid email").required("Email is required"),
});

export const forgotPasswordSchema = yup.object({
  email: yup.string().trim().lowercase().email("Enter a valid email").required("Email is required"),
});

export const resetPasswordSchema = yup.object({
  email: yup.string().trim().lowercase().email("Enter a valid email").required("Email is required"),
  code: yup
    .string()
    .trim()
    .matches(/^\d{6}$/, "Enter the 6-digit code")
    .required("Reset code is required"),
  newPassword: yup
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(72, "Password must be at most 72 characters")
    .required("New password is required"),
});
