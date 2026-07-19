import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type AlertVariant = "error" | "success" | "info";

export function Alert({
  variant = "error",
  children,
}: {
  variant?: AlertVariant;
  children: ReactNode;
}) {
  return (
    <div
      role={variant === "error" ? "alert" : "status"}
      className={cn(
        "rounded-lg px-3 py-2 text-sm",
        variant === "error" && "bg-rose-50 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300",
        variant === "success" &&
          "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300",
        variant === "info" && "bg-sky-50 text-sky-700 dark:bg-sky-950/50 dark:text-sky-300",
      )}
    >
      {children}
    </div>
  );
}
