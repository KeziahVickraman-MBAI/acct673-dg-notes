import type { Diagram as D } from '../data'
import { Citation } from '../components/Citation'

const box =
  'rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs leading-snug dark:border-slate-700 dark:bg-slate-800'

export function Diagram({ d, color }: { d: D; color: string }) {
  return (
    <figure className="rounded-xl border border-slate-200 p-3 dark:border-slate-700">
      {d.type === 'flow' && (
        <div className="flex flex-wrap items-center gap-1.5">
          {d.steps.map((s, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <div className={box} style={{ borderLeft: `3px solid ${color}` }}>
                {s}
              </div>
              {i < d.steps.length - 1 && <span className="text-slate-400">→</span>}
            </div>
          ))}
        </div>
      )}
      {d.type === 'cycle' && (
        <div className="relative mx-auto aspect-square w-full max-w-[320px]">
          <div
            className="absolute inset-[30%] flex items-center justify-center rounded-full text-center text-xs font-semibold text-white"
            style={{ background: color }}
          >
            {d.center}
          </div>
          {d.steps.map((s, i) => {
            const a = (i / d.steps.length) * 2 * Math.PI - Math.PI / 2
            return (
              <div
                key={i}
                className={`${box} absolute w-[34%] -translate-x-1/2 -translate-y-1/2 text-center`}
                style={{ left: `${50 + 38 * Math.cos(a)}%`, top: `${50 + 38 * Math.sin(a)}%` }}
              >
                <span className="font-semibold" style={{ color }}>
                  {i + 1}.
                </span>{' '}
                {s}
              </div>
            )
          })}
        </div>
      )}
      {d.type === 'layers' && (
        <div className="space-y-1.5">
          {d.rows.map((r, i) => (
            <div key={i} className="flex gap-2">
              <div
                className="w-32 shrink-0 rounded-lg px-2 py-1.5 text-xs font-semibold text-white"
                style={{ background: color, opacity: 1 - i * 0.12 }}
              >
                {r.label}
              </div>
              <div className="flex flex-1 flex-wrap gap-1">
                {r.items.map((it, j) => (
                  <div key={j} className={box}>
                    {it}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
      {d.type === 'columns' && (
        <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${Math.min(d.columns.length, 3)}, minmax(0,1fr))` }}>
          {d.columns.map((c, i) => (
            <div key={i} className="rounded-lg border border-slate-200 dark:border-slate-700">
              <div className="rounded-t-lg px-2 py-1 text-xs font-semibold text-white" style={{ background: color }}>
                {c.title}
              </div>
              <ul className="space-y-0.5 px-2 py-1.5 text-xs">
                {c.items.map((it, j) => (
                  <li key={j}>{it}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
      <figcaption className="mt-2 flex items-center gap-1 text-[11px] text-slate-500">
        Diagram reproduces the structure of <Citation cite={d.citation} />
      </figcaption>
    </figure>
  )
}
