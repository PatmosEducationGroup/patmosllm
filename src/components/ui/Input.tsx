import React from 'react'
import { cn } from '@/lib/utils'

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
  hint?: string
  size?: 'sm' | 'md' | 'lg'
  variant?: 'default' | 'filled'
  leftIcon?: React.ReactNode
  rightIcon?: React.ReactNode
}

const inputSizes = {
  sm: 'px-3 py-1.5 text-sm',
  md: 'px-4 py-2 text-sm',
  lg: 'px-4 py-3 text-base'
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({
    className,
    type = 'text',
    label,
    error,
    hint,
    size = 'md',
    variant = 'default',
    leftIcon,
    rightIcon,
    disabled,
    id,
    ...props
  }, ref) => {
    const inputId = id || `input-${Math.random().toString(36).substr(2, 9)}`

    const inputVariants = {
      default: [
        'border border-neutral-300',
        'focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20',
        error
          ? 'border-error-500 focus:border-error-500 focus:ring-error-500/20'
          : '',
        'disabled:bg-neutral-50 disabled:border-neutral-200 disabled:text-neutral-500',
      ].filter(Boolean).join(' '),

      filled: [
        'border border-transparent bg-neutral-100',
        'focus:bg-white focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20',
        error
          ? 'bg-error-50 border-error-500 focus:border-error-500 focus:ring-error-500/20'
          : '',
        'disabled:bg-neutral-100 disabled:text-neutral-500',
      ].filter(Boolean).join(' ')
    }

    return (
      <div className="space-y-1">
        {label && (
          <label
            htmlFor={inputId}
            className={cn(
              'block text-sm font-medium',
              error ? 'text-error-700' : 'text-neutral-700',
              disabled && 'text-neutral-500'
            )}
          >
            {label}
          </label>
        )}

        <div className="relative">
          {leftIcon && (
            <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
              <div className={cn(
                'h-4 w-4',
                error ? 'text-error-500' : 'text-neutral-400',
                disabled && 'text-neutral-300'
              )}>
                {leftIcon}
              </div>
            </div>
          )}

          <input
            type={type}
            id={inputId}
            className={cn(
              // Base styles
              'block w-full rounded-lg font-sans',
              'placeholder:text-neutral-400',
              'focus:outline-none',
              'transition-all duration-200',
              'disabled:cursor-not-allowed',
              // Size styles
              inputSizes[size],
              // Variant styles
              inputVariants[variant],
              // Icon padding
              leftIcon && 'pl-10',
              rightIcon && 'pr-10',
              // Custom classes
              className
            )}
            ref={ref}
            disabled={disabled}
            aria-invalid={error ? 'true' : 'false'}
            aria-describedby={
              error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined
            }
            {...props}
          />

          {rightIcon && (
            <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
              <div className={cn(
                'h-4 w-4',
                error ? 'text-error-500' : 'text-neutral-400',
                disabled && 'text-neutral-300'
              )}>
                {rightIcon}
              </div>
            </div>
          )}
        </div>

        {error && (
          <p
            id={`${inputId}-error`}
            className="text-sm text-error-600 animate-slide-up"
          >
            {error}
          </p>
        )}

        {hint && !error && (
          <p
            id={`${inputId}-hint`}
            className={cn(
              'text-sm',
              disabled ? 'text-neutral-400' : 'text-neutral-500'
            )}
          >
            {hint}
          </p>
        )}
      </div>
    )
  }
)

Input.displayName = 'Input'