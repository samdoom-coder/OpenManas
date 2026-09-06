-- OpenManas initial schema
-- Idempotent: safe to re-run (`npm run db:migrate` applies every file on each
-- run). Index names match what Postgres auto-generates for the original
-- anonymous `CREATE INDEX ON ...` statements, so databases migrated with the
-- pre-idempotent 001 keep working with zero duplicate indexes.
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  avatar TEXT,
  password_hash TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS workspaces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  icon TEXT,
  owner_id UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS workspace_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  role TEXT CHECK (role IN ('owner','admin','editor','commenter','viewer')),
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(workspace_id, user_id)
);
CREATE TABLE IF NOT EXISTS pages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
  parent_id UUID REFERENCES pages(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  icon TEXT, cover TEXT, description TEXT,
  properties JSONB DEFAULT '{}',
  is_favorite BOOLEAN DEFAULT false,
  is_archived BOOLEAN DEFAULT false,
  is_trashed BOOLEAN DEFAULT false,
  is_shared BOOLEAN DEFAULT false,
  share_mode TEXT,
  created_by UUID REFERENCES users(id),
  updated_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS pages_workspace_id_idx ON pages(workspace_id);
CREATE INDEX IF NOT EXISTS pages_parent_id_idx ON pages(parent_id);
CREATE INDEX IF NOT EXISTS pages_updated_at_idx ON pages(updated_at);

CREATE TABLE IF NOT EXISTS blocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id UUID REFERENCES pages(id) ON DELETE CASCADE,
  parent_id UUID REFERENCES blocks(id) ON DELETE SET NULL,
  type TEXT NOT NULL,
  content TEXT,
  properties JSONB DEFAULT '{}',
  position INT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS blocks_page_id_idx ON blocks(page_id);
CREATE INDEX IF NOT EXISTS blocks_position_idx ON blocks(position);

CREATE TABLE IF NOT EXISTS databases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
  page_id UUID REFERENCES pages(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  icon TEXT, description TEXT,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS database_properties (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  database_id UUID REFERENCES databases(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  options JSONB,
  relation_database_id UUID REFERENCES databases(id),
  width INT, visible BOOLEAN DEFAULT true
);
CREATE TABLE IF NOT EXISTS database_views (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  database_id UUID REFERENCES databases(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT CHECK (type IN ('table','board','calendar','gallery','list','timeline')),
  filter JSONB, sort JSONB, group_by UUID, visible_properties JSONB
);
CREATE TABLE IF NOT EXISTS database_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  database_id UUID REFERENCES databases(id) ON DELETE CASCADE,
  properties JSONB DEFAULT '{}',
  page_id UUID REFERENCES pages(id) ON DELETE SET NULL,
  position INT,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS database_records_database_id_idx ON database_records(database_id);
CREATE TABLE IF NOT EXISTS files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
  filename TEXT, mime_type TEXT, size INT, storage_key TEXT,
  uploaded_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id UUID REFERENCES pages(id) ON DELETE CASCADE,
  block_id UUID REFERENCES blocks(id) ON DELETE CASCADE,
  record_id UUID REFERENCES database_records(id) ON DELETE CASCADE,
  author_id UUID REFERENCES users(id),
  content TEXT, mentions JSONB, resolved BOOLEAN DEFAULT false,
  parent_id UUID REFERENCES comments(id),
  created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  type TEXT, title TEXT, body TEXT, read BOOLEAN DEFAULT false, link TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id),
  action TEXT, target_id UUID, target_type TEXT, metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS activities_workspace_id_created_at_idx ON activities(workspace_id, created_at);
CREATE TABLE IF NOT EXISTS page_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id UUID REFERENCES pages(id) ON DELETE CASCADE,
  version INT, blocks_snapshot JSONB, created_by UUID REFERENCES users(id), created_at TIMESTAMPTZ DEFAULT NOW()
);
