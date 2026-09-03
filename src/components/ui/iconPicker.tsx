import { useMemo, useRef, useState } from 'react'
import { Search, Smile, Shapes, Upload, X, Trash2, ImagePlus, Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  EMOJI_CATEGORIES,
  searchEmojis,
  getRecentEmojis,
  addRecentEmoji,
  searchLucideIcons,
} from '@/lib/emojiData'
import { LucideIcon, type PageIconValue, resolveIconType } from '@/components/ui/pageIcon'

export interface IconSelection {
  icon?: string
  iconType?: 'emoji' | 'lucide' | 'custom' | 'none'
  customIcon?: string
}

type Tab = 'emoji' | 'icons' | 'upload'

const MAX_UPLOAD_BYTES = 2 * 1024 * 1024 // 2MB raw file limit

function fileToResizedDataUrl(file: File, maxDim = 256, quality = 0.85): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('Could not read file'))
    reader.onload = () => {
      const src = String(reader.result || '')
      const img = new Image()
      img.onerror = () => {
        // SVG or undecodable — fall back to raw data URL if small enough
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
          ctx.clearRect(0, 0, w, h)
          ctx.drawImage(img, 0, 0, w, h)
          // Keep transparency for PNG; photos become JPEG for size
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

export function IconPicker({
  value,
  onSelect,
  onClose,
}: {
  value: PageIconValue
  onSelect: (patch: IconSelection) => void
  onClose: () => void
}) {
  const [tab, setTab] = useState<Tab>(() => {
    const t = resolveIconType(value)
    if (t === 'lucide') return 'icons'
    if (t === 'custom') return 'upload'
    return 'emoji'
  })
  const [q, setQ] = useState('')
  const [activeCat, setActiveCat] = useState('smileys')
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [recent, setRecent] = useState<string[]>(() => getRecentEmojis())
  const fileRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const current = resolveIconType(value)

  const emojiResults = useMemo(() => (q.trim() ? searchEmojis(q, 160) : null), [q])
  const iconResults = useMemo(() => searchLucideIcons(q, 160), [q])

  const pickEmoji = (emoji: string) => {
    addRecentEmoji(emoji)
    setRecent(getRecentEmojis())
    onSelect({ icon: emoji, iconType: 'emoji', customIcon: undefined })
  }

  const pickLucide = (name: string) => {
    onSelect({ icon: name, iconType: 'lucide', customIcon: undefined })
  }

  const handleFiles = async (files: FileList | File[] | null) => {
    if (!files || files.length === 0) return
    const file = Array.from(files)[0]
    setUploadError(null)
    if (!file.type.startsWith('image/')) {
      setUploadError('Please choose an image file (PNG, JPG, SVG, WebP, GIF).')
      return
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      setUploadError('Image is too large. Please choose one under 2MB.')
      return
    }
    setUploading(true)
    try {
      const dataUrl = await fileToResizedDataUrl(file)
      onSelect({ icon: undefined, iconType: 'custom', customIcon: dataUrl })
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : 'Could not read image.')
    } finally {
      setUploading(false)
    }
  }

  const scrollToCat = (id: string) => {
    setActiveCat(id)
    const el = listRef.current?.querySelector(`[data-cat="${id}"]`)
    el?.scrollIntoView({ block: 'start' })
  }

  return (
    <div className="w-[340px] overflow-hidden rounded-2xl border bg-popover text-popover-foreground shadow-xl">
      {/* header: preview + search + close */}
      <div className="flex items-center gap-2 border-b p-2">
        <span className="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-xl bg-muted text-xl">
          {current === 'custom' && value.customIcon ? (
            <img src={value.customIcon} alt="" className="h-full w-full object-cover" draggable={false} />
          ) : current === 'lucide' && value.icon ? (
            <LucideIcon name={value.icon} size={18} />
          ) : current === 'emoji' && value.icon ? (
            <span>{value.icon}</span>
          ) : (
            <span className="text-xs text-muted-foreground">None</span>
          )}
        </span>
        <div className="relative flex-1">
          <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={tab === 'icons' ? 'Search icons…' : tab === 'upload' ? 'Search is disabled here' : 'Search emoji…'}
            disabled={tab === 'upload'}
            className="h-8 w-full rounded-lg border bg-background pl-8 pr-2 text-xs outline-none placeholder:text-muted-foreground/70 focus:ring-2 focus:ring-ring disabled:opacity-50"
          />
        </div>
        <button onClick={onClose} className="rounded-lg p-1.5 hover:bg-accent" aria-label="Close">
          <X size={14} />
        </button>
      </div>

      {/* tabs */}
      <div className="flex items-center gap-1 border-b p-1.5">
        {(
          [
            { id: 'emoji', label: 'Emoji', icon: Smile },
            { id: 'icons', label: 'Icons', icon: Shapes },
            { id: 'upload', label: 'Upload', icon: Upload },
          ] as { id: Tab; label: string; icon: typeof Smile }[]
        ).map((t) => (
          <button
            key={t.id}
            onClick={() => {
              setTab(t.id)
              setQ('')
            }}
            className={cn(
              'flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-medium transition-colors',
              tab === t.id ? 'bg-accent text-foreground' : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground',
            )}
          >
            <t.icon size={14} />
            {t.label}
          </button>
        ))}
      </div>

      {/* body */}
      {tab === 'emoji' && (
        <div>
          {!q && (
            <div className="flex items-center gap-1 overflow-x-auto border-b px-2 py-1.5">
              {EMOJI_CATEGORIES.map((c) => (
                <button
                  key={c.id}
                  title={c.label}
                  onClick={() => scrollToCat(c.id)}
                  className={cn(
                    'grid h-7 w-7 shrink-0 place-items-center rounded-lg text-base hover:bg-accent',
                    activeCat === c.id && 'bg-accent ring-1 ring-border',
                  )}
                >
                  {c.icon}
                </button>
              ))}
            </div>
          )}
          <div ref={listRef} className="max-h-[260px] overflow-y-auto p-2">
            {emojiResults ? (
              <div>
                <div className="px-1 pb-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                  {emojiResults.length} result{emojiResults.length === 1 ? '' : 's'}
                </div>
                {emojiResults.length === 0 ? (
                  <div className="py-8 text-center text-xs text-muted-foreground">
                    No emoji found for “{q}”. Try “star”, “fire”, “task”…
                  </div>
                ) : (
                  <div className="grid grid-cols-8 gap-0.5">
                    {emojiResults.map((item) => (
                      <EmojiButton key={item.e + item.n} char={item.e} name={item.n} onPick={pickEmoji} />
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                {recent.length > 0 && (
                  <div>
                    <div className="px-1 pb-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Recent</div>
                    <div className="grid grid-cols-8 gap-0.5">
                      {recent.map((r) => (
                        <EmojiButton key={'recent-' + r} char={r} name={r} onPick={pickEmoji} />
                      ))}
                    </div>
                  </div>
                )}
                {EMOJI_CATEGORIES.map((c) => (
                  <div key={c.id} data-cat={c.id} className="scroll-mt-1">
                    <div className="px-1 pb-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                      {c.label}
                    </div>
                    <div className="grid grid-cols-8 gap-0.5">
                      {c.emojis.map((item) => (
                        <EmojiButton key={c.id + item.e + item.n} char={item.e} name={item.n} onPick={pickEmoji} />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {tab === 'icons' && (
        <div className="max-h-[300px] overflow-y-auto p-2">
          <div className="px-1 pb-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
            {iconResults.length} icon{iconResults.length === 1 ? '' : 's'} • Lucide
          </div>
          {iconResults.length === 0 ? (
            <div className="py-8 text-center text-xs text-muted-foreground">No icons found for “{q}”.</div>
          ) : (
            <div className="grid grid-cols-6 gap-1">
              {iconResults.map((ic) => {
                const selected = current === 'lucide' && value.icon === ic.name
                return (
                  <button
                    key={ic.name}
                    title={`${ic.label} (${ic.name})`}
                    onClick={() => pickLucide(ic.name)}
                    className={cn(
                      'group flex flex-col items-center gap-1 rounded-xl border p-2 transition-colors hover:bg-accent',
                      selected ? 'border-violet-500 bg-violet-500/10' : 'border-transparent',
                    )}
                  >
                    <span className="grid h-8 w-8 place-items-center rounded-lg bg-muted text-foreground">
                      <LucideIcon name={ic.name} size={17} />
                    </span>
                    <span className="w-full truncate text-center text-[9px] leading-tight text-muted-foreground">
                      {ic.label}
                    </span>
                    {selected && (
                      <span className="absolute -right-1 -top-1 grid h-4 w-4 place-items-center rounded-full bg-violet-500 text-white">
                        <Check size={10} />
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          )}
        </div>
      )}

      {tab === 'upload' && (
        <div className="space-y-3 p-3">
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
              'flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border border-dashed p-6 text-center transition-colors',
              dragOver ? 'border-violet-500 bg-violet-500/10' : 'hover:bg-accent/50',
            )}
          >
            {value.customIcon ? (
              <img src={value.customIcon} alt="custom icon preview" className="h-16 w-16 rounded-2xl border object-cover" draggable={false} />
            ) : (
              <span className="grid h-12 w-12 place-items-center rounded-2xl bg-muted text-muted-foreground">
                <ImagePlus size={20} />
              </span>
            )}
            <div className="text-xs font-medium">{uploading ? 'Uploading…' : value.customIcon ? 'Click or drop to replace' : 'Click or drop an image here'}</div>
            <div className="text-[11px] text-muted-foreground">PNG, JPG, SVG, WebP or GIF • under 2MB • resized to 256px</div>
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
          {uploadError && <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-2 text-xs text-red-600">{uploadError}</div>}
          {value.customIcon && (
            <button
              onClick={() => onSelect({ icon: undefined, iconType: 'custom', customIcon: value.customIcon })}
              className="w-full rounded-xl border p-2 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              Keep current upload
            </button>
          )}
        </div>
      )}

      {/* footer */}
      <div className="flex items-center justify-between border-t p-2">
        <span className="px-1 text-[10px] text-muted-foreground">
          {tab === 'emoji' ? `${EMOJI_CATEGORIES.reduce((n, c) => n + c.emojis.length, 0)}+ emojis` : tab === 'icons' ? 'Lucide icons' : 'Your own image'}
        </span>
        <button
          onClick={() => onSelect({ icon: undefined, iconType: 'none', customIcon: undefined })}
          className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs text-muted-foreground hover:bg-accent hover:text-red-600"
        >
          <Trash2 size={13} /> Remove
        </button>
      </div>
    </div>
  )
}

function EmojiButton({ char, name, onPick }: { char: string; name: string; onPick: (e: string) => void }) {
  return (
    <button
      title={name}
      onClick={() => onPick(char)}
      className="grid h-8 w-8 place-items-center rounded-lg text-lg transition-transform hover:scale-110 hover:bg-accent"
    >
      {char}
    </button>
  )
}
