import { app, PORT } from './app.js'
import { usingPg, pgQuery } from './pg.js'

// Self-healing isolation (Postgres): workspaces created before owner
// membership existed have zero member rows, which the legacy-open rule
// exposes to every user. Grant each owner their membership once at boot so
// pre-existing workspaces become private too. Idempotent + best-effort.
if (usingPg) {
  pgQuery(
    `INSERT INTO workspace_members(workspace_id, user_id, role)
     SELECT id, owner_id, 'owner' FROM workspaces WHERE owner_id IS NOT NULL
     ON CONFLICT (workspace_id, user_id) DO NOTHING`,
  ).then((r) => {
    if (Array.isArray(r)) console.log(`[acl] backfilled owner membership`)
  }).catch((e) => console.error('[acl] owner backfill skipped:', (e as Error)?.message || e))
}

app.listen(PORT, ()=> console.log(`API server listening on http://localhost:${PORT} (db: ${usingPg ? 'postgres' : 'json'})`))
