import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import practiceJson from '../../data/practice.json'
import { Citation, Citations } from '../components/Citation'
import { conceptById, knowledge, parseCite } from '../data'
import { useStored } from '../hooks'

type Guide = { criterion: string; marks: number; mustInclude: string; cites: string[] }
type Item = {
  id: string
  kind: 'essay' | 'explain' | 'compare' | 'apply'
  lectures: number[]
  basedOn?: string | null
  wordLimit: number
  totalMarks: number
  title: string
  prompt: string
  conceptIds: string[]
  modelAnswer: string
  markingGuide: Guide[]
  quiz: number | 'essay' | null
  cites: string[]
}
type Progress = { draft: string; revealed: boolean; marks: Record<number, number>; updated: number }
const ITEMS = practiceJson as Item[]
const KIND: Record<Item['kind'], { label: string; cls: string }> = {
  essay: { label: 'Essay · 400 words', cls: 'bg-violet-100 text-violet-800' },
  explain: { label: 'Explain', cls: 'bg-sky-100 text-sky-800' },
  compare: { label: 'Compare', cls: 'bg-amber-100 text-amber-800' },
  apply: { label: 'Apply', cls: 'bg-emerald-100 text-emerald-800' },
}
type Filter = 'all' | 'essay' | 1 | 2 | 3 | 4 | 5 | 'bonus'
const FILTERS: { v: Filter; label: string }[] = [
  { v: 'all', label: 'All' },
  { v: 'essay', label: 'Essays (mixed topics)' },
  ...[1, 2, 3, 4, 5].map((q) => ({ v: q as Filter, label: `Pop Quiz ${q}` })),
  { v: 'bonus', label: 'Bonus / Final review' },
]
const countWords = (s: string) => (s.trim() ? s.trim().split(/\s+/).length : 0)

/** Turn inline [L2:4, L2:5] citation tokens into links that render as citation chips. */
function withCiteLinks(md: string) {
  return md.replace(/\[(L\d:\d+(?:,\s*L\d:\d+)*)\]/g, (_, list: string) =>
    list
      .split(',')
      .map((c) => c.trim())
      .map((c) => `[${parseCite(c).short}](#cite:${c})`)
      .join(' '),
  )
}
function Markdown({ md }: { md: string }) {
  return (
    <div className="answer text-[15px] leading-relaxed">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children }) =>
            href?.startsWith('#cite:') ? <Citation cite={href.slice(6)} /> : <a href={href}>{children}</a>,
        }}
      >
        {withCiteLinks(md)}
      </ReactMarkdown>
    </div>
  )
}

export default function Practice() {
  const { id } = useParams()
  const item = id ? ITEMS.find((x) => x.id === id) : undefined
  const [progress, setProgress] = useStored<Record<string, Progress>>('acct673.practice.v1', {})
  if (item) return <Detail item={item} progress={progress} setProgress={setProgress} />
  return <List progress={progress} />
}

function List({ progress }: { progress: Record<string, Progress> }) {
  const [filter, setFilter] = useStored<Filter>('acct673.practice.filter', 'all')
  const [onlyNew, setOnlyNew] = useStored('acct673.practice.onlyNew', false)
  const [kinds, setKinds] = useStored<Item['kind'][]>('acct673.practice.kinds', [])
  const shown = useMemo(
    () =>
      ITEMS.filter((x) => {
        if (kinds.length && !kinds.includes(x.kind)) return false
        if (filter === 'all') return true
        if (filter === 'essay') return x.kind === 'essay'
        if (filter === 'bonus') return x.quiz === null
        return typeof x.quiz === 'number' && (onlyNew ? x.quiz === filter : x.quiz <= filter)
      }),
    [filter, onlyNew, kinds],
  )
  const done = ITEMS.filter((x) => progress[x.id]?.revealed).length

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-5xl px-4 py-6">
        <h1 className="text-2xl font-semibold">Practice questions</h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          Harder, written questions. The essays follow the assignment and project prompts in your slides; the short questions ask you to explain,
          compare or apply ideas in 100–150 words. Write your answer first, then reveal the model answer and mark yourself against the marking
          guide. Every model answer cites the slides it draws on. {done}/{ITEMS.length} attempted.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
          <select
            value={String(filter)}
            onChange={(e) => {
              const v = e.target.value
              setFilter((['all', 'essay', 'bonus'].includes(v) ? v : Number(v)) as Filter)
            }}
            className="rounded-md border border-slate-300 bg-white px-2 py-1 dark:border-slate-600 dark:bg-slate-800"
          >
            {FILTERS.map((f) => (
              <option key={String(f.v)} value={String(f.v)}>
                {f.label}
                {typeof f.v === 'number' ? ` (L${knowledge.quizzes[f.v].lectures[0]}–${knowledge.quizzes[f.v].lectures.at(-1)})` : ''}
              </option>
            ))}
          </select>
          {typeof filter === 'number' && (
            <label className="flex items-center gap-1.5">
              <input type="checkbox" checked={onlyNew} onChange={(e) => setOnlyNew(e.target.checked)} />
              Only material new in Quiz {filter}
            </label>
          )}
          <div className="flex flex-wrap gap-1">
            {(Object.keys(KIND) as Item['kind'][]).map((k) => (
              <button
                key={k}
                onClick={() => setKinds(kinds.includes(k) ? kinds.filter((x) => x !== k) : [...kinds, k])}
                className={`rounded-full px-2.5 py-0.5 text-xs ${kinds.includes(k) ? KIND[k].cls + ' ring-2 ring-offset-1 ring-slate-400' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'}`}
              >
                {KIND[k].label}
              </button>
            ))}
          </div>
        </div>

        <ul className="mt-4 grid gap-3 sm:grid-cols-2">
          {shown.map((x) => {
            const p = progress[x.id]
            const score = p?.revealed ? Object.values(p.marks).reduce((a, b) => a + b, 0) : null
            return (
              <li key={x.id}>
                <Link
                  to={`/practice/${x.id}`}
                  className="block h-full rounded-2xl border border-slate-200 bg-white p-4 hover:border-indigo-400 hover:shadow-sm dark:border-slate-700 dark:bg-slate-900"
                >
                  <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                    <span className={`rounded-full px-2 py-0.5 font-semibold ${KIND[x.kind].cls}`}>{KIND[x.kind].label}</span>
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                      {x.quiz === 'essay' ? `L${Math.min(...x.lectures)}–${Math.max(...x.lectures)}` : x.quiz === null ? 'Bonus' : `Q${x.quiz}`}
                    </span>
                    <span className="text-slate-400">{x.totalMarks} marks</span>
                    <span className="ml-auto">
                      {score !== null ? (
                        <span className="font-semibold text-emerald-700">
                          {score}/{x.totalMarks}
                        </span>
                      ) : p?.draft ? (
                        <span className="text-amber-700">draft</span>
                      ) : null}
                    </span>
                  </div>
                  <div className="mt-2 font-semibold">{x.title}</div>
                  <p className="mt-1 line-clamp-3 text-sm text-slate-600 dark:text-slate-400">{x.prompt}</p>
                </Link>
              </li>
            )
          })}
        </ul>
      </div>
    </div>
  )
}

function Detail({
  item,
  progress,
  setProgress,
}: {
  item: Item
  progress: Record<string, Progress>
  setProgress: (f: (p: Record<string, Progress>) => Record<string, Progress>) => void
}) {
  const nav = useNavigate()
  const p: Progress = progress[item.id] ?? { draft: '', revealed: false, marks: {}, updated: 0 }
  const save = (patch: Partial<Progress>) => setProgress((all) => ({ ...all, [item.id]: { ...p, ...patch, updated: Date.now() } }))
  const words = countWords(p.draft)
  const over = words > item.wordLimit
  const total = Object.values(p.marks).reduce((a, b) => a + b, 0)
  const [confirmReveal, setConfirmReveal] = useState(false)
  const idx = ITEMS.findIndex((x) => x.id === item.id)
  const next = ITEMS[idx + 1]

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-6xl px-4 py-5">
        <div className="flex items-center gap-3 text-sm">
          <button onClick={() => nav('/practice')} className="text-indigo-600 hover:underline">
            ← All practice questions
          </button>
          {next && (
            <Link to={`/practice/${next.id}`} className="ml-auto text-indigo-600 hover:underline">
              Next question →
            </Link>
          )}
        </div>

        <div className="mt-3 rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900">
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            <span className={`rounded-full px-2 py-0.5 font-semibold ${KIND[item.kind].cls}`}>{KIND[item.kind].label}</span>
            <span className="text-slate-500">
              {item.totalMarks} marks · max {item.wordLimit} words · Lectures {item.lectures.join(', ')}
            </span>
            {item.basedOn && (
              <span className="flex items-center gap-1 text-slate-500">
                · modelled on <Citation cite={item.basedOn} />
              </span>
            )}
          </div>
          <h1 className="mt-2 text-xl font-semibold">{item.title}</h1>
          <p className="mt-2 text-[15px] leading-relaxed">{item.prompt}</p>
          <div className="mt-2 flex flex-wrap gap-1 text-xs">
            {item.conceptIds.map((c) => {
              const cc = conceptById.get(c)!
              return (
                <Link key={c} to={`/explorer/${cc.theme}/${cc.id}`} className="rounded bg-slate-100 px-1.5 py-0.5 text-slate-600 hover:bg-indigo-100 dark:bg-slate-800 dark:text-slate-300">
                  {cc.name}
                </Link>
              )
            })}
          </div>
        </div>

        <div className={`mt-4 grid gap-4 ${p.revealed ? 'lg:grid-cols-2' : ''}`}>
          <section>
            <div className="mb-1 flex items-center justify-between text-xs">
              <h2 className="font-semibold uppercase tracking-wide text-slate-500">Your answer</h2>
              <span className={over ? 'font-semibold text-rose-600' : 'text-slate-500'}>
                {words}/{item.wordLimit} words{over ? ': over the limit' : ''}
              </span>
            </div>
            <textarea
              value={p.draft}
              onChange={(e) => save({ draft: e.target.value })}
              placeholder="Write your answer here. It saves automatically in this browser."
              className="h-[420px] w-full resize-y rounded-xl border border-slate-300 bg-white p-3 text-[15px] leading-relaxed outline-none focus:border-indigo-500 dark:border-slate-600 dark:bg-slate-900"
            />
            {!p.revealed && (
              <div className="mt-2 flex items-center gap-2">
                {confirmReveal && !p.draft.trim() ? (
                  <>
                    <span className="text-sm text-slate-600 dark:text-slate-400">You haven't written anything yet. Reveal anyway?</span>
                    <button onClick={() => save({ revealed: true })} className="rounded-lg bg-slate-700 px-3 py-1.5 text-sm text-white">
                      Yes, reveal
                    </button>
                    <button onClick={() => setConfirmReveal(false)} className="text-sm text-slate-500">
                      Keep writing
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => (p.draft.trim() ? save({ revealed: true }) : setConfirmReveal(true))}
                    className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
                  >
                    Reveal model answer & marking guide
                  </button>
                )}
              </div>
            )}
          </section>

          {p.revealed && (
            <section>
              <h2 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Model answer</h2>
              <div className="max-h-[420px] overflow-y-auto rounded-xl border border-emerald-200 bg-white p-4 dark:border-emerald-900 dark:bg-slate-900">
                <Markdown md={item.modelAnswer} />
              </div>
            </section>
          )}
        </div>

        {p.revealed && (
          <section className="mt-5 rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">Marking guide: mark yourself</h2>
              <div className="text-lg font-bold">
                {total}/{item.totalMarks}
              </div>
            </div>
            <p className="mt-1 text-xs text-slate-500">A full-mark answer must include everything listed under each criterion.</p>
            <table className="mt-3 w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-slate-500">
                  <th className="py-1">Criterion and what a full-mark answer includes</th>
                  <th className="w-40 text-right">Your mark</th>
                </tr>
              </thead>
              <tbody>
                {item.markingGuide.map((g, i) => (
                  <tr key={i} className="border-t border-slate-100 align-top dark:border-slate-800">
                    <td className="py-2 pr-3">
                      <div className="font-medium">{g.criterion}</div>
                      {g.mustInclude && <div className="text-xs text-slate-600 dark:text-slate-400">Must include: {g.mustInclude}</div>}
                      {g.cites.length > 0 && (
                        <div className="mt-1">
                          <Citations cites={g.cites} />
                        </div>
                      )}
                    </td>
                    <td className="py-2 text-right">
                      <div className="inline-flex items-center gap-1">
                        <input
                          type="number"
                          min={0}
                          max={g.marks}
                          step={0.5}
                          value={p.marks[i] ?? 0}
                          onChange={(e) => save({ marks: { ...p.marks, [i]: Math.max(0, Math.min(g.marks, Number(e.target.value))) } })}
                          className="w-16 rounded-md border border-slate-300 bg-white px-2 py-0.5 text-right dark:border-slate-600 dark:bg-slate-800"
                        />
                        <span className="text-slate-500">/ {g.marks}</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-500">
              <span>All sources used in the model answer:</span>
              <Citations cites={item.cites} />
              <button
                onClick={() => save({ revealed: false, marks: {} })}
                className="ml-auto text-slate-400 hover:text-rose-600"
              >
                Hide answer & try again
              </button>
            </div>
          </section>
        )}
      </div>
    </div>
  )
}
