import { uid } from '@/lib/utils'
import type { Page, Block, Database, DatabaseRecord } from '@/lib/types'

const now = () => new Date().toISOString()

export function generateSeed(workspaceId: string, userId: string) {
  const pages: Page[] = []
  const blocks: Block[] = []
  const databases: Database[] = []
  const records: DatabaseRecord[] = []

  const mkPage = (title: string, parentId: string | null, icon?: string, fav=false): Page => {
    const p: Page = { id: uid(), workspaceId, parentId, title, icon, isFavorite: fav, isArchived: false, isTrashed: false, isShared: false, createdBy: userId, updatedBy: userId, createdAt: now(), updatedAt: now() }
    pages.push(p)
    return p
  }

  const mkBlocks = (pageId: string, items: { type: any, content: string }[]) => {
    items.forEach((it, idx) => {
      blocks.push({ id: uid(), pageId, parentId: null, type: it.type, content: it.content, properties: {}, position: idx, createdAt: now(), updatedAt: now() })
    })
  }

  // Top level pages
  const projects = mkPage('Projects', null, '◈')
  const website = mkPage('Website Redesign', projects.id, '◆', true)
  const mobile = mkPage('Mobile App', projects.id, '◇')
  const marketing = mkPage('Marketing Campaign', projects.id, '⬢')
  const knowledge = mkPage('Knowledge Base', null, '◎')
  const eng = mkPage('Engineering', knowledge.id, '⚙')
  const design = mkPage('Design System', knowledge.id, '✦', true)
  const product = mkPage('Product Roadmap', null, '⬣', true)
  const journal = mkPage('Weekly Review', null, '◐')

  mkBlocks(website.id, [
    { type: 'heading1', content: 'Website Redesign — Q4 Initiative' },
    { type: 'paragraph', content: 'A comprehensive redesign focused on performance, accessibility, and conversion. Timeline: 8 weeks.' },
    { type: 'callout', content: '💡 Goal: increase signup conversion by 30% while maintaining brand consistency.' },
    { type: 'heading2', content: 'Objectives' },
    { type: 'bulleted_list', content: 'Ship new homepage with improved hero and social proof' },
    { type: 'bulleted_list', content: 'Optimize Core Web Vitals to < 1.5s LCP' },
    { type: 'bulleted_list', content: 'Unify design tokens across marketing and app' },
    { type: 'todo', content: 'Audit current analytics' },
    { type: 'todo', content: 'Finalize component library' },
    { type: 'divider', content: '' },
    { type: 'quote', content: 'Good design is as little design as possible.' },
  ])

  mkBlocks(eng.id, [
    { type: 'heading1', content: 'Engineering Handbook' },
    { type: 'paragraph', content: 'Principles, rituals, and architecture notes for the engineering team.' },
    { type: 'code', content: `function createBlock(type, content) {\n  return { id: uid(), type, content, position: 0 }\n}` },
    { type: 'heading2', content: 'Architecture' },
    { type: 'paragraph', content: 'Block-based document model with CRDT-ready positions and transactional persistence.' },
  ])

  mkBlocks(design.id, [
    { type: 'heading1', content: 'Design System — OpenManas UI' },
    { type: 'paragraph', content: 'Dark-first, soft neutrals, rounded 16px panels, generous whitespace. Inspired by Linear + Craft.' },
    { type: 'callout', content: '🎨 Tokens: --background, --card, --border, --primary. All theming via CSS variables.' },
  ])

  // Databases
  const tasksDb: Database = {
    id: uid(), workspaceId, name: 'Tasks', icon: '✓', description: 'Team tasks across projects',
    properties: [
      { id: 'p_name', name: 'Name', type: 'text', width: 240, visible: true },
      { id: 'p_status', name: 'Status', type: 'status', options: ['Todo','In Progress','Review','Done'], visible: true },
      { id: 'p_priority', name: 'Priority', type: 'select', options: ['Low','Medium','High','Urgent'], visible: true },
      { id: 'p_assignee', name: 'Assignee', type: 'person', visible: true },
      { id: 'p_due', name: 'Due', type: 'date', visible: true },
      { id: 'p_project', name: 'Project', type: 'relation', relationDatabaseId: 'projects', visible: true },
    ],
    views: [
      { id: uid(), name: 'Table', type: 'table' },
      { id: uid(), name: 'Board', type: 'board', groupBy: 'p_status' },
      { id: uid(), name: 'Calendar', type: 'calendar' },
    ],
    createdBy: userId, createdAt: now(), updatedAt: now()
  }
  const projectsDb: Database = {
    id: uid(), workspaceId, name: 'Projects', icon: '◈', description: 'Active projects',
    properties: [
      { id: 'pj_name', name: 'Project', type: 'text', visible: true },
      { id: 'pj_status', name: 'Status', type: 'status', options: ['Planning','Active','Paused','Completed'], visible: true },
      { id: 'pj_owner', name: 'Owner', type: 'person', visible: true },
      { id: 'pj_due', name: 'Due', type: 'date', visible: true },
    ],
    views: [{ id: uid(), name: 'Table', type: 'table' }, { id: uid(), name: 'Gallery', type: 'gallery' }],
    createdBy: userId, createdAt: now(), updatedAt: now()
  }

  databases.push(tasksDb, projectsDb)

  const taskData = [
    { p_name: 'Design new landing page', p_status: 'In Progress', p_priority: 'High', p_assignee: 'Alex Rivera', p_due: '2026-09-20', p_project: 'Website Redesign' },
    { p_name: 'Implement block drag & drop', p_status: 'Todo', p_priority: 'Urgent', p_assignee: 'Sam Chen', p_due: '2026-09-18', p_project: 'Website Redesign' },
    { p_name: 'Write API documentation', p_status: 'Review', p_priority: 'Medium', p_assignee: 'Jordan Lee', p_due: '2026-09-25', p_project: 'Mobile App' },
    { p_name: 'User research interviews', p_status: 'Done', p_priority: 'High', p_assignee: 'Morgan Park', p_due: '2026-09-10', p_project: 'Marketing Campaign' },
    { p_name: 'Build database filters', p_status: 'In Progress', p_priority: 'High', p_assignee: 'Alex Rivera', p_due: '2026-09-22', p_project: 'Website Redesign' },
    { p_name: 'Create onboarding flow', p_status: 'Todo', p_priority: 'Medium', p_assignee: 'Sam Chen', p_due: '2026-09-28', p_project: 'Mobile App' },
  ]
  taskData.forEach((props, idx) => {
    records.push({ id: uid(), databaseId: tasksDb.id, properties: props as any, position: idx, createdBy: userId, createdAt: now(), updatedAt: now() })
  })

  const projData = [
    { pj_name: 'Website Redesign', pj_status: 'Active', pj_owner: 'Alex Rivera', pj_due: '2026-10-15' },
    { pj_name: 'Mobile App', pj_status: 'Planning', pj_owner: 'Sam Chen', pj_due: '2026-11-30' },
    { pj_name: 'Marketing Campaign', pj_status: 'Active', pj_owner: 'Morgan Park', pj_due: '2026-09-30' },
  ]
  projData.forEach((props, idx) => {
    records.push({ id: uid(), databaseId: projectsDb.id, properties: props as any, position: idx, createdBy: userId, createdAt: now(), updatedAt: now() })
  })

  // extra pages
  mkBlocks(product.id, [
    { type: 'heading1', content: 'Roadmap 2026' },
    { type: 'paragraph', content: 'AI-native workspace OS. Block editor → databases → automation → agents.' },
    { type: 'todo', content: 'Ship foundation (auth, workspace, pages, blocks)' },
    { type: 'todo', content: 'Ship databases (table, board, filters)' },
    { type: 'todo', content: 'Enable AI context & semantic search' },
  ])

  return { pages, blocks, databases, records }
}

export interface TemplateSeedBlock {
  type: string
  content: string
  properties?: Record<string, unknown>
}

export interface TemplateSeed {
  name: string
  category: string
  icon: string
  description: string
  blocks: TemplateSeedBlock[]
}

export const templatesSeed: TemplateSeed[] = [
  {
    name: 'Project',
    category: 'Work',
    icon: '◈',
    description: 'Kick off a new project with goals and tasks',
    blocks: [
      { type: 'heading1', content: 'Project Overview' },
      { type: 'paragraph', content: 'Describe the goal, scope, and success criteria for this project.' },
      { type: 'callout', content: '💡 Tip: keep the goal to one sentence so the team can repeat it.' },
      { type: 'heading2', content: 'Goals' },
      { type: 'bulleted_list', content: 'Goal 1 — what does success look like?' },
      { type: 'bulleted_list', content: 'Goal 2 — how will we measure it?' },
      { type: 'heading2', content: 'Tasks' },
      { type: 'todo', content: 'Define scope and milestones' },
      { type: 'todo', content: 'Assign owners and due dates' },
      { type: 'todo', content: 'Schedule kickoff meeting' },
      { type: 'divider', content: '' },
      { type: 'quote', content: 'Write the press release first, then plan backwards.' },
    ],
  },
  {
    name: 'Meeting Notes',
    category: 'Work',
    icon: '◐',
    description: 'Structured notes with action items',
    blocks: [
      { type: 'heading1', content: 'Meeting Notes' },
      { type: 'paragraph', content: 'Date: today • Attendees: add names • Link: add agenda link' },
      { type: 'heading2', content: 'Agenda' },
      { type: 'bulleted_list', content: 'Topic 1' },
      { type: 'bulleted_list', content: 'Topic 2' },
      { type: 'heading2', content: 'Decisions' },
      { type: 'bulleted_list', content: 'Decision 1 — who decided, why' },
      { type: 'heading2', content: 'Action items' },
      { type: 'todo', content: 'Follow up on open question (@owner)' },
      { type: 'todo', content: 'Share notes with the team' },
    ],
  },
  {
    name: 'Weekly Review',
    category: 'Personal',
    icon: '◎',
    description: 'Reflect and plan the week ahead',
    blocks: [
      { type: 'heading1', content: 'Weekly Review' },
      { type: 'heading2', content: 'Wins' },
      { type: 'bulleted_list', content: 'What went well this week?' },
      { type: 'heading2', content: 'Lessons' },
      { type: 'bulleted_list', content: 'What would I do differently?' },
      { type: 'heading2', content: 'Next week' },
      { type: 'todo', content: 'Top priority 1' },
      { type: 'todo', content: 'Top priority 2' },
      { type: 'todo', content: 'Top priority 3' },
    ],
  },
  {
    name: 'Product Roadmap',
    category: 'Product',
    icon: '⬣',
    description: 'Timeline and milestones',
    blocks: [
      { type: 'heading1', content: 'Roadmap' },
      { type: 'paragraph', content: 'Where are we going and why? Link strategy docs here.' },
      { type: 'heading2', content: 'Now' },
      { type: 'bulleted_list', content: 'Milestone 1 — scope + owner' },
      { type: 'heading2', content: 'Next' },
      { type: 'bulleted_list', content: 'Milestone 2 — scope + owner' },
      { type: 'heading2', content: 'Later' },
      { type: 'bulleted_list', content: 'Big bet — hypothesis to validate' },
    ],
  },
  {
    name: 'Bug Tracker',
    category: 'Engineering',
    icon: '⚙',
    description: 'Track and triage bugs',
    blocks: [
      { type: 'heading1', content: 'Bug Triage' },
      { type: 'heading2', content: 'How to report' },
      { type: 'bulleted_list', content: 'Steps to reproduce' },
      { type: 'bulleted_list', content: 'Expected vs actual behavior' },
      { type: 'bulleted_list', content: 'Environment (OS, browser, version)' },
      { type: 'heading2', content: 'Triage queue' },
      { type: 'todo', content: 'Reproduce reported bug' },
      { type: 'todo', content: 'Assign severity + owner' },
      { type: 'code', content: '// paste stack trace or logs here' },
    ],
  },
  {
    name: 'Content Calendar',
    category: 'Marketing',
    icon: '✎',
    description: 'Plan content across channels',
    blocks: [
      { type: 'heading1', content: 'Content Calendar' },
      { type: 'paragraph', content: 'Theme for this period: write it in one line.' },
      { type: 'heading2', content: 'Pipeline' },
      { type: 'todo', content: 'Draft post 1 (channel + date)' },
      { type: 'todo', content: 'Draft post 2 (channel + date)' },
      { type: 'heading2', content: 'Ideas' },
      { type: 'bulleted_list', content: 'Idea 1 — angle + audience' },
      { type: 'bulleted_list', content: 'Idea 2 — angle + audience' },
    ],
  },
]
