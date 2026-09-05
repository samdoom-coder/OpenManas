-- Nexus 003: derived JSONB read-model for formula/rollup (see src/lib/databaseEngine.ts).
-- Server evaluates evaluateFormula/evaluateRollup on write and stores into `derived`.
-- Mirrors `derived` field on DatabaseRecord in prisma/schema.prisma.
-- Safe to re-run (IF NOT EXISTS).

ALTER TABLE database_records ADD COLUMN IF NOT EXISTS derived JSONB DEFAULT '{}';
CREATE INDEX IF NOT EXISTS idx_records_derived_gin ON database_records USING GIN (derived);
