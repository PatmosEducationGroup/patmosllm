import React from 'react'
import { cn } from '@/lib/utils'

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'destructive'
  size?: 'sm' | 'md' | 'lg' | 'xl'
  loading?: boolean
  children: React.ReactNode
}

const buttonVariants = {
  primary: [
    'bg-primary-600 text-white',
    'hover:bg-primary-700 active:bg-primary-800',
    'focus:ring-2 focus:ring-primary-500 focus:ring-offset-2',
    'disabled:bg-primary-300 disabled:cursor-not-allowed',
    'transition-colors duration-200'
  ].join(' '),

  secondary: [
    'bg-secondary-600 text-white',
    'hover:bg-secondary-700 active:bg-secondary-800',
    'focus:ring-2 focus:ring-secondary-500 focus:ring-offset-2',
    'disabled:bg-secondary-300 disabled:cursor-not-allowed',
    'transition-colors duration-200'
  ].join(' '),

  outline: [
    'border-2 border-primary-600 text-primary-700 bg-transparent',
    'hover:bg-primary-50 active:bg-primary-100',
    'focus:ring-2 focus:ring-primary-500 focus:ring-offset-2',
    'disabled:border-neutral-300 disabled:text-neutral-400 disabled:cursor-not-allowed',
    'transition-all duration-200'
  ].join(' '),

  ghost: [
    'text-neutral-700 bg-transparent',
    'hover:bg-neutral-100 active:bg-neutral-200',
    'focus:ring-2 focus:ring-neutral-500 focus:ring-offset-2',
    'disabled:text-neutral-400 disabled:cursor-not-allowed',
    'transition-colors duration-200'
  ].join(' '),

  destructive: [
    'bg-error-600 text-white',
    'hover:bg-error-700 active:bg-error-800',
    'focus:ring-2 focus:ring-error-500 focus:ring-offset-2',
    'disabled:bg-error-300 disabled:cursor-not-allowed',
    'transition-colors duration-200'
  ].join(' ')
}

const buttonSizes = {
  sm: 'px-3 py-1.5 text-sm font-medium rounded-md',
  md: 'px-4 py-2 text-sm font-medium rounded-lg',
  lg: 'px-6 py-3 text-base font-medium rounded-lg',
  xl: 'px-8 py-4 text-lg font-semibold rounded-xl'
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({
    className,
    variant = 'primary',
    size = 'md',
    loading = false,
    disabled,
    children,
    ...props
  }, ref) => {
    return (
      <button
        className={cn(
          // Base styles
          'inline-flex items-center justify-center',
          'font-sans font-medium',
          'focus:outline-none focus:ring-offset-white',
          'disabled:opacity-50',
          // Size styles
          buttonSizes[size],
          // Variant styles
          buttonVariants[variant],
          // Custom classes
          className
        )}
        ref={ref}
        disabled={disabled || loading}
        {...props}
      >
        {loading && (
          <svg
            className="animate-spin -ml-1 mr-2 h-4 w-4 text-current"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
        )}
        {children}
      </button>
    )
  }
)

Button.displayName = 'Button'