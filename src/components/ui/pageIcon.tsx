import * as Lucide from 'lucide-react'
import { FileText } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Page } from '@/lib/types'

export type PageIconType = 'emoji' | 'lucide' | 'custom' | 'none'

export interface PageIconValue {
  icon?: string
  iconType?: PageIconType
  customIcon?: string
}

/** Resolve legacy pages where only `icon` (emoji char) exists. */
export function resolveIconType(page: PageIconValue): PageIconType {
  if (page.iconType) return page.iconType
  if (page.customIcon) return 'custom'
  if (!page.icon) return 'none'
  // lucide names are ASCII PascalCase without spaces; emojis are non-ascii
  if (/^[A-Za-z][A-Za-z0-9]*$/.test(page.icon)) return 'lucide'
  return 'emoji'
}

export function LucideIcon({ name, size = 16, className }: { name: string; size?: number; className?: string }) {
  const Cmp = (Lucide as Record<string, unknown>)[name] as React.ComponentType<{ size?: number; className?: string }> | undefined
  if (!Cmp) return <FileText size={size} className={className} />
  return <Cmp size={size} className={className} />
}

/**
 * Single place to render a page/database icon.
 * Handles: emoji | lucide icon | custom uploaded image | fallback.
 */
export function PageIcon({
  page,
  size = 'md',
  className,
}: {
  page: PageIconValue | Page
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl'
  className?: string
}) {
  const type = resolveIconType(page as PageIconValue)
  const dims =
    size === 'xs'
      ? 'w-4 h-4 text-[10px]'
      : size === 'sm'
        ? 'w-6 h-6 text-sm'
        : size === 'md'
          ? 'w-8 h-8 text-lg'
          : size === 'lg'
            ? 'w-10 h-10 text-2xl'
            : 'w-14 h-14 text-4xl'

  if (type === 'custom' && (page as PageIconValue).customIcon) {
    return (
      <span className={cn('grid place-items-center overflow-hidden rounded-lg bg-muted shrink-0', dims, className)}>
        <img
          src={(page as PageIconValue).customIcon}
          alt="page icon"
          className="w-full h-full object-cover"
          draggable={false}
        />
      </span>
    )
  }

  if (type === 'lucide' && page.icon) {
    return (
      <span className={cn('grid place-items-center rounded-lg bg-violet-500/10 text-violet-600 dark:text-violet-300 shrink-0', dims, className)}>
        <LucideIcon name={page.icon} size={size === 'xl' || size === 'lg' ? 22 : 16} />
      </span>
    )
  }

  if (type === 'emoji' && page.icon) {
    return (
      <span className={cn('grid place-items-center shrink-0 leading-none', dims, className)} role="img" aria-label="page icon">
        {page.icon}
      </span>
    )
  }

  return (
    <span className={cn('grid place-items-center rounded-lg bg-muted text-muted-foreground shrink-0', dims, className)}>
      <FileText size={size === 'xs' ? 10 : 14} />
    </span>
  )
}

/** Small inline variant (no background box) for breadcrumbs / titles / sidebar rows. */
export function PageIconInline({ page, className }: { page: PageIconValue | Page; className?: string }) {
  const type = resolveIconType(page as PageIconValue)
  if (type === 'custom' && (page as PageIconValue).customIcon) {
    return (
      <img
        src={(page as PageIconValue).customIcon}
        alt=""
        draggable={false}
        className={cn('w-4 h-4 rounded object-cover inline-block shrink-0', className)}
      />
    )
  }
  if (type === 'lucide' && page.icon) {
    return (
      <span className={cn('inline-flex items-center shrink-0', className)}>
        <LucideIcon name={page.icon} size={13} />
      </span>
    )
  }
  if (type === 'emoji' && page.icon) {
    return (
      <span className={cn('inline-block shrink-0', className)} role="img" aria-label="page icon">
        {page.icon}
      </span>
    )
  }
  return (
    <span className={cn('inline-flex items-center text-muted-foreground shrink-0', className)}>
      <FileText size={12} />
    </span>
  )
}
