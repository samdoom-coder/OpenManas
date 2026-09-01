import Fuse from 'fuse.js'
import type { Page, Block, DatabaseRecord } from './types'

export interface SearchResult {
  id: string
  title: string
  type: 'page' | 'block' | 'record'
  breadcrumb?: string
  snippet?: string
  updatedAt: string
  score?: number
}

export class SearchService {
  private fusePage?: Fuse<Page>
  private fuseBlock?: Fuse<Block>

  indexPages(pages: Page[]) {
    this.fusePage = new Fuse(pages, { keys: ['title', 'description'], threshold: 0.3, includeScore: true })
  }
  indexBlocks(blocks: Block[]) {
    this.fuseBlock = new Fuse(blocks, { keys: ['content'], threshold: 0.4, includeScore: true })
  }

  search(query: string, pages: Page[], blocks: Block[], records: DatabaseRecord[]): SearchResult[] {
    if (!query.trim()) return []
    const results: SearchResult[] = []
    // Fuse for pages
    if (this.fusePage) {
      const r = this.fusePage.search(query)
      r.forEach(hit => results.push({
        id: hit.item.id,
        title: hit.item.title,
        type: 'page',
        breadcrumb: '',
        snippet: hit.item.description?.slice(0,120),
        updatedAt: hit.item.updatedAt,
        score: hit.score
      }))
    } else {
      // fallback simple
      pages.filter(p => p.title.toLowerCase().includes(query.toLowerCase())).forEach(p => results.push({
        id: p.id, title: p.title, type: 'page', updatedAt: p.updatedAt
      }))
    }
    // blocks
    blocks.filter(b => b.content.toLowerCase().includes(query.toLowerCase())).slice(0,10).forEach(b => {
      results.push({ id: b.id, title: b.content.slice(0,50) || 'Untitled block', type: 'block', snippet: b.content.slice(0,100), updatedAt: b.updatedAt })
    })
    records.filter(r => Object.values(r.properties).some(v => String(v).toLowerCase().includes(query.toLowerCase()))).slice(0,10).forEach(r => {
      results.push({ id: r.id, title: String(Object.values(r.properties)[0] || 'Record'), type: 'record', updatedAt: r.updatedAt })
    })
    // simple sort by score
    return results.slice(0,20)
  }
}

export const searchService = new SearchService()

// Semantic search abstraction (future)
export interface EmbeddingProvider {
  embed(text: string): Promise<number[]>
}
export interface VectorStore {
  upsert(id: string, vector: number[], metadata: unknown): Promise<void>
  query(vector: number[], topK: number): Promise<{ id: string, score: number }[]>
}
export class SemanticSearchService {
  constructor(private embedding: EmbeddingProvider, private store: VectorStore) {}
  async semanticSearch(query: string) {
    const vec = await this.embedding.embed(query)
    return this.store.query(vec, 10)
  }
}
