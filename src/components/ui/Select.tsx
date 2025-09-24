import React, { forwardRef } from 'react'
import { ChevronDown, Check } from 'lucide-react'
import { cn } from '@/lib/utils'

interface SelectOption {
  value: string
  label: string
  disabled?: boolean
  description?: string
}

interface SelectProps {
  options: SelectOption[]
  value?: string
  onValueChange?: (value: string) => void
  placeholder?: string
  disabled?: boolean
  size?: 'sm' | 'md' | 'lg'
  variant?: 'default' | 'outline' | 'filled'
  label?: string
  description?: string
  required?: boolean
  error?: string
  className?: string
  id?: string
  name?: string
}

const selectSizes = {
  sm: 'text-sm py-2 px-3 min-h-[36px]',
  md: 'text-base py-3 px-4 min-h-[44px]',
  lg: 'text-lg py-4 px-5 min-h-[52px]'
}

const selectVariants = {
  default: 'bg-white border border-neutral-200 shadow-sm',
  outline: 'bg-transparent border border-neutral-300',
  filled: 'bg-neutral-50 border border-transparent'
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(({
  options,
  value,
  onValueChange,
  placeholder = 'Select an option',
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
  ...props
}, ref) => {
  const handleChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    onValueChange?.(event.target.value)
  }

  const selectId = id || `select-${Math.random().toString(36).substr(2, 9)}`
  const selectedOption = options.find(option => option.value === value)

  return (
    <div className={cn('flex flex-col gap-1', className)}>
      {label && (
        <label
          htmlFor={selectId}
          className={cn(
            'block text-sm font-medium',
            disabled ? 'text-neutral-400' : 'text-neutral-700',
            error && 'text-red-700'
          )}
        >
          {label}
          {required && <span className="text-red-500 ml-1">*</span>}
        </label>
      )}

      {description && (
        <p className={cn(
          'text-xs',
          disabled ? 'text-neutral-400' : 'text-neutral-500',
          error && 'text-red-600'
        )}>
          {description}
        </p>
      )}

      <div className="relative">
        <select
          ref={ref}
          id={selectId}
          name={name}
          value={value || ''}
          onChange={handleChange}
          disabled={disabled}
          required={required}
          className={cn(
            'w-full appearance-none rounded-xl font-medium transition-all duration-200 focus:outline-none focus:ring-2 pr-10',
            selectSizes[size],
            selectVariants[variant],
            disabled
              ? 'opacity-50 cursor-not-allowed bg-neutral-100'
              : 'cursor-pointer hover:shadow-md',
            error
              ? 'border-red-300 focus:border-red-400 focus:ring-red-200'
              : 'focus:border-primary-400 focus:ring-primary-200',
            !value && 'text-neutral-500'
          )}
          aria-describedby={
            description ? `${selectId}-description` :
            error ? `${selectId}-error` : undefined
          }
          aria-invalid={!!error}
          {...props}
        >
          <option value="" disabled hidden>
            {placeholder}
          </option>

          {options.map((option) => (
            <option
              key={option.value}
              value={option.value}
              disabled={option.disabled}
              className={cn(
                'py-2',
                option.disabled && 'text-neutral-400'
              )}
            >
              {option.label}
            </option>
          ))}
        </select>

        <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
          <ChevronDown
            className={cn(
              'w-5 h-5 transition-colors duration-200',
              disabled ? 'text-neutral-400' : 'text-neutral-500'
            )}
          />
        </div>
      </div>

      {error && (
        <p
          id={`${selectId}-error`}
          className="text-red-600 text-xs"
        >
          {error}
        </p>
      )}

      {description && !label && (
        <p
          id={`${selectId}-description`}
          className={cn(
            'text-xs',
            disabled ? 'text-neutral-400' : 'text-neutral-500'
          )}
        >
          {description}
        </p>
      )}
    </div>
  )
})

Select.displayName = 'Select'

// Enhanced Select with custom styling (using the Dropdown component for better UX)
interface CustomSelectProps extends Omit<SelectProps, 'options'> {
  options: (SelectOption & { icon?: React.ComponentType<{ className?: string }> })[]
  searchable?: boolean
  clearable?: boolean
  multiSelect?: boolean
  maxSelections?: number
  onClear?: () => void
}

export const CustomSelect = ({
  options,
  value,
  onValueChange,
  placeholder = 'Select an option',
  disabled = false,
  size = 'md',
  variant = 'default',
  label,
  description,
  required = false,
  error,
  className,
  searchable = false,
  clearable = false,
  multiSelect = false,
  maxSelections,
  onClear,
  ...props
}: CustomSelectProps) => {
  // This would integrate with the Dropdown component for enhanced UX
  // For now, fallback to native select
  const nativeOptions = options.map(({ icon, ...rest }) => rest)

  return (
    <Select
      options={nativeOptions}
      value={value}
      onValueChange={onValueChange}
      placeholder={placeholder}
      disabled={disabled}
      size={size}
      variant={variant}
      label={label}
      description={description}
      required={required}
      error={error}
      className={className}
      {...props}
    />
  )
}

// Multiple Select Component
interface MultiSelectProps {
  options: SelectOption[]
  value: string[]
  onChange: (value: string[]) => void
  placeholder?: string
  disabled?: boolean
  size?: 'sm' | 'md' | 'lg'
  label?: string
  description?: string
  required?: boolean
  error?: string
  className?: string
  maxSelections?: number
  searchable?: boolean
}

export const MultiSelect = ({
  options,
  value = [],
  onChange,
  placeholder = 'Select options',
  disabled = false,
  size = 'md',
  label,
  description,
  required = false,
  error,
  className,
  maxSelections,
  searchable = false
}: MultiSelectProps) => {
  const handleToggle = (optionValue: string) => {
    if (value.includes(optionValue)) {
      onChange(value.filter(v => v !== optionValue))
    } else {
      if (maxSelections && value.length >= maxSelections) {
        return // Don't add if at max
      }
      onChange([...value, optionValue])
    }
  }

  const selectedOptions = options.filter(opt => value.includes(opt.value))
  const displayText = selectedOptions.length > 0
    ? selectedOptions.length === 1
      ? selectedOptions[0].label
      : `${selectedOptions.length} selected`
    : placeholder

  return (
    <div className={cn('flex flex-col gap-1', className)}>
      {label && (
        <label className={cn(
          'block text-sm font-medium',
          disabled ? 'text-neutral-400' : 'text-neutral-700',
          error && 'text-red-700'
        )}>
          {label}
          {required && <span className="text-red-500 ml-1">*</span>}
        </label>
      )}

      {description && (
        <p className={cn(
          'text-xs',
          disabled ? 'text-neutral-400' : 'text-neutral-500',
          error && 'text-red-600'
        )}>
          {description}
        </p>
      )}

      {/* This is a simplified version - in a real implementation,
          you'd use the Dropdown component for better UX */}
      <div className={cn(
        'relative rounded-xl border transition-all duration-200',
        selectSizes[size],
        selectVariants.default,
        disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:shadow-md',
        error ? 'border-red-300' : 'border-neutral-200'
      )}>
        <div className="flex items-center justify-between">
          <span className={cn(
            'flex-1',
            selectedOptions.length === 0 && 'text-neutral-500'
          )}>
            {displayText}
          </span>
          <ChevronDown className="w-5 h-5 text-neutral-500" />
        </div>

        {/* Selected items as badges */}
        {selectedOptions.length > 1 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {selectedOptions.map(option => (
              <span
                key={option.value}
                className="inline-flex items-center gap-1 px-2 py-1 text-xs bg-primary-100 text-primary-800 rounded-md"
              >
                {option.label}
                <button
                  onClick={() => handleToggle(option.value)}
                  className="text-primary-600 hover:text-primary-800"
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      {error && (
        <p className="text-red-600 text-xs">
          {error}
        </p>
      )}
    </div>
  )
}