"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useLoginMutation } from "@/store/api";
import { useYupForm } from "@/hooks/useYupForm";
import { loginSchema } from "@/lib/validators";
import { getApiErrorMessage } from "@/lib/apiError";
import { Input } from "@/components/ui/Input";
import { PasswordInput } from "@/components/ui/PasswordInput";
import { Button } from "@/components/ui/Button";
import { Divider } from "@/components/ui/Divider";
import { GoogleButton } from "@/components/auth/GoogleButton";

export default function LoginPage() {
  const router = useRouter();
  const [login] = useLoginMutation();

  const form = useYupForm({
    schema: loginSchema,
    initialValues: { email: "", password: "" },
    onSubmit: async (values) => {
      try {
        await login(values).unwrap();
        toast.success("Signed in");
        router.push("/chat");
      } catch (error) {
        toast.error(getApiErrorMessage(error, "Invalid email or password."));
      }
    },
  });

  return (
    <div className="flex flex-col gap-5">
      <header>
        <h1 className="text-xl font-semibold">Welcome back</h1>
        <p className="mt-1 text-sm text-muted">Sign in to save and revisit your chats.</p>
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
        <div className="flex flex-col gap-1.5">
          <PasswordInput
            label="Password"
            name="password"
            autoComplete="current-password"
            placeholder="••••••••"
            value={form.values.password}
            onChange={form.handleChange}
            error={form.errors.password}
          />
          <Link href="/forgot-password" className="self-end text-xs text-brand hover:underline">
            Forgot password?
          </Link>
        </div>
        <Button type="submit" loading={form.isSubmitting}>
          Sign in
        </Button>
      </form>

      <Divider>or</Divider>
      <GoogleButton />

      <p className="text-center text-sm text-muted">
        New here?{" "}
        <Link href="/register" className="font-medium text-brand hover:underline">
          Create an account
        </Link>
      </p>
    </div>
  );
}
