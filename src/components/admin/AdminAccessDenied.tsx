'use client'

import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/Button'
import { Card, CardContent, CardTitle, CardDescription } from '@/components/ui/Card'

interface AdminAccessDeniedProps {
  error: string | null
}

export function AdminAccessDenied({ error }: AdminAccessDeniedProps) {
  const router = useRouter()

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-200 flex items-center justify-center p-8">
      <Card className="w-full max-w-md text-center shadow-2xl">
        <CardContent className="pt-8">
          <div className="text-5xl mb-4 text-red-600">Access Denied</div>
          <CardTitle className="text-2xl text-red-600 mb-4">Access Denied</CardTitle>
          <CardDescription className="text-base mb-6 max-w-sm mx-auto">
            {error}
          </CardDescription>
          <Button
            onClick={() => router.push('/')}
            className="w-full"
          >
            Go to Chat
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
