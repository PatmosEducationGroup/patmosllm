import React from 'react'
import { cn } from '@/lib/utils'

interface AvatarProps extends React.HTMLAttributes<HTMLDivElement> {
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl'
  src?: string
  alt?: string
  name?: string
  fallback?: string
  status?: 'online' | 'offline' | 'away' | 'busy'
  showStatus?: boolean
}

const avatarSizes = {
  xs: 'h-6 w-6 text-xs',
  sm: 'h-8 w-8 text-sm',
  md: 'h-10 w-10 text-base',
  lg: 'h-12 w-12 text-lg',
  xl: 'h-16 w-16 text-xl',
  '2xl': 'h-20 w-20 text-2xl'
}

const statusSizes = {
  xs: 'h-1.5 w-1.5',
  sm: 'h-2 w-2',
  md: 'h-2.5 w-2.5',
  lg: 'h-3 w-3',
  xl: 'h-4 w-4',
  '2xl': 'h-5 w-5'
}

const statusColors = {
  online: 'bg-success-500',
  offline: 'bg-neutral-400',
  away: 'bg-warning-500',
  busy: 'bg-error-500'
}

const statusPositions = {
  xs: '-bottom-0 -right-0',
  sm: '-bottom-0 -right-0',
  md: '-bottom-0.5 -right-0.5',
  lg: '-bottom-0.5 -right-0.5',
  xl: '-bottom-1 -right-1',
  '2xl': '-bottom-1 -right-1'
}

function generateInitials(name: string): string {
  return name
    .split(' ')
    .map(word => word.charAt(0))
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

function generateColorFromName(name: string): string {
  const colors = [
    'bg-red-500',
    'bg-orange-500',
    'bg-amber-500',
    'bg-yellow-500',
    'bg-lime-500',
    'bg-green-500',
    'bg-emerald-500',
    'bg-teal-500',
    'bg-cyan-500',
    'bg-sky-500',
    'bg-blue-500',
    'bg-indigo-500',
    'bg-violet-500',
    'bg-purple-500',
    'bg-fuchsia-500',
    'bg-pink-500',
    'bg-rose-500'
  ]

  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash)
  }

  return colors[Math.abs(hash) % colors.length]
}

export const Avatar = React.forwardRef<HTMLDivElement, AvatarProps>(
  ({
    className,
    size = 'md',
    src,
    alt,
    name = '',
    fallback,
    status,
    showStatus = false,
    ...props
  }, ref) => {
    const [imageError, setImageError] = React.useState(false)
    const [imageLoaded, setImageLoaded] = React.useState(false)

    const displayFallback = fallback || (name ? generateInitials(name) : '?')
    const fallbackColor = name ? generateColorFromName(name) : 'bg-neutral-500'

    React.useEffect(() => {
      setImageError(false)
      setImageLoaded(false)
    }, [src])

    return (
      <div
        ref={ref}
        className={cn(
          'relative inline-flex shrink-0 select-none items-center justify-center',
          'rounded-full font-medium text-white',
          avatarSizes[size],
          className
        )}
        {...props}
      >
        {src && !imageError ? (
          <>
            {!imageLoaded && (
              <div className={cn(
                'absolute inset-0 rounded-full animate-pulse bg-neutral-200'
              )} />
            )}
            <img
              src={src}
              alt={alt || name || 'Avatar'}
              className={cn(
                'h-full w-full rounded-full object-cover transition-opacity duration-200',
                imageLoaded ? 'opacity-100' : 'opacity-0'
              )}
              onLoad={() => setImageLoaded(true)}
              onError={() => setImageError(true)}
            />
          </>
        ) : (
          <div className={cn(
            'flex h-full w-full items-center justify-center rounded-full font-semibold',
            fallbackColor
          )}>
            {displayFallback}
          </div>
        )}

        {showStatus && status && (
          <span
            className={cn(
              'absolute rounded-full border-2 border-white',
              statusSizes[size],
              statusColors[status],
              statusPositions[size]
            )}
            aria-label={`Status: ${status}`}
          />
        )}
      </div>
    )
  }
)

Avatar.displayName = 'Avatar'

interface AvatarGroupProps extends React.HTMLAttributes<HTMLDivElement> {
  max?: number
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl'
  children: React.ReactNode
}

export const AvatarGroup = React.forwardRef<HTMLDivElement, AvatarGroupProps>(
  ({
    className,
    max = 5,
    size = 'md',
    children,
    ...props
  }, ref) => {
    const childrenArray = React.Children.toArray(children)
    const displayChildren = childrenArray.slice(0, max)
    const remainingCount = childrenArray.length - max

    const spacingClasses = {
      xs: '-space-x-1',
      sm: '-space-x-1.5',
      md: '-space-x-2',
      lg: '-space-x-2.5',
      xl: '-space-x-3',
      '2xl': '-space-x-4'
    }

    return (
      <div
        ref={ref}
        className={cn(
          'flex items-center',
          spacingClasses[size],
          className
        )}
        {...props}
      >
        {displayChildren.map((child, index) => {
          const element = child as React.ReactElement<Record<string, unknown>>;
          return React.cloneElement(element, {
            key: index,
            ...element.props,
            className: cn(
              'border-2 border-white',
              element.props.className as string
            )
          });
        })}

        {remainingCount > 0 && (
          <Avatar
            size={size}
            fallback={`+${remainingCount}`}
            className="border-2 border-white bg-neutral-500"
          />
        )}
      </div>
    )
  }
)

AvatarGroup.displayName = 'AvatarGroup'