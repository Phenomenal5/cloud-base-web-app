"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useRegisterMutation } from "@/store/api";
import { useYupForm } from "@/hooks/useYupForm";
import { registerSchema } from "@/lib/validators";
import { getApiErrorMessage } from "@/lib/apiError";
import { Input } from "@/components/ui/Input";
import { PasswordInput } from "@/components/ui/PasswordInput";
import { Button } from "@/components/ui/Button";
import { Divider } from "@/components/ui/Divider";
import { GoogleButton } from "@/components/auth/GoogleButton";

const RegisterPage = () => {
  const router = useRouter();
  const [register] = useRegisterMutation();

  const form = useYupForm({
    schema: registerSchema,
    initialValues: { displayName: "", email: "", password: "" },
    onSubmit: async (values) => {
      try {
        await register(values).unwrap();
        toast.success("Account created, check your email for a code");
        // Registering doesn't create a session; entering the emailed code does.
        router.push(`/verify-email?email=${encodeURIComponent(values.email)}`);
      } catch (error) {
        toast.error(getApiErrorMessage(error, "Could not create your account."));
      }
    },
  });

  return (
    <div className="flex flex-col gap-5">
      <header>
        <h1 className="text-xl font-semibold">Create your account</h1>
        <p className="mt-1 text-sm text-muted">Save your chats and get a higher daily limit.</p>
      </header>

      <form onSubmit={form.handleSubmit} className="flex flex-col gap-4" noValidate>
        <Input
          label="Name"
          name="displayName"
          autoComplete="name"
          placeholder="Amelia Earhart"
          value={form.values.displayName}
          onChange={form.handleChange}
          error={form.errors.displayName}
        />
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
        <PasswordInput
          label="Password"
          name="password"
          autoComplete="new-password"
          placeholder="At least 8 characters"
          value={form.values.password}
          onChange={form.handleChange}
          error={form.errors.password}
        />
        <Button type="submit" loading={form.isSubmitting}>
          Create account
        </Button>
      </form>

      <Divider>or</Divider>
      <GoogleButton />

      <p className="text-center text-sm text-muted">
        Already have an account?{" "}
        <Link href="/login" className="font-medium text-brand hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  );
};

export default RegisterPage;
