// Public shared page — read-only view for invite-link holders.
// No session required: loads via the token-bypass API (?token=). Nothing here
// touches the local store or writes to the server; a sign-in CTA is offered
// for commenting/editing. Writes via link remain auth-gated by design.

import { useEffect, useState } from 'react'
import { fetchSharedBlocks, fetchSharedPage, resolveShareToken } from '@/lib/sync'
import { stripHtml } from '@/lib/versions'
import type { Block, Page } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { BookmarkCard } from '@/components/editor/BookmarkCard'
import { fetchLinkPreview } from '@/lib/linkPreview'

export function SharedPage({ token, onSignIn }: { token: string; onSignIn: () => void }) {
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [error, setError] = useState('')
  const [page, setPage] = useState<Page | null>(null)
  const [blocks, setBlocks] = useState<Block[]>([])
  const [permission, setPermission] = useState('view')

  useEffect(() => {
    let live = true
    setStatus('loading')
    setError('')
    ;(async () => {
      try {
        const meta = await resolveShareToken(token)
        const [p, bs] = await Promise.all([fetchSharedPage(meta.pageId, token), fetchSharedBlocks(meta.pageId, token)])
        if (!live) return
        setPage(p as Page)
        setBlocks((Array.isArray(bs) ? bs : []).sort((a, b) => a.position - b.position))
        setPermission(meta.permission ?? 'view')
        setStatus('ready')
      } catch (e) {
        if (!live) return
        setError(e instanceof Error ? e.message : 'Could not open this link.')
        setStatus('error')
      }
    })()
    return () => { live = false }
  }, [token])

  if (status === 'loading') {
    return (
      <div className="max-w-[760px] mx-auto p-6 md:p-10">
        <div className="animate-pulse space-y-4">
          <div className="h-8 w-2/3 rounded-xl bg-muted" />
          <div className="h-4 w-full rounded-lg bg-muted" />
          <div className="h-4 w-5/6 rounded-lg bg-muted" />
          <div className="h-4 w-4/6 rounded-lg bg-muted" />
        </div>
      </div>
    )
  }

  if (status === 'error' || !page) {
    return (
      <div className="max-w-[560px] mx-auto p-6 md:p-10 text-center">
        <div className="rounded-2xl border bg-card p-8">
          <div className="text-4xl">🔗</div>
          <h1 className="text-xl font-bold mt-3">This link didn’t work</h1>
          <p className="text-sm text-muted-foreground mt-2">{error || 'The link may have been revoked or expired.'}</p>
          <Button className="mt-5" onClick={onSignIn}>Go to sign in</Button>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-[760px] mx-auto p-6 md:p-10 pb-20">
      <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
        <span className="px-2 py-0.5 rounded-full border bg-card capitalize">Shared • can {permission}</span>
        <span className="ml-auto">Read-only preview</span>
      </div>
      <h1 className="text-3xl md:text-4xl font-bold mt-3 tracking-tight">
        {page.icon ? <span className="mr-2">{page.icon}</span> : null}{page.title || 'Untitled'}
      </h1>
      {page.description ? <p className="text-muted-foreground mt-2">{page.description}</p> : null}
      <div className="mt-6 space-y-1">
        {blocks.length === 0 && (
          <p className="text-sm text-muted-foreground border border-dashed rounded-xl px-4 py-8 text-center">This page has no content yet.</p>
        )}
        {blocks.map((b) => <SharedBlock key={b.id} block={b} />)}
      </div>
      <div className="mt-10 rounded-2xl border bg-card p-5 flex flex-col sm:flex-row sm:items-center gap-3">
        <p className="text-sm text-muted-foreground flex-1">Want to comment or edit? Sign in to join this workspace.</p>
        <Button onClick={onSignIn}>Sign in</Button>
      </div>
    </div>
  )
}

function html(content: string) {
  return { __html: content || '' }
}

function SharedBlock({ block }: { block: Block }) {
  const text = stripHtml(block.content ?? '')
  switch (block.type) {
    case 'heading1':
      return <h1 className="text-2xl font-bold pt-4 pb-1" dangerouslySetInnerHTML={html(block.content)} />
    case 'heading2':
      return <h2 className="text-xl font-bold pt-3 pb-1" dangerouslySetInnerHTML={html(block.content)} />
    case 'heading3':
      return <h3 className="text-lg font-semibold pt-2 pb-1" dangerouslySetInnerHTML={html(block.content)} />
    case 'bulleted_list':
      return <ul className="list-disc pl-6 py-0.5"><li dangerouslySetInnerHTML={html(block.content)} /></ul>
    case 'numbered_list':
      return <ol className="list-decimal pl-6 py-0.5"><li dangerouslySetInnerHTML={html(block.content)} /></ol>
    case 'todo': {
      const checked = Boolean((block.properties as any)?.checked)
      return (
        <div className="flex items-start gap-2.5 py-1">
          <input type="checkbox" checked={checked} readOnly className="mt-1" aria-label={checked ? 'Done' : 'Not done'} />
          <span className={`flex-1 ${checked ? 'line-through text-muted-foreground' : ''}`} dangerouslySetInnerHTML={html(block.content)} />
        </div>
      )
    }
    case 'quote':
      return <blockquote className="border-l-2 pl-4 py-1 my-1 text-muted-foreground italic" dangerouslySetInnerHTML={html(block.content)} />
    case 'code':
      return <pre className="rounded-xl bg-muted p-3 text-xs font-mono overflow-auto my-2">{text}</pre>
    case 'callout':
      return <div className="rounded-xl border bg-amber-500/10 border-amber-500/30 px-4 py-3 my-2" dangerouslySetInnerHTML={html(block.content)} />
    case 'divider':
      return <hr className="my-4" />
    case 'image':
      return block.content ? (
        <div className="rounded-xl overflow-hidden border bg-muted my-2">
          <img src={block.content} alt="" className="max-h-[400px] w-full object-contain bg-white" onError={(e) => { e.currentTarget.style.display = 'none' }} />
        </div>
      ) : null
    case 'video':
      return block.content ? <video src={block.content} controls className="rounded-xl w-full my-2 max-h-[400px] bg-black" /> : null
    case 'audio':
      return block.content ? <audio src={block.content} controls className="w-full my-2" /> : null
    case 'file':
      return block.content ? (
        <a href={block.content} target="_blank" rel="noreferrer" className="flex items-center gap-3 p-3 rounded-xl border bg-card my-2 hover:shadow-sm">
          <span className="w-9 h-9 rounded-lg bg-violet-500/10 grid place-items-center">📎</span>
          <span className="text-sm font-medium truncate flex-1">{text || block.content.split('/').pop() || 'Attachment'}</span>
          <span className="text-xs text-muted-foreground">Open ↗</span>
        </a>
      ) : null
    case 'bookmark':
      return block.content ? <SharedBookmark block={block} /> : null
    default:
      return text ? <p className="py-0.5 leading-relaxed" dangerouslySetInnerHTML={html(block.content)} /> : null
  }
}

function SharedBookmark({ block }: { block: Block }) {
  const url = (block.content || '').trim()
  const p = (block.properties || {}) as Record<string, unknown>
  const [live, setLive] = useState<{ title?: string; description?: string; image?: string; favicon?: string } | null>(null)
  const needsFetch = url && (!p.title || !p.image)
  useEffect(() => {
    let on = true
    if (!needsFetch) return
    fetchLinkPreview(url).then((m) => { if (on) setLive(m) }).catch(() => {})
    return () => { on = false }
  }, [url]) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="my-2">
      <BookmarkCard
        url={url}
        title={String((p.title as string) || live?.title || '')}
        description={String((p.description as string) || live?.description || '')}
        image={String((p.image as string) || live?.image || '')}
        favicon={String((p.favicon as string) || live?.favicon || '')}
      />
    </div>
  )
}
