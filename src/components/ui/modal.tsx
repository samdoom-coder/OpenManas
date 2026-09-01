import * as React from 'react'
import { cn } from '@/lib/utils'
import { X } from 'lucide-react'

export function Modal({ open, onClose, children, title, className }: { open: boolean, onClose: ()=>void, children: React.ReactNode, title?: string, className?: string }) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className={cn("relative bg-popover border rounded-2xl shadow-xl w-full max-w-lg max-h-[85vh] overflow-auto m-4 animate-in", className)}>
        {title && <div className="flex items-center justify-between p-5 border-b sticky top-0 bg-popover z-10 rounded-t-2xl">
          <h3 className="font-semibold">{title}</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-accent"><X size={16}/></button>
        </div>}
        <div className="p-5">{children}</div>
      </div>
    </div>
  )
}

export function Popover({ open, onClose, children, anchor }: { open:boolean, onClose:()=>void, children: React.ReactNode, anchor?: React.RefObject<HTMLElement> }) {
  if (!open) return null
  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div className="absolute z-50 mt-2 bg-popover border rounded-xl shadow-xl p-2 min-w-[220px] max-h-[320px] overflow-auto">
        {children}
      </div>
    </>
  )
}
