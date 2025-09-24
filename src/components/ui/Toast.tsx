import React, { createContext, useContext, useState, useEffect, useRef } from 'react'
import { X, CheckCircle, AlertCircle, AlertTriangle, Info } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface Toast {
  id: string
  type: 'success' | 'error' | 'warning' | 'info'
  title?: string
  message: string
  duration?: number
  action?: {
    label: string
    onClick: () => void
  }
  closable?: boolean
}

interface ToastContextType {
  toasts: Toast[]
  addToast: (toast: Omit<Toast, 'id'>) => string
  removeToast: (id: string) => void
  clearAllToasts: () => void
}

const ToastContext = createContext<ToastContextType | null>(null)

export const useToast = () => {
  const context = useContext(ToastContext)
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider')
  }
  return context
}

// Toast Provider Component
export const ToastProvider = ({ children }: { children: React.ReactNode }) => {
  const [toasts, setToasts] = useState<Toast[]>([])
  const toastTimeouts = useRef<Map<string, NodeJS.Timeout>>(new Map())

  const addToast = (toast: Omit<Toast, 'id'>): string => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    const newToast: Toast = {
      ...toast,
      id,
      duration: toast.duration ?? 5000,
      closable: toast.closable ?? true
    }

    setToasts(prev => [...prev, newToast])

    // Auto-dismiss if duration is specified and > 0
    if (newToast.duration && newToast.duration > 0) {
      const timeout = setTimeout(() => {
        removeToast(id)
      }, newToast.duration)

      toastTimeouts.current.set(id, timeout)
    }

    return id
  }

  const removeToast = (id: string) => {
    // Clear any existing timeout
    const timeout = toastTimeouts.current.get(id)
    if (timeout) {
      clearTimeout(timeout)
      toastTimeouts.current.delete(id)
    }

    setToasts(prev => prev.filter(toast => toast.id !== id))
  }

  const clearAllToasts = () => {
    // Clear all timeouts
    toastTimeouts.current.forEach(timeout => clearTimeout(timeout))
    toastTimeouts.current.clear()

    setToasts([])
  }

  // Cleanup timeouts on unmount
  useEffect(() => {
    return () => {
      toastTimeouts.current.forEach(timeout => clearTimeout(timeout))
      toastTimeouts.current.clear()
    }
  }, [])

  const value = {
    toasts,
    addToast,
    removeToast,
    clearAllToasts
  }

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastContainer />
    </ToastContext.Provider>
  )
}

// Toast Container Component
const ToastContainer = () => {
  const { toasts } = useToast()

  if (toasts.length === 0) return null

  return (
    <div
      className="fixed top-4 right-4 z-[100] flex flex-col gap-2 max-w-sm w-full"
      aria-live="polite"
      aria-label="Notifications"
    >
      {toasts.map((toast, index) => (
        <ToastComponent
          key={toast.id}
          toast={toast}
          index={index}
        />
      ))}
    </div>
  )
}

// Individual Toast Component
const ToastComponent = ({ toast, index }: { toast: Toast; index: number }) => {
  const { removeToast } = useToast()
  const [isVisible, setIsVisible] = useState(false)
  const [isExiting, setIsExiting] = useState(false)
  const timeoutRef = useRef<NodeJS.Timeout>()

  // Animate in on mount
  useEffect(() => {
    const timer = setTimeout(() => setIsVisible(true), 50)
    return () => clearTimeout(timer)
  }, [])

  // Handle pause on hover
  const handleMouseEnter = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
    }
  }

  const handleMouseLeave = () => {
    if (toast.duration && toast.duration > 0) {
      timeoutRef.current = setTimeout(() => {
        handleRemove()
      }, 1000) // Resume with 1 second delay
    }
  }

  const handleRemove = () => {
    setIsExiting(true)
    setTimeout(() => {
      removeToast(toast.id)
    }, 200) // Animation duration
  }

  const getToastIcon = () => {
    const iconClass = "w-5 h-5"

    switch (toast.type) {
      case 'success':
        return <CheckCircle className={cn(iconClass, "text-green-600")} />
      case 'error':
        return <AlertCircle className={cn(iconClass, "text-red-600")} />
      case 'warning':
        return <AlertTriangle className={cn(iconClass, "text-amber-600")} />
      case 'info':
        return <Info className={cn(iconClass, "text-blue-600")} />
      default:
        return <Info className={cn(iconClass, "text-neutral-600")} />
    }
  }

  const getToastStyles = () => {
    const baseClasses = "border-l-4"

    switch (toast.type) {
      case 'success':
        return cn(baseClasses, "border-green-500 bg-green-50/95")
      case 'error':
        return cn(baseClasses, "border-red-500 bg-red-50/95")
      case 'warning':
        return cn(baseClasses, "border-amber-500 bg-amber-50/95")
      case 'info':
        return cn(baseClasses, "border-blue-500 bg-blue-50/95")
      default:
        return cn(baseClasses, "border-neutral-500 bg-white/95")
    }
  }

  return (
    <div
      className={cn(
        'backdrop-blur-xl border border-neutral-200/40 rounded-xl shadow-2xl p-4 transition-all duration-200 transform',
        getToastStyles(),
        isVisible && !isExiting ? 'translate-x-0 opacity-100 scale-100' : 'translate-x-full opacity-0 scale-95',
        isExiting && 'animate-out slide-out-to-right duration-200'
      )}
      style={{
        '--toast-index': index
      } as React.CSSProperties}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      role="alert"
      aria-live="assertive"
    >
      <div className="flex items-start gap-3">
        {getToastIcon()}

        <div className="flex-1 min-w-0">
          {toast.title && (
            <div className="font-medium text-neutral-800 mb-1">
              {toast.title}
            </div>
          )}
          <div className="text-sm text-neutral-700">
            {toast.message}
          </div>

          {toast.action && (
            <button
              onClick={toast.action.onClick}
              className="mt-2 text-xs font-medium text-primary-600 hover:text-primary-700 transition-colors duration-200"
            >
              {toast.action.label}
            </button>
          )}
        </div>

        {toast.closable && (
          <button
            onClick={handleRemove}
            className="flex-shrink-0 p-1 text-neutral-400 hover:text-neutral-600 transition-colors duration-200 rounded-lg hover:bg-neutral-100"
            aria-label="Close notification"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Progress bar for auto-dismiss toasts */}
      {toast.duration && toast.duration > 0 && (
        <div className="absolute bottom-0 left-0 right-0 h-1 bg-neutral-200 rounded-b-xl overflow-hidden">
          <div
            className={cn(
              'h-full transition-all ease-linear',
              toast.type === 'success' ? 'bg-green-500' :
              toast.type === 'error' ? 'bg-red-500' :
              toast.type === 'warning' ? 'bg-amber-500' :
              toast.type === 'info' ? 'bg-blue-500' : 'bg-neutral-500'
            )}
            style={{
              width: '100%',
              animation: `toast-progress ${toast.duration}ms linear forwards`
            }}
          />
        </div>
      )}
    </div>
  )
}

// Convenience hook for common toast types
export const useToastActions = () => {
  const { addToast } = useToast()

  return {
    success: (message: string, options?: Partial<Omit<Toast, 'id' | 'type' | 'message'>>) =>
      addToast({ type: 'success', message, ...options }),

    error: (message: string, options?: Partial<Omit<Toast, 'id' | 'type' | 'message'>>) =>
      addToast({ type: 'error', message, duration: 8000, ...options }),

    warning: (message: string, options?: Partial<Omit<Toast, 'id' | 'type' | 'message'>>) =>
      addToast({ type: 'warning', message, duration: 6000, ...options }),

    info: (message: string, options?: Partial<Omit<Toast, 'id' | 'type' | 'message'>>) =>
      addToast({ type: 'info', message, ...options }),

    promise: <T,>(
      promise: Promise<T>,
      {
        loading,
        success,
        error
      }: {
        loading: string
        success: string | ((data: T) => string)
        error: string | ((error: Error) => string)
      }
    ) => {
      const toastId = addToast({
        type: 'info',
        message: loading,
        duration: 0,
        closable: false
      })

      promise
        .then((data) => {
          const successMessage = typeof success === 'function' ? success(data) : success
          addToast({ type: 'success', message: successMessage })
        })
        .catch((err) => {
          const errorMessage = typeof error === 'function' ? error(err) : error
          addToast({ type: 'error', message: errorMessage, duration: 8000 })
        })
        .finally(() => {
          // Remove loading toast
          setTimeout(() => removeToast(toastId), 100)
        })

      return promise
    }
  }
}

// CSS for progress bar animation (add to your global CSS)
const toastStyles = `
@keyframes toast-progress {
  from {
    width: 100%;
  }
  to {
    width: 0%;
  }
}
`

// Export the styles for global CSS injection
export const TOAST_STYLES = toastStyles