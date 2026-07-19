"use client";

import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { useForgotPasswordMutation } from "@/store/api";
import { useYupForm } from "@/hooks/useYupForm";
import { forgotPasswordSchema } from "@/lib/validators";
import { getApiErrorMessage } from "@/lib/apiError";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";

export default function ForgotPasswordPage() {
  const [forgotPassword] = useForgotPasswordMutation();
  const [sentTo, setSentTo] = useState<string | null>(null);

  const form = useYupForm({
    schema: forgotPasswordSchema,
    initialValues: { email: "" },
    onSubmit: async (values) => {
      try {
        await forgotPassword(values).unwrap();
        toast.success("If an account exists, a reset code was sent");
        setSentTo(values.email);
      } catch (error) {
        toast.error(getApiErrorMessage(error));
      }
    },
  });

  if (sentTo) {
    return (
      <div className="flex flex-col gap-5">
        <header>
          <h1 className="text-xl font-semibold">Check your email</h1>
          <p className="mt-1 text-sm text-muted">
            If an account exists for <span className="font-medium text-foreground">{sentTo}</span>,
            we sent a 6-digit reset code.
          </p>
        </header>
        <Link
          href={`/reset-password?email=${encodeURIComponent(sentTo)}`}
          className="inline-flex items-center justify-center rounded-lg bg-brand px-4 py-2.5 text-sm font-medium text-white transition hover:opacity-90"
        >
          Enter reset code
        </Link>
        <p className="text-center text-sm text-muted">
          <Link href="/login" className="text-brand hover:underline">
            Back to sign in
          </Link>
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <header>
        <h1 className="text-xl font-semibold">Reset your password</h1>
        <p className="mt-1 text-sm text-muted">We&apos;ll email you a 6-digit reset code.</p>
      </header>

      <form onSubmit={form.handleSubmit} className="flex flex-col gap-4" noValidate>
        <Input
          label="Email"
          name="email"
          type="email"
          autoComplete="email"
          placeholder="you@example.com"
          value={form.values.email}
          onChange={form.handleChange}
          error={form.errors.email}
        />
        <Button type="submit" loading={form.isSubmitting}>
          Send reset code
        </Button>
      </form>

      <p className="text-center text-sm text-muted">
        <Link href="/login" className="text-brand hover:underline">
          Back to sign in
        </Link>
      </p>
    </div>
  );
}
