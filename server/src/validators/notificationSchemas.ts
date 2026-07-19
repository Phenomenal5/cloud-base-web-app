import * as yup from "yup";

// ─── Notification broadcast schema (Yup) ──────────────

export const broadcastSchema = yup.object({
  title: yup.string().trim().min(1, "Title is required").max(120).required("Title is required"),
  body: yup.string().trim().min(1, "Body is required").max(1000).required("Body is required"),
});
