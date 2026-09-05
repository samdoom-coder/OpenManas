-- OpenManas 006: share links (bearer invite tokens per page).
-- Enforcement v1 = link secrecy (no per-user ACL yet).
-- Safe to re-run (IF NOT EXISTS).

CREATE TABLE IF NOT EXISTS share_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id UUID REFERENCES pages(id) ON DELETE CASCADE,
  permission TEXT NOT NULL DEFAULT 'view' CHECK (permission IN ('view','comment','edit')),
  visibility TEXT NOT NULL DEFAULT 'workspace' CHECK (visibility IN ('private','workspace','public')),
  token TEXT UNIQUE NOT NULL,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_share_links_page ON share_links(page_id);
CREATE INDEX IF NOT EXISTS idx_share_links_token ON share_links(token);
