// This file configures the initialization of Sentry on the client.
// The config you add here will be used whenever a users loads a page in their browser.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: "https://4b7829b1cbffe814c37c1c5422842c6e@o4510156074647552.ingest.us.sentry.io/4510156079628288",

  // Adjust this value in production, or use tracesSampler for greater control
  tracesSampleRate: 1,

  // Setting this option to true will print useful information to the console while you're setting up Sentry.
  debug: false,

  replaysOnErrorSampleRate: 1.0,

  // This sets the sample rate to be 10%. You may want this to be 100% while
  // in development and sample at a lower rate in production
  replaysSessionSampleRate: 0.1,

  // You can remove this option if you're not planning to use the Sentry Session Replay feature:
  integrations: [
    Sentry.replayIntegration({
      // Additional Replay configuration goes in here, for example:
      maskAllText: true,
      blockAllMedia: true,
    }),
  ],

  // Filter out known noise and apply privacy filters
  beforeSend(event) {
    // GDPR Phase 4: Exclude chat routes from session replay (privacy protection)
    // Still capture errors, just no video replay of user typing sensitive info
    if (event.request?.url?.includes('/chat')) {
      // If this event includes session replay data, drop it
      if (event.contexts?.replay) {
        return null;
      }
      // Allow error events through (without replay)
    }

    // Filter out ResizeObserver errors (browser noise)
    if (event.exception?.values?.[0]?.value?.includes('ResizeObserver')) {
      return null;
    }

    return event;
  },
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;