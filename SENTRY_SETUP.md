# Sentry Error Tracking Setup

## Overview

Sentry has been installed and configured for PatmosLLM to provide production error tracking, performance monitoring, and session replay capabilities.

## Installation Completed ✅

- ✅ Installed `@sentry/nextjs` package
- ✅ Created client configuration (`sentry.client.config.ts`)
- ✅ Created server configuration (`sentry.server.config.ts`)
- ✅ Created edge configuration (`sentry.edge.config.ts`)
- ✅ Updated `next.config.ts` with Sentry plugin
- ✅ Created `instrumentation.ts` for automatic error capture

## Required Environment Variables

Add these to your `.env.local` file:

```bash
# Sentry Configuration
# Get these from https://sentry.io/settings/account/api/auth-tokens/
NEXT_PUBLIC_SENTRY_DSN=https://your-dsn@sentry.io/your-project-id

# For source map uploads (optional, recommended for production)
SENTRY_ORG=your-org-name
SENTRY_PROJECT=your-project-name
SENTRY_AUTH_TOKEN=your-auth-token
```

## How to Get Your Sentry Credentials

### 1. Create a Sentry Account (if you don't have one)
1. Go to [https://sentry.io/signup/](https://sentry.io/signup/)
2. Sign up for a free account (includes 5K errors/month)

### 2. Create a New Project
1. Log in to Sentry
2. Click "Projects" → "Create Project"
3. Select "Next.js" as the platform
4. Name your project (e.g., "patmosllm")
5. Click "Create Project"

### 3. Get Your DSN
1. After creating the project, Sentry will show you the DSN
2. Copy the DSN value (looks like: `https://abc123@o123456.ingest.sentry.io/7890123`)
3. Add to `.env.local` as `NEXT_PUBLIC_SENTRY_DSN`

### 4. Get Organization and Project Names
1. Go to Settings → General
2. Copy your **Organization Slug** → use as `SENTRY_ORG`
3. Copy your **Project Name** → use as `SENTRY_PROJECT`

### 5. Create an Auth Token (for source map uploads)
1. Go to [https://sentry.io/settings/account/api/auth-tokens/](https://sentry.io/settings/account/api/auth-tokens/)
2. Click "Create New Token"
3. Name it "PatmosLLM Source Maps"
4. Select scopes:
   - ✅ `project:read`
   - ✅ `project:releases`
   - ✅ `org:read`
5. Click "Create Token"
6. Copy the token → add to `.env.local` as `SENTRY_AUTH_TOKEN`

## Features Configured

### ✅ Error Tracking
- Automatic capture of all unhandled exceptions
- Full stack traces with source maps
- Contextual data (user ID, request info, environment)

### ✅ Performance Monitoring
- 10% sample rate (`tracesSampleRate: 0.1`)
- Automatic instrumentation of API routes
- Performance metrics and slow transaction detection

### ✅ Session Replay
- 100% of error sessions captured (`replaysOnErrorSampleRate: 1.0`)
- 10% of normal sessions captured (`replaysSessionSampleRate: 0.1`)
- Privacy-first configuration (masks text, blocks media)

### ✅ Filtered Noise
- ResizeObserver errors filtered out (browser noise)
- Source maps hidden from client bundles
- Logger statements tree-shaken in production

### ✅ Ad-Blocker Bypass
- Tunneling route `/monitoring` configured
- Routes Sentry requests through your own domain

## Integration with Existing Logging

Sentry works **alongside** your existing Pino structured logging:

- **Pino logs**: Detailed JSON logs for all operations (cached in log aggregation)
- **Sentry**: Error tracking with stack traces, session replay, and user context

**Recommended workflow**:
1. Use Pino for operational logging (cache hits, performance metrics, etc.)
2. Use Sentry for error tracking and debugging production issues
3. Link errors between both systems using request IDs

## Example: Integrating Sentry with logError()

You can enhance your existing `logError()` function to send errors to Sentry:

```typescript
// src/lib/logger.ts
import * as Sentry from '@sentry/nextjs'

export function logError(error: unknown, context: Record<string, unknown> = {}) {
  if (error instanceof Error) {
    // Log to Pino (existing)
    logger.error({
      ...context,
      error: {
        message: error.message,
        stack: error.stack,
        name: error.name,
      },
    }, error.message)

    // Also send to Sentry for error tracking
    Sentry.captureException(error, {
      contexts: {
        operation: {
          ...context,
        },
      },
    })
  } else {
    logger.error({ ...context, error }, 'Unknown error occurred')
    Sentry.captureMessage('Unknown error occurred', {
      level: 'error',
      contexts: { operation: context },
    })
  }
}
```

## Testing Your Setup

### 1. Test Error Capture
Add a test endpoint to verify Sentry is working:

```typescript
// src/app/api/sentry-test/route.ts
import { NextResponse } from 'next/server'

export async function GET() {
  throw new Error('This is a test error for Sentry')
  return NextResponse.json({ message: 'This will never be reached' })
}
```

Visit `/api/sentry-test` and check Sentry dashboard for the error.

### 2. Test Client-Side Error
Add to any page:

```typescript
<button onClick={() => { throw new Error('Test client error') }}>
  Test Sentry
</button>
```

Click the button and check Sentry dashboard.

### 3. Verify in Sentry Dashboard
1. Go to https://sentry.io/
2. Select your project
3. Click "Issues" to see captured errors
4. Click on an error to see:
   - Full stack trace
   - User context
   - Request headers
   - Session replay (if enabled)

## Production Deployment

### Vercel (Recommended)
1. Add environment variables in Vercel dashboard:
   - `NEXT_PUBLIC_SENTRY_DSN`
   - `SENTRY_ORG`
   - `SENTRY_PROJECT`
   - `SENTRY_AUTH_TOKEN`

2. Deploy as normal - Sentry will automatically:
   - Upload source maps
   - Enable error tracking
   - Start capturing errors

### Self-Hosted
1. Set environment variables on your server
2. Ensure `SENTRY_AUTH_TOKEN` is secure (use secrets management)
3. Build and deploy

## Monitoring and Alerts

### Set Up Alerts
1. Go to Sentry → Alerts
2. Create alert rules for:
   - Error rate > 10/min (Critical)
   - New error types (Medium)
   - Performance degradation (Low)

### Configure Integrations
- **Slack**: Get notifications in your Slack channel
- **Email**: Alert specific team members
- **GitHub**: Create issues automatically
- **PagerDuty**: For critical errors

## Cost Considerations

**Free Tier Includes**:
- 5,000 errors/month
- 10,000 performance units/month
- 50 replays/month
- 1 team member

**If You Need More**:
- Team plan: $26/month (50K errors, 100K performance units, 500 replays)
- Business plan: $80/month (250K errors, 500K performance units, 5K replays)

**Cost Optimization Tips**:
- Adjust `tracesSampleRate` (lower = fewer performance units)
- Adjust `replaysSessionSampleRate` (lower = fewer replays)
- Filter out known noise with `beforeSend`
- Set up rate limiting per error type

## Troubleshooting

### No Errors Showing in Sentry
1. Verify `NEXT_PUBLIC_SENTRY_DSN` is set correctly
2. Check browser console for Sentry initialization messages
3. Ensure errors are actually being thrown
4. Check network tab for requests to `sentry.io`

### Source Maps Not Uploading
1. Verify `SENTRY_AUTH_TOKEN` is set
2. Check build logs for source map upload errors
3. Ensure token has `project:releases` scope
4. Run `npm run build` and check output

### High Error Volume
1. Check for repeated errors from same source
2. Add filtering in `beforeSend` function
3. Implement error deduplication
4. Consider sampling certain error types

## Next Steps

1. ✅ Add `NEXT_PUBLIC_SENTRY_DSN` to `.env.local`
2. ✅ Test error capture with `/api/sentry-test`
3. ✅ Set up Slack/Email alerts
4. ✅ Configure error sampling rates for production
5. ✅ Integrate with existing `logError()` function (optional)
6. ✅ Add Sentry environment variables to Vercel
7. ✅ Monitor errors in Sentry dashboard

## Documentation Links

- [Sentry Next.js Docs](https://docs.sentry.io/platforms/javascript/guides/nextjs/)
- [Sentry Best Practices](https://docs.sentry.io/product/best-practices/)
- [Session Replay](https://docs.sentry.io/product/session-replay/)
- [Performance Monitoring](https://docs.sentry.io/product/performance/)

---

**Status**: ✅ Installed and configured, ready for production use
**Last Updated**: October 8, 2025
**Configured By**: Claude Code (Sonnet 4.5)
