import * as yup from "yup";

// A partial update, so every field is optional, but an empty body is a mistake
// rather than a no-op update.

export const updateConversationSchema = yup
  .object({
    title: yup.string().trim().min(1).max(120),
    pinned: yup.boolean(),
    archived: yup.boolean(),
  })
  .test(
    "at-least-one",
    "Provide at least one of: title, pinned, archived.",
    (value) =>
      value.title !== undefined || value.pinned !== undefined || value.archived !== undefined,
  );
