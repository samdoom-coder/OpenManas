import { useEffect, useState } from 'react'
import { ExternalLink, Pencil, RefreshCw, Trash2, Check, X, Link2 } from 'lucide-react'
import type { Block } from '@/lib/types'
import { fetchLinkPreview, domainOf, isValidHttpUrl, normalizeUrl, type LinkPreview } from '@/lib/linkPreview'
import { cn } from '@/lib/utils'

// ---------------------------------------------------------------------------
// Presentational card — Notion-style link preview:
// [ cover image | favicon + title + description + url ]
// Works in light + dark mode via bg-card / muted tokens.
// ---------------------------------------------------------------------------

export function BookmarkCard({
  url,
  title,
  description,
  image,
  favicon,
  className,
}: {
  url: string
  title?: string
  description?: string
  image?: string
  favicon?: string
  className?: string
}) {
  const [imgOk, setImgOk] = useState(true)
  const [iconOk, setIconOk] = useState(true)
  const domain = domainOf(url)
  const displayTitle = (title || '').trim() || domain || url
  const displayDesc = (description || '').trim()
  const showCover = Boolean(image) && imgOk
  const showIcon = Boolean(favicon) && iconOk

  useEffect(() => {
    setImgOk(true)
    setIconOk(true)
  }, [image, favicon, url])

  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer noopener"
      className={cn(
        'group flex items-stretch overflow-hidden rounded-xl border bg-card text-left transition-colors',
        'hover:border-foreground/20 hover:bg-accent/40',
        className,
      )}
    >
      {/* Left cover */}
      {showCover ? (
        <div className="relative w-[180px] shrink-0 overflow-hidden border-r bg-muted sm:w-[220px]">
          <img
            src={image}
            alt=""
            loading="lazy"
            referrerPolicy="no-referrer"
            onError={() => setImgOk(false)}
            className="absolute inset-0 h-full w-full object-cover"
          />
        </div>
      ) : null}

      {/* Right body */}
      <div className="flex min-w-0 flex-1 flex-col justify-center gap-1 px-4 py-3.5">
        {showIcon ? (
          <img
            src={favicon}
            alt=""
            loading="lazy"
            referrerPolicy="no-referrer"
            onError={() => setIconOk(false)}
            className="mb-0.5 h-4 w-4 rounded-sm object-contain"
          />
        ) : null}
        <div className="truncate text-[15px] font-semibold leading-snug">{displayTitle}</div>
        {displayDesc ? (
          <div className="line-clamp-2 text-sm leading-snug text-muted-foreground">{displayDesc}</div>
        ) : null}
        <div className="mt-1.5 truncate text-[13px] text-muted-foreground/80">{url}</div>
      </div>

      {/* Hover open affordance */}
      <div className="hidden items-center pr-3 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 sm:flex">
        <ExternalLink size={15} />
      </div>
    </a>
  )
}

export function BookmarkCardSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn('flex items-stretch overflow-hidden rounded-xl border bg-card', className)}>
      <div className="w-[180px] shrink-0 animate-pulse bg-muted sm:w-[220px]" />
      <div className="flex-1 space-y-2 px-4 py-4">
        <div className="h-4 w-4 animate-pulse rounded bg-muted" />
        <div className="h-4 w-2/3 animate-pulse rounded bg-muted" />
        <div className="h-3 w-full animate-pulse rounded bg-muted" />
        <div className="h-3 w-1/2 animate-pulse rounded bg-muted" />
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Editor wrapper: fetches OG metadata, persists it to block.properties so the
// shared (read-only) view renders instantly, and hides the URL/title inputs
// behind an Edit toggle — the card itself is the default view.
// Stored properties: title, description, image, favicon, siteName
// (manual title/description edits are treated as overrides and win).
// ---------------------------------------------------------------------------

type SavedMeta = Partial<Pick<LinkPreview, 'title' | 'description' | 'image' | 'favicon' | 'siteName'>>

function savedMetaOf(block: Block): SavedMeta {
  const p = (block.properties || {}) as Record<string, unknown>
  return {
    title: typeof p.title === 'string' ? p.title : undefined,
    description: typeof p.description === 'string' ? p.description : undefined,
    image: typeof p.image === 'string' ? p.image : undefined,
    favicon: typeof p.favicon === 'string' ? p.favicon : undefined,
    siteName: typeof p.siteName === 'string' ? p.siteName : undefined,
  }
}

export function BookmarkBlockView({
  block,
  onChange,
  onDelete,
}: {
  block: Block
  onChange: (patch: Partial<Block>) => void
  onDelete?: () => void
}) {
  const url = (block.content || '').trim()
  const saved = savedMetaOf(block)
  const [editing, setEditing] = useState(!url)
  const [draftUrl, setDraftUrl] = useState(url)
  const [draftTitle, setDraftTitle] = useState(saved.title || '')
  const [draftDesc, setDraftDesc] = useState(saved.description || '')
  const [fetched, setFetched] = useState<LinkPreview | null>(null)
  const [loading, setLoading] = useState(false)

  // Keep drafts in sync when switching blocks / external updates.
  useEffect(() => {
    setDraftUrl(block.content || '')
    setDraftTitle((block.properties?.title as string) || '')
    setDraftDesc((block.properties?.description as string) || '')
    setEditing(!(block.content || '').trim())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [block.id])

  // Fetch preview whenever the URL changes.
  useEffect(() => {
    let live = true
    if (!url || !isValidHttpUrl(url)) {
      setFetched(null)
      setLoading(false)
      return
    }
    setLoading(true)
    fetchLinkPreview(url)
      .then((meta) => {
        if (!live) return
        setFetched(meta)
        setLoading(false)
        // Persist fetched meta so SharedPage renders without refetching.
        // Never overwrite a manual title/description override.
        const p = (block.properties || {}) as Record<string, unknown>
        const patch: Record<string, unknown> = {}
        if (!p.title && meta.title) patch.title = meta.title
        if (!p.description && meta.description) patch.description = meta.description
        if (meta.image && p.image !== meta.image) patch.image = meta.image
        if (meta.favicon && p.favicon !== meta.favicon) patch.favicon = meta.favicon
        if (meta.siteName && p.siteName !== meta.siteName) patch.siteName = meta.siteName
        if (Object.keys(patch).length > 0) onChange({ properties: { ...p, ...patch } })
      })
      .catch(() => {
        if (!live) return
        setLoading(false)
      })
    return () => {
      live = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url])

  const title = (saved.title || '').trim() || fetched?.title || domainOf(url)
  const description = (saved.description || '').trim() || fetched?.description || ''
  const image = (saved.image || fetched?.image || '') as string
  const favicon = (saved.favicon || fetched?.favicon || '') as string

  const saveUrl = () => {
    const next = normalizeUrl(draftUrl.trim())
    if (!next) return
    const p = (block.properties || {}) as Record<string, unknown>
    // URL changed → drop stale auto-fetched media so the new page's OG wins.
    const urlChanged = next !== url
    onChange({
      content: next,
      properties: urlChanged ? { ...p, image: '', favicon: '', siteName: '' } : p,
    })
    setEditing(false)
  }

  const saveMeta = () => {
    onChange({
      properties: { ...(block.properties || {}), title: draftTitle.trim(), description: draftDesc.trim() },
    })
    setEditing(false)
  }

  const refresh = async () => {
    if (!url) return
    setLoading(true)
    try {
      const meta = await fetchLinkPreview(url)
      // Force-refresh: fetched values win (clears stale overrides for media,
      // keeps manual title/desc only if user re-saves them).
      onChange({
        properties: {
          ...(block.properties || {}),
          title: (block.properties?.title as string) || meta.title,
          description: (block.properties?.description as string) || meta.description,
          image: meta.image,
          favicon: meta.favicon,
          siteName: meta.siteName,
        },
      })
      setFetched(meta)
      setDraftTitle((block.properties?.title as string) || meta.title)
      setDraftDesc((block.properties?.description as string) || meta.description)
    } finally {
      setLoading(false)
    }
  }

  // Empty state — no URL yet.
  if (!url) {
    return (
      <div className="rounded-xl border bg-card p-3">
        <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <Link2 size={15} /> Add a link to preview
        </div>
        <div className="mt-2 flex gap-2">
          <input
            autoFocus
            value={draftUrl}
            onChange={(e) => setDraftUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') saveUrl()
            }}
            placeholder="Paste a link…  https://"
            spellCheck={false}
            className="h-9 flex-1 rounded-lg border bg-background px-3 text-sm outline-none placeholder:text-muted-foreground focus:border-foreground/30"
          />
          <button
            onClick={saveUrl}
            disabled={!isValidHttpUrl(draftUrl)}
            className="h-9 rounded-lg bg-foreground px-3 text-sm font-medium text-background disabled:opacity-40"
          >
            Add
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="group/bookmark relative">
      {loading && !fetched && !saved.title && !saved.image ? (
        <BookmarkCardSkeleton />
      ) : (
        <BookmarkCard url={url} title={title} description={description} image={image} favicon={favicon} />
      )}

      {/* Hover toolbar — edit controls live here, not below the card */}
      {!editing && (
        <div className="absolute right-2 top-2 flex gap-1 opacity-0 transition-opacity group-hover/bookmark:opacity-100 focus-within:opacity-100">
          <button
            title="Edit link"
            onClick={() => {
              setDraftUrl(url)
              setDraftTitle((block.properties?.title as string) || fetched?.title || '')
              setDraftDesc((block.properties?.description as string) || fetched?.description || '')
              setEditing(true)
            }}
            className="rounded-lg border bg-background/95 p-1.5 shadow-sm hover:bg-accent"
          >
            <Pencil size={13} />
          </button>
          <button title="Refresh preview" onClick={refresh} className="rounded-lg border bg-background/95 p-1.5 shadow-sm hover:bg-accent">
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          </button>
          <button title="Open link" onClick={() => window.open(url, '_blank', 'noopener')} className="rounded-lg border bg-background/95 p-1.5 shadow-sm hover:bg-accent">
            <ExternalLink size={13} />
          </button>
          {onDelete && (
            <button title="Remove bookmark" onClick={onDelete} className="rounded-lg border bg-background/95 p-1.5 shadow-sm hover:bg-accent hover:text-red-500">
              <Trash2 size={13} />
            </button>
          )}
        </div>
      )}

      {editing && (
        <div className="mt-2 space-y-2 rounded-xl border bg-card p-3">
          <label className="block">
            <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Link</span>
            <input
              value={draftUrl}
              onChange={(e) => setDraftUrl(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') saveUrl()
                if (e.key === 'Escape') setEditing(false)
              }}
              placeholder="https://…"
              spellCheck={false}
              className="h-9 w-full rounded-lg border bg-background px-3 text-sm outline-none placeholder:text-muted-foreground focus:border-foreground/30"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Title <span className="normal-case text-muted-foreground/70">(optional override)</span>
            </span>
            <input
              value={draftTitle}
              onChange={(e) => setDraftTitle(e.target.value)}
              placeholder="Leave empty to use the site title"
              className="h-9 w-full rounded-lg border bg-background px-3 text-sm outline-none placeholder:text-muted-foreground focus:border-foreground/30"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Description <span className="normal-case text-muted-foreground/70">(optional override)</span>
            </span>
            <textarea
              value={draftDesc}
              onChange={(e) => setDraftDesc(e.target.value)}
              placeholder="Leave empty to use the site description"
              rows={2}
              className="w-full resize-none rounded-lg border bg-background px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus:border-foreground/30"
            />
          </label>
          <div className="flex items-center gap-2 pt-0.5">
            <button
              onClick={() => {
                // Save URL first if it changed, then meta overrides.
                const next = normalizeUrl(draftUrl.trim())
                const p = { ...(block.properties || {}), title: draftTitle.trim(), description: draftDesc.trim() } as Record<string, unknown>
                if (next && next !== url) {
                  onChange({ content: next, properties: { ...p, image: '', favicon: '', siteName: '' } })
                } else {
                  onChange({ properties: p })
                }
                setEditing(false)
              }}
              className="flex h-8 items-center gap-1.5 rounded-lg bg-foreground px-3 text-[13px] font-medium text-background"
            >
              <Check size={13} /> Done
            </button>
            <button
              onClick={() => {
                setDraftUrl(url)
                setDraftTitle((block.properties?.title as string) || '')
                setDraftDesc((block.properties?.description as string) || '')
                setEditing(false)
              }}
              className="flex h-8 items-center gap-1.5 rounded-lg border px-3 text-[13px] hover:bg-accent"
            >
              <X size={13} /> Cancel
            </button>
            <button onClick={saveMeta} className="ml-auto h-8 rounded-lg px-2 text-[13px] text-muted-foreground hover:bg-accent hover:text-foreground">
              Save title only
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
