import { LiveRefreshClient } from "./live-refresh-client";
import type { LiveKind } from "./live-updates";

/**
 * Keeps the page in sync for every user (see LiveRefreshClient). Rendered on the
 * server so the page knows when its data was loaded: a page shown later from the
 * browser's memory (back button, hover prefetch) refreshes itself at once.
 */
export function LiveRefresh(props: {
  kinds: LiveKind[];
  pollMs?: number;
  className?: string;
}) {
  // eslint-disable-next-line react-hooks/purity -- server component: runs once per request
  return <LiveRefreshClient {...props} renderedAt={Date.now()} />;
}
