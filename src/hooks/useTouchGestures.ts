'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { SWIPE_THRESHOLD, SIDEBAR_WIDTH } from '@/lib/chatUtils'

interface UseTouchGesturesReturn {
  sidebarOpen: boolean
  setSidebarOpen: (open: boolean) => void
  toggleSidebar: () => void
  // Touch handlers for elements that need swipe detection
  handleTouchStart: (e: React.TouchEvent) => void
  handleTouchMove: (e: React.TouchEvent) => void
  handleTouchEnd: () => void
}

interface TouchState {
  startX: number
  startY: number
  currentX: number
  isDragging: boolean
}

export function useTouchGestures(): UseTouchGesturesReturn {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const touchStateRef = useRef<TouchState>({
    startX: 0,
    startY: 0,
    currentX: 0,
    isDragging: false
  })

  const toggleSidebar = useCallback(() => {
    setSidebarOpen(prev => !prev)
  }, [])

  // Global edge swipe detection (swipe from left edge opens sidebar)
  useEffect(() => {
    let startX = 0
    let startY = 0

    const handleTouchStart = (e: TouchEvent) => {
      startX = e.touches[0].clientX
      startY = e.touches[0].clientY
    }

    const handleTouchMove = (e: TouchEvent) => {
      if (!startX || !startY) return

      const currentX = e.touches[0].clientX
      const currentY = e.touches[0].clientY
      const diffX = currentX - startX
      const diffY = currentY - startY

      // Check if horizontal swipe is more significant than vertical
      if (Math.abs(diffX) > Math.abs(diffY)) {
        // Swipe from left edge (within 30px) opens sidebar
        if (startX < 30 && diffX > SWIPE_THRESHOLD && !sidebarOpen) {
          setSidebarOpen(true)
        }
        // Swipe left anywhere closes sidebar
        if (diffX < -SWIPE_THRESHOLD && sidebarOpen) {
          setSidebarOpen(false)
        }
      }
    }

    const handleTouchEnd = () => {
      startX = 0
      startY = 0
    }

    document.addEventListener('touchstart', handleTouchStart, { passive: true })
    document.addEventListener('touchmove', handleTouchMove, { passive: true })
    document.addEventListener('touchend', handleTouchEnd, { passive: true })

    return () => {
      document.removeEventListener('touchstart', handleTouchStart)
      document.removeEventListener('touchmove', handleTouchMove)
      document.removeEventListener('touchend', handleTouchEnd)
    }
  }, [sidebarOpen])

  // Element-level touch handlers for components that need them
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStateRef.current = {
      startX: e.touches[0].clientX,
      startY: e.touches[0].clientY,
      currentX: e.touches[0].clientX,
      isDragging: true
    }
  }, [])

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!touchStateRef.current.isDragging) return
    touchStateRef.current.currentX = e.touches[0].clientX
  }, [])

  const handleTouchEnd = useCallback(() => {
    const { startX, currentX, isDragging } = touchStateRef.current
    if (!isDragging) return

    const diffX = currentX - startX

    // Close sidebar on swipe left
    if (diffX < -SWIPE_THRESHOLD && sidebarOpen) {
      setSidebarOpen(false)
    }
    // Open sidebar on swipe right (from sidebar area)
    if (diffX > SWIPE_THRESHOLD && !sidebarOpen && startX < SIDEBAR_WIDTH) {
      setSidebarOpen(true)
    }

    touchStateRef.current.isDragging = false
  }, [sidebarOpen])

  return {
    sidebarOpen,
    setSidebarOpen,
    toggleSidebar,
    handleTouchStart,
    handleTouchMove,
    handleTouchEnd
  }
}
