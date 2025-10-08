export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config')
  }

  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config')
  }
}

export const onRequestError = async (
  err: Error,
  request: {
    path: string
    method: string
    headers: Headers
  },
  context: {
    routerKind: 'Pages Router' | 'App Router'
    routePath: string
    routeType: 'render' | 'route' | 'action' | 'middleware'
  }
) => {
  // Send error to Sentry
  const { captureException } = await import('@sentry/nextjs')
  captureException(err, {
    contexts: {
      request: {
        url: request.path,
        method: request.method,
      },
      nextjs: context,
    },
  })
}
