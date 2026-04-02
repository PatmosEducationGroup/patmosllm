'use client'

interface PageSizeSelectorProps {
  pageSize: number
  onPageSizeChange: (size: number) => void
  sizes?: number[]
}

export function PageSizeSelector({ pageSize, onPageSizeChange, sizes = [20, 50, 100] }: PageSizeSelectorProps) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
      <span style={{ fontSize: '12px', color: '#64748b' }}>Show:</span>
      {sizes.map(size => (
        <button
          key={size}
          onClick={() => onPageSizeChange(size)}
          style={{
            fontSize: '12px',
            fontWeight: '500',
            color: pageSize === size ? 'white' : '#64748b',
            backgroundColor: pageSize === size ? 'rgb(130, 179, 219)' : 'transparent',
            border: '1px solid rgba(226, 232, 240, 0.6)',
            padding: '4px 8px',
            borderRadius: '4px',
            cursor: 'pointer',
            transition: 'all 0.2s'
          }}
          onMouseEnter={(e) => {
            if (pageSize !== size) {
              e.currentTarget.style.backgroundColor = 'rgba(130, 179, 219, 0.1)'
            }
          }}
          onMouseLeave={(e) => {
            if (pageSize !== size) {
              e.currentTarget.style.backgroundColor = 'transparent'
            }
          }}
        >
          {size}
        </button>
      ))}
    </div>
  )
}
