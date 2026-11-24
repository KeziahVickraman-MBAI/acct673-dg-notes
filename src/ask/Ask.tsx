import { useCallback, useEffect, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Citation } from '../components/Citation'
import { useStored } from '../hooks'

type Health = {
  hasKey: boolean
  model: string
  effort: string
  retrieval: { pages: number; embeddings: 'loading' | 'ready' | 'unavailable'; embeddingModel: string; embeddingError?: string }
}
type Hit = { cite: string; label: string; title: string; score: number; via: string[]; text: string }
type Segment = { text: string; cites: string[] }
type Run = {
  id: number
  question: string
  imageUrl?: string
  status: string
  transcript?: string
  hits: Hit[]
  discussion?: { prompt: string; citation: string } | null
  segments: Segment[]
  citedText: Record<string, string[]>
  state: 'running' | 'done' | 'nokey' | 'error'
  message?: string
  meta?: { model: string; usage: { input: number; output: number } }
}
type Img = { mediaType: string; data: string; url: string }

const EXAMPLES = [
  'What is the difference between a data owner and a business data steward?',
  'Explain the three approaches to valuing data and when each applies.',
  'Compare data lineage with a data flow diagram.',
  'What is the difference between data management and data governance?',
]

export default function Ask() {
  const [health, setHealth] = useState<Health | null>(null)
  const [healthErr, setHealthErr] = useState(false)
  const [question, setQuestion] = useState('')
  const [img, setImg] = useState<Img | null>(null)
  const [drag, setDrag] = useState(false)
  const [run, setRun] = useState<Run | null>(null)
  const [history, setHistory] = useStored<Run[]>('acct673.ask.history', [])
  const abortRef = useRef<AbortController | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const loadHealth = useCallback(() => {
    fetch('/api/health')
      .then((r) => r.json())
      .then((h) => {
        setHealth(h)
        setHealthErr(false)
      })
      .catch(() => setHealthErr(true))
  }, [])
  useEffect(() => {
    loadHealth()
    const t = setInterval(loadHealth, 5000)
    return () => clearInterval(t)
  }, [loadHealth])

  const addImage = async (file: File) => {
    if (!file.type.startsWith('image/')) return
    setImg(await prepareImage(file))
  }

  // paste a screenshot anywhere on the page
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const f = [...(e.clipboardData?.files ?? [])].find((x) => x.type.startsWith('image/'))
      if (f) {
        e.preventDefault()
        void addImage(f)
      }
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [])

  const ask = async () => {
    if (!question.trim() && !img) return
    abortRef.current?.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl
    let cur: Run = {
      id: Date.now(),
      question: question.trim() || '(question in screenshot)',
      imageUrl: img?.url,
      status: 'Starting…',
      hits: [],
      segments: [],
      citedText: {},
      state: 'running',
    }
    const update = (f: (r: Run) => Run) => {
      cur = f(cur)
      setRun(cur)
    }
    setRun(cur)
    try {
      const res = await fetch('/api/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question, image: img ? { mediaType: img.mediaType, data: img.data } : undefined }),
        signal: ctrl.signal,
      })
      if (!res.ok || !res.body) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.error ?? `Server error ${res.status}`)
      }
      const reader = res.body.getReader()
      const dec = new TextDecoder()
      let buf = ''
      for (;;) {
        const { value, done } = await reader.read()
        if (done) break
        buf += dec.decode(value, { stream: true })
        let i
        while ((i = buf.indexOf('\n\n')) >= 0) {
          const chunk = buf.slice(0, i)
          buf = buf.slice(i + 2)
          const ev = /^event: (.*)$/m.exec(chunk)?.[1]
          const data = JSON.parse(/^data: (.*)$/m.exec(chunk)?.[1] ?? '{}')
          switch (ev) {
            case 'status':
              update((r) => ({ ...r, status: data.message }))
              break
            case 'transcript':
              update((r) => ({ ...r, transcript: data.text }))
              break
            case 'sources':
              update((r) => ({ ...r, hits: data.hits, discussion: data.discussion }))
              break
            case 'block':
              update((r) => ({ ...r, segments: [...r.segments, { text: '', cites: [] }] }))
              break
            case 'text':
              update((r) => {
                const segs = r.segments.length ? [...r.segments] : [{ text: '', cites: [] }]
                const last = segs[segs.length - 1]
                segs[segs.length - 1] = { ...last, text: last.text + data.t }
                return { ...r, segments: segs }
              })
              break
            case 'cite':
              update((r) => {
                const segs = r.segments.length ? [...r.segments] : [{ text: '', cites: [] }]
                const last = segs[segs.length - 1]
                if (!last.cites.includes(data.source)) segs[segs.length - 1] = { ...last, cites: [...last.cites, data.source] }
                const prev = r.citedText[data.source] ?? []
                return {
                  ...r,
                  segments: segs,
                  citedText: { ...r.citedText, [data.source]: prev.includes(data.cited_text) ? prev : [...prev, data.cited_text] },
                }
              })
              break
            case 'done':
              update((r) => ({ ...r, state: 'done', status: '', meta: { model: data.model, usage: data.usage } }))
              break
            case 'nokey':
              update((r) => ({ ...r, state: 'nokey', status: '', message: data.reason }))
              break
            case 'error':
              update((r) => ({ ...r, state: 'error', status: '', message: data.message }))
              break
          }
        }
      }
      if (cur.state === 'running') update((r) => ({ ...r, state: 'error', status: '', message: 'The connection closed before the answer finished.' }))
    } catch (e) {
      if ((e as Error).name === 'AbortError') update((r) => ({ ...r, state: 'error', status: '', message: 'Stopped.' }))
      else update((r) => ({ ...r, state: 'error', status: '', message: (e as Error).message }))
    }
    if (cur.state === 'done' || cur.state === 'nokey') setHistory((h) => [{ ...cur, imageUrl: undefined }, ...h].slice(0, 20))
  }

  const running = run?.state === 'running'

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-4xl px-4 py-6">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold">Ask a Question</h1>
          <StatusPill health={health} err={healthErr} />
        </div>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          Answers are written <b>only</b> from your lecture slides. Your question is matched against the slides (keyword + semantic + concept search), the
          best pages are sent to Claude, and every claim comes back with a clickable citation. If the slides don't cover it, you'll be told.
        </p>

        {healthErr && (
          <Banner tone="rose">
            The answer server isn't running. Start everything with <code>npm run dev</code> (it runs the website and the server together).
          </Banner>
        )}
        {health && !health.hasKey && (
          <Banner tone="amber">
            <b>No Claude API key yet: retrieval-only mode.</b> You'll see the most relevant slides, but no written answer. To enable answers: copy{' '}
            <code>.env.example</code> to <code>.env</code> in the project folder, paste your key after <code>ANTHROPIC_API_KEY=</code> and save. No restart needed: this page picks it up within a few seconds. The key stays on your machine and is never sent to the browser.
          </Banner>
        )}

        {/* input */}
        <div
          className={`mt-4 rounded-2xl border-2 bg-white p-3 transition dark:bg-slate-900 ${drag ? 'border-indigo-500 bg-indigo-50' : 'border-slate-200 dark:border-slate-700'}`}
          onDragOver={(e) => {
            e.preventDefault()
            setDrag(true)
          }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => {
            e.preventDefault()
            setDrag(false)
            const f = e.dataTransfer.files[0]
            if (f) void addImage(f)
          }}
        >
          <textarea
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void ask()
            }}
            rows={3}
            placeholder="Ask anything about the course… or drop / paste a screenshot of a quiz question"
            className="w-full resize-y bg-transparent text-[15px] outline-none"
          />
          {img && (
            <div className="mt-2 flex items-start gap-2">
              <img src={img.url} alt="Attached screenshot" className="max-h-40 rounded-lg border border-slate-200 dark:border-slate-700" />
              <button onClick={() => setImg(null)} className="rounded-md px-2 text-sm text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800">
                ✕ Remove
              </button>
            </div>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-2 dark:border-slate-800">
            <button onClick={() => fileRef.current?.click()} className="rounded-md border border-slate-300 px-2.5 py-1 text-sm dark:border-slate-600">
              🖼 Attach screenshot
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/gif,image/webp"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) void addImage(f)
                e.target.value = ''
              }}
            />
            <span className="text-xs text-slate-400">or drag & drop / paste (⌘V) an image · ⌘↵ to ask</span>
            <div className="ml-auto">
              {running ? (
                <button onClick={() => abortRef.current?.abort()} className="rounded-lg bg-slate-700 px-4 py-1.5 text-sm text-white">
                  Stop
                </button>
              ) : (
                <button
                  onClick={() => void ask()}
                  disabled={!question.trim() && !img}
                  className="rounded-lg bg-indigo-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-40"
                >
                  Ask
                </button>
              )}
            </div>
          </div>
        </div>

        {!run && (
          <div className="mt-3 flex flex-wrap gap-2">
            {EXAMPLES.map((e) => (
              <button
                key={e}
                onClick={() => setQuestion(e)}
                className="rounded-full border border-slate-300 px-3 py-1 text-xs text-slate-600 hover:border-indigo-400 dark:border-slate-600 dark:text-slate-300"
              >
                {e}
              </button>
            ))}
          </div>
        )}

        {run && <Answer run={run} />}

        {history.length > 0 && (
          <section className="mt-10">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">Recent questions</h2>
              <button className="text-xs text-slate-400 hover:text-rose-600" onClick={() => setHistory([])}>
                Clear
              </button>
            </div>
            <ul className="mt-2 space-y-1 text-sm">
              {history.map((h) => (
                <li key={h.id}>
                  <button onClick={() => setRun(h)} className="text-left text-indigo-700 hover:underline dark:text-indigo-300">
                    {h.question}
                  </button>
                  <span className="ml-2 text-xs text-slate-400">{new Date(h.id).toLocaleString()}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  )
}

function Answer({ run }: { run: Run }) {
  // Number sources in order of first citation.
  const order: string[] = []
  for (const s of run.segments) for (const c of s.cites) if (!order.includes(c)) order.push(c)
  const num = (c: string) => order.indexOf(c) + 1
  const md = run.segments
    .map((s) => (s.cites.length ? s.text.replace(/(\s*)$/, ' ' + s.cites.map((c) => `[${num(c)}](#cite:${c})`).join('') + '$1') : s.text))
    .join('')
  const cited = order.map((c) => run.hits.find((h) => h.cite === c) ?? { cite: c, label: c, title: '', score: 0, via: [], text: '' })
  const others = run.hits.filter((h) => !order.includes(h.cite))

  return (
    <div className="mt-6 space-y-4">
      <div className="rounded-xl bg-slate-100 px-4 py-2 text-sm dark:bg-slate-800">
        <span className="text-slate-500">Q: </span>
        {run.question}
        {run.imageUrl && <img src={run.imageUrl} alt="" className="mt-2 max-h-32 rounded" />}
      </div>
      {run.transcript && (
        <div className="rounded-lg border border-dashed border-slate-300 px-3 py-2 text-xs text-slate-600 dark:border-slate-600 dark:text-slate-300">
          <b>Read from screenshot:</b> <span className="whitespace-pre-wrap">{run.transcript}</span>
        </div>
      )}
      {run.discussion && (
        <Banner tone="amber">
          This matches a class discussion prompt on <Citation cite={run.discussion.citation} />: “{run.discussion.prompt}”. The slides pose it but give no model
          answer.
        </Banner>
      )}
      {run.status && (
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <span className="h-2 w-2 animate-ping rounded-full bg-indigo-500" /> {run.status}
        </div>
      )}

      {md && (
        <article className="answer rounded-2xl border border-slate-200 bg-white p-5 text-[15px] leading-relaxed dark:border-slate-700 dark:bg-slate-900">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              a: ({ href, children }) =>
                href?.startsWith('#cite:') ? (
                  <Citation cite={href.slice(6)} marker={String(children)} />
                ) : (
                  <a href={href} target="_blank" rel="noreferrer" className="text-indigo-600 underline">
                    {children}
                  </a>
                ),
            }}
          >
            {md}
          </ReactMarkdown>
          {run.meta && (
            <div className="mt-3 border-t border-slate-100 pt-2 text-[11px] text-slate-400 dark:border-slate-800">
              {run.meta.model} · {run.meta.usage.input.toLocaleString()} input / {run.meta.usage.output.toLocaleString()} output tokens
            </div>
          )}
        </article>
      )}
      {run.state === 'done' && order.length === 0 && md && (
        <Banner tone="amber">This answer has no citations. Treat it with caution and check the slides below.</Banner>
      )}
      {(run.state === 'error' || run.state === 'nokey') && run.message && <Banner tone={run.state === 'error' ? 'rose' : 'amber'}>{run.message}</Banner>}

      {cited.length > 0 && (
        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Cited slides</h3>
          <ul className="space-y-2">
            {cited.map((h) => (
              <li key={h.cite} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900">
                <div className="flex items-center gap-2">
                  <span className="rounded bg-indigo-100 px-1.5 text-xs font-semibold text-indigo-700">{num(h.cite)}</span>
                  <Citation cite={h.cite} />
                  <span className="truncate text-slate-600 dark:text-slate-300">{h.title}</span>
                </div>
                {(run.citedText[h.cite] ?? []).slice(0, 3).map((t, i) => (
                  <blockquote key={i} className="mt-1 border-l-2 border-indigo-300 pl-2 text-xs text-slate-600 dark:text-slate-400">
                    {t.length > 280 ? t.slice(0, 280) + '…' : t}
                  </blockquote>
                ))}
              </li>
            ))}
          </ul>
        </section>
      )}
      {others.length > 0 && (
        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
            {run.state === 'nokey' ? 'Most relevant slides' : 'Also retrieved (not cited)'}
          </h3>
          <ul className="grid gap-2 sm:grid-cols-2">
            {others.map((h) => (
              <li key={h.cite} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-900">
                <div className="flex items-center gap-2">
                  <Citation cite={h.cite} />
                  <span className="truncate font-medium">{h.title}</span>
                </div>
                <p className="mt-1 line-clamp-3 text-slate-500">{h.text}</p>
                <div className="mt-1 text-[10px] text-slate-400">matched by {h.via.join(' + ')}</div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}

function StatusPill({ health, err }: { health: Health | null; err: boolean }) {
  if (err) return <span className="rounded-full bg-rose-100 px-2 py-0.5 text-xs text-rose-800">server offline</span>
  if (!health) return <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">checking…</span>
  return (
    <span className="flex flex-wrap gap-1 text-xs">
      <span className={`rounded-full px-2 py-0.5 ${health.hasKey ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
        {health.hasKey ? `${health.model} ready` : 'no API key'}
      </span>
      <span
        className={`rounded-full px-2 py-0.5 ${health.retrieval.embeddings === 'ready' ? 'bg-slate-100 text-slate-600' : 'bg-amber-100 text-amber-800'}`}
        title={health.retrieval.embeddingError}
      >
        {health.retrieval.pages} slides indexed · semantic search {health.retrieval.embeddings}
      </span>
    </span>
  )
}

function Banner({ tone, children }: { tone: 'amber' | 'rose'; children: React.ReactNode }) {
  const cls =
    tone === 'amber'
      ? 'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200'
      : 'border-rose-300 bg-rose-50 text-rose-900 dark:border-rose-800 dark:bg-rose-950 dark:text-rose-200'
  return <div className={`mt-3 rounded-lg border px-3 py-2 text-sm ${cls}`}>{children}</div>
}

/** Read an image file; downscale large screenshots so they stay under the API's 5 MB image limit. */
async function prepareImage(file: File): Promise<Img> {
  const url = await new Promise<string>((res, rej) => {
    const r = new FileReader()
    r.onload = () => res(r.result as string)
    r.onerror = rej
    r.readAsDataURL(file)
  })
  const el = await new Promise<HTMLImageElement>((res, rej) => {
    const i = new Image()
    i.onload = () => res(i)
    i.onerror = rej
    i.src = url
  })
  const MAX = 2000
  if (file.size < 3.5 * 1024 * 1024 && el.width <= MAX && el.height <= MAX && file.type !== 'image/gif') {
    return { mediaType: file.type, data: url.split(',')[1], url }
  }
  const scale = Math.min(1, MAX / Math.max(el.width, el.height))
  const c = document.createElement('canvas')
  c.width = Math.round(el.width * scale)
  c.height = Math.round(el.height * scale)
  c.getContext('2d')!.drawImage(el, 0, 0, c.width, c.height)
  const out = c.toDataURL('image/jpeg', 0.9)
  return { mediaType: 'image/jpeg', data: out.split(',')[1], url: out }
}
