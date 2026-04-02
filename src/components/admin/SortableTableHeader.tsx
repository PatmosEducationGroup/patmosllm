'use client'

interface SortableTableHeaderProps {
  label: string
  field: string
  currentSortField: string
  sortDirection: 'asc' | 'desc'
  onSort: (field: string) => void
}

export function SortableTableHeader({ label, field, currentSortField, sortDirection, onSort }: SortableTableHeaderProps) {
  const isActive = currentSortField === field

  return (
    <th
      onClick={() => onSort(field)}
      style={{
        padding: '8px 12px',
        textAlign: 'left',
        fontSize: '12px',
        fontWeight: '500',
        color: isActive ? '#2563eb' : '#64748b',
        textTransform: 'uppercase',
        cursor: 'pointer',
        userSelect: 'none'
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
        {label}
        {isActive && (
          <span style={{ fontSize: '10px' }}>{sortDirection === 'asc' ? '\u2191' : '\u2193'}</span>
        )}
      </div>
    </th>
  )
}

interface StaticTableHeaderProps {
  label: string
}

export function StaticTableHeader({ label }: StaticTableHeaderProps) {
  return (
    <th style={{
      padding: '8px 12px',
      textAlign: 'left',
      fontSize: '12px',
      fontWeight: '500',
      color: '#64748b',
      textTransform: 'uppercase'
    }}>
      {label}
    </th>
  )
}
