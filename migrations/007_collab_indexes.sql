-- OpenManas 007: Slice 4 — comments/activities/files/notifications sync + ACL.
-- Safe to re-run (IF NOT EXISTS). No column changes, only indexes so
-- multi-user pulls (comments by page/block/record, notifications by user,
-- activities/files by workspace) stay fast.

-- Comments: pull filters used by GET /api/comments?pageId&blockId&recordId
CREATE INDEX IF NOT EXISTS idx_comments_page ON comments(page_id) WHERE page_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_comments_block ON comments(block_id) WHERE block_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_comments_record ON comments(record_id) WHERE record_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_comments_author ON comments(author_id) WHERE author_id IS NOT NULL;

-- Notifications: per-user inbox pull (GET /api/notifications, newest first)
CREATE INDEX IF NOT EXISTS idx_notifications_user_created ON notifications(user_id, created_at DESC);

-- Activities: workspace feed pull (GET /api/activities?workspaceId)
CREATE INDEX IF NOT EXISTS idx_activities_ws_created ON activities(workspace_id, created_at DESC);

-- Files: workspace listing (GET /api/files?workspaceId)
CREATE INDEX IF NOT EXISTS idx_files_ws_created ON files(workspace_id, created_at DESC);

-- Workspace membership lookups for ACL (owner + member role resolution)
CREATE INDEX IF NOT EXISTS idx_members_ws_user ON workspace_members(workspace_id, user_id);
CREATE INDEX IF NOT EXISTS idx_pages_ws ON pages(workspace_id) WHERE workspace_id IS NOT NULL;
