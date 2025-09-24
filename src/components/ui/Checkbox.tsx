import React, { forwardRef } from 'react'
import { Check, Minus } from 'lucide-react'
import { cn } from '@/lib/utils'

interface CheckboxProps {
  checked?: boolean | 'indeterminate'
  onCheckedChange?: (checked: boolean) => void
  disabled?: boolean
  size?: 'sm' | 'md' | 'lg'
  variant?: 'default' | 'success' | 'warning' | 'error'
  label?: string
  description?: string
  required?: boolean
  error?: string
  className?: string
  id?: string
  name?: string
  value?: string
}

const checkboxSizes = {
  sm: 'w-4 h-4',
  md: 'w-5 h-5',
  lg: 'w-6 h-6'
}

const checkboxVariants = {
  default: {
    unchecked: 'border-neutral-300 bg-white',
    checked: 'border-primary-500 bg-primary-500',
    hover: 'hover:border-primary-400',
    focus: 'focus:ring-primary-200 focus:border-primary-400'
  },
  success: {
    unchecked: 'border-neutral-300 bg-white',
    checked: 'border-green-500 bg-green-500',
    hover: 'hover:border-green-400',
    focus: 'focus:ring-green-200 focus:border-green-400'
  },
  warning: {
    unchecked: 'border-neutral-300 bg-white',
    checked: 'border-amber-500 bg-amber-500',
    hover: 'hover:border-amber-400',
    focus: 'focus:ring-amber-200 focus:border-amber-400'
  },
  error: {
    unchecked: 'border-red-300 bg-white',
    checked: 'border-red-500 bg-red-500',
    hover: 'hover:border-red-400',
    focus: 'focus:ring-red-200 focus:border-red-400'
  }
}

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(({
  checked = false,
  onCheckedChange,
  disabled = false,
  size = 'md',
  variant = 'default',
  label,
  description,
  required = false,
  error,
  className,
  id,
  name,
  value,
  ...props
}, ref) => {
  const isIndeterminate = checked === 'indeterminate'
  const isChecked = checked === true
  const variantStyles = error ? checkboxVariants.error : checkboxVariants[variant]

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (disabled) return
    onCheckedChange?.(event.target.checked)
  }

  const checkboxId = id || `checkbox-${Math.random().toString(36).substr(2, 9)}`

  return (
    <div className={cn('flex flex-col gap-1', className)}>
      <div className="flex items-start gap-3">
        <div className="relative flex items-center">
          <input
            ref={ref}
            type="checkbox"
            id={checkboxId}
            name={name}
            value={value}
            checked={isChecked}
            onChange={handleChange}
            disabled={disabled}
            required={required}
            className="sr-only"
            aria-describedby={description ? `${checkboxId}-description` : undefined}
            aria-invalid={!!error}
            {...props}
          />

          <div
            className={cn(
              'flex items-center justify-center border-2 rounded-md transition-all duration-200',
              checkboxSizes[size],
              disabled
                ? 'opacity-50 cursor-not-allowed bg-neutral-100 border-neutral-200'
                : 'cursor-pointer',
              !disabled && (
                isChecked || isIndeterminate
                  ? variantStyles.checked
                  : cn(variantStyles.unchecked, variantStyles.hover)
              ),
              !disabled && `focus-within:ring-2 ${variantStyles.focus.split(' ')[0]} ${variantStyles.focus.split(' ')[1]}`
            )}
            onClick={() => !disabled && onCheckedChange?.(!isChecked)}
          >
            {isIndeterminate ? (
              <Minus
                className={cn(
                  'text-white transition-all duration-200',
                  size === 'sm' ? 'w-2.5 h-2.5' :
                  size === 'md' ? 'w-3 h-3' : 'w-4 h-4'
                )}
              />
            ) : isChecked ? (
              <Check
                className={cn(
                  'text-white transition-all duration-200',
                  size === 'sm' ? 'w-2.5 h-2.5' :
                  size === 'md' ? 'w-3 h-3' : 'w-4 h-4'
                )}
              />
            ) : null}
          </div>
        </div>

        {(label || description) && (
          <div className="flex-1 min-w-0">
            {label && (
              <label
                htmlFor={checkboxId}
                className={cn(
                  'block text-sm font-medium transition-colors duration-200',
                  disabled
                    ? 'text-neutral-400 cursor-not-allowed'
                    : 'text-neutral-700 cursor-pointer',
                  error && 'text-red-700'
                )}
              >
                {label}
                {required && <span className="text-red-500 ml-1">*</span>}
              </label>
            )}

            {description && (
              <p
                id={`${checkboxId}-description`}
                className={cn(
                  'text-xs mt-1',
                  disabled ? 'text-neutral-400' : 'text-neutral-500',
                  error && 'text-red-600'
                )}
              >
                {description}
              </p>
            )}
          </div>
        )}
      </div>

      {error && (
        <div className="text-red-600 text-xs mt-1 ml-8">
          {error}
        </div>
      )}
    </div>
  )
})

Checkbox.displayName = 'Checkbox'

// Checkbox Group Component
interface CheckboxGroupOption {
  value: string
  label: string
  description?: string
  disabled?: boolean
}

interface CheckboxGroupProps {
  options: CheckboxGroupOption[]
  value: string[]
  onChange: (value: string[]) => void
  disabled?: boolean
  size?: 'sm' | 'md' | 'lg'
  variant?: 'default' | 'success' | 'warning' | 'error'
  label?: string
  description?: string
  required?: boolean
  error?: string
  className?: string
  orientation?: 'vertical' | 'horizontal'
  columns?: number
}

export const CheckboxGroup = ({
  options,
  value = [],
  onChange,
  disabled = false,
  size = 'md',
  variant = 'default',
  label,
  description,
  required = false,
  error,
  className,
  orientation = 'vertical',
  columns
}: CheckboxGroupProps) => {
  const handleOptionChange = (optionValue: string, checked: boolean) => {
    if (checked) {
      onChange([...value, optionValue])
    } else {
      onChange(value.filter(v => v !== optionValue))
    }
  }

  const gridClassName = columns
    ? `grid gap-4 ${columns === 2 ? 'grid-cols-2' : columns === 3 ? 'grid-cols-3' : `grid-cols-${columns}`}`
    : orientation === 'horizontal'
    ? 'flex flex-wrap gap-6'
    : 'space-y-3'

  return (
    <fieldset className={cn('space-y-3', className)}>
      {label && (
        <legend className="text-sm font-medium text-neutral-700">
          {label}
          {required && <span className="text-red-500 ml-1">*</span>}
        </legend>
      )}

      {description && (
        <p className="text-xs text-neutral-500 -mt-1">
          {description}
        </p>
      )}

      <div className={gridClassName}>
        {options.map((option) => (
          <Checkbox
            key={option.value}
            checked={value.includes(option.value)}
            onCheckedChange={(checked) => handleOptionChange(option.value, checked)}
            disabled={disabled || option.disabled}
            size={size}
            variant={variant}
            label={option.label}
            description={option.description}
            value={option.value}
          />
        ))}
      </div>

      {error && (
        <div className="text-red-600 text-xs">
          {error}
        </div>
      )}
    </fieldset>
  )
}