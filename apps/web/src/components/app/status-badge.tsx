import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export type Tone = "success" | "warning" | "danger" | "info" | "neutral";

const TONES: Record<Tone, string> = {
  success: "bg-success-surface text-success",
  warning: "bg-warning-surface text-warning",
  danger: "bg-danger-surface text-danger",
  info: "bg-info-surface text-info",
  neutral: "bg-neutral-surface text-neutral",
};

/** Tinted status pill with a leading dot (Instantly's "• Active" style). */
export function StatusBadge({
  tone,
  children,
  className,
  dot = true,
}: {
  tone: Tone;
  children: ReactNode;
  className?: string;
  /** Show the small dot before the text. */
  dot?: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium whitespace-nowrap capitalize transition-colors duration-300",
        TONES[tone],
        className,
      )}
    >
      {dot && (
        <span aria-hidden="true" className="size-1.5 rounded-full bg-current" />
      )}
      {children}
    </span>
  );
}
