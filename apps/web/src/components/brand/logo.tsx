import { cn } from "@/lib/utils";

type LogoProps = {
  className?: string;
  /** Hide the "Scrap&Mail" wordmark and show only the mark. */
  markOnly?: boolean;
  /** "sm" for the app rail and top bars, "default" for auth pages. */
  size?: "sm" | "default";
};

/** Scrap&Mail logo: two overlapping blue panels. */
export function Logo({
  className,
  markOnly = false,
  size = "default",
}: LogoProps) {
  const small = size === "sm";
  return (
    <span
      className={cn(
        "inline-flex items-center",
        small ? "gap-2" : "gap-3",
        className,
      )}
    >
      <svg
        viewBox="0 0 40 32"
        aria-hidden="true"
        className={cn("shrink-0", small ? "h-6 w-7" : "h-8 w-10")}
      >
        <path d="M4 9.5 18 3.5v19L4 28.5z" fill="#7fb0ea" />
        <path d="M14 8.5 36 2.5v20l-22 7z" fill="#2465b3" />
      </svg>
      {!markOnly && (
        <span
          className={cn(
            "font-semibold tracking-tight text-foreground",
            small ? "text-lg" : "text-2xl",
          )}
        >
          Scrap&amp;Mail
        </span>
      )}
    </span>
  );
}
