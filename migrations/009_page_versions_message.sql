-- 009: page_versions message column + lookup indexes.
-- Idempotent: safe to re-run (IF NOT EXISTS everywhere).
-- 001 created page_versions(id, page_id, version, blocks_snapshot, created_by, created_at).
-- The client PageVersion type also carries an optional `message` (e.g. "Manual
-- snapshot", "Before restore to v3") which had nowhere to persist until now.
ALTER TABLE IF EXISTS page_versions ADD COLUMN IF NOT EXISTS message TEXT;

CREATE INDEX IF NOT EXISTS idx_page_versions_page_id ON page_versions(page_id);
CREATE INDEX IF NOT EXISTS idx_page_versions_page_version ON page_versions(page_id, version);
