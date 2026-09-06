import { useEffect, useMemo, useState } from 'react'
import { Upload, File, Image as ImageIcon, Video, Music, FileText, Trash2, Search, RefreshCw, Plus, ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/modal'
import { useAppStore } from '@/stores/appStore'
import { storageService } from '@/lib/storageService'
import { blockTypeForMime, resolveAttachTarget } from '@/lib/fileRefs'
import { useToast } from '@/components/ui/toast'
import type { FileAsset } from '@/lib/types'

// Matches server FILE_MAX_SIZE default (25MB) so clients reject before upload.
export const MAX_FILE_SIZE = 25 * 1024 * 1024

export function formatSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)))
  const v = bytes / Math.pow(1024, i)
  return `${v >= 100 ? Math.round(v) : Math.round(v * 10) / 10} ${units[i]}`
}

export function kindOf(mime: string): 'image' | 'video' | 'audio' | 'pdf' | 'file' {
  const m = (mime || '').toLowerCase()
  if (m.startsWith('image/')) return 'image'
  if (m.startsWith('video/')) return 'video'
  if (m.startsWith('audio/')) return 'audio'
  if (m === 'application/pdf') return 'pdf'
  return 'file'
}

/** Resolvable preview URL: stored url first, else provider lookup by key. */
export function previewUrl(f: FileAsset): string {
  if (f.url) return f.url
  try {
    return storageService.getActive().getUrl(f.storageKey) || ''
  } catch {
    return ''
  }
}

// simple dropzone without extra dep — custom
export function FileManager() {
  const { files, workspace, backendMode, pages, selectedPageId } = useAppStore()
  const { push } = useToast()
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [query, setQuery] = useState('')
  const [preview, setPreview] = useState<FileAsset | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  // Destination page for "+ Page" — the Files route clears the selection, so
  // the open page can't be used. Defaults to the most recently updated page.
  const [targetPageId, setTargetPageId] = useState<string | null>(null)

  // Pull server metadata once per mount when logged in (local cache otherwise).
  useEffect(() => {
    if (backendMode === 'server') {
      setRefreshing(true)
      useAppStore.getState().refreshFiles().finally(() => setRefreshing(false))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [backendMode, workspace.id])

  const list = useMemo(() => {
    const q = query.trim().toLowerCase()
    return files
      .filter((f) => f.workspaceId === workspace.id || !f.workspaceId)
      .filter((f) => !q || f.filename.toLowerCase().includes(q))
      .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt))
  }, [files, workspace.id, query])

  const pageOptions = useMemo(
    () => [...pages].filter((p) => !p.isTrashed).sort((a, b) => +new Date(b.updatedAt) - +new Date(a.updatedAt)).slice(0, 50),
    [pages],
  )
  const effectiveTarget = resolveAttachTarget(pages, selectedPageId, targetPageId)

  const handleFiles = async (listFiles: FileList) => {
    const items = [...listFiles]
    if (items.length === 0) return
    setUploading(true)
    let done = 0
    for (const file of items) {
      try {
        if (file.size > MAX_FILE_SIZE) {
          push({ title: `Skipped ${file.name}`, desc: `Over the 25MB limit (${formatSize(file.size)}).` })
          continue
        }
        const { key, url } = await storageService.getActive().upload(file)
        useAppStore.getState().addFile({
          filename: file.name, mimeType: file.type || 'application/octet-stream',
          size: file.size, storageKey: key, url,
        })
        push({ title: `Uploaded ${file.name}`, desc: `Stored as ${key}` })
      } catch (e: unknown) {
        push({ title: 'Upload failed', desc: e instanceof Error ? e.message : String(e) })
      } finally {
        done += 1
        setProgress(Math.round((done / items.length) * 100))
      }
    }
    setProgress(100)
    setTimeout(() => { setUploading(false); setProgress(0) }, 800)
  }

  const remove = (f: FileAsset) => {
    useAppStore.getState().removeFile(f.id)
    if (preview?.id === f.id) setPreview(null)
    push({ title: `Deleted ${f.filename}` })
  }

  const useInPage = (f: FileAsset) => {
    const st = useAppStore.getState()
    const page = resolveAttachTarget(st.pages, st.selectedPageId, targetPageId)
    if (!page) {
      push({ title: 'No page to attach to', desc: 'Create a page first, then attach this file to it.' })
      return
    }
    const url = previewUrl(f)
    if (!url) {
      push({ title: 'No file bytes on this device', desc: 'Re-upload the file here first — metadata syncs, bytes stay local until object storage is configured.' })
      return
    }
    const type = blockTypeForMime(f.mimeType)
    st.addBlock(page.id, type, url)
    st.setSelectedPage(page.id)
    push({ title: `Attached to ${page.title || 'Untitled'}`, desc: `${f.filename} added as a ${type} block.` })
  }

  const manualRefresh = async () => {
    setRefreshing(true)
    await useAppStore.getState().refreshFiles()
    setRefreshing(false)
  }

  return (
    <div className="space-y-4">
      <div
        onDragOver={e => e.preventDefault()}
        onDrop={e => { e.preventDefault(); e.dataTransfer.files && handleFiles(e.dataTransfer.files) }}
        className="rounded-2xl border border-dashed p-8 text-center hover:bg-accent/30 transition-colors"
      >
        <Upload size={20} className="mx-auto text-muted-foreground" />
        <div className="font-medium mt-2">Drop files here</div>
        <div className="text-xs text-muted-foreground mt-1">Images, PDFs, videos, audio — up to 25MB each. Stored via {storageService.getActive().name}.</div>
        <label className="inline-flex mt-3">
          <input type="file" multiple hidden onChange={e => e.target.files && handleFiles(e.target.files)} />
          <span className="px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm cursor-pointer">Choose files</span>
        </label>
        {uploading && <div className="mt-4">
          <div className="h-2 rounded-full bg-muted overflow-hidden">
            <div className="h-full bg-violet-500 transition-all" style={{ width: `${progress}%` }} />
          </div>
          <div className="text-xs text-muted-foreground mt-1">{progress}%</div>
        </div>}
      </div>

      <div className="rounded-2xl border bg-card">
        <div className="px-3 pt-3 flex items-center gap-2 text-xs text-muted-foreground">
          <span className="shrink-0">“+ Page” attaches to:</span>
          <select
            value={effectiveTarget?.id ?? ''}
            onChange={e => setTargetPageId(e.target.value || null)}
            className="h-8 min-w-0 flex-1 rounded-lg border bg-background px-2 text-xs text-foreground outline-none focus:ring-2 focus:ring-ring"
          >
            {pageOptions.length === 0 && <option value="">No pages yet</option>}
            {pageOptions.map(p => (
              <option key={p.id} value={p.id}>{p.title || 'Untitled'}</option>
            ))}
          </select>
        </div>
        <div className="p-3 border-b flex items-center gap-2 mt-1">
          <span className="font-medium text-sm flex items-center gap-2"><File size={16} /> Files in workspace</span>
          <span className="text-xs text-muted-foreground">{list.length}</span>
          <span className="ml-auto flex items-center gap-1">
            <span className="relative">
              <Search size={13} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Filter files..."
                className="h-8 w-40 rounded-lg border bg-background pl-7 pr-2 text-xs outline-none focus:ring-2 focus:ring-ring"
              />
            </span>
            {backendMode === 'server' && (
              <Button variant="ghost" size="sm" onClick={manualRefresh} title="Refresh from server">
                <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
              </Button>
            )}
          </span>
        </div>
        <div className="p-3 space-y-2">
          {list.length === 0 && (
            <div className="py-8 text-center text-sm text-muted-foreground border rounded-xl border-dashed">
              No files yet. Drop files above or choose files to upload.
            </div>
          )}
          {list.map(f => (
            <FileRow key={f.id} file={f} onPreview={() => setPreview(f)} onUseInPage={() => useInPage(f)} onDelete={() => remove(f)} />
          ))}
        </div>
      </div>

      {preview && <PreviewModal file={preview} onClose={() => setPreview(null)} />}
    </div>
  )
}

function FileRow({ file: f, onPreview, onUseInPage, onDelete }: { file: FileAsset; onPreview: () => void; onUseInPage: () => void; onDelete: () => void }) {
  const kind = kindOf(f.mimeType)
  const url = previewUrl(f)
  const Icon = kind === 'image' ? ImageIcon : kind === 'video' ? Video : kind === 'audio' ? Music : kind === 'pdf' ? FileText : File
  return (
    <div className="flex items-center gap-3 p-2 rounded-xl hover:bg-accent">
      {kind === 'image' && url ? (
        <button onClick={onPreview} title="Preview" className="w-10 h-10 rounded-lg overflow-hidden bg-muted shrink-0">
          <img src={url} alt="" className="w-full h-full object-cover" />
        </button>
      ) : (
        <button onClick={onPreview} title="Preview" className="w-10 h-10 rounded-lg bg-muted grid place-items-center shrink-0 hover:ring-2 hover:ring-ring">
          <Icon size={16} />
        </button>
      )}
      <button onClick={onPreview} className="flex-1 min-w-0 text-left" title="Preview">
        <span className="block text-sm font-medium truncate">{f.filename}</span>
        <span className="block text-xs text-muted-foreground">{formatSize(f.size)} • {new Date(f.createdAt).toLocaleDateString()}</span>
      </button>
      <Button variant="ghost" size="sm" onClick={onUseInPage} title="Attach to the open page">
        <Plus size={14} className="mr-1" /> Page
      </Button>
      <Button variant="ghost" size="sm" onClick={onDelete} title={`Delete ${f.filename}`} className="hover:text-red-600">
        <Trash2 size={14} />
      </Button>
    </div>
  )
}

function PreviewModal({ file: f, onClose }: { file: FileAsset; onClose: () => void }) {
  const url = previewUrl(f)
  const kind = kindOf(f.mimeType)
  return (
    <Modal open onClose={onClose} title={f.filename} className="max-w-[720px]">
      <div className="space-y-3">
        {!url ? (
          <div className="py-8 text-center text-sm text-muted-foreground">No preview available on this device — metadata syncs across devices, bytes stay local until object storage is configured.</div>
        ) : kind === 'image' ? (
          <img src={url} alt={f.filename} className="w-full max-h-[60vh] object-contain rounded-xl bg-muted" />
        ) : kind === 'video' ? (
          <video src={url} controls className="w-full max-h-[60vh] rounded-xl bg-black" />
        ) : kind === 'audio' ? (
          <audio src={url} controls className="w-full" />
        ) : kind === 'pdf' ? (
          <iframe src={url} title={f.filename} className="w-full h-[60vh] rounded-xl border bg-muted" />
        ) : (
          <div className="py-8 text-center">
            <div className="text-sm text-muted-foreground mb-3">No inline preview for this file type.</div>
            <Button variant="outline" size="sm" onClick={() => window.open(url, '_blank')}><ExternalLink size={14} className="mr-1" /> Open file</Button>
          </div>
        )}
        <div className="text-xs text-muted-foreground">{f.mimeType} • {formatSize(f.size)} • {new Date(f.createdAt).toLocaleString()}</div>
      </div>
    </Modal>
  )
}
