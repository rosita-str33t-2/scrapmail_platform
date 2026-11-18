import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

function Input({ className, type, ...props }: ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "flex h-10 w-full min-w-0 rounded-md border border-input bg-muted px-3 text-sm transition-colors outline-none placeholder:text-muted-foreground hover:border-muted-foreground/40 focus-visible:border-primary focus-visible:ring-[3px] focus-visible:ring-primary/20 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive",
        className,
      )}
      {...props}
    />
  );
}

export { Input };
