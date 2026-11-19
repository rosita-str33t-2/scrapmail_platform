// Runs in the browser before the app starts: error monitoring for client code.
// The Sentry library is only downloaded when a DSN is configured, so it does not
// slow down every page while monitoring is off.
type SentryModule = typeof import("@sentry/nextjs");

let sentry: SentryModule | undefined;

if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
  void Promise.all([
    import("@sentry/nextjs"),
    import("@/lib/monitoring/sentry"),
  ]).then(([Sentry, { sentryOptions }]) => {
    Sentry.init(sentryOptions);
    sentry = Sentry;
  });
}

export function onRouterTransitionStart(
  ...args: Parameters<SentryModule["captureRouterTransitionStart"]>
) {
  sentry?.captureRouterTransitionStart(...args);
}
