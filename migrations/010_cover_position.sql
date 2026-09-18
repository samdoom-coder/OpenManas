-- Page cover focal position (vertical %, 0-100, default 50).
-- Set via the cover "Reposition" control (PATCH coverPosition).
ALTER TABLE pages ADD COLUMN IF NOT EXISTS cover_position INT DEFAULT 50;
UPDATE pages SET cover_position = 50 WHERE cover_position IS NULL;
