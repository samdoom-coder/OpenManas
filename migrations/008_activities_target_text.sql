-- OpenManas 008: activities.target_id UUID → TEXT.
-- POST /api/activities accepts any client id string (min 1, max 100 chars),
-- but the 001 column is UUID, so non-UUID targets (legacy ids, external refs)
-- crash the insert with `invalid input syntax for type uuid`. TEXT stores both
-- UUIDs and legacy ids; existing UUID values cast losslessly.
-- Safe to re-run.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'activities' AND column_name = 'target_id'
      AND udt_name = 'uuid'
  ) THEN
    ALTER TABLE activities ALTER COLUMN target_id TYPE TEXT;
  END IF;
END $$;
