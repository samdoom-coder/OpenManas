import type { BlockType, SlashCommand } from './types'

export interface BlockDefinition {
  type: BlockType
  label: string
  description: string
  icon: string
  slash: SlashCommand
  defaultContent?: string
  validate?: (content: string) => boolean
  serialize?: (content: string) => string
}

const registry = new Map<BlockType, BlockDefinition>()

function register(def: BlockDefinition) {
  registry.set(def.type, def)
}

// Basic
register({
  type: 'paragraph',
  label: 'Paragraph',
  description: 'Plain text block',
  icon: 'pilcrow',
  slash: { id: 'paragraph', title: 'Paragraph', description: 'Just start writing', icon: '¶', keywords: ['text', 'paragraph'], blockType: 'paragraph' },
  defaultContent: ''
})
register({
  type: 'heading1',
  label: 'Heading 1',
  description: 'Large heading',
  icon: 'heading1',
  slash: { id: 'h1', title: 'Heading 1', description: 'Large section heading', icon: 'H1', keywords: ['h1', 'heading', 'title'], blockType: 'heading1', shortcut: '# ' },
})
register({
  type: 'heading2',
  label: 'Heading 2',
  description: 'Medium heading',
  icon: 'heading2',
  slash: { id: 'h2', title: 'Heading 2', description: 'Medium heading', icon: 'H2', keywords: ['h2'], blockType: 'heading2', shortcut: '## ' },
})
register({
  type: 'heading3',
  label: 'Heading 3',
  description: 'Small heading',
  icon: 'heading3',
  slash: { id: 'h3', title: 'Heading 3', description: 'Small heading', icon: 'H3', keywords: ['h3'], blockType: 'heading3', shortcut: '### ' },
})
register({
  type: 'bulleted_list',
  label: 'Bulleted list',
  description: 'Simple bulleted list',
  icon: 'list',
  slash: { id: 'bullet', title: 'Bulleted list', description: 'Create a bulleted list', icon: '•', keywords: ['bullet', 'list', 'ul'], blockType: 'bulleted_list', shortcut: '- ' },
})
register({
  type: 'numbered_list',
  label: 'Numbered list',
  description: 'Ordered list',
  icon: 'listOrdered',
  slash: { id: 'numbered', title: 'Numbered list', description: 'Create a numbered list', icon: '1.', keywords: ['numbered', 'ordered'], blockType: 'numbered_list', shortcut: '1. ' },
})
register({
  type: 'todo',
  label: 'To-do',
  description: 'Track tasks',
  icon: 'checkSquare',
  slash: { id: 'todo', title: 'To-do', description: 'Track tasks with checkbox', icon: '☑', keywords: ['todo', 'task', 'checkbox'], blockType: 'todo', shortcut: '[] ' },
})
register({
  type: 'quote',
  label: 'Quote',
  description: 'Capture a quote',
  icon: 'quote',
  slash: { id: 'quote', title: 'Quote', description: 'Capture a quote', icon: '❝', keywords: ['quote', 'blockquote'], blockType: 'quote', shortcut: '> ' },
})
register({
  type: 'divider',
  label: 'Divider',
  description: 'Visual separator',
  icon: 'minus',
  slash: { id: 'divider', title: 'Divider', description: 'Add a divider', icon: '—', keywords: ['divider', 'separator', 'hr'], blockType: 'divider' },
})
// Advanced
register({
  type: 'code',
  label: 'Code',
  description: 'Code block with syntax',
  icon: 'code',
  slash: { id: 'code', title: 'Code', description: 'Add code block', icon: '</>', keywords: ['code', 'snippet'], blockType: 'code', shortcut: '```' },
})
register({
  type: 'callout',
  label: 'Callout',
  description: 'Highlight important text',
  icon: 'alertCircle',
  slash: { id: 'callout', title: 'Callout', description: 'Highlight with icon', icon: '💡', keywords: ['callout', 'alert'], blockType: 'callout' },
})
register({
  type: 'toggle',
  label: 'Toggle',
  description: 'Collapsible block',
  icon: 'chevronRight',
  slash: { id: 'toggle', title: 'Toggle', description: 'Collapsible section', icon: '▸', keywords: ['toggle', 'fold'], blockType: 'toggle' },
})
register({
  type: 'table',
  label: 'Table',
  description: 'Simple table',
  icon: 'table',
  slash: { id: 'table', title: 'Table', description: 'Insert table', icon: '⊞', keywords: ['table'], blockType: 'table' },
})
register({
  type: 'image',
  label: 'Image',
  description: 'Upload or embed image',
  icon: 'image',
  slash: { id: 'image', title: 'Image', description: 'Upload or embed image', icon: '🖼', keywords: ['image', 'photo'], blockType: 'image' },
})
register({
  type: 'video',
  label: 'Video',
  description: 'Embed video',
  icon: 'video',
  slash: { id: 'video', title: 'Video', description: 'Embed video', icon: '▶', keywords: ['video', 'embed'], blockType: 'video' },
})
register({
  type: 'bookmark',
  label: 'Bookmark',
  description: 'Link preview',
  icon: 'bookmark',
  slash: { id: 'bookmark', title: 'Bookmark', description: 'Save a link', icon: '🔖', keywords: ['bookmark', 'link'], blockType: 'bookmark' },
})
register({
  type: 'equation',
  label: 'Equation',
  description: 'Math block',
  icon: 'function',
  slash: { id: 'equation', title: 'Equation', description: 'Math equation', icon: '∑', keywords: ['equation', 'math', 'latex'], blockType: 'equation' },
})
// Workspace
register({
  type: 'page_embed',
  label: 'Page link',
  description: 'Link to page',
  icon: 'fileText',
  slash: { id: 'page', title: 'Page', description: 'Link to a page', icon: '📄', keywords: ['page', 'embed'], blockType: 'page_embed' },
})
register({
  type: 'database_embed',
  label: 'Database',
  description: 'Embed database',
  icon: 'database',
  slash: { id: 'database', title: 'Database', description: 'Embed database', icon: '▦', keywords: ['database', 'table'], blockType: 'database_embed' },
})
register({
  type: 'mention',
  label: 'Mention',
  description: 'Mention person',
  icon: 'atSign',
  slash: { id: 'mention', title: 'Mention', description: 'Mention a user', icon: '@', keywords: ['mention', 'user'], blockType: 'mention' },
})

export const BlockRegistry = {
  get(type: BlockType) { return registry.get(type) },
  all() { return Array.from(registry.values()) },
  slashCommands(): SlashCommand[] { return Array.from(registry.values()).map(r => r.slash) },
  register,
  has(type: string) { return registry.has(type as BlockType) }
}

// Markdown shortcuts handling
export function detectMarkdownShortcut(text: string): BlockType | null {
  if (text.startsWith('# ')) return 'heading1'
  if (text.startsWith('## ')) return 'heading2'
  if (text.startsWith('### ')) return 'heading3'
  if (text.startsWith('- ') || text.startsWith('* ')) return 'bulleted_list'
  if (/^\d+\.\s/.test(text)) return 'numbered_list'
  if (text.startsWith('[] ') || text.startsWith('[ ] ')) return 'todo'
  if (text.startsWith('> ')) return 'quote'
  if (text === '---' || text === '***') return 'divider'
  if (text.startsWith('```')) return 'code'
  return null
}

export function stripMarkdownPrefix(text: string, type: BlockType): string {
  switch(type) {
    case 'heading1': return text.replace(/^#\s+/, '')
    case 'heading2': return text.replace(/^##\s+/, '')
    case 'heading3': return text.replace(/^###\s+/, '')
    case 'bulleted_list': return text.replace(/^[-*]\s+/, '')
    case 'numbered_list': return text.replace(/^\d+\.\s+/, '')
    case 'todo': return text.replace(/^\[.?\]\s+/, '')
    case 'quote': return text.replace(/^>\s+/, '')
    case 'code': return text.replace(/^```/, '')
    default: return text
  }
}
