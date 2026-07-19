import * as yup from "yup";

// ─── User profile schemas (Yup) ───────────────────────

export const updateProfileSchema = yup.object({
  displayName: yup
    .string()
    .trim()
    .min(1, "Name is required")
    .max(80, "Name must be at most 80 characters")
    .required("Name is required"),
});
