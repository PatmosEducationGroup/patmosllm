/**
 * Shared utility functions for admin pages
 */

export function formatFileSize(bytes: number | null | undefined): string {
  if (!bytes || isNaN(bytes)) return 'Unknown size'
  const sizes = ['Bytes', 'KB', 'MB', 'GB']
  if (bytes === 0) return '0 Bytes'
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i]
}

export function formatDate(dateString: string | null | undefined): string {
  if (!dateString) return 'Unknown date'
  const date = new Date(dateString)
  if (isNaN(date.getTime())) return 'Invalid date'
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

export function getStatusColor(status: string) {
  switch (status) {
    case 'completed':
      return { bg: '#f0fdf4', color: '#16a34a', text: '#16a34a', dot: '#16a34a' }
    case 'processing':
      return { bg: '#fef3c7', color: '#d97706', text: '#d97706', dot: '#d97706' }
    case 'failed':
      return { bg: '#fef2f2', color: '#dc2626', text: '#dc2626', dot: '#dc2626' }
    default:
      return { bg: '#f3f4f6', color: '#6b7280', text: '#6b7280', dot: '#6b7280' }
  }
}
