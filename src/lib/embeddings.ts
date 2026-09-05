// Local embeddings + in-memory vector store — zero-dependency semantic search.
// Deterministic hashed-TF vectors (FNV-1a → 256 dims, L2-normalized) so search
// works offline with no API keys. Swap `LocalEmbeddingProvider` for an
// OpenAI/Anthropic provider later via the same `EmbeddingProvider` interface
// (see searchService.ts). Server pipeline: embed on write → pgvector
// (migrations/004_pgvector.sql uses vector(256) to match EMBEDDING_DIM).

export const EMBEDDING_DIM = 256

const STOPWORDS = new Set(
  'a,an,the,and,or,not,but,if,then,else,for,to,of,in,on,at,by,with,from,as,is,are,was,were,be,been,being,it,its,this,that,these,those,i,you,he,she,we,they,my,your,his,her,our,their,me,him,us,them,do,does,did,can,could,should,would,will,just,so,than,too,very,also,into,over,after,before,between,through,up,out,about,how,what,when,where,who,why,which,while'.split(','),
)

export function tokenize(text: string): string[] {
  return (text || '')
    .toLowerCase()
    .replace(/<[^>]*>/g, ' ') // strip HTML (block content stores innerHTML)
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 1 && !STOPWORDS.has(t))
    .map(stem)
}

// Naive symmetric stemmer (plurals/verb forms) — applied to docs and queries
// alike, so "colors" matches "color". Kept conservative to avoid mangling.
export function stem(t: string): string {
  if (t.length > 5 && t.endsWith('ies')) return t.slice(0, -3) + 'y'
  if (t.length > 4 && t.endsWith('es') && !t.endsWith('ues')) return t.slice(0, -2)
  if (t.length > 3 && t.endsWith('s') && !t.endsWith('ss') && !t.endsWith('us')) return t.slice(0, -1)
  return t
}

// FNV-1a 32-bit → dim bucket.
function bucket(token: string, dim: number): number {
  let h = 0x811c9dc5
  for (let i = 0; i < token.length; i++) {
    h ^= token.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0) % dim
}

// Deterministic sync embedding. Same text → same vector.
export function embedText(text: string, dim = EMBEDDING_DIM): number[] {
  const vec = new Array<number>(dim).fill(0)
  for (const tok of tokenize(text)) vec[bucket(tok, dim)] += 1
  // sublinear TF dampens repeated words
  for (let i = 0; i < dim; i++) if (vec[i] > 0) vec[i] = 1 + Math.log(vec[i])
  let norm = 0
  for (let i = 0; i < dim; i++) norm += vec[i] * vec[i]
  norm = Math.sqrt(norm)
  if (norm > 0) for (let i = 0; i < dim; i++) vec[i] /= norm
  return vec
}

export function cosineSimilarity(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length)
  let dot = 0
  for (let i = 0; i < n; i++) dot += a[i] * b[i]
  return dot // inputs are L2-normalized
}

// Async wrapper matching the EmbeddingProvider interface in searchService.ts.
export class LocalEmbeddingProvider {
  constructor(readonly dim = EMBEDDING_DIM) {}
  async embed(text: string): Promise<number[]> {
    return embedText(text, this.dim)
  }
}

export interface VectorDoc {
  id: string
  kind: 'page' | 'block' | 'record'
  title: string
  text: string
}

export interface ScoredDoc extends VectorDoc {
  score: number
}

export function buildDocs(
  pages: { id: string; title: string; description?: string }[],
  blocks: { id: string; pageId: string; content: string }[],
  records: { id: string; properties: Record<string, unknown> }[],
): VectorDoc[] {
  return [
    ...pages.map((p) => ({ id: p.id, kind: 'page' as const, title: p.title, text: `${p.title} ${p.description ?? ''}` })),
    ...blocks
      .filter((b) => (b.content || '').replace(/<[^>]*>/g, '').trim())
      .map((b) => {
        const plain = b.content.replace(/<[^>]*>/g, ' ')
        return { id: b.id, kind: 'block' as const, title: plain.slice(0, 50) || 'Untitled block', text: plain }
      }),
    ...records.map((r) => {
      const vals = Object.values(r.properties ?? {})
      return { id: r.id, kind: 'record' as const, title: String(vals[0] ?? 'Record'), text: vals.map((v) => String(v)).join(' ') }
    }),
  ]
}

// Sync semantic search over docs. Returns topK with cosine scores (0-1).
// Docs sharing no exact (stemmed) token with the query are skipped — this
// keeps 256-dim hash collisions from surfacing as false positives.
export function semanticSearchDocs(query: string, docs: VectorDoc[], topK = 10, dim = EMBEDDING_DIM): ScoredDoc[] {
  if (!query.trim() || docs.length === 0) return []
  const qTokens = new Set(tokenize(query))
  if (qTokens.size === 0) return []
  const q = embedText(query, dim)
  const cache = new Map<string, { vec: number[]; tokens: Set<string> }>()
  const scored: ScoredDoc[] = []
  for (const d of docs) {
    let entry = cache.get(d.text)
    if (!entry) {
      entry = { vec: embedText(d.text, dim), tokens: new Set(tokenize(d.text)) }
      cache.set(d.text, entry)
    }
    let overlap = false
    for (const t of qTokens) {
      if (entry.tokens.has(t)) { overlap = true; break }
    }
    if (!overlap) continue
    const score = cosineSimilarity(q, entry.vec)
    if (score > 0) scored.push({ ...d, score })
  }
  // Exact title matches always win (hashed TF can under-rank short titles).
  const ql = query.toLowerCase().trim()
  for (const s of scored) {
    if (s.title.toLowerCase().includes(ql)) s.score = Math.min(1, s.score + 0.35)
  }
  return scored.sort((a, b) => b.score - a.score).slice(0, topK)
}
