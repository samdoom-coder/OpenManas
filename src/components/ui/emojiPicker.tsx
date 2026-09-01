import { useState } from 'react'

const EMOJIS = ["😀","😂","🥳","😎","🤔","😍","🔥","✨","💡","📌","✅","❌","⚠️","🚀","🎯","📚","💼","🛠️","🎨","🧠","📈","📅","🕒","🔁","⭐","🌈","🍀","🎉","💬","👋","👍","🙏","💪","🧩","🔍","📎","🗂️","📄","📊","🧪","⚙️","🔧","🎁","🌟","💎","🏆","📍","🔗","📌","🧭","🪄","🌿","🍎","⚡","🎵","🎬","📷","🖼️","🔔","💰","🛒","🚦","🧹","✏️","📝","📌"]

export function EmojiPicker({ onSelect, onClose }: { onSelect:(emoji:string)=>void, onClose:()=>void }) {
  const [q, setQ] = useState('')
  const filtered = q ? EMOJIS.filter(e=> e.includes(q)) : EMOJIS
  return (
    <div className="absolute z-30 bg-popover border rounded-2xl shadow-xl p-2 w-[280px]">
      <div className="flex items-center gap-2 mb-2">
        <input autoFocus placeholder="Search emoji" value={q} onChange={e=> setQ(e.target.value)} className="flex-1 h-7 rounded-lg border bg-background px-2 text-xs" />
        <button onClick={onClose} className="p-1 hover:bg-accent rounded-lg text-xs">✕</button>
      </div>
      <div className="grid grid-cols-8 gap-1 max-h-[180px] overflow-auto">
        {filtered.slice(0,64).map(e=> (
          <button key={e} onClick={()=> { onSelect(e); onClose() }} className="w-8 h-8 rounded-lg hover:bg-accent grid place-items-center text-lg">{e}</button>
        ))}
      </div>
      <div className="text-[10px] text-muted-foreground mt-1 text-center">Click to insert • Type to search</div>
    </div>
  )
}
