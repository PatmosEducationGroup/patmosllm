// =============================================================================
// Application Constants
// Centralized magic numbers and hardcoded strings for maintainability.
// Import from this file rather than scattering literals across the codebase.
// =============================================================================

// -----------------------------------------------------------------------------
// Brand
// -----------------------------------------------------------------------------

export const BRAND_NAME = 'Multiply Tools'

// -----------------------------------------------------------------------------
// Email Addresses
// -----------------------------------------------------------------------------

export const EMAIL_NOREPLY = 'noreply@multiplytools.app'
export const EMAIL_ADMIN = 'admin@multiplytools.app'
export const EMAIL_PRIVACY = 'privacy@multiplytools.app'

/** Formatted "from" address used in outgoing Resend emails. */
export const EMAIL_FROM = `${BRAND_NAME} <${EMAIL_NOREPLY}>`

// -----------------------------------------------------------------------------
// Timeout Durations (milliseconds)
// -----------------------------------------------------------------------------

/** Abort timeout for the chat streaming request on the client. */
export const TIMEOUT_CHAT_STREAM_MS = 120_000

/** Abort timeout for individual HTTP requests in the web scraper. */
export const TIMEOUT_SCRAPE_HTTP_MS = 8_000

/** Abort timeout for the lightweight HTTP scraper (e.g. ASP.NET sites). */
export const TIMEOUT_SCRAPE_LIGHTWEIGHT_MS = 10_000

/** Delay between sequential file uploads to avoid rate-limit bursts. */
export const DELAY_BETWEEN_UPLOADS_MS = 2_000

/** Simulated async delay for stub/placeholder async operations. */
export const DELAY_SIMULATED_MS = 1_000

/** How long to show the "copied" state in copy-to-clipboard UIs. */
export const DELAY_COPY_FEEDBACK_MS = 2_000

/** How long to wait (showing a toast) before navigating away after an action. */
export const DELAY_REDIRECT_MS = 3_000

/** Brief pause so a toast remains visible before a programmatic sign-out/redirect. */
export const DELAY_TOAST_VISIBLE_MS = 1_500

// -----------------------------------------------------------------------------
// Toast Durations (milliseconds)
// These match the defaults used in src/components/ui/Toast.tsx.
// -----------------------------------------------------------------------------

/** Default duration for informational / success toasts. */
export const TOAST_DURATION_DEFAULT_MS = 5_000

/** Duration for warning toasts — slightly longer to give users time to read. */
export const TOAST_DURATION_WARNING_MS = 6_000

/** Duration for error toasts — longest so users have time to act. */
export const TOAST_DURATION_ERROR_MS = 8_000

/** Duration for brief success toasts (e.g. single-file upload complete). */
export const TOAST_DURATION_SUCCESS_BRIEF_MS = 3_000
