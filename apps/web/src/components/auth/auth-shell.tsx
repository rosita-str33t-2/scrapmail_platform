import { ShieldCheck } from "lucide-react";
import type { ReactNode } from "react";

import { Logo } from "@/components/brand/logo";
import { ThemeToggle } from "@/components/theme-toggle";

type AuthShellProps = {
  headline: string;
  description: string;
  children: ReactNode;
};

/**
 * Centered auth layout in the Instantly style: logo on top, one card with the
 * form, and the product line underneath.
 */
export function AuthShell({ headline, description, children }: AuthShellProps) {
  return (
    <main className="relative flex min-h-dvh flex-col items-center bg-brand-surface px-4 py-10 sm:py-16">
      {/* Soft blue glow behind the card */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-80 bg-[radial-gradient(ellipse_at_top,color-mix(in_oklab,var(--primary)_14%,transparent),transparent_70%)]"
      />
      <ThemeToggle className="absolute top-4 right-4" />
      <Logo className="relative" />
      <div className="relative mt-8 w-full max-w-[440px] animate-in duration-300 fade-in slide-in-from-bottom-2">
        <div className="rounded-xl border bg-card p-6 shadow-2xl shadow-black/5 sm:p-8">
          {children}
        </div>
      </div>
      <div className="relative mt-8 max-w-md text-center">
        <p className="text-sm font-medium">{headline}</p>
        <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
          {description}
        </p>
      </div>
    </main>
  );
}

export function SecureNote({ title }: { title: string }) {
  return (
    <div className="mt-6 flex items-start gap-2.5 rounded-md border bg-muted/50 px-4 py-3 text-[13px]">
      <ShieldCheck
        aria-hidden="true"
        className="mt-px size-4 shrink-0 text-muted-foreground"
      />
      <p className="text-muted-foreground">
        <span className="font-medium text-foreground">{title}:</span> Your
        information is encrypted and protected.
      </p>
    </div>
  );
}
