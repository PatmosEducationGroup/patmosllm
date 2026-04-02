'use client'

interface SearchInputProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  width?: string
}

export function SearchInput({ value, onChange, placeholder = 'Search...', width = '220px' }: SearchInputProps) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
      <input
        type="text"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          padding: '6px 10px',
          borderRadius: '8px',
          border: '1px solid rgba(226, 232, 240, 0.6)',
          fontSize: '13px',
          backgroundColor: 'white',
          width
        }}
      />
      {value && (
        <button
          onClick={() => onChange('')}
          style={{
            padding: '6px 10px',
            borderRadius: '8px',
            border: 'none',
            backgroundColor: '#ef4444',
            color: 'white',
            fontSize: '12px',
            fontWeight: '500',
            cursor: 'pointer'
          }}
        >
          Clear
        </button>
      )}
    </div>
  )
}
