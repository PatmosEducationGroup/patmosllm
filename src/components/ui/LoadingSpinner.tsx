import React from 'react'
import { cn } from '@/lib/utils'

interface LoadingSpinnerProps extends React.HTMLAttributes<HTMLDivElement> {
  size?: 'sm' | 'md' | 'lg' | 'xl'
  variant?: 'primary' | 'secondary' | 'neutral'
  text?: string
}

const spinnerSizes = {
  sm: 'w-4 h-4',
  md: 'w-6 h-6',
  lg: 'w-8 h-8',
  xl: 'w-12 h-12'
}

const spinnerVariants = {
  primary: 'border-primary-200 border-t-primary-600',
  secondary: 'border-secondary-200 border-t-secondary-600',
  neutral: 'border-neutral-200 border-t-neutral-600'
}

export const LoadingSpinner = React.forwardRef<HTMLDivElement, LoadingSpinnerProps>(
  ({ className, size = 'md', variant = 'primary', text, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn('flex flex-col items-center justify-center gap-2', className)}
        {...props}
      >
        <div
          className={cn(
            'border-4 border-solid rounded-full animate-spin',
            spinnerSizes[size],
            spinnerVariants[variant]
          )}
        />
        {text && (
          <div className="text-sm font-medium text-neutral-600 animate-pulse">
            {text}
          </div>
        )}
      </div>
    )
  }
)

LoadingSpinner.displayName = 'LoadingSpinner'