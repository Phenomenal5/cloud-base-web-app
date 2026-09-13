"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { useResetPasswordMutation } from "@/store/api";
import { useYupForm } from "@/hooks/useYupForm";
import { resetPasswordSchema } from "@/lib/validators";
import { getApiErrorMessage } from "@/lib/apiError";
import { Input } from "@/components/ui/Input";
import { PasswordInput } from "@/components/ui/PasswordInput";
import { Button } from "@/components/ui/Button";

const ResetPasswordForm = () => {
  const router = useRouter();
  const searchParams = useSearchParams();
  const emailFromQuery = searchParams.get("email") ?? "";

  const [resetPassword] = useResetPasswordMutation();

  const form = useYupForm({
    schema: resetPasswordSchema,
    initialValues: { email: emailFromQuery, code: "", newPassword: "" },
    onSubmit: async (values) => {
      try {
        await resetPassword(values).unwrap();
        // a reset kills every session, so there's nothing to route them into
        toast.success("Password reset, please sign in");
        router.push("/login");
      } catch (error) {
        toast.error(getApiErrorMessage(error, "Invalid or expired code."));
      }
    },
  });

  return (
    <div className="flex flex-col gap-5">
      <header>
        <h1 className="text-xl font-semibold">Set a new password</h1>
        <p className="mt-1 text-sm text-muted">
          Enter the code from your email and choose a new password. This signs you out everywhere.
        </p>
      </header>

      <form onSubmit={form.handleSubmit} className="flex flex-col gap-4" noValidate>
        {!emailFromQuery && (
          <Input
            label="Email"
            name="email"
            type="email"
            autoComplete="email"
            value={form.values.email}
            onChange={form.handleChange}
            error={form.errors.email}
          />
        )}
        <Input
          label="Reset code"
          name="code"
          inputMode="numeric"
          maxLength={6}
          placeholder="000000"
          value={form.values.code}
          onChange={form.handleChange}
          error={form.errors.code}
          className="text-center tracking-[0.4em]"
        />
        <PasswordInput
          label="New password"
          name="newPassword"
          autoComplete="new-password"
          placeholder="At least 8 characters"
          value={form.values.newPassword}
          onChange={form.handleChange}
          error={form.errors.newPassword}
        />
        <Button type="submit" loading={form.isSubmitting}>
          Reset password
        </Button>
      </form>

      <p className="text-center text-sm text-muted">
        <Link href="/login" className="text-brand hover:underline">
          Back to sign in
        </Link>
      </p>
    </div>
  );
};

const ResetPasswordPage = () => (
  <Suspense fallback={<div className="py-6 text-center text-sm text-muted">Loading…</div>}>
    <ResetPasswordForm />
  </Suspense>
);

export default ResetPasswordPage;
