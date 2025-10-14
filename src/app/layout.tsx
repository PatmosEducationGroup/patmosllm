import { ClerkProvider } from '@clerk/nextjs'
import { Inter } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import Footer from '@/components/Footer'
import './globals.css'

const inter = Inter({ 
  subsets: ['latin'],
  display: 'block',
  preload: false,
})

export const metadata = {
  title: 'Multiply Tools AI',
  description: 'AI-powered document search and chat system',
  icons: {
    icon: '/favicon.ico',
    shortcut: '/favicon.ico',
    apple: '/apple-touch-icon.png',
  },
}

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <ClerkProvider
      publishableKey={process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY}
      signInUrl="/sign-in"
      signInFallbackRedirectUrl="/chat"
    >
      <html lang="en">
        <head>
          <meta name="theme-color" content="#000000" />
        </head>
        <body className={inter.className}>
          <ErrorBoundary>
            {children}
            <Footer />
            <Analytics />
          </ErrorBoundary>
        </body>
      </html>
    </ClerkProvider>
  )
}