// Share dialog — visibility + bearer invite links per page.
// Opened from PageView or Topbar via openShare(pageId). Links require a
// server session; visibility flips work locally too.

import { useEffect, useState } from 'react'
import { create } from 'zustand'
import { useAppStore } from '@/stores/appStore'
import { createShareLink, listShareLinks, revokeShareLink, shareUrl, type ShareLink } from '@/lib/sync'
import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/modal'
import { useToast } from '@/components/ui/toast'
import { Link2, Trash2, Copy, Check } from 'lucide-react'

interface ShareState {
  pageId: string | null
}
export const useShareStore = create<ShareState>(() => ({ pageId: null }))
export const openShare = (pageId: string) => useShareStore.setState({ pageId })
export const closeShare = () => useShareStore.setState({ pageId: null })

export function ShareDialog() {
  const pageId = useShareStore((s) => s.pageId)
  const { pages, token, updatePage } = useAppStore()
  const { push } = useToast()
  const page = pages.find((p) => p.id === pageId)
  const [links, setLinks] = useState<ShareLink[]>([])
  const [permission, setPermission] = useState<ShareLink['permission']>('view')
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState<string | null>(null)

  useEffect(() => {
    if (!pageId || !token) { setLinks([]); return }
    let live = true
    listShareLinks(pageId).then((l) => { if (live) setLinks(l) }).catch(() => {})
    return () => { live = false }
  }, [pageId, token])

  if (!pageId || !page) return null

  const visibility = page.shareMode ?? (page.isShared ? 'workspace' : 'private')
  const setVisibility = (v: ShareLink['visibility']) => {
    updatePage(page.id, { shareMode: v, isShared: v !== 'private' } as any)
  }

  const create = async () => {
    setBusy(true)
    try {
      const link = await createShareLink(page.id, permission, visibility === 'private' ? 'workspace' : visibility)
      setLinks((ls) => [link, ...ls])
      push({ title: 'Invite link created', desc: 'Anyone with the link can open this page.' })
    } catch (e) {
      push({ title: 'Could not create link', desc: e instanceof Error ? e.message : 'Server error' })
    } finally {
      setBusy(false)
    }
  }

  const copy = async (t: string) => {
    try {
      await navigator.clipboard.writeText(shareUrl(t))
    } catch {
      const ta = document.createElement('textarea')
      ta.value = shareUrl(t)
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      ta.remove()
    }
    setCopied(t)
    setTimeout(() => setCopied((c) => (c === t ? null : c)), 1500)
  }

  const revoke = async (t: string) => {
    try {
      await revokeShareLink(t)
      setLinks((ls) => ls.filter((l) => l.token !== t))
    } catch (e) {
      push({ title: 'Could not revoke link', desc: e instanceof Error ? e.message : 'Server error' })
    }
  }

  return (
    <Modal open onClose={closeShare} title={`Share “${page.title || 'Untitled'}”`}>
      <div className="space-y-4">
        <div>
          <div className="text-xs font-medium mb-1.5">Who can access</div>
          <div className="flex rounded-full border text-xs overflow-hidden w-fit" role="radiogroup" aria-label="Visibility">
            {(['private', 'workspace', 'public'] as const).map((v) => (
              <button key={v} onClick={()=> setVisibility(v)} className={`px-3 py-1.5 capitalize ${visibility===v ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}>{v}</button>
            ))}
          </div>
          <p className="text-[11px] text-muted-foreground mt-1.5">
            {visibility === 'private' && 'Only you. Create a link below to invite someone specific.'}
            {visibility === 'workspace' && 'Anyone in the workspace with the link can open it.'}
            {visibility === 'public' && 'Anyone with the link can open it, no sign-in wall.'}
          </p>
        </div>

        {!token ? (
          <div className="text-xs text-muted-foreground bg-muted/40 border border-dashed rounded-xl px-3 py-2.5">
            Sign in to create invite links — visibility above still applies locally.
          </div>
        ) : (
          <div>
            <div className="text-xs font-medium mb-1.5">Invite links</div>
            <div className="flex gap-2">
              <select value={permission} onChange={e=> setPermission(e.target.value as any)} className="h-9 px-2 rounded-xl border bg-background text-xs" aria-label="Link permission">
                <option value="view">Can view</option>
                <option value="comment">Can comment</option>
                <option value="edit">Can edit</option>
              </select>
              <Button size="sm" className="flex-1" disabled={busy} onClick={()=> void create()}>
                <Link2 size={14} className="mr-1"/> {busy ? 'Creating…' : 'Create link'}
              </Button>
            </div>
            {links.length > 0 && (
              <div className="mt-2 space-y-1.5 max-h-[220px] overflow-auto">
                {links.map((l) => (
                  <div key={l.token} className="flex items-center gap-2 px-2.5 py-2 rounded-xl border bg-background text-xs">
                    <span className="px-1.5 py-0.5 rounded bg-secondary capitalize">{l.permission}</span>
                    <code className="truncate flex-1 text-muted-foreground">{l.token.slice(0, 16)}…</code>
                    <button onClick={()=> void copy(l.token)} className="p-1.5 rounded-lg hover:bg-accent" title="Copy link">
                      {copied === l.token ? <Check size={14} className="text-emerald-500"/> : <Copy size={14}/>}
                    </button>
                    <button onClick={()=> void revoke(l.token)} className="p-1.5 rounded-lg hover:bg-red-500/10 text-red-600" title="Revoke">
                      <Trash2 size={14}/>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </Modal>
  )
}
