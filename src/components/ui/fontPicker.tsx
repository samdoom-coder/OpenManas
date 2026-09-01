import { useState } from 'react'

const SIZES = [12,14,15,16,18,20,24,28,32,36]
const FAMILIES = [
  { id:'sans', name:'Sans (Inter)', style:'font-sans' },
  { id:'mono', name:'Mono', style:'font-mono' },
  { id:'serif', name:'Serif', style:'font-serif' },
  { id:'caveat', name:'Caveat (Handwritten)', style:'font-caveat' },
]

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

export function FontPicker({ current, onSelect, onClose }: { current:any, onSelect:(patch:any)=>void, onClose:()=>void }) {
  const [size, setSize] = useState(current?.fontSize || 15)
  const [family, setFamily] = useState(current?.fontFamily || 'sans')
  const [weight, setWeight] = useState(current?.fontWeight || '400')
  const [italic, setItalic] = useState(!!current?.italic)
  const [color, setColor] = useState(current?.color || '')
  return (
    <div className="absolute z-30 right-0 top-full mt-2 w-[280px] bg-popover border rounded-2xl shadow-xl p-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold">Typography</span>
        <button onClick={onClose} className="p-1 hover:bg-accent rounded-lg text-xs">✕</button>
      </div>
      <div className="space-y-3">
        <div>
          <div className="text-[11px] font-medium text-muted-foreground mb-1">Size</div>
          <div className="flex flex-wrap gap-1">
            {SIZES.map(s=> (
              <button key={s} onClick={()=> { setSize(s); onSelect({ fontSize: s })}} className={`px-2 py-1 rounded-lg border text-xs ${size===s ? 'bg-violet-500 text-white border-violet-500' : 'hover:bg-accent'}`}>{s}</button>
            ))}
          </div>
        </div>
        <div>
          <div className="text-[11px] font-medium text-muted-foreground mb-1">Family</div>
          <div className="grid grid-cols-1 gap-1">
            {FAMILIES.map(f=> (
              <button key={f.id} onClick={()=> { setFamily(f.id); onSelect({ fontFamily: f.id })}} className={`text-left px-2 py-1.5 rounded-lg border text-xs flex items-center gap-2 ${family===f.id ? 'bg-accent border-violet-500/30' : 'hover:bg-accent'}`}>
                <span className={f.style}>Aa</span> {f.name}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={()=> { const w = weight==='700' ? '400' : '700'; setWeight(w); onSelect({ fontWeight: w })}} className={`flex-1 py-1.5 rounded-lg border text-xs font-bold ${weight==='700' ? 'bg-accent' : 'hover:bg-accent'}`}>B Bold</button>
          <button onClick={()=> { setItalic(!italic); onSelect({ italic: !italic })}} className={`flex-1 py-1.5 rounded-lg border text-xs italic ${italic ? 'bg-accent' : 'hover:bg-accent'}`}>I Italic</button>
        </div>
        <div>
          <div className="text-[11px] font-medium text-muted-foreground mb-1">Text color</div>
          <div className="grid grid-cols-6 gap-1">
            {TEXT_COLORS.map(c=> (
              <button key={c.name} title={c.name} onClick={()=> { setColor(c.value); onSelect({ color: c.value })}} className={`h-7 rounded-lg border grid place-items-center text-xs font-bold ${color===c.value ? 'ring-2 ring-violet-500 ring-offset-1' : ''}`} style={{ background:c.value ? c.value : 'white', color: c.value ? 'white' : '#111827', borderColor: c.value ? c.value : '#e5e7eb' }}>
                A
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2 mt-2">
            <input type="color" value={color || '#000000'} onChange={e=> { setColor(e.target.value); onSelect({ color: e.target.value })}} className="w-8 h-8 rounded-lg border p-0.5 bg-background cursor-pointer" title="Custom color" />
            <span className="text-xs text-muted-foreground flex-1 truncate">{color || 'Default (inherit)'}</span>
            <button onClick={()=> { setColor(''); onSelect({ color: '' })}} className="text-xs border rounded-lg px-2 py-1 hover:bg-accent shrink-0">Clear</button>
          </div>
          <div className="mt-2 p-2 rounded-lg border bg-muted/30 flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Preview:</span>
            <span className="text-sm font-medium truncate" style={{ color: color || undefined, fontFamily: family==='caveat' ? "'Caveat', cursive" : family==='mono' ? 'JetBrains Mono, monospace' : family==='serif' ? 'Georgia, serif' : 'Inter, sans-serif', fontWeight: weight, fontStyle: italic ? 'italic' : undefined, fontSize: `${size}px` }}>Aa Caveat sample</span>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-1">
          <button onClick={()=> { setSize(15); setFamily('sans'); setWeight('400'); setItalic(false); setColor(''); onSelect({ fontSize:15, fontFamily:'sans', fontWeight:'400', italic:false, color:'' })}} className="text-xs border rounded-lg py-1 hover:bg-accent">Reset</button>
          <button onClick={onClose} className="text-xs bg-primary text-primary-foreground rounded-lg py-1">Done</button>
        </div>
      </div>
    </div>
  )
}
