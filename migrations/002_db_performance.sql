-- Nexus 002: database performance (Postgres path).
-- Run after 001_initial.sql. Safe to re-run (IF NOT EXISTS).
-- Frontend paginate() mirrors: LIMIT :pageSize OFFSET (:page-1)*:pageSize
-- with stable ORDER BY position, id. Always return total via COUNT(*) OVER().

-- 10k-record tables: composite + GIN so filter/sort/paginate stays fast.
CREATE INDEX IF NOT EXISTS idx_records_db_position
  ON database_records(database_id, position, id);
CREATE INDEX IF NOT EXISTS idx_records_db_updated
  ON database_records(database_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_records_props_gin
  ON database_records USING GIN (properties);
-- relation/rollup lookups: page link + relation target scans
CREATE INDEX IF NOT EXISTS idx_records_page
  ON database_records(page_id) WHERE page_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_props_db
  ON database_properties(database_id);
CREATE INDEX IF NOT EXISTS idx_views_db
  ON database_views(database_id);
-- blocks/pages stay fast as workspaces grow to 1k pages / 10k blocks
CREATE INDEX IF NOT EXISTS idx_blocks_page_position
  ON blocks(page_id, position);
CREATE INDEX IF NOT EXISTS idx_pages_ws_trash_updated
  ON pages(workspace_id, is_trashed, updated_at DESC);

-- Future derived columns (formula/rollup): prefer a read-model over stored
-- generated columns until expressions stabilize, e.g.:
--   ALTER TABLE database_records ADD COLUMN derived JSONB DEFAULT '{}';
--   CREATE INDEX IF NOT EXISTS idx_records_derived_gin ON database_records USING GIN (derived);
-- Server evaluates evaluateFormula/evaluateRollup (same semantics as
-- src/lib/databaseEngine.ts) on write and stores into `derived`.
