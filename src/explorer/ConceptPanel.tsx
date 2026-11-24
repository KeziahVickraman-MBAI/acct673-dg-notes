import { Citations, Citation } from '../components/Citation'
import { conceptById, diagrams, knowledge, quizBadge, themeById, THEME_COLORS, type Concept } from '../data'
import { Diagram } from './Diagram'

export function ConceptPanel({
  concept,
  onSelect,
  onClose,
}: {
  concept: Concept
  onSelect: (id: string) => void
  onClose: () => void
}) {
  const theme = themeById.get(concept.theme)!
  const color = THEME_COLORS[concept.theme]
  const d = diagrams[concept.id]
  // incoming links too, so the panel shows every relationship
  const incoming = knowledge.concepts.flatMap((c) =>
    c.related.filter((r) => r.id === concept.id).map((r) => ({ from: c, type: r.type })),
  )
  const prompts = knowledge.discussionPrompts.filter((p) => p.relatedConcepts.includes(concept.id))

  return (
    <aside className="panel-in absolute inset-0 z-20 flex flex-col overflow-hidden bg-white shadow-2xl md:inset-y-0 md:left-auto md:right-0 md:w-[480px] md:border-l md:border-slate-200 dark:bg-slate-900 dark:md:border-slate-700">
      <div className="border-b border-slate-200 px-5 py-4 dark:border-slate-700" style={{ borderTop: `4px solid ${color}` }}>
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="text-xs font-medium uppercase tracking-wide" style={{ color }}>
              {theme.name}
            </div>
            <h2 className="mt-0.5 text-xl font-semibold leading-tight">{concept.name}</h2>
          </div>
          <button onClick={onClose} className="rounded-md px-2 py-1 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800" aria-label="Close">
            ✕
          </button>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
          <span className="rounded-full bg-slate-100 px-2 py-0.5 font-medium dark:bg-slate-800">{quizBadge(concept)}</span>
          {concept.flags?.noQuiz && <span className="rounded-full bg-slate-200 px-2 py-0.5 dark:bg-slate-700">Not quizzed</span>}
        </div>
      </div>

      <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4 text-sm leading-relaxed">
        {concept.flags?.notDefinedInSlides && (
          <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200">
            <strong>Not defined in slides.</strong> This topic is named in the materials but never defined. No definition is
            given here and it is excluded from quizzes.
          </div>
        )}
        {concept.flags?.conflict && (
          <div className="rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-rose-900 dark:border-rose-700 dark:bg-rose-950 dark:text-rose-200">
            <strong>Source conflict.</strong> {concept.flags.conflict}
          </div>
        )}

        <p className="text-base font-medium">{concept.summary}</p>

        <section>
          <H>Explanation</H>
          <p className="whitespace-pre-line">{concept.explanation}</p>
        </section>

        {d && (
          <section>
            <H>Diagram</H>
            <Diagram d={d} color={color} />
          </section>
        )}

        {concept.keyTerms.length > 0 && (
          <section>
            <H>Key terms</H>
            <div className="flex flex-wrap gap-1.5">
              {concept.keyTerms.map((t) => (
                <span key={t} className="rounded-md bg-slate-100 px-2 py-0.5 text-xs dark:bg-slate-800">
                  {t}
                </span>
              ))}
            </div>
          </section>
        )}

        {concept.examples.length > 0 && (
          <section>
            <H>Examples from the slides</H>
            <ul className="list-disc space-y-1 pl-5">
              {concept.examples.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          </section>
        )}

        <section>
          <H>Related concepts</H>
          <ul className="space-y-1">
            {concept.related.map((r) => {
              const t = conceptById.get(r.id)!
              return (
                <li key={'o' + r.id}>
                  <span className="text-slate-500">{concept.name} </span>
                  <em className="text-slate-600 dark:text-slate-400">{r.type}</em>{' '}
                  <Link c={t} onSelect={onSelect} />
                </li>
              )
            })}
            {incoming
              .filter((i) => !concept.related.some((r) => r.id === i.from.id))
              .map((i) => (
                <li key={'i' + i.from.id}>
                  <Link c={i.from} onSelect={onSelect} /> <em className="text-slate-600 dark:text-slate-400">{i.type}</em>
                  <span className="text-slate-500"> this</span>
                </li>
              ))}
          </ul>
        </section>

        {prompts.length > 0 && (
          <section>
            <H>Class discussion prompts</H>
            <ul className="space-y-2">
              {prompts.map((p) => (
                <li key={p.id} className="rounded-lg border border-dashed border-slate-300 px-3 py-2 dark:border-slate-600">
                  <div className="italic">“{p.prompt}”</div>
                  <div className="mt-1 flex flex-wrap items-center gap-1 text-xs text-slate-500">
                    <Citation cite={p.citation} /> · No model answer in the slides
                    {p.relatedSlides.length > 0 && (
                      <>
                        {' '}
                        · related content: <Citations cites={p.relatedSlides} />
                      </>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section>
          <H>Sources</H>
          <Citations cites={concept.citations} />
        </section>
      </div>
    </aside>
  )
}

function H({ children }: { children: React.ReactNode }) {
  return <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">{children}</h3>
}

function Link({ c, onSelect }: { c: Concept; onSelect: (id: string) => void }) {
  return (
    <button
      onClick={() => onSelect(c.id)}
      className="font-medium underline decoration-dotted underline-offset-2 hover:text-indigo-600"
      style={{ textDecorationColor: THEME_COLORS[c.theme] }}
    >
      {c.name}
    </button>
  )
}
