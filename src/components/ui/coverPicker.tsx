import { useRef, useState } from 'react'
import { Check, ImagePlus, Link2, Trash2, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { COVER_PRESETS } from '@/lib/coverData'

const MAX_UPLOAD_BYTES = 4 * 1024 * 1024 // 4MB raw file limit

function fileToResizedDataUrl(file: File, maxDim = 1600, quality = 0.82): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('Could not read file'))
    reader.onload = () => {
      const src = String(reader.result || '')
      const img = new Image()
      img.onerror = () => {
        if (src.length < MAX_UPLOAD_BYTES * 1.4) resolve(src)
        else reject(new Error('Could not decode image'))
      }
      img.onload = () => {
        try {
          const scale = Math.min(1, maxDim / Math.max(img.width, img.height))
          const w = Math.max(1, Math.round(img.width * scale))
          const h = Math.max(1, Math.round(img.height * scale))
          const canvas = document.createElement('canvas')
          canvas.width = w
          canvas.height = h
          const ctx = canvas.getContext('2d')
          if (!ctx) {
            resolve(src)
            return
          }
          ctx.drawImage(img, 0, 0, w, h)
          const outType = file.type === 'image/png' ? 'image/png' : 'image/jpeg'
          resolve(canvas.toDataURL(outType, quality))
        } catch {
          resolve(src)
        }
      }
      img.src = src
    }
    reader.readAsDataURL(file)
  })
}

/**
 * Cover picker popup: gradient presets + image upload + link + remove.
 * Values: `gradient:<id>` or an image URL. Parent persists via updatePage.
 */
export function CoverPicker({
  value,
  onSelect,
  onClose,
}: {
  value?: string
  onSelect: (cover: string | undefined) => void
  onClose: () => void
}) {
  const [link, setLink] = useState('')
  const [linkError, setLinkError] = useState<string | null>(null)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const current = value ?? ''

  const handleFiles = async (files: FileList | File[] | null) => {
    if (!files || files.length === 0) return
    const file = Array.from(files)[0]
    setUploadError(null)
    if (!file.type.startsWith('image/')) {
      setUploadError('Please choose an image file (PNG, JPG, WebP, GIF).')
      return
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      setUploadError('Image is too large. Please choose one under 4MB.')
      return
    }
    setUploading(true)
    try {
      const dataUrl = await fileToResizedDataUrl(file)
      onSelect(dataUrl)
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : 'Could not read image.')
    } finally {
      setUploading(false)
    }
  }

  const applyLink = () => {
    const v = link.trim()
    if (!v) return
    if (!/^(https?:|data:|blob:)/.test(v)) {
      setLinkError('Link must start with http(s)://')
      return
    }
    setLinkError(null)
    onSelect(v)
  }

  return (
    <div className="w-[320px] overflow-hidden rounded-2xl border bg-popover text-popover-foreground shadow-xl">
      <div className="flex items-center justify-between border-b px-3 py-2">
        <span className="text-xs font-semibold">Cover</span>
        <button onClick={onClose} className="rounded-lg p-1.5 hover:bg-accent" aria-label="Close">
          <X size={14} />
        </button>
      </div>

      <div className="space-y-3 p-3">
        <div>
          <div className="mb-1.5 text-[11px] font-medium text-muted-foreground">Color</div>
          <div className="grid grid-cols-5 gap-1.5">
            {COVER_PRESETS.map((p) => {
              const selected = current === `gradient:${p.id}`
              return (
                <button
                  key={p.id}
                  title={p.label}
                  onClick={() => onSelect(`gradient:${p.id}`)}
                  className={cn(
                    'relative h-12 rounded-xl bg-gradient-to-br transition-transform hover:scale-105',
                    p.classes,
                    selected && 'ring-2 ring-violet-500 ring-offset-2 ring-offset-popover',
                  )}
                >
                  {selected && (
                    <span className="absolute inset-0 grid place-items-center text-white">
                      <Check size={16} />
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        </div>

        <div>
          <div className="mb-1.5 text-[11px] font-medium text-muted-foreground">Upload image</div>
          <div
            role="button"
            tabIndex={0}
            onClick={() => fileRef.current?.click()}
            onKeyDown={(e) => e.key === 'Enter' && fileRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault()
              setDragOver(true)
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault()
              setDragOver(false)
              void handleFiles(e.dataTransfer.files)
            }}
            className={cn(
              'flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed px-3 py-4 text-center transition-colors',
              dragOver ? 'border-violet-500 bg-violet-500/10' : 'hover:bg-accent/50',
            )}
          >
            <ImagePlus size={16} className="shrink-0 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">{uploading ? 'Uploading…' : 'Click or drop an image • under 4MB'}</span>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                void handleFiles(e.target.files)
                e.target.value = ''
              }}
            />
          </div>
          {uploadError && <div className="mt-1.5 rounded-xl border border-red-500/30 bg-red-500/10 p-2 text-xs text-red-600">{uploadError}</div>}
        </div>

        <div>
          <div className="mb-1.5 text-[11px] font-medium text-muted-foreground">Image link</div>
          <div className="flex items-center gap-1.5">
            <div className="relative flex-1">
              <Link2 size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                value={link}
                onChange={(e) => setLink(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && applyLink()}
                placeholder="https://…"
                className="h-8 w-full rounded-lg border bg-background pl-8 pr-2 text-xs outline-none placeholder:text-muted-foreground/70 focus:ring-2 focus:ring-ring"
              />
            </div>
            <button onClick={applyLink} disabled={!link.trim()} className="h-8 shrink-0 rounded-lg bg-primary px-3 text-xs text-primary-foreground disabled:opacity-40">
              Set
            </button>
          </div>
          {linkError && <div className="mt-1.5 text-[11px] text-red-600">{linkError}</div>}
        </div>
      </div>

      <div className="flex items-center justify-between border-t p-2">
        <span className="px-1 text-[10px] text-muted-foreground">Shown above the title</span>
        {current ? (
          <button
            onClick={() => onSelect(undefined)}
            className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs text-muted-foreground hover:bg-accent hover:text-red-600"
          >
            <Trash2 size={13} /> Remove
          </button>
        ) : (
          <span className="px-2 py-1.5 text-xs text-muted-foreground">No cover</span>
        )}
      </div>
    </div>
  )
}
