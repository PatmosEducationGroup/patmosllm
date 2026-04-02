'use client'

import { getStatusColor } from '@/lib/admin-utils'

interface StatusBadgeProps {
  status: string
}

export function StatusBadge({ status }: StatusBadgeProps) {
  const colors = getStatusColor(status)

  return (
    <span style={{
      fontSize: '12px',
      fontWeight: '500',
      color: colors.text,
      backgroundColor: colors.bg,
      padding: '4px 8px',
      borderRadius: '8px',
      textTransform: 'capitalize',
      display: 'inline-flex',
      alignItems: 'center',
      gap: '4px'
    }}>
      <span style={{
        width: '6px',
        height: '6px',
        borderRadius: '50%',
        backgroundColor: colors.dot
      }} />
      {status}
    </span>
  )
}
