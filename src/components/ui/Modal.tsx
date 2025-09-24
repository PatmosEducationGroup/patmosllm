import React, { useEffect, useRef } from 'react'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ModalProps {
  isOpen: boolean
  onClose: () => void
  title?: string
  children: React.ReactNode
  size?: 'sm' | 'md' | 'lg' | 'xl'
  showCloseButton?: boolean
  closeOnBackdropClick?: boolean
  closeOnEscapeKey?: boolean
  className?: string
}

const modalSizes = {
  sm: 'max-w-md',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl'
}

export const Modal = ({
  isOpen,
  onClose,
  title,
  children,
  size = 'md',
  showCloseButton = true,
  closeOnBackdropClick = true,
  closeOnEscapeKey = true,
  className
}: ModalProps) => {
  const modalRef = useRef<HTMLDivElement>(null)
  const previousActiveElement = useRef<HTMLElement | null>(null)

  // Focus management for accessibility
  useEffect(() => {
    if (isOpen) {
      // Store the previously focused element
      previousActiveElement.current = document.activeElement as HTMLElement

      // Focus the modal
      if (modalRef.current) {
        modalRef.current.focus()
      }

      // Prevent body scroll
      document.body.style.overflow = 'hidden'
    } else {
      // Restore focus to previously focused element
      if (previousActiveElement.current) {
        previousActiveElement.current.focus()
      }

      // Restore body scroll
      document.body.style.overflow = 'unset'
    }

    return () => {
      document.body.style.overflow = 'unset'
    }
  }, [isOpen])

  // Handle escape key
  useEffect(() => {
    if (!isOpen || !closeOnEscapeKey) return

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose()
      }
    }

    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [isOpen, closeOnEscapeKey, onClose])

  // Handle focus trapping
  useEffect(() => {
    if (!isOpen) return

    const handleTabKey = (event: KeyboardEvent) => {
      if (event.key !== 'Tab' || !modalRef.current) return

      const focusableElements = modalRef.current.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      )
      const firstFocusable = focusableElements[0] as HTMLElement
      const lastFocusable = focusableElements[focusableElements.length - 1] as HTMLElement

      if (event.shiftKey) {
        // Shift + Tab
        if (document.activeElement === firstFocusable) {
          lastFocusable?.focus()
          event.preventDefault()
        }
      } else {
        // Tab
        if (document.activeElement === lastFocusable) {
          firstFocusable?.focus()
          event.preventDefault()
        }
      }
    }

    document.addEventListener('keydown', handleTabKey)
    return () => document.removeEventListener('keydown', handleTabKey)
  }, [isOpen])

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={closeOnBackdropClick ? onClose : undefined}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />

      {/* Modal */}
      <div
        ref={modalRef}
        tabIndex={-1}
        className={cn(
          'relative w-full bg-white/90 backdrop-blur-xl rounded-2xl shadow-2xl border border-neutral-200/40 max-h-[90vh] overflow-y-auto',
          modalSizes[size],
          className
        )}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title || 'Modal dialog'}
      >
        {/* Header */}
        {(title || showCloseButton) && (
          <div className="flex items-center justify-between p-6 border-b border-neutral-200/40">
            {title && (
              <h2 className="text-xl font-bold text-neutral-800">
                {title}
              </h2>
            )}
            {showCloseButton && (
              <button
                onClick={onClose}
                className="p-2 text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 rounded-lg transition-colors duration-200 min-h-[44px] min-w-[44px] flex items-center justify-center"
                aria-label="Close modal"
              >
                <X className="w-5 h-5" />
              </button>
            )}
          </div>
        )}

        {/* Content */}
        <div className="p-6">
          {children}
        </div>
      </div>
    </div>
  )
}

// Modal Header component for structured content
export const ModalHeader = ({
  children,
  className
}: {
  children: React.ReactNode
  className?: string
}) => (
  <div className={cn('mb-4', className)}>
    {children}
  </div>
)

// Modal Footer component for actions
export const ModalFooter = ({
  children,
  className
}: {
  children: React.ReactNode
  className?: string
}) => (
  <div className={cn('flex items-center justify-end gap-3 mt-6 pt-4 border-t border-neutral-200/40', className)}>
    {children}
  </div>
)