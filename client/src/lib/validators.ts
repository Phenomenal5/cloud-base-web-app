import * as yup from "yup";

// ─── Yup schemas (mirror the backend validators) ──────

export const loginSchema = yup.object({
  email: yup.string().trim().lowercase().email("Enter a valid email").required("Email is required"),
  password: yup.string().required("Password is required"),
});

export const registerSchema = yup.object({
  displayName: yup
    .string()
    .trim()
    .min(1, "Name is required")
    .max(80, "Name is too long")
    .required("Name is required"),
  email: yup.string().trim().lowercase().email("Enter a valid email").required("Email is required"),
  password: yup
    .string()
    .min(8, "At least 8 characters")
    .max(72, "At most 72 characters")
    .required("Password is required"),
});

export const verifyEmailSchema = yup.object({
  email: yup.string().trim().lowercase().email("Enter a valid email").required("Email is required"),
  code: yup
    .string()
    .trim()
    .matches(/^\d{6}$/, "Enter the 6-digit code")
    .required("Code is required"),
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
    .required("Code is required"),
  newPassword: yup
    .string()
    .min(8, "At least 8 characters")
    .max(72, "At most 72 characters")
    .required("New password is required"),
});
