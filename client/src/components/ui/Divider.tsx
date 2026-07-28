import type { ReactNode } from "react";

export const Divider = ({ children }: { children?: ReactNode }) => (
  <div className="flex items-center gap-3 text-xs text-slate-400">
    <span className="h-px flex-1 bg-slate-200 dark:bg-slate-800" />
    {children}
    <span className="h-px flex-1 bg-slate-200 dark:bg-slate-800" />
  </div>
);
