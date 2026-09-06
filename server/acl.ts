// Backend ACL — per-user workspace roles + page action checks.
// Mirrors src/lib/permissions.ts on the frontend so both sides agree.
// v1 scope: workspace membership (owner/member) + share-link bearer bypass.
// Legacy behavior preserved: single-user workspaces with no members table
// rows remain open to any authenticated user (zero-setup dev + old tests).

export type Role = 'owner' | 'admin' | 'editor' | 'commenter' | 'viewer'

const order: Record<Role, number> = { owner: 5, admin: 4, editor: 3, commenter: 2, viewer: 1 }

export function canRole(role: Role, required: Role): boolean {
  return (order[role] ?? 0) >= (order[required] ?? 0)
}

export type PageAction = 'view' | 'comment' | 'edit' | 'share' | 'delete'

const actionMinimum: Record<PageAction, Role> = {
  view: 'viewer',
  comment: 'commenter',
  edit: 'editor',
  share: 'admin',
  delete: 'admin',
}

export function requiredRoleFor(action: PageAction): Role {
  return actionMinimum[action]
}

export function canDoPageAction(role: Role, action: PageAction): boolean {
  return canRole(role, actionMinimum[action])
}

/**
 * Resolve the effective role for a user in a workspace.
 * - ownerId match → 'owner'
 * - explicit member row → its role (validated, fallback 'viewer')
 * - otherwise null (no access) — callers may still allow legacy open access
 *   when the workspace has zero members (see `allowLegacyOpenAccess`).
 */
export function resolveWorkspaceRole(
  userId: string | undefined | null,
  ownerId: string | undefined | null,
  memberRole: string | undefined | null,
): Role | null {
  if (userId && ownerId && userId === ownerId) return 'owner'
  if (typeof memberRole === 'string' && (order as Record<string, number>)[memberRole] !== undefined) {
    return memberRole as Role
  }
  return null
}

/**
 * Legacy single-user workspaces (no members rows yet) stay usable without
 * manual invites: any authenticated user gets editor-equivalent access.
 * Returns false as soon as the workspace has explicit membership.
 */
export function allowLegacyOpenAccess(memberCount: number): boolean {
  return memberCount === 0
}

export const VALID_ROLES: Role[] = ['owner', 'admin', 'editor', 'commenter', 'viewer']

export function isValidRole(v: unknown): v is Role {
  return typeof v === 'string' && (VALID_ROLES as string[]).includes(v)
}

// --- Slice 5: per-resource enforcement helpers (pure, unit-tested) ---
// Page PATCH bodies that change visibility touch sharing → admin minimum,
// everything else is a content edit → editor minimum.
const SHARING_KEYS = new Set(['isShared', 'is_shared', 'shareMode', 'share_mode'])

export function touchesSharingFields(body: Record<string, unknown>): boolean {
  return Object.keys(body ?? {}).some((k) => SHARING_KEYS.has(k))
}

export function minimumRoleForPagePatch(body: Record<string, unknown>): Role {
  return touchesSharingFields(body) ? 'admin' : 'editor'
}
