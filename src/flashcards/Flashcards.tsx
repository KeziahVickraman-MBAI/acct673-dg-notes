import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import cardsJson from '../../data/flashcards.json'
import { Citations } from '../components/Citation'
import {
  conceptById,
  knowledge,
  QUIZ_FILTERS,
  quizFilterLabel,
  scopeOf,
  themeById,
  themes,
  THEME_COLORS,
  type QuizFilter,
} from '../data'
import { useStored } from '../hooks'
import { fmtInterval, nextInterval, rate, status, type CardState, type Grade } from './srs'

type Card = {
  id: string
  conceptId: string
  kind: 'definition' | 'list' | 'compare' | 'fact'
  front: string
  back: string
  prompt?: string
  keyTerms?: string[]
  cites: string[]
  theme: string
  quizzes: number[]
  auto: boolean
}
const CARDS = cardsJson as Card[]
const cardById = new Map(CARDS.map((c) => [c.id, c]))
const KIND_LABEL = { definition: 'Explain', list: 'List', compare: 'Compare', fact: 'Recall' }
const GRADES: { g: Grade; label: string; key: string; cls: string }[] = [
  { g: 'again', label: 'Again', key: '1', cls: 'bg-rose-600 hover:bg-rose-700' },
  { g: 'hard', label: 'Hard', key: '2', cls: 'bg-amber-600 hover:bg-amber-700' },
  { g: 'good', label: 'Good', key: '3', cls: 'bg-emerald-600 hover:bg-emerald-700' },
  { g: 'easy', label: 'Easy', key: '4', cls: 'bg-sky-600 hover:bg-sky-700' },
]
// Order: by first quiz, then course order of the concept, then the concept's own 'explain' card first.
const conceptIndex = new Map(knowledge.concepts.map((c, i) => [c.id, i]))
const themeIndex = new Map(themes.map((t, i) => [t.id, i]))
const ORDER = (c: Card) =>
  (c.quizzes.length ? Math.min(...c.quizzes) : 9) * 1e6 +
  (themeIndex.get(c.theme) ?? 0) * 1e4 +
  (conceptIndex.get(c.conceptId) ?? 0) * 10 +
  (c.auto ? 0 : 1)

export default function Flashcards() {
  const [filter, setFilter] = useStored<QuizFilter>('acct673.fc.quiz', 'all')
  const [onlyNew, setOnlyNew] = useStored('acct673.fc.onlyNew', false)
  const [topics, setTopics] = useStored<string[]>('acct673.fc.topics', [])
  const [mode, setMode] = useStored<'srs' | 'browse'>('acct673.fc.mode', 'srs')
  const [newLimit, setNewLimit] = useStored('acct673.fc.newLimit', 20)
  const [progress, setProgress] = useStored<Record<string, CardState>>('acct673.srs.v1', {})
  const [queue, setQueue] = useState<string[]>([])
  const [flipped, setFlipped] = useState(false)
  const [reviewed, setReviewed] = useState(0)
  const [now, setNow] = useState(Date.now())

  const pool = useMemo(
    () =>
      CARDS.filter((c) => {
        const s = scopeOf(conceptById.get(c.conceptId)!, filter)
        const inQuiz = onlyNew && typeof filter === 'number' ? s.isNew : s.inScope
        return inQuiz && (topics.length === 0 || topics.includes(c.theme))
      }).sort((a, b) => ORDER(a) - ORDER(b)),
    [filter, onlyNew, topics],
  )

  const counts = useMemo(() => {
    const c = { new: 0, learning: 0, due: 0, review: 0, mature: 0 }
    for (const card of pool) c[status(progress[card.id], now)]++
    return c
  }, [pool, progress, now])

  const buildQueue = useCallback(() => {
    const t = Date.now()
    setNow(t)
    if (mode === 'browse') {
      setQueue(pool.map((c) => c.id))
    } else {
      const due = pool
        .filter((c) => progress[c.id] && progress[c.id].due <= t)
        .sort((a, b) => progress[a.id].due - progress[b.id].due)
      const fresh = pool.filter((c) => !progress[c.id]).slice(0, newLimit)
      setQueue([...due, ...fresh].map((c) => c.id))
    }
    setFlipped(false)
    setReviewed(0)
    // progress intentionally excluded: rebuilding on every rating would reset the session
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pool, mode, newLimit])

  useEffect(() => buildQueue(), [buildQueue])

  const card = queue.length ? cardById.get(queue[0]) : undefined

  const grade = useCallback(
    (g: Grade) => {
      if (!card) return
      const next = rate(progress[card.id], g)
      setProgress((p) => ({ ...p, [card.id]: next }))
      setReviewed((r) => r + 1)
      setFlipped(false)
      setQueue((q) => {
        const rest = q.slice(1)
        // short "learning" steps come back later in this session
        if (mode === 'srs' && next.interval < 1) rest.splice(Math.min(rest.length, g === 'again' ? 3 : 6), 0, card.id)
        return rest
      })
    },
    [card, progress, setProgress, mode],
  )

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === 'INPUT' || (e.target as HTMLElement).tagName === 'SELECT') return
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault()
        setFlipped((f) => !f)
      } else if (flipped) {
        const gr = GRADES.find((x) => x.key === e.key)
        if (gr) grade(gr.g)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [flipped, grade])

  const seen = pool.filter((c) => progress[c.id]).length
  const nextDue = pool.map((c) => progress[c.id]?.due).filter((d): d is number => !!d && d > now).sort((a, b) => a - b)[0]

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      {/* filters */}
      <div className="border-b border-slate-200 bg-white px-4 py-3 dark:border-slate-700 dark:bg-slate-900">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-3 text-sm">
          <select
            value={String(filter)}
            onChange={(e) => {
              const v = e.target.value
              setFilter((v === 'all' || v === 'bonus' ? v : Number(v)) as QuizFilter)
            }}
            className="rounded-md border border-slate-300 bg-white px-2 py-1 dark:border-slate-600 dark:bg-slate-800"
          >
            {QUIZ_FILTERS.map((f) => (
              <option key={String(f)} value={String(f)}>
                {quizFilterLabel(f)}
                {typeof f === 'number' ? ` (L${knowledge.quizzes[f].lectures[0]}–${knowledge.quizzes[f].lectures.at(-1)})` : ''}
              </option>
            ))}
          </select>
          {typeof filter === 'number' && (
            <label className="flex items-center gap-1.5">
              <input type="checkbox" checked={onlyNew} onChange={(e) => setOnlyNew(e.target.checked)} />
              Only material new in Quiz {filter} (L{knowledge.quizzes[filter].newLectures.join(', L')})
            </label>
          )}
          <div className="flex rounded-md border border-slate-300 dark:border-slate-600">
            {(['srs', 'browse'] as const).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`px-3 py-1 ${mode === m ? 'bg-indigo-600 text-white' : ''} ${m === 'srs' ? 'rounded-l-md' : 'rounded-r-md'}`}
              >
                {m === 'srs' ? 'Spaced repetition' : 'Browse all'}
              </button>
            ))}
          </div>
          {mode === 'srs' && (
            <label className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
              New cards / session
              <input
                type="number"
                min={0}
                max={200}
                value={newLimit}
                onChange={(e) => setNewLimit(Math.max(0, Number(e.target.value)))}
                className="w-16 rounded-md border border-slate-300 bg-white px-2 py-0.5 dark:border-slate-600 dark:bg-slate-800"
              />
            </label>
          )}
        </div>
        <div className="mx-auto mt-2 flex max-w-5xl flex-wrap gap-1.5">
          <TopicChip active={topics.length === 0} onClick={() => setTopics([])} label="All topics" />
          {themes.map((t) => (
            <TopicChip
              key={t.id}
              active={topics.includes(t.id)}
              color={THEME_COLORS[t.id]}
              label={t.name}
              onClick={() => setTopics(topics.includes(t.id) ? topics.filter((x) => x !== t.id) : [...topics, t.id])}
            />
          ))}
        </div>
      </div>

      <div className="mx-auto w-full max-w-3xl flex-1 px-4 py-5">
        {/* stats */}
        <div className="mb-4 grid grid-cols-5 gap-2 text-center text-xs">
          <Stat n={pool.length} label="In selection" />
          <Stat n={counts.new} label="New" cls="text-sky-600" />
          <Stat n={counts.due + counts.learning} label="Due now" cls="text-rose-600" />
          <Stat n={counts.review} label="Learned" cls="text-emerald-600" />
          <Stat n={counts.mature} label="Mature (21d+)" cls="text-indigo-600" />
        </div>
        <div className="mb-5 h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
          <div className="h-full bg-emerald-500 transition-all" style={{ width: `${pool.length ? (seen / pool.length) * 100 : 0}%` }} />
        </div>

        {card ? (
          <>
            <div className="mb-2 flex justify-between text-xs text-slate-500">
              <span>
                {queue.length} left in this session · {reviewed} reviewed
              </span>
              <span>Space = flip · 1–4 = rate</span>
            </div>
            <FlipCard card={card} flipped={flipped} onFlip={() => setFlipped((f) => !f)} />
            <div className="mt-4 grid grid-cols-4 gap-2">
              {flipped ? (
                GRADES.map((gr) => (
                  <button key={gr.g} onClick={() => grade(gr.g)} className={`rounded-lg py-2 text-sm font-medium text-white ${gr.cls}`}>
                    {gr.label}
                    <div className="text-[11px] font-normal opacity-80">
                      {fmtInterval(nextInterval(progress[card.id], gr.g))} · {gr.key}
                    </div>
                  </button>
                ))
              ) : (
                <button
                  onClick={() => setFlipped(true)}
                  className="col-span-4 rounded-lg bg-indigo-600 py-3 text-sm font-medium text-white hover:bg-indigo-700"
                >
                  Show answer (Space)
                </button>
              )}
            </div>
          </>
        ) : (
          <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center dark:border-slate-700 dark:bg-slate-900">
            <div className="text-3xl">🎉</div>
            <h2 className="mt-2 text-lg font-semibold">
              {pool.length === 0 ? 'No cards match these filters' : 'Session complete'}
            </h2>
            {pool.length > 0 && (
              <p className="mt-1 text-sm text-slate-500">
                {reviewed} cards reviewed.{' '}
                {nextDue ? `Next card due in ${fmtInterval((nextDue - Date.now()) / 86400000)}.` : ''}
              </p>
            )}
            <div className="mt-4 flex justify-center gap-2">
              <button onClick={buildQueue} className="rounded-md border border-slate-300 px-3 py-1.5 text-sm dark:border-slate-600">
                Check for due cards
              </button>
              <button onClick={() => setMode('browse')} className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm text-white">
                Browse all cards
              </button>
            </div>
          </div>
        )}

        <div className="mt-8 flex justify-between text-xs text-slate-400">
          <span>Progress is saved in this browser (localStorage).</span>
          <button
            className="hover:text-rose-600"
            onClick={() => {
              if (confirm('Reset all flashcard progress? This cannot be undone.')) {
                setProgress({})
                setTimeout(buildQueue, 0)
              }
            }}
          >
            Reset progress
          </button>
        </div>
      </div>
    </div>
  )
}

function FlipCard({ card, flipped, onFlip }: { card: Card; flipped: boolean; onFlip: () => void }) {
  const concept = conceptById.get(card.conceptId)!
  const color = THEME_COLORS[card.theme]
  const header = (
    <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
      <span className="rounded-full px-2 py-0.5 font-semibold text-white" style={{ background: color }}>
        {themeById.get(card.theme)!.name}
      </span>
      <span className="rounded-full bg-slate-100 px-2 py-0.5 dark:bg-slate-800">
        {card.quizzes.length ? card.quizzes.map((q) => `Q${q}`).join(' · ') : 'Bonus'}
      </span>
      <span className="text-slate-500">{KIND_LABEL[card.kind]}</span>
    </div>
  )
  return (
    <div className="flip-card cursor-pointer select-text" onClick={onFlip}>
      <div className={`flip-inner ${flipped ? 'is-flipped' : ''}`}>
        <div className="flip-face rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-900" style={{ borderTop: `4px solid ${color}` }}>
          {header}
          <div className="flex min-h-[200px] flex-col items-center justify-center text-center">
            {card.prompt && <div className="mb-2 text-xs uppercase tracking-wide text-slate-400">{card.prompt}</div>}
            <div className="text-xl font-semibold leading-snug">{card.front}</div>
          </div>
          <div className="text-center text-xs text-slate-400">Click or press Space to flip</div>
        </div>
        <div
          className="flip-face flip-back rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-900"
          style={{ borderTop: `4px solid ${color}` }}
        >
          {header}
          <div className="mt-2 text-sm font-medium text-slate-500">{card.front}</div>
          <div className="mt-3 whitespace-pre-line text-[15px] leading-relaxed">{card.back}</div>
          {card.keyTerms && card.keyTerms.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1">
              {card.keyTerms.map((t) => (
                <span key={t} className="rounded bg-slate-100 px-1.5 py-0.5 text-xs dark:bg-slate-800">
                  {t}
                </span>
              ))}
            </div>
          )}
          <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3 text-xs dark:border-slate-800" onClick={(e) => e.stopPropagation()}>
            <span className="text-slate-500">Source:</span>
            <Citations cites={card.cites} />
            <Link to={`/explorer/${concept.theme}/${concept.id}`} className="ml-auto text-indigo-600 hover:underline">
              Open “{concept.name}” in Explorer →
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}

function Stat({ n, label, cls = '' }: { n: number; label: string; cls?: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white py-2 dark:border-slate-700 dark:bg-slate-900">
      <div className={`text-lg font-semibold ${cls}`}>{n}</div>
      <div className="text-slate-500">{label}</div>
    </div>
  )
}

function TopicChip({ label, active, onClick, color }: { label: string; active: boolean; onClick: () => void; color?: string }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full border px-2.5 py-0.5 text-xs ${active ? 'text-white' : 'text-slate-600 dark:text-slate-300'}`}
      style={{ borderColor: color ?? '#6366f1', background: active ? (color ?? '#6366f1') : undefined }}
    >
      {label}
    </button>
  )
}
