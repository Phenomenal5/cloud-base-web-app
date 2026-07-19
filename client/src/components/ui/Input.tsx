import { forwardRef, type InputHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, error, id, className, ...props },
  ref,
) {
  const inputId = id ?? props.name;
  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label htmlFor={inputId} className="text-sm font-medium">
          {label}
        </label>
      )}
      <input
        id={inputId}
        ref={ref}
        aria-invalid={Boolean(error)}
        className={cn(
          "w-full rounded-lg border bg-white px-3 py-2 text-sm outline-none transition placeholder:text-slate-400 focus:ring-2 dark:bg-slate-900",
          error
            ? "border-rose-400 focus:ring-rose-200 dark:border-rose-700 dark:focus:ring-rose-900"
            : "border-slate-300 focus:border-brand focus:ring-brand/25 dark:border-slate-700",
          className,
        )}
        {...props}
      />
      {error && <p className="text-xs text-rose-600 dark:text-rose-400">{error}</p>}
    </div>
  );
});
