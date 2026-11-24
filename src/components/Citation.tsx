import { useState } from 'react'
import { parseCite } from '../data'

/** A clickable source chip. Click to see the extracted slide text and open the PDF at that page. */
export function Citation({ cite, marker }: { cite: string; marker?: string }) {
  const [open, setOpen] = useState(false)
  const c = parseCite(cite)
  return (
    <>
      {marker ? (
        <button
          onClick={() => setOpen(true)}
          className="mx-0.5 inline-flex -translate-y-0.5 items-center rounded bg-indigo-100 px-1 text-[11px] font-semibold leading-4 text-indigo-700 hover:bg-indigo-200 dark:bg-indigo-900 dark:text-indigo-200"
          title={`${c.label}: click to view the slide`}
        >
          {marker}
        </button>
      ) : (
        <button
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-1.5 py-0.5 text-xs font-medium text-slate-600 hover:border-indigo-400 hover:text-indigo-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300"
          title={`${c.file}, page ${c.page}`}
        >
          📄 {c.short}
        </button>
      )}
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="max-h-[80vh] w-full max-w-2xl overflow-hidden rounded-xl bg-white shadow-xl dark:bg-slate-900"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-slate-700">
              <div>
                <div className="font-semibold">{c.label}</div>
                <div className="text-xs text-slate-500">{c.file}</div>
              </div>
              <div className="flex gap-2">
                <a
                  href={c.url}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm text-white hover:bg-indigo-700"
                >
                  Open PDF at page
                </a>
                <button onClick={() => setOpen(false)} className="rounded-md px-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800">
                  ✕
                </button>
              </div>
            </div>
            <pre className="max-h-[60vh] overflow-auto whitespace-pre-wrap px-4 py-3 font-mono text-xs leading-relaxed text-slate-700 dark:text-slate-300">
              {c.text || '(no extractable text on this page)'}
            </pre>
          </div>
        </div>
      )}
    </>
  )
}

export function Citations({ cites }: { cites: string[] }) {
  return (
    <span className="inline-flex flex-wrap gap-1">
      {cites.map((c) => (
        <Citation key={c} cite={c} />
      ))}
    </span>
  )
}
