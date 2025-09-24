import React from 'react'
import { cn } from '@/lib/utils'

interface AlertProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'success' | 'warning' | 'error' | 'info'
  children: React.ReactNode
}

const alertVariants = {
  default: 'bg-neutral-50 text-neutral-900 border-neutral-200',
  success: 'bg-green-50/80 text-green-800 border-green-200 backdrop-blur-xl',
  warning: 'bg-yellow-50/80 text-yellow-800 border-yellow-200 backdrop-blur-xl',
  error: 'bg-red-50/80 text-red-800 border-red-200 backdrop-blur-xl',
  info: 'bg-blue-50/80 text-blue-800 border-blue-200 backdrop-blur-xl'
}

export const Alert = React.forwardRef<HTMLDivElement, AlertProps>(
  ({ className, variant = 'default', children, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          // Base styles
          'relative w-full rounded-xl border p-4 transition-all duration-200',
          // Variant styles
          alertVariants[variant],
          // Custom classes
          className
        )}
        {...props}
      >
        {children}
      </div>
    )
  }
)

Alert.displayName = 'Alert'

export const AlertDescription = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
  ({ className, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn('text-sm leading-relaxed', className)}
        {...props}
      />
    )
  }
)

AlertDescription.displayName = 'AlertDescription'