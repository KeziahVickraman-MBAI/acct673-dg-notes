import knowledgeJson from '../data/knowledge.json'
import diagramsJson from '../data/diagrams.json'

export type Relation = { id: string; type: string }
export type Flags = {
  notDefinedInSlides?: boolean
  noQuiz?: boolean
  conflict?: string
  noQuizFigures?: string[]
}
export type Concept = {
  id: string
  name: string
  theme: string
  quizzes: number[]
  summary: string
  explanation: string
  keyTerms: string[]
  examples: string[]
  citations: string[]
  related: Relation[]
  flags?: Flags
}
export type Theme = {
  id: string
  name: string
  summary: string
  lectures: number[]
  citations: string[]
  links: { to: string; label: string }[]
}
export type DiscussionPrompt = {
  id: string
  prompt: string
  citation: string
  relatedConcepts: string[]
  relatedSlides: string[]
}
export type Diagram =
  | { type: 'flow'; citation: string; steps: string[] }
  | { type: 'cycle'; citation: string; center: string; steps: string[] }
  | { type: 'layers'; citation: string; rows: { label: string; items: string[] }[] }
  | { type: 'columns'; citation: string; columns: { title: string; items: string[] }[] }

type Knowledge = {
  sources: Record<string, string>
  quizzes: Record<string, { label: string; lectures: number[]; newLectures: number[]; citations: string[] }>
  quizPolicy: { cumulative: boolean; note: string; bonusLabel: string }
  themes: Theme[]
  concepts: Concept[]
  discussionPrompts: DiscussionPrompt[]
}

export const knowledge = knowledgeJson as unknown as Knowledge
export const diagrams = diagramsJson as unknown as Record<string, Diagram>
export const concepts = knowledge.concepts
export const themes = knowledge.themes
export const conceptById = new Map(concepts.map((c) => [c.id, c]))
export const themeById = new Map(themes.map((t) => [t.id, t]))

/* ---------- Quiz scope ---------- */
// 'all' | 1..5 | 'bonus'. Quizzes are cumulative: Quiz N covers concepts first taught in Quiz <= N.
export type QuizFilter = 'all' | 1 | 2 | 3 | 4 | 5 | 'bonus'
export const QUIZ_FILTERS: QuizFilter[] = ['all', 1, 2, 3, 4, 5, 'bonus']
export const BONUS_LABEL = knowledge.quizPolicy.bonusLabel

export function quizFilterLabel(f: QuizFilter) {
  if (f === 'all') return 'All topics'
  if (f === 'bonus') return BONUS_LABEL
  return `Pop Quiz ${f}`
}
export function firstQuiz(c: Concept): number | null {
  return c.quizzes.length ? Math.min(...c.quizzes) : null
}
/** in scope: shown normally. isNew: material newly introduced for this quiz. */
export function scopeOf(c: Concept, f: QuizFilter): { inScope: boolean; isNew: boolean } {
  const q = firstQuiz(c)
  if (f === 'all') return { inScope: true, isNew: false }
  if (f === 'bonus') return { inScope: q === null, isNew: q === null }
  return { inScope: q !== null && q <= f, isNew: c.quizzes.includes(f) }
}
export function quizBadge(c: Concept) {
  return c.quizzes.length ? c.quizzes.map((q) => `Q${q}`).join(' · ') : 'Bonus'
}

/* ---------- Citations ---------- */
// data/raw/ (extracted slide text) is git-ignored so the public repo doesn't redistribute the slides.
// The glob is empty when the folder is missing, so deployed builds still work, just without slide text.
const rawGlob = import.meta.glob('../data/raw/_index.json', { eager: true, import: 'default' })
const rawIndex = Object.values(rawGlob)[0] ?? []
/** True only when running locally with the lecture PDFs available (the dev server serves them). */
export const HAS_PDFS = import.meta.env.DEV
const pages = new Map<string, string>()
for (const r of rawIndex as { file: string; pages: { n: number; text: string }[] }[]) {
  for (const p of r.pages) pages.set(`${r.file}#${p.n}`, p.text)
}
export function parseCite(cite: string) {
  const [lec, page] = cite.split(':')
  const file = knowledge.sources[lec]
  const n = Number(page)
  return {
    lecture: Number(lec.slice(1)),
    page: n,
    file,
    label: `Lecture ${lec.slice(1)}, p.${n}`,
    short: `${lec} p.${n}`,
    url: `/materials/${encodeURIComponent(file)}#page=${n}`,
    text: pages.get(`${file}#${n}`) ?? '',
  }
}

export const THEME_COLORS: Record<string, string> = {
  foundations: '#6366f1',
  strategy: '#0ea5e9',
  organisation: '#14b8a6',
  governance: '#22c55e',
  documentation: '#eab308',
  quality: '#f97316',
  architecture: '#ec4899',
  trends: '#8b5cf6',
}
