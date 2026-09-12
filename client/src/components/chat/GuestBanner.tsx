import Link from "next/link";

export const GuestBanner = () => (
  <div className="flex items-center justify-center gap-2 border-b border-border bg-surface-2 px-4 py-2 text-xs text-muted">
    <span>You&apos;re chatting as a guest, messages aren&apos;t saved.</span>
    <Link href="/login" className="font-medium text-brand hover:underline">
      Sign in
    </Link>
  </div>
);
