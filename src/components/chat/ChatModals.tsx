'use client'

import { Modal } from '@/components/ui/Modal'

// =================================================================
// FEEDBACK MODAL
// =================================================================
interface FeedbackModalProps {
  isOpen: boolean
  onClose: () => void
  form: {
    name: string
    email: string
    message: string
  }
  onInputChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void
  onSubmit: (e: React.FormEvent) => void
  isSubmitting: boolean
}

export function FeedbackModal({
  isOpen,
  onClose,
  form,
  onInputChange,
  onSubmit,
  isSubmitting
}: FeedbackModalProps) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Beta Feedback"
      size="md"
    >
      <div className="flex flex-col gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Name
          </label>
          <input
            type="text"
            name="name"
            value={form.name}
            onChange={onInputChange}
            required
            className="w-full p-4 bg-white/80 backdrop-blur-xl border border-neutral-200/60 rounded-xl text-sm outline-none transition-all duration-200 focus:border-primary-400 focus:ring-2 focus:ring-primary-400/50"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Email
          </label>
          <input
            type="email"
            name="email"
            value={form.email}
            onChange={onInputChange}
            required
            className="w-full p-4 bg-white/80 backdrop-blur-xl border border-neutral-200/60 rounded-xl text-sm outline-none transition-all duration-200 focus:border-primary-400 focus:ring-2 focus:ring-primary-400/50"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Feedback
          </label>
          <textarea
            name="message"
            value={form.message}
            onChange={onInputChange}
            required
            rows={4}
            placeholder="Share your thoughts, bugs you've found, or suggestions for improvement..."
            className="w-full p-4 bg-white/80 backdrop-blur-xl border border-neutral-200/60 rounded-xl text-sm outline-none resize-vertical transition-all duration-200 focus:border-primary-400 focus:ring-2 focus:ring-primary-400/50"
          />
        </div>

        <div className="flex gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 px-4 py-3 border border-slate-300 text-neutral-700 rounded-xl bg-white cursor-pointer text-sm font-medium transition-all duration-200 hover:bg-neutral-50"
          >
            Cancel
          </button>
          <button
            onClick={onSubmit}
            disabled={isSubmitting}
            className={`flex-1 px-4 py-3 rounded-xl border-none text-sm font-medium transition-all duration-200 ${
              isSubmitting
                ? 'bg-neutral-300 text-neutral-600 cursor-not-allowed'
                : 'bg-gradient-to-r from-primary-400 to-primary-600 text-white cursor-pointer hover:scale-105'
            }`}
          >
            {isSubmitting ? 'Sending...' : 'Send Feedback'}
          </button>
        </div>
      </div>
    </Modal>
  )
}

// =================================================================
// CONTACT MODAL
// =================================================================
interface ContactInfo {
  person: string
  email: string
  documentTitle: string
}

interface ContactModalProps {
  isOpen: boolean
  contactInfo: ContactInfo | null
  onClose: () => void
  form: {
    senderName: string
    senderEmail: string
    subject: string
    message: string
  }
  onFormChange: (field: string, value: string) => void
  onSubmit: (e: React.FormEvent) => void
  isSending: boolean
}

export function ContactModal({
  isOpen,
  contactInfo,
  onClose,
  form,
  onFormChange,
  onSubmit,
  isSending
}: ContactModalProps) {
  return (
    <Modal
      isOpen={isOpen && !!contactInfo}
      onClose={onClose}
      title={contactInfo ? `Contact ${contactInfo.person}` : 'Contact'}
      size="lg"
    >
      {contactInfo && (
        <>
          <p className="text-sm text-neutral-600 mb-6">
            Send a message about &ldquo;{contactInfo.documentTitle}&rdquo;
          </p>

          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-2 text-gray-700">
                  Your Name *
                </label>
                <input
                  type="text"
                  value={form.senderName}
                  onChange={(e) => onFormChange('senderName', e.target.value)}
                  required
                  className="w-full p-3 bg-white/80 border border-neutral-200/60 rounded-lg text-sm outline-none transition-all duration-200 focus:border-primary-400 focus:ring-2 focus:ring-primary-400/50"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2 text-gray-700">
                  Your Email *
                </label>
                <input
                  type="email"
                  value={form.senderEmail}
                  onChange={(e) => onFormChange('senderEmail', e.target.value)}
                  required
                  className="w-full p-3 bg-white/80 border border-neutral-200/60 rounded-lg text-sm outline-none transition-all duration-200 focus:border-primary-400 focus:ring-2 focus:ring-primary-400/50"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2 text-gray-700">
                Subject *
              </label>
              <input
                type="text"
                value={form.subject}
                onChange={(e) => onFormChange('subject', e.target.value)}
                required
                placeholder="Question about the document..."
                className="w-full p-3 bg-white/80 border border-neutral-200/60 rounded-lg text-sm outline-none transition-all duration-200 focus:border-primary-400 focus:ring-2 focus:ring-primary-400/50"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2 text-gray-700">
                Message *
              </label>
              <textarea
                value={form.message}
                onChange={(e) => onFormChange('message', e.target.value)}
                required
                rows={4}
                placeholder="Your question or comment..."
                className="w-full p-3 bg-white/80 border border-neutral-200/60 rounded-lg text-sm outline-none resize-vertical transition-all duration-200 focus:border-primary-400 focus:ring-2 focus:ring-primary-400/50"
              />
            </div>

            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={onClose}
                disabled={isSending}
                className={`px-4 py-3 text-sm text-neutral-600 bg-white border border-slate-300 rounded-lg transition-all duration-200 ${
                  isSending ? 'cursor-not-allowed' : 'cursor-pointer hover:bg-neutral-50'
                }`}
              >
                Cancel
              </button>
              <button
                onClick={onSubmit}
                disabled={isSending}
                className={`px-4 py-3 text-sm border-none rounded-lg transition-all duration-200 ${
                  isSending
                    ? 'bg-neutral-300 text-neutral-600 cursor-not-allowed'
                    : 'bg-gradient-to-r from-primary-400 to-primary-600 text-white cursor-pointer hover:scale-105'
                }`}
              >
                {isSending ? 'Sending...' : 'Send Message'}
              </button>
            </div>
          </div>
        </>
      )}
    </Modal>
  )
}
