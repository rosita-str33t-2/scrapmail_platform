import path from "node:path";
import { withSentryConfig } from "@sentry/nextjs/config";
import type { NextConfig } from "next";

// Extra hosts allowed to open the *dev* server (e.g. this machine's public IP),
// comma-separated in DEV_ALLOWED_ORIGINS. Has no effect on production builds.
const devAllowedOrigins = (process.env.DEV_ALLOWED_ORIGINS ?? "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const nextConfig: NextConfig = {
  allowedDevOrigins: devAllowedOrigins,
  reactStrictMode: true,
  poweredByHeader: false,
  // Don't generate AGENTS.md files during `next dev`.
  agentRules: false,
  // Monorepo: the pnpm workspace root is two levels up.
  turbopack: {
    root: path.join(__dirname, "../.."),
  },
  experimental: {
    // Only nudge about Next.js security releases (the default, set explicitly).
    agentUpgrade: "security",
    // A page seen or prefetched (on hover) in the last 30 s shows instantly from
    // the browser's memory; it then refreshes itself at once if it is older than
    // a few seconds (LiveRefresh), so it never stays out of date.
    staleTimes: { dynamic: 30, static: 30 },
    // Load only the Radix components that are used, not the whole package.
    optimizePackageImports: ["radix-ui"],
  },
};

export default withSentryConfig(nextConfig, {
  // Source map upload needs @sentry/cli (its install script is disabled in
  // pnpm-workspace.yaml) and a Sentry auth token. Enable later if needed.
  sourcemaps: { disable: true },
  telemetry: false,
  silent: true,
});
