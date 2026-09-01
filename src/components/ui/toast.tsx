import { create } from 'zustand'

interface Toast { id: string, title: string, desc?: string }
interface ToastState { toasts: Toast[], push: (t: Omit<Toast,'id'>)=>void, remove: (id:string)=>void }

export const useToast = create<ToastState>((set)=> ({
  toasts: [],
  push: (t)=> set(s=> ({ toasts: [...s.toasts, { ...t, id: Math.random().toString(36).slice(2)}]})),
  remove: (id)=> set(s=> ({ toasts: s.toasts.filter(x=>x.id!==id)}))
}))

export function Toaster() {
  const { toasts, remove } = useToast()
  return <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
    {toasts.map(t=> (
      <div key={t.id} onClick={()=>remove(t.id)} className="bg-popover border shadow-lg rounded-xl px-4 py-3 min-w-[320px] cursor-pointer animate-in">
        <div className="font-medium text-sm">{t.title}</div>
        {t.desc && <div className="text-xs text-muted-foreground">{t.desc}</div>}
      </div>
    ))}
  </div>
}
