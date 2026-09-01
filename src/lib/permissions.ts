// Permission system — backend-enforced, frontend mirrors
export type Role = 'owner'|'admin'|'editor'|'commenter'|'viewer'
const order: Record<Role, number> = { owner:5, admin:4, editor:3, commenter:2, viewer:1 }
export function can(role: Role, required: Role): boolean {
  return order[role] >= order[required]
}
export function canEdit(role: Role) { return can(role, 'editor') }
export function canComment(role: Role) { return can(role, 'commenter') }
export function checkPagePermission(role: Role, action: 'view'|'edit'|'comment'|'share'|'delete') {
  const map: Record<string, Role> = { view:'viewer', edit:'editor', comment:'commenter', share:'admin', delete:'admin' }
  return can(role, map[action])
}
