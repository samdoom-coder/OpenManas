import { describe, it, expect, beforeEach } from 'vitest'
import {
  buildNotificationsForEvent,
  isDoneTransition,
  isDoneValue,
  parseMentions,
  parseNotificationLink,
  DEFAULT_AUTOMATION_RULES,
  loadAutomationRules,
  type AutomationRule,
} from '../src/lib/automation'

const ALL_ON = { mentions: true, comments: true, shares: true, tasks: true }
const ALL_OFF = { mentions: false, comments: false, shares: false, tasks: false }

function rulesWith(id: string, enabled: boolean): AutomationRule[] {
  return DEFAULT_AUTOMATION_RULES.map((r) => (r.id === id ? { ...r, enabled } : { ...r }))
}

describe('automation helpers', () => {
  it('detects Done case-insensitively', () => {
    expect(isDoneValue('Done')).toBe(true)
    expect(isDoneValue(' done ')).toBe(true)
    expect(isDoneValue('Doing')).toBe(false)
    expect(isDoneTransition('Doing', 'Done')).toBe(true)
    expect(isDoneTransition('Done', 'Done')).toBe(false)
  })

  it('parses @mentions from text', () => {
    expect(parseMentions('hey @alex and @sam.')).toEqual(['alex', 'sam'])
    expect(parseMentions('no mentions')).toEqual([])
  })

  it('loads defaults when storage is empty', () => {
    expect(loadAutomationRules().length).toBe(5)
  })
})

describe('buildNotificationsForEvent (prefs + rule gating)', () => {
  beforeEach(() => {
    try { localStorage.clear() } catch { /* node without stub */ }
  })

  it('status_done → task notification, gated by tasks pref', () => {
    const ev = { type: 'status_done', actorId: 'u1', databaseId: 'db1', recordId: 'r1', title: 'Launch' } as const
    expect(buildNotificationsForEvent(ev, ALL_ON, DEFAULT_AUTOMATION_RULES).length).toBe(1)
    expect(buildNotificationsForEvent(ev, ALL_OFF, DEFAULT_AUTOMATION_RULES).length).toBe(0)
    expect(buildNotificationsForEvent(ev, ALL_ON, rulesWith('status_done', false)).length).toBe(0)
  })

  it('mention with no names → no notification', () => {
    const ev = { type: 'mention', actorId: 'u1', mentioned: [], snippet: 'hi' } as const
    expect(buildNotificationsForEvent(ev, ALL_ON, DEFAULT_AUTOMATION_RULES).length).toBe(0)
  })

  it('mention respects mentions pref', () => {
    const ev = { type: 'mention', actorId: 'u1', mentioned: ['alex'], snippet: 'hi @alex' } as const
    expect(buildNotificationsForEvent(ev, ALL_ON, DEFAULT_AUTOMATION_RULES)[0].type).toBe('mention')
    expect(buildNotificationsForEvent(ev, { ...ALL_ON, mentions: false }, DEFAULT_AUTOMATION_RULES).length).toBe(0)
  })

  it('comment + share respect their prefs', () => {
    const c = { type: 'comment_added', actorId: 'u1', commentId: 'c1', snippet: 'nice' } as const
    expect(buildNotificationsForEvent(c, ALL_ON, DEFAULT_AUTOMATION_RULES).length).toBe(1)
    expect(buildNotificationsForEvent(c, { ...ALL_ON, comments: false }, DEFAULT_AUTOMATION_RULES).length).toBe(0)
    const s = { type: 'page_shared', actorId: 'u1', pageId: 'p1', title: 'Roadmap', visibility: 'workspace' } as const
    expect(buildNotificationsForEvent(s, ALL_ON, DEFAULT_AUTOMATION_RULES)[0].type).toBe('share')
    expect(buildNotificationsForEvent(s, { ...ALL_ON, shares: false }, DEFAULT_AUTOMATION_RULES).length).toBe(0)
  })

  it('task_assigned carries assignee + link', () => {
    const ev = { type: 'task_assigned', actorId: 'u1', databaseId: 'db1', recordId: 'r2', assignee: 'sam', title: 'Bug' } as const
    const [n] = buildNotificationsForEvent(ev, ALL_ON, DEFAULT_AUTOMATION_RULES)
    expect(n.title).toContain('Bug')
    expect(n.body).toContain('sam')
    expect(n.link).toContain('r2')
  })
})

describe('parseNotificationLink (deep-links)', () => {
  it('parses page / record / database+record links', () => {
    expect(parseNotificationLink('page:abc')).toEqual({ pageId: 'abc' })
    expect(parseNotificationLink('record:r1')).toEqual({ recordId: 'r1' })
    expect(parseNotificationLink('database:db1/record:r2')).toEqual({ databaseId: 'db1', recordId: 'r2' })
  })

  it('returns {} for missing or malformed links', () => {
    expect(parseNotificationLink(undefined)).toEqual({})
    expect(parseNotificationLink('')).toEqual({})
    expect(parseNotificationLink('nonsense')).toEqual({})
    expect(parseNotificationLink('page:')).toEqual({})
  })

  it('round-trips links created by the bus', () => {
    const [done] = buildNotificationsForEvent(
      { type: 'status_done', actorId: 'u1', databaseId: 'db1', recordId: 'r1', title: 'T' },
      ALL_ON, DEFAULT_AUTOMATION_RULES,
    )
    expect(parseNotificationLink(done.link)).toEqual({ databaseId: 'db1', recordId: 'r1' })
    const [shared] = buildNotificationsForEvent(
      { type: 'page_shared', actorId: 'u1', pageId: 'p1', title: 'R', visibility: 'workspace' },
      ALL_ON, DEFAULT_AUTOMATION_RULES,
    )
    expect(parseNotificationLink(shared.link)).toEqual({ pageId: 'p1' })
  })
})
