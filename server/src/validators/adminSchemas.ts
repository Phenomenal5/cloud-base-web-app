import * as yup from "yup";

export const updateRoleSchema = yup.object({
  role: yup
    .string()
    .oneOf(["TRAINEE", "ANALYST", "ADMIN"], "Invalid role")
    .required("Role is required"),
});

export const updateStatusSchema = yup.object({
  status: yup
    .string()
    .oneOf(["ACTIVE", "BLOCKED"], "Invalid status")
    .required("Status is required"),
});
