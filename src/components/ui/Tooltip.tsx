import React, { useState, useRef, useEffect } from 'react'
import { cn } from '@/lib/utils'

interface TooltipProps {
  children: React.ReactNode
  content: React.ReactNode
  position?: 'top' | 'bottom' | 'left' | 'right' | 'auto'
  delay?: number
  hideDelay?: number
  disabled?: boolean
  className?: string
  maxWidth?: string
  showArrow?: boolean
  trigger?: 'hover' | 'click' | 'focus'
}

const positionClasses = {
  top: 'bottom-full left-1/2 transform -translate-x-1/2 mb-2',
  bottom: 'top-full left-1/2 transform -translate-x-1/2 mt-2',
  left: 'right-full top-1/2 transform -translate-y-1/2 mr-2',
  right: 'left-full top-1/2 transform -translate-y-1/2 ml-2'
}

const arrowClasses = {
  top: 'top-full left-1/2 transform -translate-x-1/2 border-l-transparent border-r-transparent border-b-transparent border-t-neutral-800',
  bottom: 'bottom-full left-1/2 transform -translate-x-1/2 border-l-transparent border-r-transparent border-t-transparent border-b-neutral-800',
  left: 'left-full top-1/2 transform -translate-y-1/2 border-t-transparent border-b-transparent border-r-transparent border-l-neutral-800',
  right: 'right-full top-1/2 transform -translate-y-1/2 border-t-transparent border-b-transparent border-l-transparent border-r-neutral-800'
}

export const Tooltip = ({
  children,
  content,
  position = 'auto',
  delay = 200,
  hideDelay = 0,
  disabled = false,
  className,
  maxWidth = '200px',
  showArrow = true,
  trigger = 'hover'
}: TooltipProps) => {
  const [isVisible, setIsVisible] = useState(false)
  const [calculatedPosition, setCalculatedPosition] = useState<'top' | 'bottom' | 'left' | 'right'>('top')
  const showTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const hideTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const triggerRef = useRef<HTMLDivElement>(null)
  const tooltipRef = useRef<HTMLDivElement>(null)

  // Calculate optimal position
  const calculatePosition = (): 'top' | 'bottom' | 'left' | 'right' => {
    if (position !== 'auto') return position

    if (!triggerRef.current) return 'top'

    const rect = triggerRef.current.getBoundingClientRect()
    const viewportWidth = window.innerWidth
    const viewportHeight = window.innerHeight

    const spaceAbove = rect.top
    const spaceBelow = viewportHeight - rect.bottom
    const spaceLeft = rect.left
    const spaceRight = viewportWidth - rect.right

    // Prioritize top/bottom first for better UX
    if (spaceAbove >= 60) return 'top'
    if (spaceBelow >= 60) return 'bottom'
    if (spaceRight >= 120) return 'right'
    if (spaceLeft >= 120) return 'left'

    // Fallback to the side with most space
    const maxSpace = Math.max(spaceAbove, spaceBelow, spaceLeft, spaceRight)
    if (maxSpace === spaceAbove) return 'top'
    if (maxSpace === spaceBelow) return 'bottom'
    if (maxSpace === spaceRight) return 'right'
    return 'left'
  }

  const showTooltip = () => {
    if (disabled) return

    if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current)

    if (delay > 0) {
      showTimeoutRef.current = setTimeout(() => {
        setCalculatedPosition(calculatePosition())
        setIsVisible(true)
      }, delay)
    } else {
      setCalculatedPosition(calculatePosition())
      setIsVisible(true)
    }
  }

  const hideTooltip = () => {
    if (showTimeoutRef.current) clearTimeout(showTimeoutRef.current)

    if (hideDelay > 0) {
      hideTimeoutRef.current = setTimeout(() => {
        setIsVisible(false)
      }, hideDelay)
    } else {
      setIsVisible(false)
    }
  }

  // Handle click trigger
  const handleClick = () => {
    if (trigger === 'click') {
      if (isVisible) {
        hideTooltip()
      } else {
        showTooltip()
      }
    }
  }

  // Handle focus trigger
  const handleFocus = () => {
    if (trigger === 'focus') {
      showTooltip()
    }
  }

  const handleBlur = () => {
    if (trigger === 'focus') {
      hideTooltip()
    }
  }

  // Close tooltip when clicking outside (for click trigger)
  useEffect(() => {
    if (trigger !== 'click' || !isVisible) return

    const handleClickOutside = (event: MouseEvent) => {
      if (
        triggerRef.current &&
        tooltipRef.current &&
        !triggerRef.current.contains(event.target as Node) &&
        !tooltipRef.current.contains(event.target as Node)
      ) {
        hideTooltip()
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trigger, isVisible])

  // Handle escape key for click/focus triggers
  useEffect(() => {
    if ((trigger === 'click' || trigger === 'focus') && isVisible) {
      const handleEscape = (event: KeyboardEvent) => {
        if (event.key === 'Escape') {
          hideTooltip()
        }
      }

      document.addEventListener('keydown', handleEscape)
      return () => document.removeEventListener('keydown', handleEscape)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trigger, isVisible])

  // Cleanup timeouts on unmount
  useEffect(() => {
    return () => {
      if (showTimeoutRef.current) clearTimeout(showTimeoutRef.current)
      if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current)
    }
  }, [])

  const triggerProps = {
    ...(trigger === 'hover' && {
      onMouseEnter: showTooltip,
      onMouseLeave: hideTooltip
    }),
    ...(trigger === 'click' && {
      onClick: handleClick
    }),
    ...(trigger === 'focus' && {
      onFocus: handleFocus,
      onBlur: handleBlur
    })
  }

  const tooltipProps = {
    ...(trigger === 'hover' && {
      onMouseEnter: () => { if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current) },
      onMouseLeave: hideTooltip
    })
  }

  return (
    <div className="relative inline-block">
      <div
        ref={triggerRef}
        {...triggerProps}
        className="cursor-help"
      >
        {children}
      </div>

      {isVisible && (
        <div
          ref={tooltipRef}
          {...tooltipProps}
          className={cn(
            'absolute z-50 px-3 py-2 text-sm text-white bg-neutral-800/95 backdrop-blur-sm rounded-lg shadow-lg border border-neutral-600/20 animate-in fade-in-0 zoom-in-95 duration-200',
            positionClasses[calculatedPosition],
            className
          )}
          style={{ maxWidth }}
          role="tooltip"
          aria-hidden={!isVisible}
        >
          <div className="relative">
            {content}
            {showArrow && (
              <div
                className={cn(
                  'absolute w-0 h-0 border-4',
                  arrowClasses[calculatedPosition]
                )}
              />
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// Convenience component for simple text tooltips
interface SimpleTooltipProps {
  children: React.ReactNode
  text: string
  position?: 'top' | 'bottom' | 'left' | 'right' | 'auto'
  delay?: number
  className?: string
}

export const SimpleTooltip = ({ children, text, ...props }: SimpleTooltipProps) => {
  return (
    <Tooltip content={text} {...props}>
      {children}
    </Tooltip>
  )
}

// Icon tooltip component for help icons
interface HelpTooltipProps {
  content: React.ReactNode
  position?: 'top' | 'bottom' | 'left' | 'right' | 'auto'
  className?: string
}

export const HelpTooltip = ({ content, position = 'top', className }: HelpTooltipProps) => {
  return (
    <Tooltip content={content} position={position} trigger="click" className={className}>
      <button
        type="button"
        className="inline-flex items-center justify-center w-4 h-4 text-neutral-400 hover:text-neutral-600 transition-colors duration-200 cursor-help"
        aria-label="Help"
      >
        <svg
          className="w-4 h-4"
          fill="currentColor"
          viewBox="0 0 20 20"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            fillRule="evenodd"
            d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-3a1 1 0 00-.867.5 1 1 0 11-1.731-1A3 3 0 0113 8a3.001 3.001 0 01-2 2.83V11a1 1 0 11-2 0v-1a1 1 0 011-1 1 1 0 100-2zm0 8a1 1 0 100-2 1 1 0 000 2z"
            clipRule="evenodd"
          />
        </svg>
      </button>
    </Tooltip>
  )
}