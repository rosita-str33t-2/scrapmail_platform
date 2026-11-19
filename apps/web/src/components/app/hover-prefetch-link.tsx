"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ComponentProps } from "react";

type PrefetchOptions = Parameters<ReturnType<typeof useRouter>["prefetch"]>[1];
const FULL = { kind: "full" } as unknown as PrefetchOptions;

/**
 * A link that loads the whole page (with its data) as soon as the pointer is on it
 * or it gets keyboard focus, so the click shows the page at once. The loaded page
 * is kept for 30 seconds at most and refreshes itself when shown (LiveRefresh).
 */
export function HoverPrefetchLink({
  href,
  onMouseEnter,
  onFocus,
  onTouchStart,
  ...props
}: ComponentProps<typeof Link> & { href: string }) {
  const router = useRouter();
  // "full": the page with its data, not only its loading skeleton.
  const load = () => router.prefetch(href, FULL);
  return (
    <Link
      href={href}
      onMouseEnter={(e) => {
        load();
        onMouseEnter?.(e);
      }}
      onFocus={(e) => {
        load();
        onFocus?.(e);
      }}
      onTouchStart={(e) => {
        load();
        onTouchStart?.(e);
      }}
      {...props}
    />
  );
}
