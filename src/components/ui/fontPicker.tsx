import { useState } from 'react'
import { FONT_FAMILIES, fontFamilyCSS } from '@/lib/fonts'

const SIZES = [12,14,15,16,18,20,24,28,32,36]

const TEXT_COLORS = [
  { name:'Default', value:'' },
  { name:'Black', value:'#111827' },
  { name:'Gray', value:'#6b7280' },
  { name:'Red', value:'#dc2626' },
  { name:'Orange', value:'#ea580c' },
  { name:'Amber', value:'#d97706' },
  { name:'Yellow', value:'#ca8a04' },
  { name:'Green', value:'#16a34a' },
  { name:'Emerald', value:'#059669' },
  { name:'Teal', value:'#0d9488' },
  { name:'Cyan', value:'#0891b2' },
  { name:'Sky', value:'#0284c7' },
  { name:'Blue', value:'#2563eb' },
  { name:'Indigo', value:'#4f46e5' },
  { name:'Violet', value:'#7c3aed' },
  { name:'Purple', value:'#9333ea' },
  { name:'Fuchsia', value:'#c026d3' },
  { name:'Pink', value:'#db2777' },
  { name:'Rose', value:'#e11d48' },
]

export function FontPicker({ current, onSelect, onPreview, onClearPreview, onClose }: {
  current:any
  onSelect:(patch:any)=>void
  onPreview?:(patch:Record<string,unknown>)=>void
  onClearPreview?:()=>void
  onClose:()=>void
}) {
  const [size, setSize] = useState(current?.fontSize || 15)
  const [family, setFamily] = useState(current?.fontFamily || 'sans')
  const [weight, setWeight] = useState(current?.fontWeight || '400')
  const [italic, setItalic] = useState(!!current?.italic)
  const [color, setColor] = useState(current?.color || '')
  // Hover state drives the preview box + live block preview. Click commits.
  const [hover, setHover] = useState<Record<string, any> | null>(null)

  const eff = {
    fontSize: hover?.fontSize ?? size,
    fontFamily: hover?.fontFamily ?? family,
    fontWeight: hover?.fontWeight ?? weight,
    italic: hover?.italic ?? italic,
    color: hover?.color ?? color,
  }

  const hoverPatch = (patch: Record<string, any>) => {
    setHover((prev) => ({ ...(prev || {}), ...patch }))
    onPreview?.(patch)
  }
  const clearHover = () => {
    setHover(null)
    onClearPreview?.()
  }
  const commit = (patch: Record<string, any>) => {
    setHover(null)
    onClearPreview?.()
    if (patch.fontSize !== undefined) setSize(patch.fontSize)
    if (patch.fontFamily !== undefined) setFamily(patch.fontFamily)
    if (patch.fontWeight !== undefined) setWeight(patch.fontWeight)
    if (patch.italic !== undefined) setItalic(patch.italic)
    if (patch.color !== undefined) setColor(patch.color)
    onSelect(patch)
  }
  const close = () => {
    setHover(null)
    onClearPreview?.()
    onClose()
  }

  return (
    <div className="absolute z-30 right-0 top-full mt-2 w-[280px] bg-popover border rounded-2xl shadow-xl p-3" onMouseLeave={clearHover}>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-semibold">Typography</span>
        <button onClick={close} className="p-1 hover:bg-accent rounded-lg text-xs">✕</button>
      </div>
      <div className="text-[10px] text-muted-foreground mb-2">Hover to preview on the block • click to apply</div>
      <div className="space-y-3">
        <div>
          <div className="text-[11px] font-medium text-muted-foreground mb-1">Size</div>
          <div className="flex flex-wrap gap-1">
            {SIZES.map(s=> (
              <button key={s} onClick={()=> commit({ fontSize: s })} onMouseEnter={()=> hoverPatch({ fontSize: s })} onFocus={()=> hoverPatch({ fontSize: s })} title={`${s}px — hover to preview, click to apply`} className={`px-2 py-1 rounded-lg border text-xs transition-transform hover:scale-105 ${eff.fontSize===s ? 'bg-violet-500 text-white border-violet-500' : 'hover:bg-accent'}`}>{s}</button>
            ))}
          </div>
        </div>
        <div>
          <div className="text-[11px] font-medium text-muted-foreground mb-1">Family — incl. handwriting</div>
          <div className="grid grid-cols-1 gap-1 max-h-[220px] overflow-auto">
            {FONT_FAMILIES.map(f=> (
              <button key={f.id} onClick={()=> commit({ fontFamily: f.id })} onMouseEnter={()=> hoverPatch({ fontFamily: f.id })} onFocus={()=> hoverPatch({ fontFamily: f.id })} title={`${f.name} — hover to preview, click to apply`} className={`text-left px-2 py-1.5 rounded-lg border text-xs flex items-center gap-2 transition-colors ${eff.fontFamily===f.id ? 'bg-accent border-violet-500/40' : 'hover:bg-accent'}`}>
                <span className={f.className} style={{ fontSize: f.handwriting ? 18 : 14 }}>Aa</span>
                <span className="flex-1">{f.name}</span>
                {f.handwriting && <span className="text-[9px] rounded-full border px-1.5 py-0.5 text-muted-foreground">hand</span>}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onMouseEnter={()=> hoverPatch({ fontWeight: weight==='700' ? '400' : '700' })}
            onClick={()=> commit({ fontWeight: weight==='700' ? '400' : '700' })}
            className={`flex-1 py-1.5 rounded-lg border text-xs font-bold ${eff.fontWeight==='700' ? 'bg-accent' : 'hover:bg-accent'}`}
          >B Bold</button>
          <button
            onMouseEnter={()=> hoverPatch({ italic: !eff.italic })}
            onClick={()=> commit({ italic: !eff.italic })}
            className={`flex-1 py-1.5 rounded-lg border text-xs italic ${eff.italic ? 'bg-accent' : 'hover:bg-accent'}`}
          >I Italic</button>
        </div>
        <div>
          <div className="text-[11px] font-medium text-muted-foreground mb-1">Text color</div>
          <div className="grid grid-cols-6 gap-1">
            {TEXT_COLORS.map(c=> (
              <button key={c.name} title={`${c.name} — hover to preview, click to apply`} onClick={()=> commit({ color: c.value })} onMouseEnter={()=> hoverPatch({ color: c.value })} onFocus={()=> hoverPatch({ color: c.value })} className={`h-7 rounded-lg border grid place-items-center text-xs font-bold transition-transform hover:scale-110 ${eff.color===c.value ? 'ring-2 ring-violet-500 ring-offset-1' : ''}`} style={{ background:c.value ? c.value : 'white', color: c.value ? 'white' : '#111827', borderColor: c.value ? c.value : '#e5e7eb' }}>
                A
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2 mt-2">
            <input type="color" value={eff.color || '#000000'} onInput={e=> hoverPatch({ color: (e.target as HTMLInputElement).value })} onChange={e=> commit({ color: (e.target as HTMLInputElement).value })} className="w-8 h-8 rounded-lg border p-0.5 bg-background cursor-pointer" title="Custom color — slide to preview, release to apply" />
            <span className="text-xs text-muted-foreground flex-1 truncate">{eff.color || 'Default (inherit)'}</span>
            <button onClick={()=> commit({ color: '' })} onMouseEnter={()=> hoverPatch({ color: '' })} className="text-xs border rounded-lg px-2 py-1 hover:bg-accent shrink-0">Clear</button>
          </div>
          <div className="mt-2 p-2 rounded-lg border bg-muted/30 flex items-center gap-2">
            <span className="text-xs text-muted-foreground shrink-0">Preview:</span>
            <span className="font-medium truncate flex-1" style={{ color: eff.color || undefined, fontFamily: fontFamilyCSS(eff.fontFamily), fontWeight: eff.fontWeight, fontStyle: eff.italic ? 'italic' : undefined, fontSize: `${eff.fontSize}px` }}>Aa Handwriting sample</span>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-1">
          <button onClick={()=> commit({ fontSize:15, fontFamily:'sans', fontWeight:'400', italic:false, color:'' })} className="text-xs border rounded-lg py-1 hover:bg-accent">Reset</button>
          <button onClick={close} className="text-xs bg-primary text-primary-foreground rounded-lg py-1">Done</button>
        </div>
      </div>
    </div>
  )
}
