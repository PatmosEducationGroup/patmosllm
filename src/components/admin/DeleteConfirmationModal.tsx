'use client'

import { AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'

interface DeleteConfirmationModalProps {
  isOpen: boolean
  onClose: () => void
  onDelete: () => void
  title: string
  itemName: string
  warnings?: string[]
}

export function DeleteConfirmationModal({
  isOpen,
  onClose,
  onDelete,
  title,
  itemName,
  warnings = [
    'The document file will be permanently removed',
    'All associated chat history will remain but lose document references',
    'Vector embeddings will be deleted from the search index',
    'This cannot be undone'
  ]
}: DeleteConfirmationModalProps) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      size="md"
    >
      <div className="space-y-4">
        <div className="flex items-start space-x-3">
          <AlertCircle className="h-6 w-6 text-red-500 flex-shrink-0 mt-1" />
          <div>
            <p className="text-sm text-gray-900">
              Are you sure you want to <strong>permanently delete</strong> <strong>&ldquo;{itemName}&rdquo;</strong>?
            </p>
            <ul className="mt-3 text-sm text-gray-600 space-y-1">
              {warnings.map((warning, i) => (
                <li key={i}>&bull; {warning}</li>
              ))}
            </ul>
          </div>
        </div>

        <div className="bg-red-50 border border-red-200 rounded-md p-3">
          <p className="text-sm text-red-800">
            <strong>Warning:</strong> This action is permanent and cannot be reversed.
          </p>
        </div>

        <div className="flex justify-end space-x-3 pt-4">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={onDelete}>
            {title}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
