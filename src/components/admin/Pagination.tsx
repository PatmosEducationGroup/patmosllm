'use client'

export interface PaginationData {
  page: number
  limit: number
  total: number
  totalPages: number
}

interface PaginationProps {
  pagination: PaginationData
  currentPage: number
  onPageChange: (page: number) => void
  itemLabel?: string
}

export function Pagination({ pagination, currentPage, onPageChange, itemLabel = 'items' }: PaginationProps) {
  if (pagination.totalPages <= 1) return null

  return (
    <div style={{
      padding: '16px 24px',
      borderTop: '1px solid rgba(226, 232, 240, 0.4)',
      backgroundColor: 'rgba(248, 250, 252, 0.5)',
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center'
    }}>
      <div style={{ fontSize: '14px', color: '#64748b' }}>
        Showing {((pagination.page - 1) * pagination.limit) + 1} to{' '}
        {Math.min(pagination.page * pagination.limit, pagination.total)} of{' '}
        {pagination.total} {itemLabel}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <button
          onClick={() => onPageChange(Math.max(1, currentPage - 1))}
          disabled={currentPage === 1}
          style={{
            padding: '6px 12px',
            fontSize: '14px',
            color: currentPage === 1 ? '#9ca3af' : '#374151',
            backgroundColor: 'white',
            border: '1px solid rgba(226, 232, 240, 0.6)',
            borderRadius: '6px',
            cursor: currentPage === 1 ? 'not-allowed' : 'pointer',
            opacity: currentPage === 1 ? 0.6 : 1
          }}
        >
          Previous
        </button>

        <div style={{ display: 'flex', gap: '4px' }}>
          {Array.from({ length: Math.min(7, pagination.totalPages) }, (_, i) => {
            let pageNumber: number
            const totalPages = pagination.totalPages

            if (totalPages <= 7) {
              pageNumber = i + 1
            } else if (currentPage <= 4) {
              pageNumber = i + 1
            } else if (currentPage >= totalPages - 3) {
              pageNumber = totalPages - 6 + i
            } else {
              pageNumber = currentPage - 3 + i
            }

            return (
              <button
                key={pageNumber}
                onClick={() => onPageChange(pageNumber)}
                style={{
                  padding: '6px 10px',
                  fontSize: '14px',
                  fontWeight: '500',
                  color: currentPage === pageNumber ? 'white' : '#374151',
                  backgroundColor: currentPage === pageNumber ? 'rgb(130, 179, 219)' : 'white',
                  border: '1px solid rgba(226, 232, 240, 0.6)',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  minWidth: '36px'
                }}
                onMouseEnter={(e) => {
                  if (currentPage !== pageNumber) {
                    e.currentTarget.style.backgroundColor = 'rgba(130, 179, 219, 0.1)'
                  }
                }}
                onMouseLeave={(e) => {
                  if (currentPage !== pageNumber) {
                    e.currentTarget.style.backgroundColor = 'white'
                  }
                }}
              >
                {pageNumber}
              </button>
            )
          })}
        </div>

        <button
          onClick={() => onPageChange(Math.min(pagination.totalPages, currentPage + 1))}
          disabled={currentPage === pagination.totalPages}
          style={{
            padding: '6px 12px',
            fontSize: '14px',
            color: currentPage === pagination.totalPages ? '#9ca3af' : '#374151',
            backgroundColor: 'white',
            border: '1px solid rgba(226, 232, 240, 0.6)',
            borderRadius: '6px',
            cursor: currentPage === pagination.totalPages ? 'not-allowed' : 'pointer',
            opacity: currentPage === pagination.totalPages ? 0.6 : 1
          }}
        >
          Next
        </button>
      </div>
    </div>
  )
}
