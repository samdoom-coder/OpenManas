// Presence UI — online collaborators + sync status.
// Reads the shared collab store (populated by the active CollabSession).
// Renders nothing when realtime is off (no sync URL configured).

import { useCollabStore } from '@/lib/collabClient'

export function PresenceAvatars() {
  const peers = useCollabStore((s) => s.peers)
  if (peers.length === 0) return null
  const shown = peers.slice(0, 5)
  return (
    <div className="flex items-center -space-x-2 mr-1" title={`${peers.length} online`}>
      {shown.map((p) => (
        <span
          key={p.clientId}
          title={p.name}
          className="w-7 h-7 rounded-xl border-2 grid place-items-center text-[11px] font-semibold text-white"
          style={{ background: p.color, borderColor: 'var(--card)' }}
        >
          {p.name.slice(0, 1).toUpperCase()}
        </span>
      ))}
      {peers.length > shown.length && (
        <span className="w-7 h-7 rounded-xl border-2 bg-muted grid place-items-center text-[10px] font-semibold" style={{ borderColor: 'var(--card)' }}>
          +{peers.length - shown.length}
        </span>
      )}
    </div>
  )
}

export function CollabStatusDot() {
  const status = useCollabStore((s) => s.status)
  if (status === 'off') return null
  const meta = {
    connected: { cls: 'bg-emerald-500', label: 'Live' },
    connecting: { cls: 'bg-amber-500 animate-pulse', label: 'Syncing' },
    disconnected: { cls: 'bg-red-500', label: 'Offline' },
  } as const
  const m = meta[status]
  return (
    <span className="hidden md:flex items-center gap-1.5 mr-1" title={`Realtime: ${m.label}`}>
      <span className="text-xs text-muted-foreground">{m.label}</span>
      <span className={`w-2 h-2 rounded-full ${m.cls}`} />
    </span>
  )
}
