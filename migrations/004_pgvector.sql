-- Nexus 004: pgvector semantic-search pipeline.
-- Requires the pgvector extension on the Postgres host
-- (managed providers: enable "vector" in the dashboard; self-hosted:
-- CREATE EXTENSION vector needs superuser or the extension preinstalled).
-- Safe to re-run (IF NOT EXISTS). If the extension is unavailable, this file
-- fails — run the other migrations without it and retry after installing.
-- Embedding dim (256) must match EMBEDDING_DIM in src/lib/embeddings.ts.
-- Server pipeline (queued): embed on block/record write → upsert here →
-- cosine query for workspace Q&A. Client semantic search works offline via
-- src/lib/embeddings.ts without this table.

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS embeddings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type TEXT NOT NULL CHECK (entity_type IN ('page','block','record')),
  entity_id UUID NOT NULL,
  embedding vector(256) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(entity_type, entity_id)
);
CREATE INDEX IF NOT EXISTS idx_embeddings_entity
  ON embeddings(entity_type, entity_id);
-- HNSW cosine index for top-K similarity (pgvector >= 0.7).
CREATE INDEX IF NOT EXISTS idx_embeddings_hnsw
  ON embeddings USING hnsw (embedding vector_cosine_ops);
