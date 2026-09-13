// Page export helpers (pure, framework-free): Markdown + JSON.
// Block content is HTML (contentEditable innerHTML) — stripHtml recovers text.

import type { Block, Page } from './types'

const ENTITIES: Record<string, string> = {
  '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&nbsp;': ' ',
}

/** Strip HTML tags to plain text (regex-based, no DOM needed). */
export function stripHtml(html: string): string {
  if (!html) return ''
  let s = html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|h[1-6]|li|tr|blockquote)>\s*<(p|div|h[1-6]|li|tr|blockquote)[^>]*>/gi, '\n')
    .replace(/<\/(p|div|h[1-6]|li|tr|blockquote)>/gi, '\n')
    .replace(/<(li|tr)[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, '')
  s = s.replace(/&(amp|lt|gt|quot|nbsp);|&#39;/g, (m) => ENTITIES[m] ?? m)
  return s
    .split('\n')
    .map((l) => l.replace(/[ \t]+/g, ' ').trim())
    .filter((l) => l.length > 0)
    .join('\n')
}

/** Best-effort TableBlock content ({columns, rows}) → markdown table. */
function tableContentToMarkdown(content: string): string | null {
  try {
    const p = JSON.parse(content) as { columns?: { label?: string }[]; rows?: { cells?: unknown[] }[] }
    if (!Array.isArray(p.columns) || !Array.isArray(p.rows) || p.columns.length === 0) return null
    const head = p.columns.map((c) => String(c?.label ?? '').trim() || ' ')
    const lines = [
      `| ${head.join(' | ')} |`,
      `| ${head.map(() => '---').join(' | ')} |`,
    ]
    for (const r of p.rows) {
      const cells = head.map((_, i) => String((r?.cells as unknown[])?.[i] ?? '').replace(/\|/g, '\\|').trim())
      lines.push(`| ${cells.join(' | ')} |`)
    }
    return lines.join('\n')
  } catch {
    return null
  }
}

function chartTitle(content: string): string {
  try {
    const p = JSON.parse(content) as { title?: unknown }
    return typeof p.title === 'string' && p.title ? p.title : 'Untitled chart'
  } catch {
    return 'Untitled chart'
  }
}

function bookmarkLabel(block: Block): string {
  const p = (block.properties || {}) as Record<string, unknown>
  const title = typeof p.title === 'string' && p.title.trim() ? p.title.trim() : ''
  return title || block.content.trim()
}

/** One block → markdown string ('' when the block has no text export). */
export function blockToMarkdown(block: Block, listIndex = 1): string {
  const text = stripHtml(block.content || '')
  const todoChecked = !!(block.properties as Record<string, unknown> | undefined)?.checked
  switch (block.type) {
    case 'heading1': return text ? `# ${text}` : ''
    case 'heading2': return text ? `## ${text}` : ''
    case 'heading3': return text ? `### ${text}` : ''
    case 'bulleted_list': return text ? `- ${text}` : ''
    case 'numbered_list': return text ? `${listIndex}. ${text}` : ''
    case 'todo': return text ? `- [${todoChecked ? 'x' : ' '}] ${text}` : ''
    case 'quote': return text ? text.split('\n').map((l) => `> ${l}`).join('\n') : ''
    case 'callout': return text ? `> 💡 ${text}` : ''
    case 'code': return text ? `\`\`\`\n${text}\n\`\`\`` : ''
    case 'equation': return text ? `$$${text}$$` : ''
    case 'divider': return '---'
    case 'toggle': {
      const body = typeof (block.properties as Record<string, unknown> | undefined)?.body === 'string'
        ? stripHtml((block.properties as Record<string, string>).body)
        : ''
      const head = text ? `- ▸ ${text}` : ''
      const tail = body ? body.split('\n').map((l) => `  ${l}`).join('\n') : ''
      return [head, tail].filter(Boolean).join('\n')
    }
    case 'table': return tableContentToMarkdown(block.content || '') ?? (text ? text : '')
    case 'chart': return `_📊 Chart: ${chartTitle(block.content || '')}_`
    case 'image': return block.content.trim() ? `![](${block.content.trim()})` : ''
    case 'video': return block.content.trim() ? `[▶ Video](${block.content.trim()})` : ''
    case 'audio': return block.content.trim() ? `[🎵 Audio](${block.content.trim()})` : ''
    case 'file': return block.content.trim() ? `[📎 ${block.content.trim().split('/').pop() || 'File'}](${block.content.trim()})` : ''
    case 'bookmark': return block.content.trim() ? `[${bookmarkLabel(block)}](${block.content.trim()})` : ''
    case 'page_embed':
    case 'database_embed':
    case 'relation':
    case 'mention':
      return text ? text : ''
    case 'paragraph':
    default:
      return text
  }
}

/** Full page (title + description + blocks in position order) → markdown. */
export function pageToMarkdown(page: Page, blocks: Block[]): string {
  const sorted = [...blocks]
    .filter((b) => b.pageId === page.id)
    .sort((a, b) => a.position - b.position)
  const parts: string[] = [`# ${page.title || 'Untitled'}`, '']
  if (page.description) parts.push(`_${page.description}_`, '')
  let numbered = 0
  for (const b of sorted) {
    if (b.type === 'numbered_list') numbered += 1
    else numbered = 0
    const md = blockToMarkdown(b, numbered || 1)
    if (md) parts.push(md, '')
  }
  return parts.join('\n').trimEnd() + '\n'
}

/** Full page snapshot → pretty JSON. */
export function pageToJson(page: Page, blocks: Block[]): string {
  const sorted = [...blocks]
    .filter((b) => b.pageId === page.id)
    .sort((a, b) => a.position - b.position)
  return JSON.stringify({ page, blocks: sorted }, null, 2)
}

/** Filesystem-safe download name from a page title. */
export function exportFilename(title: string, ext: string): string {
  const base = (title || 'page')
    .replace(/[\\/:*?"<>|#%&{}$!'@+=`]/g, '')
    .replace(/\s+/g, '-')
    .slice(0, 60)
    .replace(/^-+|-+$/g, '')
  return `${base || 'page'}.${ext}`
}
