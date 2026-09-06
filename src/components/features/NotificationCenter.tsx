import { useAppStore } from '@/stores/appStore'
import { create } from 'zustand'
import { Bell, Check, ArrowUpRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/toast'
import { parseNotificationLink } from '@/lib/automation'
import type { Notification } from '@/lib/types'

// Store-driven so the panel can render in App (outside Topbar).
// NOTE: must NOT render inside Topbar — its `backdrop-blur` makes it the
// containing block for `fixed` descendants, clipping the panel to 56px.
interface NotifUI { open: boolean }
export const useNotifStore = create<NotifUI>(() => ({ open: false }))
export const openNotifications = () => useNotifStore.setState({ open: true })
export const closeNotifications = () => useNotifStore.setState({ open: false })

export function NotificationCenter({ open, onClose }: { open?: boolean, onClose?: () => void }) {
  const storeOpen = useNotifStore((s) => s.open)
  const visible = open ?? storeOpen
  const close = onClose ?? closeNotifications
  const { notifications, markNotificationRead, markAllNotificationsRead } = useAppStore()
  const { push } = useToast()
  if (!visible) return null
  const unread = notifications.filter(n => !n.read).length

  const handleOpen = (n: Notification) => {
    const st = useAppStore.getState()
    markNotificationRead(n.id)
    const parsed = parseNotificationLink(n.link)
    if (!parsed.pageId && !parsed.databaseId && !parsed.recordId) return // no target — stay open
    // Record → its full page (creates the backing page on first open).
    if (parsed.recordId) {
      const rec = st.records.find((r) => r.id === parsed.recordId)
      if (rec) {
        const page = st.ensureRecordPage(parsed.recordId)
        if (page) {
          st.setSelectedPage(page.id)
          close()
          return
        }
      }
      // Record gone — fall back to its database when known.
      if (parsed.databaseId && st.databases.some((d) => d.id === parsed.databaseId)) {
        st.setSelectedDatabase(parsed.databaseId)
        close()
        return
      }
      push({ title: 'Target no longer exists', desc: 'The linked record was deleted.' })
      return
    }
    if (parsed.pageId) {
      if (st.pages.some((p) => p.id === parsed.pageId)) {
        st.setSelectedPage(parsed.pageId)
        close()
        return
      }
      push({ title: 'Target no longer exists', desc: 'The linked page was deleted.' })
      return
    }
    if (parsed.databaseId) {
      if (st.databases.some((d) => d.id === parsed.databaseId)) {
        st.setSelectedDatabase(parsed.databaseId)
        close()
        return
      }
      push({ title: 'Target no longer exists', desc: 'The linked database was deleted.' })
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/20" onClick={close} />
      <div className="relative w-[380px] max-w-[90vw] bg-popover border-l shadow-xl h-screen flex flex-col">
        <div className="p-4 border-b flex items-center justify-between">
          <h3 className="font-semibold flex items-center gap-2"><Bell size={16}/> Notifications {unread > 0 && <span className="text-xs font-normal text-muted-foreground">({unread} unread)</span>}</h3>
          <Button variant="ghost" size="sm" onClick={() => markAllNotificationsRead()}><Check size={14} className="mr-1"/> Mark all read</Button>
        </div>
        <div className="flex-1 overflow-auto p-2 space-y-2">
          {notifications.map(n=> {
            const hasTarget = !!n.link && !!(parseNotificationLink(n.link).pageId || parseNotificationLink(n.link).databaseId || parseNotificationLink(n.link).recordId)
            const body = (
              <>
                <div className="text-sm font-medium flex items-center gap-1">
                  <span className="flex-1">{n.title}</span>
                  {hasTarget && <ArrowUpRight size={14} className="shrink-0 text-muted-foreground" />}
                </div>
                {n.body && <div className="text-xs mt-1 line-clamp-2">{n.body}</div>}
                <div className="text-xs text-muted-foreground mt-1">{new Date(n.createdAt).toLocaleString()} • {n.type}</div>
              </>
            )
            return hasTarget ? (
              <button
                key={n.id}
                onClick={() => handleOpen(n)}
                title="Open linked item"
                className={`w-full text-left p-3 rounded-xl border hover:bg-accent transition-colors ${n.read ? 'bg-muted/30' : 'bg-card'}`}
              >
                {body}
              </button>
            ) : (
              <div key={n.id} onClick={() => markNotificationRead(n.id)} className={`p-3 rounded-xl border ${n.read ? 'bg-muted/30' : 'bg-card'}`}>
                {body}
              </div>
            )
          })}
          {notifications.length===0 && <div className="p-8 text-center text-sm text-muted-foreground">No notifications — automations (status Done, mentions, shares) will appear here.</div>}
        </div>
      </div>
    </div>
  )
}
