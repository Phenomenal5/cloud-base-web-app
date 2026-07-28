"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useAppSelector } from "@/store/hooks";

// Where Google sends the browser back to. The backend has already set the
// session cookies by this point, so we just wait for AuthProvider's /auth/me to
// resolve and route accordingly. The target matches the other auth pages so the
// redirects never fight.
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
