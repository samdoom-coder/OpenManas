/** Central URL contract for the app (react-router-dom).
 *
 *  Static screens live at fixed paths; open pages/databases are deep-linkable
 *  (`/page/:id`, `/db/:id`) so reloads, bookmarks and back/forward work.
 *  `routeNameForPath` maps a pathname back to the legacy route names the
 *  Sidebar/BottomNav consume (`dashboard`, `settings`, …) so those components
 *  stay untouched.
 */

export const pathForRouteName = (r: string): string => {
  switch (r) {
    case 'dashboard': return '/'
    case 'page': return '/'
    case 'database': return '/'
    case 'settings': return '/settings'
    case 'templates': return '/templates'
    case 'trash': return '/trash'
    case 'files': return '/files'
    case 'graph': return '/graph'
    case 'shared': return '/shared'
    case 'auth': return '/auth'
    default: return '/'
  }
}

export const pagePath = (id: string): string => `/page/${encodeURIComponent(id)}`
export const databasePath = (id: string): string => `/db/${encodeURIComponent(id)}`
export const joinPath = (token: string): string => `/join/${encodeURIComponent(token)}`

/** Legacy route name for sidebar/bottom-nav highlighting. */
export function routeNameForPath(pathname: string): string {
  if (pathname === '/' || pathname === '') return 'dashboard'
  if (pathname.startsWith('/page/')) return 'page'
  if (pathname.startsWith('/db/')) return 'database'
  if (pathname.startsWith('/settings')) return 'settings'
  if (pathname.startsWith('/templates')) return 'templates'
  if (pathname.startsWith('/trash')) return 'trash'
  if (pathname.startsWith('/files')) return 'files'
  if (pathname.startsWith('/graph')) return 'graph'
  if (pathname.startsWith('/shared')) return 'shared'
  if (pathname.startsWith('/auth')) return 'auth'
  if (pathname.startsWith('/join/')) return 'join'
  return 'dashboard'
}
