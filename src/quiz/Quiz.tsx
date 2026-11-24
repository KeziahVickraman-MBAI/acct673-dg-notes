import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Citations } from '../components/Citation'
import { conceptById, themeById, THEME_COLORS } from '../data'
import { useStored } from '../hooks'
import {
  buildAttempt,
  isCorrect,
  QUESTIONS,
  questionById,
  QUIZ_SPECS,
  type Attempt,
  type HistoryEntry,
  type QuizKey,
} from './bank'

const TYPE_LABEL = { definition: 'Definition', not: 'Which is NOT…', scenario: 'Apply to a scenario', distinguish: 'Tell apart' }
const LETTERS = 'ABCDEFG'
const specOf = (k: QuizKey) => QUIZ_SPECS.find((s) => s.key === k)!

export default function Quiz() {
  const [attempt, setAttempt] = useStored<Attempt | null>('acct673.quiz.current', null)
  const [history, setHistory] = useStored<HistoryEntry[]>('acct673.quiz.history', [])
  const [result, setResult] = useState<HistoryEntry | null>(null)

  const submit = (a: Attempt) => {
    const results = a.items.map(({ id }) => {
      const q = questionById.get(id)!
      return { id, chosen: a.answers[id] ?? [], correct: isCorrect(q, a.answers[id]) }
    })
    const entry: HistoryEntry = {
      quiz: a.quiz,
      date: Date.now(),
      score: results.filter((r) => r.correct).length,
      total: results.length,
      secondsUsed: Math.min(a.seconds, Math.round((Date.now() - a.startedAt) / 1000)),
      results,
    }
    setHistory((h) => [entry, ...h].slice(0, 100))
    setResult(entry)
    setAttempt(null)
  }

  if (attempt) return <Run attempt={attempt} setAttempt={setAttempt} onSubmit={submit} />
  if (result) return <Results entry={result} history={history} onRetake={() => { setResult(null); setAttempt(buildAttempt(specOf(result.quiz), history)) }} onHome={() => setResult(null)} />
  return <Home history={history} onStart={(k) => setAttempt(buildAttempt(specOf(k), history))} onOpen={setResult} onClear={() => setHistory([])} />
}

/* ---------------- Home ---------------- */

function Home({ history, onStart, onOpen, onClear }: { history: HistoryEntry[]; onStart: (k: QuizKey) => void; onOpen: (h: HistoryEntry) => void; onClear: () => void }) {
  const weak = useMemo(() => weakConcepts(history.flatMap((h) => h.results)), [history])
  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-5xl px-4 py-6">
        <h1 className="text-2xl font-semibold">Pop Quiz</h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          Timed MCQ quizzes drawn from a bank of {QUESTIONS.length} questions written from your slides. Quizzes are <b>cumulative</b>:
          about 60% of questions come from the newly taught lectures and 40% from earlier ones. Questions marked{' '}
          <span className="rounded bg-violet-100 px-1.5 py-0.5 text-xs font-semibold text-violet-800">Select all that apply</span> are
          multi-select and marked all-or-nothing (you must pick exactly the correct set). Each retake draws a new set, favouring questions you
          got wrong or haven't seen.
        </p>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {QUIZ_SPECS.map((s) => {
            const mine = history.filter((h) => h.quiz === s.key)
            const best = mine.length ? Math.max(...mine.map((h) => h.score / h.total)) : null
            const poolSize = QUESTIONS.filter((q) => s.lectures.includes(q.lecture)).length
            return (
              <div key={s.key} className={`flex flex-col rounded-2xl border bg-white p-4 dark:bg-slate-900 ${s.key === 'final' ? 'border-violet-300 dark:border-violet-800' : 'border-slate-200 dark:border-slate-700'}`}>
                <div className="flex items-start justify-between">
                  <h2 className="text-lg font-semibold">{s.title}</h2>
                  {best !== null && <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${best >= 0.7 ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>best {Math.round(best * 100)}%</span>}
                </div>
                <div className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                  Lectures {s.lectures[0]}–{s.lectures.at(-1)}
                  {s.key !== '1' && s.key !== 'final' && <> · focus on L{s.newLectures.join(', L')}</>}
                  {s.key === 'final' && <> · includes the bonus Lecture 9</>}
                </div>
                <div className="mt-1 text-xs text-slate-500">
                  {s.count} questions · {s.minutes} min · ~{s.multiTarget} multi-select · bank of {poolSize}
                </div>
                <div className="mt-1 text-xs text-slate-500">{mine.length} attempt{mine.length === 1 ? '' : 's'}</div>
                <button onClick={() => onStart(s.key)} className="mt-3 rounded-lg bg-indigo-600 py-2 text-sm font-medium text-white hover:bg-indigo-700">
                  Start {s.title}
                </button>
              </div>
            )
          })}
        </div>

        {weak.length > 0 && (
          <section className="mt-8">
            <h2 className="text-lg font-semibold">Weak topics across all attempts</h2>
            <WeakList weak={weak} />
          </section>
        )}

        {history.length > 0 && (
          <section className="mt-8">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">History</h2>
              <button className="text-xs text-slate-400 hover:text-rose-600" onClick={() => confirm('Clear quiz history?') && onClear()}>
                Clear history
              </button>
            </div>
            <table className="mt-2 w-full text-sm">
              <tbody>
                {history.slice(0, 15).map((h) => (
                  <tr key={h.date} className="border-t border-slate-100 dark:border-slate-800">
                    <td className="py-1.5">{specOf(h.quiz).title}</td>
                    <td className="text-slate-500">{new Date(h.date).toLocaleString()}</td>
                    <td className="font-medium">{h.score}/{h.total}</td>
                    <td className="text-slate-500">{fmt(h.secondsUsed)}</td>
                    <td className="text-right"><button onClick={() => onOpen(h)} className="text-indigo-600 hover:underline">Review</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}
      </div>
    </div>
  )
}

/* ---------------- Run ---------------- */

function Run({ attempt, setAttempt, onSubmit }: { attempt: Attempt; setAttempt: (a: Attempt | null) => void; onSubmit: (a: Attempt) => void }) {
  const [i, setI] = useState(0)
  const [now, setNow] = useState(Date.now())
  const spec = specOf(attempt.quiz)
  const left = Math.max(0, attempt.seconds - Math.floor((now - attempt.startedAt) / 1000))

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 500)
    return () => clearInterval(t)
  }, [])
  const submitted = useRef(false)
  const finish = () => {
    if (submitted.current) return
    submitted.current = true
    onSubmit(attempt)
  }
  useEffect(() => {
    if (left === 0) finish()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [left])

  const item = attempt.items[i]
  const q = questionById.get(item.id)!
  const chosen = attempt.answers[q.id] ?? []
  const answeredCount = attempt.items.filter((it) => (attempt.answers[it.id] ?? []).length > 0).length
  const flagged = attempt.flagged.includes(q.id)

  const toggle = (orig: number) => {
    const next = q.multi ? (chosen.includes(orig) ? chosen.filter((x) => x !== orig) : [...chosen, orig]) : [orig]
    setAttempt({ ...attempt, answers: { ...attempt.answers, [q.id]: next } })
  }
  const trySubmit = () => {
    const missing = attempt.items.length - answeredCount
    if (missing === 0 || confirm(`${missing} question${missing > 1 ? 's are' : ' is'} unanswered. Submit anyway?`)) finish()
  }

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <div className="sticky top-0 z-10 border-b border-slate-200 bg-white px-4 py-2 dark:border-slate-700 dark:bg-slate-900">
        <div className="mx-auto flex max-w-3xl items-center gap-3">
          <div className="font-semibold">{spec.title}</div>
          <div className="text-sm text-slate-500">{answeredCount}/{attempt.items.length} answered</div>
          <div className={`ml-auto rounded-md px-2.5 py-1 font-mono text-lg font-semibold ${left <= 60 ? 'animate-pulse bg-rose-100 text-rose-700' : 'bg-slate-100 dark:bg-slate-800'}`}>
            ⏱ {fmt(left)}
          </div>
          <button onClick={() => confirm('Abandon this attempt? It will not be saved.') && setAttempt(null)} className="text-sm text-slate-400 hover:text-rose-600">
            Quit
          </button>
        </div>
        <div className="mx-auto mt-2 flex max-w-3xl flex-wrap gap-1">
          {attempt.items.map((it, j) => {
            const done = (attempt.answers[it.id] ?? []).length > 0
            const fl = attempt.flagged.includes(it.id)
            return (
              <button
                key={it.id}
                onClick={() => setI(j)}
                className={`h-7 w-7 rounded-md text-xs font-medium ${j === i ? 'ring-2 ring-indigo-500' : ''} ${done ? 'bg-indigo-600 text-white' : 'bg-slate-100 dark:bg-slate-800'} ${fl ? 'outline outline-2 outline-amber-400' : ''}`}
                title={fl ? 'Flagged' : undefined}
              >
                {j + 1}
              </button>
            )
          })}
        </div>
      </div>

      <div className="mx-auto w-full max-w-3xl flex-1 px-4 py-5">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="font-semibold text-slate-500">Question {i + 1} of {attempt.items.length}</span>
            <span className="rounded bg-slate-100 px-1.5 py-0.5 text-slate-600 dark:bg-slate-800 dark:text-slate-300">{TYPE_LABEL[q.type]}</span>
            {q.multi ? (
              <span className="rounded bg-violet-100 px-1.5 py-0.5 font-semibold text-violet-800">Select all that apply</span>
            ) : (
              <span className="rounded bg-slate-100 px-1.5 py-0.5 text-slate-600 dark:bg-slate-800 dark:text-slate-300">Choose one</span>
            )}
          </div>
          <p className="mt-3 text-[17px] font-medium leading-relaxed">{q.q}</p>
          <div className="mt-4 space-y-2">
            {item.order.map((orig, j) => {
              const on = chosen.includes(orig)
              return (
                <button
                  key={orig}
                  onClick={() => toggle(orig)}
                  className={`flex w-full items-start gap-3 rounded-xl border px-3 py-2.5 text-left text-sm transition ${on ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950' : 'border-slate-200 hover:border-slate-400 dark:border-slate-700'}`}
                >
                  <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center border text-[11px] font-semibold ${q.multi ? 'rounded' : 'rounded-full'} ${on ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-slate-400'}`}>
                    {on ? '✓' : LETTERS[j]}
                  </span>
                  <span>{q.options[orig]}</span>
                </button>
              )
            })}
          </div>
          {q.multi && <div className="mt-2 text-xs text-slate-500">{chosen.length} selected · all-or-nothing marking</div>}
        </div>

        <div className="mt-4 flex items-center gap-2">
          <button disabled={i === 0} onClick={() => setI(i - 1)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:opacity-40 dark:border-slate-600">
            ← Previous
          </button>
          <button
            onClick={() => setAttempt({ ...attempt, flagged: flagged ? attempt.flagged.filter((x) => x !== q.id) : [...attempt.flagged, q.id] })}
            className={`rounded-lg border px-3 py-2 text-sm ${flagged ? 'border-amber-400 bg-amber-50 text-amber-800' : 'border-slate-300 dark:border-slate-600'}`}
          >
            {flagged ? '★ Flagged' : '☆ Flag for review'}
          </button>
          <div className="ml-auto flex gap-2">
            {i < attempt.items.length - 1 && (
              <button onClick={() => setI(i + 1)} className="rounded-lg bg-slate-800 px-4 py-2 text-sm text-white dark:bg-slate-200 dark:text-slate-900">
                Next →
              </button>
            )}
            <button onClick={trySubmit} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700">
              Submit
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ---------------- Results ---------------- */

type Weak = { conceptId: string; right: number; total: number }
function weakConcepts(results: { id: string; correct: boolean }[]): Weak[] {
  const m = new Map<string, Weak>()
  for (const r of results) {
    const q = questionById.get(r.id)
    if (!q) continue
    const w = m.get(q.conceptId) ?? { conceptId: q.conceptId, right: 0, total: 0 }
    w.total++
    if (r.correct) w.right++
    m.set(q.conceptId, w)
  }
  return [...m.values()].filter((w) => w.right < w.total).sort((a, b) => a.right / a.total - b.right / b.total || b.total - a.total)
}

function WeakList({ weak }: { weak: Weak[] }) {
  return (
    <ul className="mt-2 grid gap-2 sm:grid-cols-2">
      {weak.slice(0, 12).map((w) => {
        const c = conceptById.get(w.conceptId)!
        return (
          <li key={w.conceptId} className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900" style={{ borderLeft: `4px solid ${THEME_COLORS[c.theme]}` }}>
            <div className="flex-1">
              <div className="font-medium">{c.name}</div>
              <div className="text-xs text-slate-500">{w.right}/{w.total} correct · {themeById.get(c.theme)!.name}</div>
            </div>
            <Link to={`/explorer/${c.theme}/${c.id}`} className="text-xs text-indigo-600 hover:underline">Revise</Link>
          </li>
        )
      })}
    </ul>
  )
}

function Results({ entry, history, onRetake, onHome }: { entry: HistoryEntry; history: HistoryEntry[]; onRetake: () => void; onHome: () => void }) {
  const spec = specOf(entry.quiz)
  const pct = Math.round((entry.score / entry.total) * 100)
  const weak = weakConcepts(entry.results)
  const byTheme = useMemo(() => {
    const m = new Map<string, { right: number; total: number }>()
    for (const r of entry.results) {
      const t = conceptById.get(questionById.get(r.id)!.conceptId)!.theme
      const v = m.get(t) ?? { right: 0, total: 0 }
      v.total++
      if (r.correct) v.right++
      m.set(t, v)
    }
    return [...m.entries()].sort((a, b) => a[1].right / a[1].total - b[1].right / b[1].total)
  }, [entry])
  const prev = history.filter((h) => h.quiz === entry.quiz && h.date < entry.date)[0]

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-3xl px-4 py-6">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center dark:border-slate-700 dark:bg-slate-900">
          <div className="text-sm text-slate-500">{spec.title} · {new Date(entry.date).toLocaleString()}</div>
          <div className={`mt-2 text-5xl font-bold ${pct >= 70 ? 'text-emerald-600' : pct >= 50 ? 'text-amber-600' : 'text-rose-600'}`}>
            {entry.score}/{entry.total}
          </div>
          <div className="mt-1 text-slate-600 dark:text-slate-400">
            {pct}% · time used {fmt(entry.secondsUsed)} of {spec.minutes}:00
            {prev && <> · previous attempt {prev.score}/{prev.total}</>}
          </div>
          <div className="mt-4 flex justify-center gap-2">
            <button onClick={onRetake} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white">Retake (new questions)</button>
            <button onClick={onHome} className="rounded-lg border border-slate-300 px-4 py-2 text-sm dark:border-slate-600">All quizzes</button>
          </div>
        </div>

        <section className="mt-6">
          <h2 className="font-semibold">Score by topic</h2>
          <div className="mt-2 space-y-1.5">
            {byTheme.map(([t, v]) => (
              <div key={t} className="flex items-center gap-3 text-sm">
                <div className="w-56 truncate">{themeById.get(t)!.name}</div>
                <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
                  <div className="h-full" style={{ width: `${(v.right / v.total) * 100}%`, background: THEME_COLORS[t] }} />
                </div>
                <div className={`w-12 text-right font-medium ${v.right / v.total < 0.7 ? 'text-rose-600' : ''}`}>{v.right}/{v.total}</div>
              </div>
            ))}
          </div>
        </section>

        {weak.length > 0 && (
          <section className="mt-6">
            <h2 className="font-semibold">Weak topics from this attempt</h2>
            <WeakList weak={weak} />
            <Link to="/flashcards" className="mt-2 inline-block text-sm text-indigo-600 hover:underline">Drill these with flashcards →</Link>
          </section>
        )}

        <section className="mt-6">
          <h2 className="font-semibold">Review answers</h2>
          <ol className="mt-2 space-y-3">
            {entry.results.map((r, n) => {
              const q = questionById.get(r.id)!
              const c = conceptById.get(q.conceptId)!
              const partial = !r.correct && q.multi && r.chosen.some((x) => q.answer.includes(x))
              return (
                <li key={r.id} className={`rounded-xl border bg-white p-4 dark:bg-slate-900 ${r.correct ? 'border-emerald-300 dark:border-emerald-800' : 'border-rose-300 dark:border-rose-800'}`}>
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className={`font-semibold ${r.correct ? 'text-emerald-700' : 'text-rose-700'}`}>
                      {n + 1}. {r.correct ? '✓ Correct' : partial ? '✗ Partially right (no mark)' : r.chosen.length ? '✗ Incorrect' : '✗ Not answered'}
                    </span>
                    {q.multi && <span className="rounded bg-violet-100 px-1.5 py-0.5 font-semibold text-violet-800">Select all that apply</span>}
                    <span className="text-slate-500">{c.name}</span>
                  </div>
                  <p className="mt-2 font-medium">{q.q}</p>
                  <ul className="mt-2 space-y-1 text-sm">
                    {q.options.map((o, oi) => {
                      const right = q.answer.includes(oi)
                      const picked = r.chosen.includes(oi)
                      return (
                        <li key={oi} className={`flex gap-2 rounded-md px-2 py-1 ${right ? 'bg-emerald-50 dark:bg-emerald-950' : picked ? 'bg-rose-50 dark:bg-rose-950' : ''}`}>
                          <span className="w-16 shrink-0 text-xs font-semibold">
                            {right && picked && <span className="text-emerald-700">✓ yours</span>}
                            {right && !picked && <span className="text-amber-700">missed</span>}
                            {!right && picked && <span className="text-rose-700">✗ yours</span>}
                          </span>
                          <span>{o}</span>
                        </li>
                      )
                    })}
                  </ul>
                  <div className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-sm dark:bg-slate-800">
                    <span className="font-semibold">Why: </span>{q.explanation}
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                    <Citations cites={q.cites} />
                    <Link to={`/explorer/${c.theme}/${c.id}`} className="ml-auto text-indigo-600 hover:underline">Open concept →</Link>
                  </div>
                </li>
              )
            })}
          </ol>
        </section>
      </div>
    </div>
  )
}

function fmt(s: number) {
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}
