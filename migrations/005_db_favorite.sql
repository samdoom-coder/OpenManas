-- OpenManas 005: database favorites (see Database.isFavorite).
-- Safe to re-run (IF NOT EXISTS).

ALTER TABLE databases ADD COLUMN IF NOT EXISTS is_favorite BOOLEAN DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_databases_ws_fav
  ON databases(workspace_id, is_favorite, updated_at DESC);
