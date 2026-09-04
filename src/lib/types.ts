export type ID = string

export interface User {
  id: ID
  email: string
  name: string
  avatar?: string
  createdAt: string
  updatedAt: string
}

export interface Workspace {
  id: ID
  name: string
  icon?: string
  ownerId: ID
  createdAt: string
  updatedAt: string
}

export interface WorkspaceMember {
  id: ID
  workspaceId: ID
  userId: ID
  role: 'owner' | 'admin' | 'editor' | 'commenter' | 'viewer'
  joinedAt: string
}

export type PageIconType = 'emoji' | 'lucide' | 'custom' | 'none'

export interface Page {
  id: ID
  workspaceId: ID
  parentId: ID | null
  title: string
  icon?: string // emoji char when iconType==='emoji', lucide component name when iconType==='lucide'
  iconType?: PageIconType // default: 'emoji' for backwards compat when `icon` is set
  customIcon?: string // dataURL or http(s) URL when iconType==='custom'
  cover?: string
  coverPosition?: number // vertical focal point 0-100 (%), default 50; image covers only
  description?: string
  /** Per-page theme id (see src/lib/pageThemes.ts). Undefined = 'default' (inherit global). */
  theme?: string
  isFavorite: boolean
  isArchived: boolean
  isTrashed: boolean
  isShared: boolean
  shareMode?: 'private' | 'workspace' | 'public'
  properties?: Record<string, unknown>
  createdBy: ID
  updatedBy: ID
  createdAt: string
  updatedAt: string
  // computed
  breadcrumb?: Page[]
  children?: Page[]
}

export type BlockType =
  // basic
  | 'paragraph'
  | 'heading1' | 'heading2' | 'heading3'
  | 'bulleted_list' | 'numbered_list' | 'todo' | 'quote' | 'divider'
  // advanced
  | 'code' | 'callout' | 'toggle' | 'table' | 'image' | 'video' | 'audio' | 'file' | 'bookmark' | 'equation'
  // workspace
  | 'page_embed' | 'database_embed' | 'relation' | 'mention'

export interface Block {
  id: ID
  pageId: ID
  parentId: ID | null
  type: BlockType
  content: string // markdown-like or json string for rich content
  properties: Record<string, unknown>
  position: number
  createdBy?: ID
  createdAt: string
  updatedAt: string
  children?: Block[]
}

export type PropertyType =
  | 'text' | 'number' | 'select' | 'multi_select' | 'status' | 'checkbox'
  | 'date' | 'date_range' | 'person' | 'url' | 'email' | 'phone'
  | 'formula' | 'relation' | 'rollup' | 'created_time' | 'updated_time'

export interface DatabaseProperty {
  id: ID
  name: string
  type: PropertyType
  options?: string[] // for select
  relationDatabaseId?: ID
  required?: boolean
  width?: number
  visible?: boolean
}

export type DatabaseViewType = 'table' | 'board' | 'calendar' | 'gallery' | 'list' | 'timeline'

export interface DatabaseView {
  id: ID
  name: string
  type: DatabaseViewType
  filter?: FilterGroup
  sort?: { propertyId: ID, direction: 'asc' | 'desc' }[]
  groupBy?: ID
  visibleProperties?: ID[]
}

export interface Database {
  id: ID
  workspaceId: ID
  pageId?: ID
  name: string
  icon?: string
  description?: string
  properties: DatabaseProperty[]
  views: DatabaseView[]
  createdBy: ID
  createdAt: string
  updatedAt: string
}

export interface DatabaseRecord {
  id: ID
  databaseId: ID
  properties: Record<ID, unknown>
  pageId?: ID // optional full page
  position: number
  createdBy: ID
  createdAt: string
  updatedAt: string
}

export interface FilterCondition {
  propertyId: ID
  operator: 'equals' | 'not_equals' | 'contains' | 'not_contains' | 'gt' | 'lt' | 'is_empty' | 'is_not_empty' | 'before' | 'after'
  value: unknown
}

export interface FilterGroup {
  op: 'and' | 'or' | 'not'
  conditions: (FilterCondition | FilterGroup)[]
}

export interface FileAsset {
  id: ID
  workspaceId: ID
  filename: string
  mimeType: string
  size: number
  storageKey: string
  url?: string
  uploadedBy: ID
  createdAt: string
}

export interface Comment {
  id: ID
  pageId?: ID
  blockId?: ID
  recordId?: ID
  authorId: ID
  content: string
  mentions?: ID[]
  resolved?: boolean
  createdAt: string
  updatedAt: string
  replies?: Comment[]
  parentId?: ID | null
}

export interface Notification {
  id: ID
  userId: ID
  type: 'mention' | 'comment' | 'share' | 'task_assigned' | 'system'
  title: string
  body?: string
  read: boolean
  link?: string
  createdAt: string
}

export interface Template {
  id: ID
  workspaceId: ID
  name: string
  description?: string
  icon?: string
  category: string
  blocks: Omit<Block, 'id' | 'pageId' | 'createdAt' | 'updatedAt'>[]
  properties?: Record<string, unknown>
}

export interface Activity {
  id: ID
  workspaceId: ID
  userId: ID
  action: 'page_created' | 'page_updated' | 'block_created' | 'block_deleted' | 'record_created' | 'comment_added' | 'file_uploaded' | 'page_shared' | 'page_archived' | 'page_favorited' | 'database_created'
  targetId: ID
  targetType: string
  metadata?: Record<string, unknown>
  createdAt: string
}

export interface ShareLink {
  id: ID
  pageId: ID
  permission: 'view' | 'comment' | 'edit'
  visibility: 'private' | 'workspace' | 'public'
  token: string
  createdBy: ID
  createdAt: string
}

export interface PageVersion {
  id: ID
  pageId: ID
  version: number
  blocksSnapshot: Block[]
  createdBy: ID
  createdAt: string
  message?: string
}

// AI abstaction
export interface AIProvider {
  id: string
  name: string
  models: string[]
  generate(prompt: string, context?: unknown): Promise<string>
  stream?(prompt: string, context?: unknown): AsyncGenerator<string>
}

export interface EmbeddingProvider {
  embed(text: string): Promise<number[]>
  search(query: string, topK?: number): Promise<{ id: string; score: number }[]>
}

// Editor slash command
export interface SlashCommand {
  id: string
  title: string
  description: string
  icon: string
  keywords: string[]
  blockType: BlockType
  shortcut?: string
}

// Plugin extension point
export interface Plugin {
  id: string
  name: string
  blockTypes?: string[]
  commands?: SlashCommand[]
  propertyTypes?: string[]
}
