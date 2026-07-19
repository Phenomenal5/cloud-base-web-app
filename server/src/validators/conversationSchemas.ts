import * as yup from "yup";

// ─── Conversation update schema (Yup) ─────────────────
// All fields optional (partial update), but at least one must be present.

export const updateConversationSchema = yup
  .object({
    title: yup.string().trim().min(1).max(120),
    pinned: yup.boolean(),
    archived: yup.boolean(),
  })
  .test(
    "at-least-one",
    "Provide at least one of: title, pinned, archived.",
    (value) => value.title !== undefined || value.pinned !== undefined || value.archived !== undefined,
  );
