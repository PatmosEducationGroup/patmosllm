import React, { useState, useRef, useEffect } from 'react'
import { ChevronDown, Check } from 'lucide-react'
import { cn } from '@/lib/utils'

interface DropdownOption {
  value: string
  label: string
  disabled?: boolean
  icon?: React.ComponentType<{ className?: string }>
}

interface DropdownProps {
  options: DropdownOption[]
  value?: string
  onSelect: (value: string) => void
  placeholder?: string
  disabled?: boolean
  className?: string
  size?: 'sm' | 'md' | 'lg'
  variant?: 'default' | 'outline' | 'ghost'
  position?: 'bottom' | 'top' | 'auto'
}

const dropdownSizes = {
  sm: 'text-sm py-1.5 px-2',
  md: 'text-base py-2 px-3',
  lg: 'text-lg py-3 px-4'
}

const dropdownVariants = {
  default: 'bg-white border border-neutral-200 shadow-lg',
  outline: 'bg-transparent border border-neutral-300',
  ghost: 'bg-neutral-50 border border-transparent hover:bg-neutral-100'
}

export const Dropdown = ({
  options,
  value,
  onSelect,
  placeholder = 'Select an option',
  disabled = false,
  className,
  size = 'md',
  variant = 'default',
  position = 'auto'
}: DropdownProps) => {
  const [isOpen, setIsOpen] = useState(false)
  const [focusedIndex, setFocusedIndex] = useState(-1)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const optionsRef = useRef<HTMLDivElement>(null)

  const selectedOption = options.find(option => option.value === value)

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
        setFocusedIndex(-1)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Handle keyboard navigation
  useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (event: KeyboardEvent) => {
      switch (event.key) {
        case 'Escape':
          setIsOpen(false)
          setFocusedIndex(-1)
          buttonRef.current?.focus()
          break
        case 'ArrowDown':
          event.preventDefault()
          setFocusedIndex(prev => {
            // const _enabledOptions = options.filter(opt => !opt.disabled)
            const enabledIndexes = options
              .map((opt, idx) => opt.disabled ? -1 : idx)
              .filter(idx => idx !== -1)

            const currentEnabledIndex = enabledIndexes.indexOf(prev)
            const nextEnabledIndex = currentEnabledIndex < enabledIndexes.length - 1
              ? currentEnabledIndex + 1
              : 0

            return enabledIndexes[nextEnabledIndex] ?? 0
          })
          break
        case 'ArrowUp':
          event.preventDefault()
          setFocusedIndex(prev => {
            // const _enabledOptions = options.filter(opt => !opt.disabled)
            const enabledIndexes = options
              .map((opt, idx) => opt.disabled ? -1 : idx)
              .filter(idx => idx !== -1)

            const currentEnabledIndex = enabledIndexes.indexOf(prev)
            const prevEnabledIndex = currentEnabledIndex > 0
              ? currentEnabledIndex - 1
              : enabledIndexes.length - 1

            return enabledIndexes[prevEnabledIndex] ?? enabledIndexes.length - 1
          })
          break
        case 'Enter':
        case ' ':
          event.preventDefault()
          if (focusedIndex >= 0 && !options[focusedIndex]?.disabled) {
            handleSelect(options[focusedIndex].value)
          }
          break
        case 'Tab':
          setIsOpen(false)
          setFocusedIndex(-1)
          break
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, focusedIndex, options])

  const handleToggle = () => {
    if (disabled) return

    setIsOpen(!isOpen)
    if (!isOpen) {
      setFocusedIndex(value ? options.findIndex(opt => opt.value === value) : -1)
    }
  }

  const handleSelect = (optionValue: string) => {
    onSelect(optionValue)
    setIsOpen(false)
    setFocusedIndex(-1)
    buttonRef.current?.focus()
  }

  // Calculate dropdown position
  const getDropdownPosition = () => {
    if (position === 'top') return 'bottom-full mb-1'
    if (position === 'bottom') return 'top-full mt-1'

    // Auto positioning
    if (!buttonRef.current) return 'top-full mt-1'

    const rect = buttonRef.current.getBoundingClientRect()
    const spaceBelow = window.innerHeight - rect.bottom
    const spaceAbove = rect.top

    return spaceBelow < 200 && spaceAbove > spaceBelow ? 'bottom-full mb-1' : 'top-full mt-1'
  }

  return (
    <div ref={dropdownRef} className={cn('relative inline-block text-left', className)}>
      <button
        ref={buttonRef}
        type="button"
        onClick={handleToggle}
        disabled={disabled}
        className={cn(
          'w-full flex items-center justify-between rounded-xl font-medium transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-primary-200 focus:border-primary-400 min-h-[44px]',
          dropdownSizes[size],
          dropdownVariants[variant],
          disabled
            ? 'opacity-50 cursor-not-allowed'
            : 'hover:shadow-md cursor-pointer',
          isOpen && 'ring-2 ring-primary-200 border-primary-400'
        )}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-label={selectedOption ? selectedOption.label : placeholder}
      >
        <div className="flex items-center gap-2 flex-1 text-left">
          {selectedOption?.icon && (
            <selectedOption.icon className="w-4 h-4 text-neutral-600" />
          )}
          <span className={cn(
            selectedOption ? 'text-neutral-800' : 'text-neutral-500'
          )}>
            {selectedOption ? selectedOption.label : placeholder}
          </span>
        </div>
        <ChevronDown
          className={cn(
            'w-4 h-4 text-neutral-400 transition-transform duration-200',
            isOpen && 'rotate-180'
          )}
        />
      </button>

      {isOpen && (
        <div
          ref={optionsRef}
          className={cn(
            'absolute left-0 right-0 z-50 bg-white/95 backdrop-blur-xl border border-neutral-200/60 rounded-xl shadow-2xl py-1 max-h-60 overflow-y-auto',
            getDropdownPosition()
          )}
          role="listbox"
          aria-label="Options"
        >
          {options.map((option, index) => {
            const Icon = option.icon
            const isSelected = option.value === value
            const isFocused = index === focusedIndex

            return (
              <div
                key={option.value}
                onClick={() => !option.disabled && handleSelect(option.value)}
                className={cn(
                  'flex items-center gap-2 px-3 py-2 text-sm cursor-pointer transition-colors duration-150',
                  option.disabled
                    ? 'text-neutral-400 cursor-not-allowed opacity-50'
                    : 'text-neutral-800',
                  isFocused && !option.disabled && 'bg-primary-50 text-primary-700',
                  isSelected && 'bg-primary-100 text-primary-800 font-medium',
                  !option.disabled && !isFocused && !isSelected && 'hover:bg-neutral-50'
                )}
                role="option"
                aria-selected={isSelected}
                aria-disabled={option.disabled}
              >
                <div className="flex items-center gap-2 flex-1">
                  {Icon && (
                    <Icon className={cn(
                      'w-4 h-4',
                      option.disabled
                        ? 'text-neutral-300'
                        : isSelected
                        ? 'text-primary-600'
                        : 'text-neutral-500'
                    )} />
                  )}
                  <span>{option.label}</span>
                </div>
                {isSelected && (
                  <Check className="w-4 h-4 text-primary-600" />
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// Convenience component for simple string options
interface SimpleDropdownProps {
  options: string[]
  value?: string
  onSelect: (value: string) => void
  placeholder?: string
  disabled?: boolean
  className?: string
  size?: 'sm' | 'md' | 'lg'
  variant?: 'default' | 'outline' | 'ghost'
}

export const SimpleDropdown = ({ options, ...props }: SimpleDropdownProps) => {
  const formattedOptions: DropdownOption[] = options.map(option => ({
    value: option,
    label: option
  }))

  return <Dropdown options={formattedOptions} {...props} />
}