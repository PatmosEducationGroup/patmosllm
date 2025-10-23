'use client'

import { useState } from 'react'
import { Modal } from '@/components/ui/Modal'

interface WaitlistModalProps {
  isOpen: boolean
  onClose: () => void
}

export function WaitlistModal({ isOpen, onClose }: WaitlistModalProps) {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    church_ministry_affiliation: '',
    email_consent: false,
    sms_consent: false
  })
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitStatus, setSubmitStatus] = useState<'idle' | 'success' | 'error'>('idle')
  const [errorMessage, setErrorMessage] = useState('')

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target
    const checked = (e.target as HTMLInputElement).checked

    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }))
    // Clear error when user starts typing
    if (submitStatus === 'error') {
      setSubmitStatus('idle')
      setErrorMessage('')
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)
    setSubmitStatus('idle')
    setErrorMessage('')

    try {
      const response = await fetch('/api/waitlist', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      })

      const data = await response.json()

      if (response.ok && data.success) {
        setSubmitStatus('success')
        setFormData({ name: '', email: '', phone: '', church_ministry_affiliation: '', email_consent: false, sms_consent: false })
        // Auto-close after 3 seconds
        setTimeout(() => {
          onClose()
          setSubmitStatus('idle')
        }, 3000)
      } else {
        setSubmitStatus('error')
        setErrorMessage(data.error || 'Failed to join waitlist. Please try again.')
      }
    } catch (error) {
      console.error('Waitlist signup error:', error)
      setSubmitStatus('error')
      setErrorMessage('Something went wrong. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleClose = () => {
    if (!isSubmitting) {
      onClose()
      // Reset form after a short delay
      setTimeout(() => {
        setFormData({ name: '', email: '', phone: '', church_ministry_affiliation: '', email_consent: false, sms_consent: false })
        setSubmitStatus('idle')
        setErrorMessage('')
      }, 300)
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="Join Our Waitlist"
      size="md"
    >
      {submitStatus === 'success' ? (
        <div className="text-center py-8">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h3 className="text-xl font-semibold text-neutral-800 mb-2">
            You&apos;re on the list!
          </h3>
          <p className="text-neutral-600">
            We&apos;ll notify you when we&apos;re ready to send your invitation.
          </p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <p className="text-sm text-neutral-600 mb-2">
            Multiply Tools is currently in invitation-only mode. Sign up below to receive an invitation and be notified when the system opens to all sign-ups.
          </p>

          <div>
            <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-2">
              Name *
            </label>
            <input
              type="text"
              id="name"
              name="name"
              value={formData.name}
              onChange={handleInputChange}
              required
              disabled={isSubmitting}
              className="w-full p-4 bg-white/80 backdrop-blur-xl border border-neutral-200/60 rounded-xl text-sm outline-none transition-all duration-200 focus:border-primary-400 focus:ring-2 focus:ring-primary-400/50 disabled:bg-neutral-100 disabled:cursor-not-allowed"
              placeholder="John Doe"
            />
          </div>

          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
              Email Address *
            </label>
            <input
              type="email"
              id="email"
              name="email"
              value={formData.email}
              onChange={handleInputChange}
              required
              disabled={isSubmitting}
              className="w-full p-4 bg-white/80 backdrop-blur-xl border border-neutral-200/60 rounded-xl text-sm outline-none transition-all duration-200 focus:border-primary-400 focus:ring-2 focus:ring-primary-400/50 disabled:bg-neutral-100 disabled:cursor-not-allowed"
              placeholder="john@example.com"
            />
          </div>

          <div>
            <label htmlFor="phone" className="block text-sm font-medium text-gray-700 mb-2">
              Phone Number
            </label>
            <input
              type="tel"
              id="phone"
              name="phone"
              value={formData.phone}
              onChange={handleInputChange}
              disabled={isSubmitting}
              className="w-full p-4 bg-white/80 backdrop-blur-xl border border-neutral-200/60 rounded-xl text-sm outline-none transition-all duration-200 focus:border-primary-400 focus:ring-2 focus:ring-primary-400/50 disabled:bg-neutral-100 disabled:cursor-not-allowed"
              placeholder="+1 (555) 123-4567"
            />
            <p className="text-xs text-neutral-500 mt-1">Optional</p>
          </div>

          <div>
            <label htmlFor="church_ministry_affiliation" className="block text-sm font-medium text-gray-700 mb-2">
              Church / Ministry Affiliation
            </label>
            <input
              type="text"
              id="church_ministry_affiliation"
              name="church_ministry_affiliation"
              value={formData.church_ministry_affiliation}
              onChange={handleInputChange}
              disabled={isSubmitting}
              className="w-full p-4 bg-white/80 backdrop-blur-xl border border-neutral-200/60 rounded-xl text-sm outline-none transition-all duration-200 focus:border-primary-400 focus:ring-2 focus:ring-primary-400/50 disabled:bg-neutral-100 disabled:cursor-not-allowed"
              placeholder="First Baptist Church, City Mission, etc."
            />
            <p className="text-xs text-neutral-500 mt-1">Optional</p>
          </div>

          <div className="space-y-3 pt-2">
            <div className="flex items-start gap-3">
              <input
                type="checkbox"
                id="email_consent"
                name="email_consent"
                checked={formData.email_consent}
                onChange={handleInputChange}
                disabled={isSubmitting}
                required
                className="mt-1 w-4 h-4 text-primary-600 border-neutral-300 rounded focus:ring-primary-400 focus:ring-2 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              />
              <label htmlFor="email_consent" className="text-sm text-gray-700 cursor-pointer">
                I consent to receive emails from Multiply Tools about my waitlist status and product updates. <span className="text-red-500">*</span>
              </label>
            </div>

            <div className="flex items-start gap-3">
              <input
                type="checkbox"
                id="sms_consent"
                name="sms_consent"
                checked={formData.sms_consent}
                onChange={handleInputChange}
                disabled={isSubmitting}
                className="mt-1 w-4 h-4 text-primary-600 border-neutral-300 rounded focus:ring-primary-400 focus:ring-2 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              />
              <label htmlFor="sms_consent" className="text-sm text-gray-700 cursor-pointer">
                I consent to receive text messages from Multiply Tools about my waitlist status. (Optional)
              </label>
            </div>
          </div>

          {submitStatus === 'error' && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600">
              {errorMessage}
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={handleClose}
              disabled={isSubmitting}
              className="flex-1 px-4 py-3 border border-slate-300 text-neutral-700 rounded-xl bg-white cursor-pointer text-sm font-medium transition-all duration-200 hover:bg-neutral-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className={`flex-1 px-4 py-3 rounded-xl border-none text-sm font-medium transition-all duration-200 ${
                isSubmitting
                  ? 'bg-neutral-300 text-neutral-600 cursor-not-allowed'
                  : 'bg-gradient-to-r from-primary-400 to-primary-600 text-white cursor-pointer hover:scale-105'
              }`}
            >
              {isSubmitting ? 'Joining...' : 'Join Waitlist'}
            </button>
          </div>
        </form>
      )}
    </Modal>
  )
}
