import React, { forwardRef, useRef, useImperativeHandle, useEffect, useState } from 'react'
import { cn } from '@/lib/utils'

interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string
  description?: string
  error?: string
  required?: boolean
  size?: 'sm' | 'md' | 'lg'
  variant?: 'default' | 'outline' | 'filled'
  resize?: 'none' | 'both' | 'horizontal' | 'vertical' | 'auto'
  autoResize?: boolean
  maxHeight?: number
  minHeight?: number
  showCharCount?: boolean
  maxLength?: number
  helperText?: string
}

const textareaSizes = {
  sm: 'text-sm py-2 px-3 min-h-[80px]',
  md: 'text-base py-3 px-4 min-h-[100px]',
  lg: 'text-lg py-4 px-5 min-h-[120px]'
}

const textareaVariants = {
  default: 'bg-white border border-neutral-200 shadow-sm',
  outline: 'bg-transparent border border-neutral-300',
  filled: 'bg-neutral-50 border border-transparent'
}

const resizeClasses = {
  none: 'resize-none',
  both: 'resize',
  horizontal: 'resize-x',
  vertical: 'resize-y',
  auto: 'resize-none' // Will be handled by autoResize logic
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(({
  label,
  description,
  error,
  required = false,
  size = 'md',
  variant = 'default',
  resize = 'vertical',
  autoResize = false,
  maxHeight,
  minHeight,
  showCharCount = false,
  maxLength,
  helperText,
  className,
  id,
  value,
  onChange,
  onInput,
  disabled,
  ...props
}, ref) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [charCount, setCharCount] = useState(0)

  // Combine refs
  useImperativeHandle(ref, () => textareaRef.current!, [])

  const textareaId = id || `textarea-${Math.random().toString(36).substr(2, 9)}`

  // Auto resize functionality
  const adjustHeight = () => {
    const textarea = textareaRef.current
    if (!textarea || !autoResize) return

    // Reset height to get accurate scrollHeight
    textarea.style.height = 'auto'

    let newHeight = textarea.scrollHeight

    // Apply min/max height constraints
    if (minHeight) newHeight = Math.max(newHeight, minHeight)
    if (maxHeight) newHeight = Math.min(newHeight, maxHeight)

    textarea.style.height = `${newHeight}px`
  }

  // Handle input changes
  const handleChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = event.target.value

    // Update character count
    setCharCount(newValue.length)

    // Auto resize if enabled
    if (autoResize) {
      setTimeout(adjustHeight, 0)
    }

    onChange?.(event)
  }

  const handleInput = (event: React.FormEvent<HTMLTextAreaElement>) => {
    if (autoResize) {
      adjustHeight()
    }
    onInput?.(event)
  }

  // Initialize character count and auto-resize on mount
  useEffect(() => {
    if (value) {
      setCharCount(String(value).length)
    }
    if (autoResize) {
      adjustHeight()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, autoResize])

  // Adjust height when autoResize prop changes
  useEffect(() => {
    if (autoResize) {
      adjustHeight()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoResize])

  const isOverLimit = maxLength ? charCount > maxLength : false

  return (
    <div className={cn('flex flex-col gap-1', className)}>
      {label && (
        <label
          htmlFor={textareaId}
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
        <textarea
          ref={textareaRef}
          id={textareaId}
          value={value}
          onChange={handleChange}
          onInput={handleInput}
          disabled={disabled}
          maxLength={maxLength}
          className={cn(
            'w-full rounded-xl font-medium transition-all duration-200 focus:outline-none focus:ring-2',
            textareaSizes[size],
            textareaVariants[variant],
            resizeClasses[resize],
            disabled
              ? 'opacity-50 cursor-not-allowed bg-neutral-100'
              : 'cursor-text hover:shadow-md',
            error || isOverLimit
              ? 'border-red-300 focus:border-red-400 focus:ring-red-200'
              : 'focus:border-primary-400 focus:ring-primary-200'
          )}
          style={{
            minHeight: minHeight ? `${minHeight}px` : undefined,
            maxHeight: maxHeight ? `${maxHeight}px` : undefined
          }}
          aria-describedby={
            description ? `${textareaId}-description` :
            error ? `${textareaId}-error` :
            helperText ? `${textareaId}-helper` : undefined
          }
          aria-invalid={!!(error || isOverLimit)}
          {...props}
        />

        {/* Character count in bottom right */}
        {(showCharCount || maxLength) && (
          <div className="absolute bottom-2 right-2 text-xs text-neutral-400 bg-white/80 backdrop-blur-sm px-2 py-1 rounded pointer-events-none">
            <span className={cn(isOverLimit && 'text-red-500')}>
              {charCount}
            </span>
            {maxLength && (
              <>
                <span className="text-neutral-300">/</span>
                <span>{maxLength}</span>
              </>
            )}
          </div>
        )}
      </div>

      {/* Helper text */}
      {helperText && !error && (
        <p
          id={`${textareaId}-helper`}
          className={cn(
            'text-xs',
            disabled ? 'text-neutral-400' : 'text-neutral-500'
          )}
        >
          {helperText}
        </p>
      )}

      {/* Error message */}
      {error && (
        <p
          id={`${textareaId}-error`}
          className="text-red-600 text-xs"
        >
          {error}
        </p>
      )}

      {/* Character limit warning */}
      {isOverLimit && (
        <p className="text-red-600 text-xs">
          Character limit exceeded by {charCount - (maxLength || 0)} characters
        </p>
      )}
    </div>
  )
})

Textarea.displayName = 'Textarea'

// Enhanced Textarea with additional features
interface EnhancedTextareaProps extends Omit<TextareaProps, 'autoComplete'> {
  autoComplete?: boolean
  suggestions?: string[]
  onSuggestionSelect?: (suggestion: string) => void
  allowMarkdown?: boolean
  previewMode?: boolean
  onPreviewToggle?: (preview: boolean) => void
}

export const EnhancedTextarea = ({
  autoComplete: _autoComplete = false,
  suggestions: _suggestions = [],
  onSuggestionSelect,
  allowMarkdown = false,
  previewMode = false,
  onPreviewToggle,
  ...textareaProps
}: EnhancedTextareaProps) => {
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [filteredSuggestions, _setFilteredSuggestions] = useState<string[]>([])

  // This is a simplified implementation
  // In a full implementation, you'd add autocomplete logic, markdown preview, etc.

  return (
    <div className="relative">
      <Textarea {...textareaProps} />

      {/* Markdown preview toggle */}
      {allowMarkdown && (
        <div className="flex justify-end mt-1">
          <button
            type="button"
            onClick={() => onPreviewToggle?.(!previewMode)}
            className="text-xs text-neutral-500 hover:text-neutral-700 transition-colors"
          >
            {previewMode ? 'Edit' : 'Preview'}
          </button>
        </div>
      )}

      {/* Autocomplete suggestions */}
      {showSuggestions && filteredSuggestions.length > 0 && (
        <div className="absolute top-full left-0 right-0 z-10 mt-1 bg-white border border-neutral-200 rounded-lg shadow-lg max-h-40 overflow-y-auto">
          {filteredSuggestions.map((suggestion, index) => (
            <button
              key={index}
              type="button"
              onClick={() => {
                onSuggestionSelect?.(suggestion)
                setShowSuggestions(false)
              }}
              className="w-full px-3 py-2 text-left text-sm hover:bg-neutral-50 transition-colors"
            >
              {suggestion}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// Form field wrapper for consistent spacing and layout
interface TextareaFieldProps extends TextareaProps {
  layout?: 'vertical' | 'horizontal'
  labelWidth?: string
}

export const TextareaField = ({
  layout = 'vertical',
  labelWidth = '120px',
  label,
  className,
  ...props
}: TextareaFieldProps) => {
  if (layout === 'horizontal') {
    return (
      <div className={cn('flex items-start gap-4', className)}>
        {label && (
          <div style={{ width: labelWidth }} className="flex-shrink-0 pt-3">
            <label className="block text-sm font-medium text-neutral-700">
              {label}
              {props.required && <span className="text-red-500 ml-1">*</span>}
            </label>
          </div>
        )}
        <div className="flex-1">
          <Textarea {...props} label={undefined} />
        </div>
      </div>
    )
  }

  return <Textarea label={label} className={className} {...props} />
}