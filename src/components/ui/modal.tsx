import * as React from 'react'
import { cn } from '@/lib/utils'
import { X } from 'lucide-react'

export function Modal({ open, onClose, children, title, className }: { open: boolean, onClose: ()=>void, children: React.ReactNode, title?: string, className?: string }) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className={cn("relative bg-popover border rounded-t-3xl sm:rounded-2xl shadow-xl w-full max-w-lg max-h-[92dvh] sm:max-h-[85vh] overflow-y-auto overscroll-contain m-0 sm:m-4 animate-in slide-in-from-bottom sm:zoom-in-95 duration-200", className)} role="dialog" aria-modal="true" style={{ paddingBottom: 'max(0px, env(safe-area-inset-bottom))' }}>
        {title && <div className="flex items-center justify-between gap-3 p-4 sm:p-5 border-b sticky top-0 bg-popover z-10 rounded-t-3xl sm:rounded-t-2xl">
          <h3 className="font-semibold text-base sm:text-lg truncate min-w-0 flex-1">{title}</h3>
          <button onClick={onClose} aria-label="Close" className="p-2 min-w-[40px] min-h-[40px] grid place-items-center rounded-lg hover:bg-accent shrink-0"><X size={16}/></button>
        </div>}
        <div className="p-4 sm:p-5">{children}</div>
      </div>
    </div>
  )
}

export function Popover({ open, onClose, children, anchor }: { open:boolean, onClose:()=>void, children: React.ReactNode, anchor?: React.RefObject<HTMLElement> }) {
  if (!open) return null
  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div className="absolute z-50 mt-2 bg-popover border rounded-xl shadow-xl p-2 min-w-[220px] max-w-[calc(100vw-2rem)] max-h-[320px] overflow-auto overscroll-contain">
        {children}
      </div>
    </>
  )
}
