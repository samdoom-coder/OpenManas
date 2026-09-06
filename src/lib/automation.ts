// Automation event bus — Activity → Notification workflows.
// Pure + tiny by design: events are emitted from appStore mutations,
// `buildNotificationsForEvent` decides what (if anything) to notify,
// gated by Settings → Notifications prefs + per-rule toggles.
// Persisted rules: localStorage `openmanas_automations_v1`.

import type { Notification } from '@/lib/types'
import type { NotificationPrefs } from '@/lib/settings'

export type AutomationEventType =
  | 'status_done'
  | 'task_assigned'
  | 'mention'
  | 'comment_added'
  | 'page_shared'

export interface AutomationEventBase {
  type: AutomationEventType
  actorId: string
}

export interface StatusDoneEvent extends AutomationEventBase {
  type: 'status_done'
  databaseId: string
  recordId: string
  title: string
}

export interface TaskAssignedEvent extends AutomationEventBase {
  type: 'task_assigned'
  databaseId: string
  recordId: string
  assignee: string
  title: string
}

export interface MentionEvent extends AutomationEventBase {
  type: 'mention'
  commentId?: string
  pageId?: string
  recordId?: string
  blockId?: string
  mentioned: string[]
  snippet: string
}

export interface CommentAddedEvent extends AutomationEventBase {
  type: 'comment_added'
  commentId: string
  pageId?: string
  recordId?: string
  blockId?: string
  snippet: string
}

export interface PageSharedEvent extends AutomationEventBase {
  type: 'page_shared'
  pageId: string
  title: string
  visibility: string
}

export type AutomationEvent =
  | StatusDoneEvent
  | TaskAssignedEvent
  | MentionEvent
  | CommentAddedEvent
  | PageSharedEvent

export interface AutomationRule {
  id: AutomationEventType
  name: string
  description: string
  notifType: Notification['type']
  enabled: boolean
}

export const DEFAULT_AUTOMATION_RULES: AutomationRule[] = [
  { id: 'status_done', name: 'Status → Done', description: 'When a record status becomes Done → notify', notifType: 'task_assigned', enabled: true },
  { id: 'task_assigned', name: 'Task assigned', description: 'When a person property is set → notify assignee', notifType: 'task_assigned', enabled: true },
  { id: 'mention', name: 'Mention', description: 'When someone is @mentioned in a comment → notify', notifType: 'mention', enabled: true },
  { id: 'comment_added', name: 'New comment', description: 'When a comment is added → notify followers', notifType: 'comment', enabled: true },
  { id: 'page_shared', name: 'Page shared', description: 'When a page is shared (workspace/public) → notify', notifType: 'share', enabled: true },
]

const KEY = 'openmanas_automations_v1'

function storage(): Storage | null {
  try {
    if (typeof localStorage !== 'undefined') return localStorage
    return (globalThis as unknown as { localStorage?: Storage }).localStorage ?? null
  } catch {
    return null
  }
}

export function loadAutomationRules(): AutomationRule[] {
  try {
    const raw = storage()?.getItem(KEY)
    if (!raw) return DEFAULT_AUTOMATION_RULES.map((r) => ({ ...r }))
    const parsed = JSON.parse(raw) as Partial<AutomationRule>[]
    const byId = new Map(parsed.map((r) => [r.id, r]))
    // Merge with defaults so new rules appear after upgrades.
    return DEFAULT_AUTOMATION_RULES.map((d) => ({ ...d, ...byId.get(d.id) }))
  } catch {
    return DEFAULT_AUTOMATION_RULES.map((r) => ({ ...r }))
  }
}

export function saveAutomationRules(rules: AutomationRule[]) {
  try {
    storage()?.setItem(KEY, JSON.stringify(rules))
  } catch { /* quota */ }
}

export function isRuleEnabled(rules: AutomationRule[] | undefined, id: AutomationEventType): boolean {
  if (!rules) return true
  return rules.find((r) => r.id === id)?.enabled ?? true
}

/** Prefs gate: maps notification type → Settings → Notifications toggle. */
export function shouldNotify(prefs: NotificationPrefs | undefined, notifType: Notification['type']): boolean {
  if (!prefs) return true
  switch (notifType) {
    case 'mention': return prefs.mentions
    case 'comment': return prefs.comments
    case 'share': return prefs.shares
    case 'task_assigned':
    case 'system': return prefs.tasks
    default: return true
  }
}

/** Case-insensitive "Done" check (status options are user-customizable). */
export function isDoneValue(v: unknown): boolean {
  return typeof v === 'string' && v.trim().toLowerCase() === 'done'
}

export function isDoneTransition(oldValue: unknown, newValue: unknown): boolean {
  return !isDoneValue(oldValue) && isDoneValue(newValue)
}

/** Extract `@name` tokens from comment text (in addition to explicit mentions[]). */
export function parseMentions(content: string): string[] {
  if (!content) return []
  const out = new Set<string>()
  const re = /@([\w.\-]+)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(content)) !== null) {
    const name = m[1]?.trim().replace(/[.,;:!?]+$/, '')
    if (name) out.add(name)
  }
  return [...out]
}

export interface NotificationDraft {
  type: Notification['type']
  title: string
  body?: string
  link?: string
}

export interface ParsedNotificationLink {
  pageId?: string
  databaseId?: string
  recordId?: string
}

/**
 * Parse links created by `buildNotificationsForEvent`:
 * `page:<id>`, `record:<id>`, `database:<dbId>/record:<recId>`.
 * Returns {} for missing/malformed links (callers show a fallback).
 */
export function parseNotificationLink(link?: string): ParsedNotificationLink {
  if (!link || typeof link !== 'string') return {}
  const out: ParsedNotificationLink = {}
  for (const part of link.split('/')) {
    const i = part.indexOf(':')
    if (i <= 0) continue
    const k = part.slice(0, i)
    const v = part.slice(i + 1).trim()
    if (!v) continue
    if (k === 'page') out.pageId = v
    else if (k === 'database') out.databaseId = v
    else if (k === 'record') out.recordId = v
  }
  return out
}

function snippetOf(s: string, max = 120): string {
  const t = s.replace(/<[^>]*>/g, '').trim()
  return t.length > max ? `${t.slice(0, max - 1)}…` : t
}

/**
 * Pure: event + prefs + rules → 0..1 notification drafts.
 * Never throws, never touches the store — callers fill id/userId/createdAt.
 */
export function buildNotificationsForEvent(
  event: AutomationEvent,
  prefs?: NotificationPrefs,
  rules?: AutomationRule[],
): NotificationDraft[] {
  if (!isRuleEnabled(rules, event.type)) return []
  switch (event.type) {
    case 'status_done': {
      const draft: NotificationDraft = {
        type: 'task_assigned',
        title: `Done: ${event.title || 'Untitled record'}`,
        body: 'Status changed to Done',
        link: `database:${event.databaseId}/record:${event.recordId}`,
      }
      return shouldNotify(prefs, draft.type) ? [draft] : []
    }
    case 'task_assigned': {
      const draft: NotificationDraft = {
        type: 'task_assigned',
        title: `Assigned: ${event.title || 'Untitled record'}`,
        body: `Assigned to ${event.assignee}`,
        link: `database:${event.databaseId}/record:${event.recordId}`,
      }
      return shouldNotify(prefs, draft.type) ? [draft] : []
    }
    case 'mention': {
      if (event.mentioned.length === 0) return []
      const draft: NotificationDraft = {
        type: 'mention',
        title: `You were mentioned: ${event.mentioned.map((m) => `@${m}`).join(', ')}`,
        body: snippetOf(event.snippet),
        link: event.recordId ? `record:${event.recordId}` : event.pageId ? `page:${event.pageId}` : undefined,
      }
      return shouldNotify(prefs, draft.type) ? [draft] : []
    }
    case 'comment_added': {
      const draft: NotificationDraft = {
        type: 'comment',
        title: 'New comment',
        body: snippetOf(event.snippet),
        link: event.recordId ? `record:${event.recordId}` : event.pageId ? `page:${event.pageId}` : undefined,
      }
      return shouldNotify(prefs, draft.type) ? [draft] : []
    }
    case 'page_shared': {
      const draft: NotificationDraft = {
        type: 'share',
        title: `Shared: ${event.title || 'Untitled page'}`,
        body: `Visibility → ${event.visibility}`,
        link: `page:${event.pageId}`,
      }
      return shouldNotify(prefs, draft.type) ? [draft] : []
    }
    default:
      return []
  }
}
