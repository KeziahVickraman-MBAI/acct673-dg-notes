/**
 * Hybrid retrieval over the extracted slide text (data/raw/_index.json).
 *
 * Unit of retrieval = one slide page. Each page is split into paragraph "blocks" so Claude's
 * citations can point at the exact paragraph it used.
 *
 * Rankers, fused with Reciprocal Rank Fusion (RRF):
 *   1. BM25 keyword search over page text
 *   2. Local embeddings (transformers.js, all-MiniLM-L6-v2): page score = best-matching block
 *   3. Concept index: if the question matches a concept in knowledge.json, the slides that concept
 *      cites get a boost (the mapping is curated from the same slides)
 * If the embedding model can't load (e.g. offline first run), 1 + 3 still work.
 */
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'

export type Passage = {
  cite: string // "L4:8"
  file: string
  lecture: number
  page: number
  label: string // "Lecture 4, p.8"
  title: string // first meaningful line of the slide
  blocks: string[] // paragraphs (citation granularity)
  text: string
}
export type Hit = Passage & { score: number; via: string[] }

const FOOTER = /Data Governance and Quality\s*-\s*SMU Accounting Masters Program/g
const STOP = new Set(
  'a an the and or of to in on for is are was were be been by with as at from that this these those it its what which who whom how why when where do does did can could should would will may might not no yes your you i we they their there than then so such into about per vs versus between each any all some more most other also only both'.split(
    ' ',
  ),
)

export function tokenize(s: string) {
  return (s.toLowerCase().match(/[a-z0-9]+/g) ?? [])
    .filter((t) => !STOP.has(t) && t.length > 1)
    .map((t) => (t.length > 4 && t.endsWith('ies') ? t.slice(0, -3) + 'y' : t.length > 3 && t.endsWith('s') && !t.endsWith('ss') ? t.slice(0, -1) : t))
}

function cleanPage(raw: string) {
  return raw
    .replace(FOOTER, '')
    .split('\n')
    .map((l) => l.replace(/\s{2,}/g, '  ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function toBlocks(text: string): string[] {
  // Split on blank lines; merge tiny fragments so each block is a meaningful citable unit.
  const parts = text.split(/\n\s*\n/).map((p) => p.replace(/\s*\n\s*/g, ' ').replace(/\s{2,}/g, ' ').trim()).filter(Boolean)
  const out: string[] = []
  for (const p of parts) {
    if (out.length && (out[out.length - 1].length < 120 || p.length < 40) && out[out.length - 1].length + p.length < 700) out[out.length - 1] += ' ' + p
    else out.push(p)
  }
  return out
}

/* ---------------- BM25 ---------------- */
class BM25 {
  private docs: string[][]
  private df = new Map<string, number>()
  private avg: number
  constructor(docs: string[][], private k1 = 1.2, private b = 0.75) {
    this.docs = docs
    for (const d of docs) for (const t of new Set(d)) this.df.set(t, (this.df.get(t) ?? 0) + 1)
    this.avg = docs.reduce((s, d) => s + d.length, 0) / Math.max(1, docs.length)
  }
  scores(q: string[]) {
    const N = this.docs.length
    return this.docs.map((d) => {
      const tf = new Map<string, number>()
      for (const t of d) tf.set(t, (tf.get(t) ?? 0) + 1)
      let s = 0
      for (const t of new Set(q)) {
        const f = tf.get(t)
        if (!f) continue
        const n = this.df.get(t) ?? 0
        const idf = Math.log(1 + (N - n + 0.5) / (n + 0.5))
        s += idf * ((f * (this.k1 + 1)) / (f + this.k1 * (1 - this.b + (this.b * d.length) / this.avg)))
      }
      return s
    })
  }
}

const rankOf = (scores: number[]) => {
  const idx = scores.map((s, i) => [s, i] as const).filter(([s]) => s > 0).sort((a, b) => b[0] - a[0])
  const r = new Map<number, number>()
  idx.forEach(([, i], k) => r.set(i, k))
  return r
}

/* ---------------- Index ---------------- */
type Concept = { id: string; name: string; keyTerms: string[]; summary: string; citations: string[] }

export class SlideIndex {
  passages: Passage[] = []
  private bm25!: BM25
  private conceptBm25!: BM25
  private concepts: Concept[] = []
  private blockOwner: number[] = []
  private blockVecs: Float32Array[] = []
  embedStatus: 'loading' | 'ready' | 'unavailable' = 'loading'
  embedError = ''
  readonly embedModel = 'Xenova/all-MiniLM-L6-v2'
  private embedder: ((texts: string[]) => Promise<number[][]>) | null = null
  discussionPrompts: { prompt: string; citation: string; relatedSlides: string[] }[] = []

  constructor(private root: string) {
    const raw = JSON.parse(fs.readFileSync(path.join(root, 'data/raw/_index.json'), 'utf8')) as {
      file: string
      pages: { n: number; text: string }[]
    }[]
    const k = JSON.parse(fs.readFileSync(path.join(root, 'data/knowledge.json'), 'utf8'))
    const fileToLec = new Map<string, string>(Object.entries(k.sources as Record<string, string>).map(([lec, f]) => [f, lec]))
    for (const r of raw) {
      const lec = fileToLec.get(r.file)
      if (!lec) continue
      for (const p of r.pages) {
        const text = cleanPage(p.text)
        if (text.replace(/\s/g, '').length < 60) continue // title / divider slides
        const blocks = toBlocks(text)
        const title = (text.split('\n').find((l) => l.length > 3 && !/^ACCT673$/.test(l)) ?? '').slice(0, 90)
        this.passages.push({
          cite: `${lec}:${p.n}`,
          file: r.file,
          lecture: Number(lec.slice(1)),
          page: p.n,
          label: `Lecture ${lec.slice(1)}, p.${p.n}`,
          title,
          blocks,
          text: blocks.join('\n'),
        })
      }
    }
    this.bm25 = new BM25(this.passages.map((p) => tokenize(p.text + ' ' + p.title)))
    this.concepts = k.concepts.filter((c: { flags?: { notDefinedInSlides?: boolean } }) => !c.flags?.notDefinedInSlides)
    this.conceptBm25 = new BM25(this.concepts.map((c) => tokenize(`${c.name} ${c.name} ${c.keyTerms.join(' ')} ${c.summary}`)))
    this.discussionPrompts = k.discussionPrompts
    this.passages.forEach((p, i) => p.blocks.forEach(() => this.blockOwner.push(i)))
  }

  /** Load the embedding model and embed every block (cached on disk by content hash). */
  async initEmbeddings() {
    try {
      const { pipeline, env } = await import('@huggingface/transformers')
      env.cacheDir = path.join(this.root, 'server/.cache/models')
      const extractor = await pipeline('feature-extraction', this.embedModel, { dtype: 'q8' })
      this.embedder = async (texts) => {
        const out = await extractor(texts, { pooling: 'mean', normalize: true })
        return out.tolist() as number[][]
      }
      const cacheFile = path.join(this.root, 'server/.cache/embeddings.json')
      let cache: Record<string, number[]> = {}
      try {
        const c = JSON.parse(fs.readFileSync(cacheFile, 'utf8'))
        if (c.model === this.embedModel) cache = c.items
      } catch {
        /* no cache yet */
      }
      const blocks = this.passages.flatMap((p) => p.blocks.map((b) => `${p.title}. ${b}`))
      const hashes = blocks.map((b) => crypto.createHash('sha1').update(b).digest('hex'))
      const todo = blocks.map((b, i) => [b, i] as const).filter(([, i]) => !cache[hashes[i]])
      for (let s = 0; s < todo.length; s += 32) {
        const batch = todo.slice(s, s + 32)
        const vecs = await this.embedder(batch.map(([b]) => b))
        batch.forEach(([, i], j) => (cache[hashes[i]] = vecs[j]))
      }
      fs.mkdirSync(path.dirname(cacheFile), { recursive: true })
      fs.writeFileSync(cacheFile, JSON.stringify({ model: this.embedModel, items: Object.fromEntries(hashes.map((h) => [h, cache[h]])) }))
      this.blockVecs = hashes.map((h) => Float32Array.from(cache[h]))
      this.embedStatus = 'ready'
      console.log(`[retrieval] embeddings ready: ${this.blockVecs.length} blocks (${todo.length} newly embedded)`)
    } catch (e) {
      this.embedStatus = 'unavailable'
      this.embedError = (e as Error).message
      console.warn('[retrieval] embeddings unavailable, using keyword + concept search only:', this.embedError)
    }
  }

  async search(query: string, k = 8): Promise<Hit[]> {
    const q = tokenize(query)
    const rankers: { name: string; ranks: Map<number, number>; weight: number }[] = []

    rankers.push({ name: 'keyword', ranks: rankOf(this.bm25.scores(q)), weight: 1 })

    if (this.embedStatus === 'ready' && this.embedder) {
      const [qv] = await this.embedder([query])
      const pageBest = new Array(this.passages.length).fill(0)
      this.blockVecs.forEach((v, bi) => {
        let dot = 0
        for (let d = 0; d < v.length; d++) dot += v[d] * qv[d]
        const owner = this.blockOwner[bi]
        if (dot > pageBest[owner]) pageBest[owner] = dot
      })
      rankers.push({ name: 'semantic', ranks: rankOf(pageBest.map((s) => (s > 0.2 ? s : 0))), weight: 1 })
    }

    // Concept index: top matching concepts vote for the slides they cite.
    const cs = this.conceptBm25.scores(q)
    const topConcepts = cs.map((s, i) => [s, i] as const).filter(([s]) => s > 1.5).sort((a, b) => b[0] - a[0]).slice(0, 3)
    const conceptScore = new Array(this.passages.length).fill(0)
    topConcepts.forEach(([s, ci], rank) => {
      this.concepts[ci].citations.forEach((cite, j) => {
        const pi = this.passages.findIndex((p) => p.cite === cite)
        if (pi >= 0) conceptScore[pi] += s / (rank + 1) / (j + 1)
      })
    })
    rankers.push({ name: 'concept', ranks: rankOf(conceptScore), weight: 0.8 })

    const fused = new Map<number, { score: number; via: string[] }>()
    for (const r of rankers)
      for (const [i, rank] of r.ranks) {
        if (rank >= 30) continue
        const f = fused.get(i) ?? { score: 0, via: [] }
        f.score += r.weight / (60 + rank)
        f.via.push(r.name)
        fused.set(i, f)
      }
    return [...fused.entries()]
      .sort((a, b) => b[1].score - a[1].score)
      .slice(0, k)
      .map(([i, f]) => ({ ...this.passages[i], score: Number((f.score * 1000).toFixed(2)), via: f.via }))
  }

  /** Returns a class discussion prompt (posed on a slide, no answer given) that the question closely matches. */
  matchDiscussionPrompt(query: string) {
    const q = new Set(tokenize(query))
    let best: { prompt: string; citation: string; relatedSlides: string[] } | null = null
    let bestScore = 0
    for (const d of this.discussionPrompts) {
      const t = new Set(tokenize(d.prompt))
      const inter = [...t].filter((x) => q.has(x)).length
      const score = inter / Math.max(1, Math.min(t.size, q.size))
      if (score > bestScore) [best, bestScore] = [d, score]
    }
    return bestScore >= 0.75 ? best : null
  }
}
