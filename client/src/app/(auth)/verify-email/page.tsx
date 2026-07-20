"use client";

import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { useVerifyEmailMutation, useResendVerificationMutation } from "@/store/api";
import { useYupForm } from "@/hooks/useYupForm";
import { verifyEmailSchema } from "@/lib/validators";
import { getApiErrorMessage } from "@/lib/apiError";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";

function VerifyEmailForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const emailFromQuery = searchParams.get("email") ?? "";

  const [verifyEmail] = useVerifyEmailMutation();
  const [resend, { isLoading: isResending }] = useResendVerificationMutation();

  const form = useYupForm({
    schema: verifyEmailSchema,
    initialValues: { email: emailFromQuery, code: "" },
    onSubmit: async (values) => {
      try {
        await verifyEmail(values).unwrap(); // verified + signed in
        toast.success("Email verified");
        router.push("/chat");
      } catch (error) {
        toast.error(getApiErrorMessage(error, "Invalid or expired code."));
      }
    },
  });

  const handleResend = async () => {
    try {
      await resend({ email: form.values.email }).unwrap();
      toast.success("A new code is on its way");
    } catch (error) {
      toast.error(getApiErrorMessage(error));
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <header>
        <h1 className="text-xl font-semibold">Verify your email</h1>
        <p className="mt-1 text-sm text-muted">
          Enter the 6-digit code we sent
          {emailFromQuery ? (
            <>
              {" "}
              to <span className="font-medium text-foreground">{emailFromQuery}</span>
            </>
          ) : null}
          .
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
          label="Verification code"
          name="code"
          inputMode="numeric"
          maxLength={6}
          placeholder="000000"
          value={form.values.code}
          onChange={form.handleChange}
          error={form.errors.code}
          className="text-center tracking-[0.4em]"
        />
        <Button type="submit" loading={form.isSubmitting}>
          Verify &amp; continue
        </Button>
      </form>

      <p className="text-center text-sm text-muted">
        Didn&apos;t get it?{" "}
        <button
          type="button"
          onClick={handleResend}
          disabled={isResending}
          className="font-medium text-brand hover:underline disabled:opacity-60"
        >
          Resend code
        </button>
      </p>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={<div className="py-6 text-center text-sm text-muted">Loading…</div>}>
      <VerifyEmailForm />
    </Suspense>
  );
}
