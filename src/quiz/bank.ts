import questionsJson from '../../data/questions.json'
import { knowledge } from '../data'

export type Question = {
  id: string
  lecture: number
  conceptId: string
  type: 'definition' | 'not' | 'scenario' | 'distinguish'
  multi: boolean
  q: string
  options: string[]
  answer: number[]
  explanation: string
  cites: string[]
}
export const QUESTIONS = questionsJson as Question[]
export const questionById = new Map(QUESTIONS.map((q) => [q.id, q]))

export type QuizKey = '1' | '2' | '3' | '4' | '5' | 'final'
export type QuizSpec = {
  key: QuizKey
  title: string
  lectures: number[]
  newLectures: number[]
  count: number
  minutes: number
  multiTarget: number
}

export const QUIZ_SPECS: QuizSpec[] = [
  ...(['1', '2', '3', '4', '5'] as const).map((k) => {
    const q = knowledge.quizzes[k]
    return {
      key: k,
      title: `Pop Quiz ${k}`,
      lectures: q.lectures,
      newLectures: q.newLectures,
      count: 10,
      minutes: 10,
      multiTarget: 3,
    }
  }),
  {
    key: 'final',
    title: 'Bonus / Final review',
    lectures: [1, 2, 3, 4, 5, 6, 7, 8, 9],
    newLectures: [9],
    count: 15,
    minutes: 15,
    multiTarget: 4,
  },
]

export type Attempt = {
  quiz: QuizKey
  items: { id: string; order: number[] }[] // order = shuffled original option indices
  answers: Record<string, number[]> // original indices
  flagged: string[]
  startedAt: number
  seconds: number
}
export type HistoryEntry = {
  quiz: QuizKey
  date: number
  score: number
  total: number
  secondsUsed: number
  results: { id: string; correct: boolean; chosen: number[] }[]
}

const shuffle = <T,>(a: T[]) => {
  const b = [...a]
  for (let i = b.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[b[i], b[j]] = [b[j], b[i]]
  }
  return b
}

/** Priority: questions you got wrong before > never seen > previously right; plus randomness. */
function weigh(pool: Question[], history: HistoryEntry[]) {
  const last = new Map<string, boolean>()
  for (const h of history) for (const r of h.results) last.set(r.id, r.correct)
  return pool
    .map((q) => ({ q, w: (last.get(q.id) === false ? 3 : last.has(q.id) ? 0 : 2) + Math.random() * 2.5 }))
    .sort((a, b) => b.w - a.w)
    .map((x) => x.q)
}

/** Pick n questions with ~multiTarget multi-selects, preferring distinct concepts. */
function pick(pool: Question[], n: number, multiTarget: number, history: HistoryEntry[], used: Set<string>) {
  const sorted = weigh(pool, history)
  const out: Question[] = []
  const take = (pred: (q: Question) => boolean, limit: number, distinct: boolean) => {
    for (const q of sorted) {
      if (out.length >= n || limit <= 0) break
      if (out.includes(q) || !pred(q)) continue
      if (distinct && used.has(q.conceptId)) continue
      out.push(q)
      used.add(q.conceptId)
      limit--
    }
  }
  take((q) => q.multi, multiTarget, true)
  take((q) => !q.multi, n, true)
  take(() => true, n, false) // fall back to allowing repeated concepts
  return out
}

export function buildAttempt(spec: QuizSpec, history: HistoryEntry[]): Attempt {
  const pool = QUESTIONS.filter((q) => spec.lectures.includes(q.lecture))
  const used = new Set<string>()
  let chosen: Question[]
  if (spec.key === '1') {
    chosen = pick(pool, spec.count, spec.multiTarget, history, used)
  } else {
    // Cumulative: ~60% from the newly-taught lectures, ~40% from earlier ones.
    const fresh = pool.filter((q) => spec.newLectures.includes(q.lecture))
    const older = pool.filter((q) => !spec.newLectures.includes(q.lecture))
    const nNew = Math.round(spec.count * 0.6)
    const mNew = Math.ceil(spec.multiTarget * 0.6)
    chosen = [
      ...pick(fresh, nNew, mNew, history, used),
      ...pick(older, spec.count - nNew, spec.multiTarget - mNew, history, used),
    ]
  }
  return {
    quiz: spec.key,
    items: shuffle(chosen).map((q) => ({ id: q.id, order: shuffle(q.options.map((_, i) => i)) })),
    answers: {},
    flagged: [],
    startedAt: Date.now(),
    seconds: spec.minutes * 60,
  }
}

/** All-or-nothing marking: the chosen set must exactly equal the correct set. */
export function isCorrect(q: Question, chosen: number[] | undefined) {
  if (!chosen || chosen.length !== q.answer.length) return false
  return q.answer.every((a) => chosen.includes(a))
}
