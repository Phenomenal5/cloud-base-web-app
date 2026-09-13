"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useAppSelector } from "@/store/hooks";

// where google drops the browser back. the backend has already set the session
// cookies by the time we get here, so all this does is wait for AuthProvider's
// /auth/me to resolve and then route. same target as the other auth pages, or
// the two redirects fight each other
const OAuthCallbackPage = () => {
  const router = useRouter();
  const status = useAppSelector((state) => state.auth.status);

  useEffect(() => {
    if (status === "authenticated") router.replace("/chat");
    else if (status === "guest") router.replace("/login");
  }, [status, router]);

  return (
    <div className="flex flex-col items-center gap-3 py-8">
      <Loader2 className="h-6 w-6 animate-spin text-brand" />
      <p className="text-sm text-muted">Signing you in…</p>
    </div>
  );
};

export default OAuthCallbackPage;
