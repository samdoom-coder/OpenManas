import { useAppStore } from '@/stores/appStore'
import { Bell, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function NotificationCenter({ open, onClose }: { open:boolean, onClose:()=>void }) {
  const { notifications } = useAppStore()
  if (!open) return null
  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <div className="absolute inset-0 bg-black/20" onClick={onClose} />
      <div className="relative w-[380px] bg-popover border-l shadow-xl h-full flex flex-col">
        <div className="p-4 border-b flex items-center justify-between">
          <h3 className="font-semibold flex items-center gap-2"><Bell size={16}/> Notifications</h3>
          <Button variant="ghost" size="sm" onClick={onClose}><Check size={14} className="mr-1"/> Mark all read</Button>
        </div>
        <div className="flex-1 overflow-auto p-2 space-y-2">
          {notifications.map(n=> (
            <div key={n.id} className={`p-3 rounded-xl border ${n.read ? 'bg-muted/30' : 'bg-card'}`}>
              <div className="text-sm font-medium">{n.title}</div>
              <div className="text-xs text-muted-foreground mt-1">{new Date(n.createdAt).toLocaleString()} • {n.type}</div>
            </div>
          ))}
          {notifications.length===0 && <div className="p-8 text-center text-sm text-muted-foreground">No notifications</div>}
        </div>
      </div>
    </div>
  )
}
