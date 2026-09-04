-- Page theme (per-page theming, see src/lib/pageThemes.ts)
-- Default 'default' inherits the global workspace theme.
ALTER TABLE pages ADD COLUMN IF NOT EXISTS theme TEXT DEFAULT 'default';
