# OpenManas — Workspace OS

A production-quality, full-stack collaborative workspace inspired by Notion + Linear + Craft + Obsidian + Airtable + AI-native tools. Dark-first, fast, extensible, block-based.

Distinct visual identity: soft neutrals, rounded 16-24px panels, subtle borders, excellent typography, command-palette first.

## Stack

- **Frontend:** Vite + React 18 + TypeScript + Tailwind + Zustand + Framer Motion + lucide-react
- **Backend:** Express + Zod validation + file persistence (swappable to PostgreSQL + Prisma)
- **Search:** Fuse.js + semantic abstraction (pgvector ready)
- **Storage:** Abstracted provider (local → S3/R2/Supabase/MinIO)
- **AI:** Centralized AIService with provider abstraction (OpenAI/Anthropic/Google/DeepSeek/OpenRouter)

## Quick Start

```bash
npm install --prefix /content/app
# dev frontend + backend
npm run dev --prefix /content/app      # Vite on 5173
npm run server --prefix /content/app   # Express on 3001
# or both:
npm run dev:all --prefix /content/app

# seeding (frontend uses localStorage seed; backend seeds server/db.json)
npm run seed --prefix /content/app

# build
npm run build --prefix /content/app
npm run preview --prefix /content/app
```

App runs at http://localhost:5173 (proxies /api → 3001).

## Primary Journey

```
Sign in → Workspace → Create Page → Open Editor → Add Blocks → Edit → Reorder → Autosave → Navigate away → Return (still there)
```

Autosave is debounced (400ms), persisted to localStorage (`nexus_state_v1`) and backend via `server/db.json`.

## Architecture

```
src/
  lib/
    types.ts            # User, Workspace, Page, Block, Database, etc (UUIDs, timestamps, FKs)
    blockRegistry.ts    # registry + markdown shortcuts + slash metadata
    databaseEngine.ts   # filter/sort/group + pagination/virtualization helpers
    searchService.ts    # Fuse + semantic vector stubs
    aiService.ts        # AIService + context builder
    storageService.ts   # Storage abstraction
  stores/appStore.ts    # Zustand store with persistence boundaries (server/UI/editor separated)
  components/
    ui/                 # Button, Input, Modal, Toast, Card
    layout/             # Sidebar (collapsible), Topbar, CommandPalette (⌘K), GlobalSearch
    editor/             # BlockEditor, SlashMenu, InlineToolbar, drag-and-drop
    database/           # Table/Board/Gallery/Calendar/List + filters
  pages/
    Dashboard, PageView, DatabasePage, Settings
  data/seed.ts          # Realistic Acme Workspace seed
server/
  index.ts              # Express API with Zod, transactions, consistent error shape
  db.json               # JSON persistence (swap to Postgres via DATABASE_URL)
```

## API

```
/health
/api/workspaces, /api/pages, /api/blocks, /api/databases, /api/records, /api/search, /api/comments, /api/files, /api/activities, /api/auth, /api/ai
```

All POST/PATCH validated with Zod; errors return `{ error: ... }`.

## Features Implemented

**Foundation:** workspaces, auth stub, navigation, collapsible sidebar, command palette (⌘K), global search, dark/light theming via CSS variables, responsive (drawer on mobile).

**Editor:** block types (paragraph, h1-3, bullet/numbered, todo, quote, divider, code, callout, toggle, table, image, video, bookmark, equation, page/database embed, mention) via BlockRegistry; markdown shortcuts (#, -, [], >, ```); slash commands (fuzzy, arrow+enter); block handle (turn into, duplicate, delete, color); drag-and-drop; inline formatting (bold/italic/underline/strike/link); floating toolbar; undo/redo-ready structure; autosave indicator.

**Pages:** nested hierarchy, breadcrumbs, backlinks panel, favorites, archive/trash/restore, duplicate, share dialog (private/workspace/public + permissions), version history stub, cover/icon, properties.

**Databases:** dynamic properties (text/number/select/multi/status/checkbox/date/person/url/email/phone/formula/relation...), Table/Board (groupBy)/Calendar/Gallery/List views, filters (AND/OR/NOT), sorting, grouping, inline edit, column resize/visibility stubs, pagination via virtualization helper, relation rollup ready.

**Productivity:** favorites, recent, templates (seeded), files upload (abstracted), comments (replies/mentions/resolve), activity feed, notifications center, trash, onboarding placeholder.

**AI-ready:** AIService abstraction + AIContextBuilder; per-task model config; streaming stub.

**Other:** skeleton loaders, file upload progress, toast, accessibility (ARIA, focus rings, semantic HTML), performance (debounce, memo, pagination).

## Extensibility

- `BlockRegistry.register()` → new block types without touching editor.
- `AIService.register(provider)` → new AI providers.
- `StorageService.register(provider)` → new storage.
- `Database` views are pluggable via `DatabaseView.type`.
- Plugin interface reserves `blockTypes, commands, propertyTypes, integrations, themes, automations`.

## Testing

```bash
npm test --prefix /content/app
```

Includes unit tests for block ops, filters, search, permissions.

## Production Build

```bash
npm run build --prefix /content/app
# serves dist via Express static
PORT=3001 npm run server --prefix /content/app
```
