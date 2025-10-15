// This file configures the initialization of Sentry on the client.
// The config you add here will be used whenever a users loads a page in their browser.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from "@sentry/nextjs";

// GDPR: Check if user has consented to error tracking before initializing Sentry
function getUserConsent() {
  if (typeof window === 'undefined') return { errorTracking: false };

  try {
    const cookieConsent = localStorage.getItem('cookie_consent');
    const cookiePreferences = localStorage.getItem('cookie_preferences');

    // If user accepted "all", enable error tracking
    if (cookieConsent === 'all') {
      return { errorTracking: true };
    }

    // If user has custom preferences, check error tracking specifically
    if (cookieConsent === 'custom' && cookiePreferences) {
      const prefs = JSON.parse(cookiePreferences);
      return { errorTracking: prefs.errorTracking === true };
    }

    // Default: disable until user makes a choice
    return { errorTracking: false };
  } catch {
    return { errorTracking: false };
  }
}

const consent = getUserConsent();

Sentry.init({
  dsn: "https://4b7829b1cbffe814c37c1c5422842c6e@o4510156074647552.ingest.us.sentry.io/4510156079628288",

  // GDPR: Disable performance traces if no consent
  tracesSampleRate: consent.errorTracking ? 1 : 0,

  // Setting this option to true will print useful information to the console while you're setting up Sentry.
  debug: false,

  // GDPR: Only enable session replay if user consented to error tracking
  replaysOnErrorSampleRate: consent.errorTracking ? 1.0 : 0,

  // This sets the sample rate to be 10%. You may want this to be 100% while
  // in development and sample at a lower rate in production
  replaysSessionSampleRate: consent.errorTracking ? 0.1 : 0,

  // GDPR: Filter out BrowserSession integration when no consent, add replay integration when consent given
  integrations: (defaultIntegrations) => {
    // Filter out BrowserSession when no consent (stops session tracking)
    const filtered = consent.errorTracking
      ? defaultIntegrations
      : defaultIntegrations.filter(
          (integration) => integration.name !== 'BrowserSession'
        );

    // Add replay integration if consent given
    return consent.errorTracking
      ? [
          ...filtered,
          Sentry.replayIntegration({
            // Additional Replay configuration goes in here, for example:
            maskAllText: true,
            blockAllMedia: true,
          }),
        ]
      : filtered;
  },

  // Filter out known noise and apply privacy filters
  beforeSend(event) {
    // GDPR: Block all events if user hasn't consented (safety check)
    if (!consent.errorTracking) {
      return null;
    }

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