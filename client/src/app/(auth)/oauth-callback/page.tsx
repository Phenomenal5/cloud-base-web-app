"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useAppSelector } from "@/store/hooks";

// Landing spot after Google OAuth: the backend already set the session cookies,
// so once AuthProvider's /auth/me resolves we bounce home (or to login on failure).
export default function OAuthCallbackPage() {
  const router = useRouter();
  const status = useAppSelector((state) => state.auth.status);

  useEffect(() => {
    if (status === "authenticated") router.replace("/");
    else if (status === "guest") router.replace("/login");
  }, [status, router]);

  return (
    <div className="flex flex-col items-center gap-3 py-8">
      <Loader2 className="h-6 w-6 animate-spin text-brand" />
      <p className="text-sm text-slate-500">Signing you in…</p>
    </div>
  );
}
