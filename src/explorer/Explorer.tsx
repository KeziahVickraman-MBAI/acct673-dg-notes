import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  Background,
  Controls,
  Handle,
  MarkerType,
  MiniMap,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Edge,
  type Node,
  type NodeProps,
} from '@xyflow/react'
import dagre from '@dagrejs/dagre'
import '@xyflow/react/dist/style.css'
import {
  concepts,
  conceptById,
  knowledge,
  QUIZ_FILTERS,
  quizBadge,
  quizFilterLabel,
  scopeOf,
  themeById,
  themes,
  THEME_COLORS,
  type Concept,
  type QuizFilter,
  type Theme,
} from '../data'
import { useStored } from '../hooks'
import { ConceptPanel } from './ConceptPanel'
import { Citation, Citations } from '../components/Citation'

/* ---------- graph data helpers ---------- */

type Link = { from: Concept; to: Concept; type: string }
/** Every concept link, deduplicated by unordered pair (first direction wins). */
const ALL_LINKS: Link[] = (() => {
  const seen = new Set<string>()
  const out: Link[] = []
  for (const c of concepts)
    for (const r of c.related) {
      const key = [c.id, r.id].sort().join('|')
      if (seen.has(key)) continue
      seen.add(key)
      out.push({ from: c, to: conceptById.get(r.id)!, type: r.type })
    }
  return out
})()

/** Theme-to-theme connections derived from concept links (grounded: each is backed by concept links). */
const THEME_LINKS = (() => {
  const m = new Map<string, Link[]>()
  for (const l of ALL_LINKS) {
    if (l.from.theme === l.to.theme) continue
    const key = [l.from.theme, l.to.theme].sort().join('|')
    m.set(key, [...(m.get(key) ?? []), l])
  }
  return [...m.entries()].map(([key, links]) => {
    const [a, b] = key.split('|')
    return { a, b, links }
  })
})()

const MIN_THEME_LINKS = 2

/* ---------- custom nodes ---------- */

const centerHandle = { opacity: 0, top: '50%', left: '50%', width: 1, height: 1, minWidth: 0, minHeight: 0, border: 0 }
const sideHandle = { opacity: 0, width: 1, height: 1, minWidth: 0, minHeight: 0, border: 0 }
function SideHandles() {
  return (
    <>
      <Handle type="target" position={Position.Top} style={sideHandle} isConnectable={false} />
      <Handle type="source" position={Position.Bottom} style={sideHandle} isConnectable={false} />
    </>
  )
}
function Handles() {
  return (
    <>
      <Handle type="target" position={Position.Top} style={centerHandle} isConnectable={false} />
      <Handle type="source" position={Position.Bottom} style={centerHandle} isConnectable={false} />
    </>
  )
}

type ThemeData = { theme: Theme; total: number; inScope: number; fresh: number; dim: boolean }
function ThemeNode({ data }: NodeProps<Node<ThemeData>>) {
  const color = THEME_COLORS[data.theme.id]
  return (
    <div
      className="w-[250px] cursor-pointer rounded-2xl border-2 bg-white p-3 shadow-md transition hover:-translate-y-0.5 hover:shadow-xl dark:bg-slate-900"
      style={{ borderColor: color, opacity: data.dim ? 0.3 : 1 }}
    >
      <Handles />
      <div className="text-[11px] font-semibold uppercase tracking-wide" style={{ color }}>
        Lecture {data.theme.lectures.join(', ')}
      </div>
      <div className="text-base font-semibold leading-tight">{data.theme.name}</div>
      <div className="mt-1 line-clamp-3 text-xs text-slate-600 dark:text-slate-400">{data.theme.summary}</div>
      <div className="mt-2 flex items-center gap-2 text-[11px]">
        <span className="rounded-full px-2 py-0.5 font-medium text-white" style={{ background: color }}>
          {data.inScope === data.total ? `${data.total} concepts` : `${data.inScope}/${data.total} in scope`}
        </span>
        {data.fresh > 0 && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-amber-800">{data.fresh} new</span>}
      </div>
    </div>
  )
}

type ConceptData = { concept: Concept; ghost: boolean; dim: boolean; fresh: boolean; selected: boolean }
function ConceptNode({ data }: NodeProps<Node<ConceptData>>) {
  const c = data.concept
  const color = THEME_COLORS[c.theme]
  return (
    <div
      className={`w-[200px] cursor-pointer rounded-xl border bg-white px-3 py-2 shadow-sm transition hover:shadow-lg dark:bg-slate-900 ${
        data.ghost ? 'border-dashed' : ''
      } ${data.selected ? 'ring-4 ring-indigo-300' : ''}`}
      style={{
        borderColor: color,
        borderLeftWidth: data.ghost ? 1 : 5,
        opacity: data.dim ? 0.25 : data.ghost ? 0.75 : 1,
      }}
    >
      <SideHandles />
      {data.ghost && (
        <div className="text-[10px] font-medium uppercase" style={{ color }}>
          ↗ {themeById.get(c.theme)!.name}
        </div>
      )}
      <div className="text-[13px] font-semibold leading-snug">{c.name}</div>
      <div className="mt-1 flex flex-wrap items-center gap-1 text-[10px] text-slate-500">
        <span>{quizBadge(c)}</span>
        {data.fresh && <span className="rounded bg-amber-100 px-1 text-amber-800">new</span>}
        {c.flags?.notDefinedInSlides && <span className="rounded bg-amber-200 px-1 text-amber-900">not defined in slides</span>}
        {c.flags?.conflict && <span className="rounded bg-rose-100 px-1 text-rose-800">source conflict</span>}
      </div>
    </div>
  )
}

const nodeTypes = { theme: ThemeNode, concept: ConceptNode }

/* ---------- layouts ---------- */

function courseGraph(filter: QuizFilter) {
  const R = 430
  const nodes: Node<ThemeData>[] = themes.map((t, i) => {
    const a = (i / themes.length) * 2 * Math.PI - Math.PI / 2
    const cs = concepts.filter((c) => c.theme === t.id)
    const sc = cs.map((c) => scopeOf(c, filter))
    const inScope = sc.filter((s) => s.inScope).length
    return {
      id: t.id,
      type: 'theme',
      position: { x: R * 1.35 * Math.cos(a) - 125, y: R * Math.sin(a) - 60 },
      data: { theme: t, total: cs.length, inScope, fresh: sc.filter((s) => s.isNew).length, dim: inScope === 0 },
    }
  })
  const edges: Edge[] = THEME_LINKS.filter((l) => l.links.length >= MIN_THEME_LINKS).map((l) => ({
    id: `${l.a}|${l.b}`,
    source: l.a,
    target: l.b,
    type: 'straight',
    label: `${l.links.length} links`,
    style: { strokeWidth: 1 + l.links.length * 0.6, stroke: '#94a3b8' },
    labelStyle: { fontSize: 11, fill: '#475569' },
    labelBgPadding: [4, 2] as [number, number],
    labelBgBorderRadius: 4,
  }))
  return { nodes, edges }
}

function themeGraph(themeId: string, filter: QuizFilter, selected: string | undefined, showAllGhosts: boolean) {
  const own = concepts.filter((c) => c.theme === themeId)
  const ownIds = new Set(own.map((c) => c.id))
  // Cross-theme neighbours ("ghosts") are shown for the selected concept, or for all when toggled on.
  const ghostLinks = ALL_LINKS.filter(
    (l) =>
      ownIds.has(l.from.id) !== ownIds.has(l.to.id) &&
      (showAllGhosts || l.from.id === selected || l.to.id === selected),
  )
  const ghostIds = new Set(ghostLinks.flatMap((l) => [l.from.id, l.to.id]).filter((id) => !ownIds.has(id)))
  const links = [...ALL_LINKS.filter((l) => ownIds.has(l.from.id) && ownIds.has(l.to.id)), ...ghostLinks]
  const all = [...own, ...[...ghostIds].map((id) => conceptById.get(id)!)]

  const g = new dagre.graphlib.Graph()
  g.setGraph({ rankdir: 'TB', nodesep: 30, ranksep: 90, marginx: 20, marginy: 20 })
  g.setDefaultEdgeLabel(() => ({}))
  for (const c of all) g.setNode(c.id, { width: 200, height: ghostIds.has(c.id) ? 70 : 60 })
  for (const l of links) g.setEdge(l.from.id, l.to.id)
  dagre.layout(g)

  const nodes: Node<ConceptData>[] = all.map((c) => {
    const p = g.node(c.id)
    const s = scopeOf(c, filter)
    return {
      id: c.id,
      type: 'concept',
      position: { x: p.x - 100, y: p.y - 30 },
      data: { concept: c, ghost: ghostIds.has(c.id), dim: !s.inScope, fresh: s.isNew && filter !== 'all', selected: c.id === selected },
    }
  })
  const edges: Edge[] = links.map((l) => {
    const touchesSel = selected && (l.from.id === selected || l.to.id === selected)
    return {
      id: `${l.from.id}->${l.to.id}`,
      source: l.from.id,
      target: l.to.id,
      type: 'default',
      label: l.type,
      markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16, color: touchesSel ? '#4f46e5' : '#94a3b8' },
      style: { stroke: touchesSel ? '#4f46e5' : '#cbd5e1', strokeWidth: touchesSel ? 2.5 : 1.25 },
      labelStyle: { fontSize: 10, fill: touchesSel ? '#4338ca' : '#64748b', fontWeight: touchesSel ? 600 : 400 },
      labelBgPadding: [3, 1] as [number, number],
      labelBgBorderRadius: 3,
      zIndex: touchesSel ? 10 : 0,
    }
  })
  return { nodes, edges }
}

/* ---------- main ---------- */

export default function Explorer() {
  return (
    <ReactFlowProvider>
      <ExplorerInner />
    </ReactFlowProvider>
  )
}

function ExplorerInner() {
  const { themeId, conceptId } = useParams()
  const navigate = useNavigate()
  const rf = useReactFlow()
  const [filter, setFilter] = useStored<QuizFilter>('acct673.quizFilter', 'all')
  const [edgeInfo, setEdgeInfo] = useState<string | null>(null)
  const [showPrompts, setShowPrompts] = useState(false)
  const [search, setSearch] = useState('')
  const [showAllGhosts, setShowAllGhosts] = useStored('acct673.showGhosts', false)

  const theme = themeId ? themeById.get(themeId) : undefined
  const concept = conceptId ? conceptById.get(conceptId) : undefined

  const { nodes, edges } = useMemo(
    () => (theme ? themeGraph(theme.id, filter, concept?.id, showAllGhosts) : courseGraph(filter)),
    [theme, filter, concept?.id, showAllGhosts],
  )

  // Smooth zoom: refit whenever the level changes.
  useEffect(() => {
    const t = setTimeout(() => rf.fitView({ padding: 0.12, duration: 650 }), 30)
    return () => clearTimeout(t)
  }, [rf, themeId])

  // When a concept opens, glide to it (offset left so the side panel doesn't cover it).
  useEffect(() => {
    if (!concept || !theme) return
    const t = setTimeout(() => {
      const n = rf.getNode(concept.id)
      if (!n) return
      const offset = window.innerWidth >= 768 ? 240 : 0
      rf.setCenter(n.position.x + 100 + offset / 1.3, n.position.y + 30, { zoom: 1.1, duration: 600 })
    }, 120)
    return () => clearTimeout(t)
  }, [rf, concept, theme])

  const openConcept = useCallback(
    (id: string) => {
      const c = conceptById.get(id)
      if (c) navigate(`/explorer/${c.theme}/${c.id}`)
    },
    [navigate],
  )

  const onNodeClick = useCallback(
    (_: unknown, n: Node) => {
      if (n.type === 'theme') {
        // zoom into the theme bubble, then swap to the 3,000 ft view
        rf.setCenter(n.position.x + 125, n.position.y + 60, { zoom: 2.2, duration: 450 })
        setTimeout(() => navigate(`/explorer/${n.id}`), 380)
      } else openConcept(n.id)
    },
    [rf, navigate, openConcept],
  )

  const linkInfo = edgeInfo ? THEME_LINKS.find((l) => `${l.a}|${l.b}` === edgeInfo) : undefined

  return (
    <div className="flex h-full flex-col">
      {/* toolbar */}
      <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 bg-white px-4 py-2 dark:border-slate-700 dark:bg-slate-900">
        <nav className="flex flex-wrap items-center gap-1 text-sm" aria-label="Breadcrumb">
          <Crumb active={!theme} onClick={() => navigate('/explorer')}>
            🛰 Course (6,000 ft)
          </Crumb>
          {theme && (
            <>
              <span className="text-slate-400">›</span>
              <Crumb active={!concept} onClick={() => navigate(`/explorer/${theme.id}`)} color={THEME_COLORS[theme.id]}>
                ✈ {theme.name} (3,000 ft)
              </Crumb>
            </>
          )}
          {concept && (
            <>
              <span className="text-slate-400">›</span>
              <Crumb active>🤿 {concept.name}</Crumb>
            </>
          )}
        </nav>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <form
            onSubmit={(e) => {
              e.preventDefault()
              const c = concepts.find((x) => x.name.toLowerCase() === search.toLowerCase()) ??
                concepts.find((x) => x.name.toLowerCase().includes(search.toLowerCase()))
              if (c) {
                openConcept(c.id)
                setSearch('')
              }
            }}
          >
            <input
              list="concept-names"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Find a concept…"
              className="w-48 rounded-md border border-slate-300 bg-white px-2 py-1 text-sm dark:border-slate-600 dark:bg-slate-800"
            />
            <datalist id="concept-names">
              {concepts.map((c) => (
                <option key={c.id} value={c.name} />
              ))}
            </datalist>
          </form>
          <label className="flex items-center gap-1.5 text-sm">
            <span className="text-slate-500">Filter</span>
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
          </label>
          {theme && (
            <label className="flex items-center gap-1.5 text-sm text-slate-600 dark:text-slate-300">
              <input type="checkbox" checked={showAllGhosts} onChange={(e) => setShowAllGhosts(e.target.checked)} />
              Show links to other themes
            </label>
          )}
          {!theme && (
            <button
              onClick={() => setShowPrompts(true)}
              className="rounded-md border border-slate-300 px-2 py-1 text-sm hover:bg-slate-50 dark:border-slate-600 dark:hover:bg-slate-800"
            >
              💬 Discussion prompts ({knowledge.discussionPrompts.length})
            </button>
          )}
        </div>
      </div>
      {typeof filter === 'number' && (
        <div className="border-b border-amber-200 bg-amber-50 px-4 py-1 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
          Pop Quiz {filter} is cumulative: it covers Lectures {knowledge.quizzes[filter].lectures.join(', ')}. Concepts new in this quiz
          (Lecture {knowledge.quizzes[filter].newLectures.join(', ')}) are tagged <b>new</b>; later material is faded.
        </div>
      )}

      {/* graph */}
      <div className="relative flex-1">
        <div key={themeId ?? 'course'} className="graph-in absolute inset-0">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            onNodeClick={onNodeClick}
            onEdgeClick={(_, e) => !theme && setEdgeInfo(e.id)}
            nodesDraggable
            nodesConnectable={false}
            minZoom={0.15}
            maxZoom={2.5}
            fitView
            proOptions={{ hideAttribution: true }}
          >
            <Background gap={24} color="#e2e8f0" />
            <Controls showInteractive={false} />
            {theme && <MiniMap pannable zoomable nodeColor={(n) => THEME_COLORS[(n.data as ConceptData).concept.theme]} />}
          </ReactFlow>
        </div>

        {!theme && (
          <div className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-white/90 px-3 py-1 text-xs text-slate-600 shadow dark:bg-slate-800/90 dark:text-slate-300">
            Click a theme to zoom in · click an edge to see the concept links behind it
          </div>
        )}
        {theme && !concept && (
          <div className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-white/90 px-3 py-1 text-xs text-slate-600 shadow dark:bg-slate-800/90 dark:text-slate-300">
            Click a concept to dive in · its links to other themes appear as dashed boxes
          </div>
        )}

        {concept && <ConceptPanel concept={concept} onSelect={openConcept} onClose={() => navigate(`/explorer/${concept.theme}`)} />}

        {linkInfo && (
          <SidePanel title={`${themeById.get(linkInfo.a)!.name} ↔ ${themeById.get(linkInfo.b)!.name}`} onClose={() => setEdgeInfo(null)}>
            <p className="mb-3 text-xs text-slate-500">
              This connection is derived from {linkInfo.links.length} concept-level links in the knowledge base.
            </p>
            <ul className="space-y-2 text-sm">
              {linkInfo.links.map((l) => (
                <li key={l.from.id + l.to.id} className="rounded-lg border border-slate-200 px-3 py-2 dark:border-slate-700">
                  <button className="font-medium hover:text-indigo-600" onClick={() => openConcept(l.from.id)}>
                    {l.from.name}
                  </button>{' '}
                  <em className="text-slate-500">{l.type}</em>{' '}
                  <button className="font-medium hover:text-indigo-600" onClick={() => openConcept(l.to.id)}>
                    {l.to.name}
                  </button>
                  <div className="mt-1">
                    <Citations cites={[...new Set([...l.from.citations.slice(0, 2), ...l.to.citations.slice(0, 2)])]} />
                  </div>
                </li>
              ))}
            </ul>
          </SidePanel>
        )}

        {showPrompts && (
          <SidePanel title="Class discussion prompts" onClose={() => setShowPrompts(false)}>
            <p className="mb-3 text-xs text-slate-500">
              These are open discussion questions from the slides. <b>The slides do not give model answers.</b> Where slide content
              is related, it is linked so you can build your own answer.
            </p>
            <ul className="space-y-2 text-sm">
              {knowledge.discussionPrompts.map((p) => (
                <li key={p.id} className="rounded-lg border border-dashed border-slate-300 px-3 py-2 dark:border-slate-600">
                  <div className="italic">“{p.prompt}”</div>
                  <div className="mt-1 flex flex-wrap items-center gap-1 text-xs text-slate-500">
                    <Citation cite={p.citation} />
                    {p.relatedSlides.length > 0 && (
                      <>
                        · related: <Citations cites={p.relatedSlides} />
                      </>
                    )}
                    {p.relatedConcepts.map((id) => (
                      <button key={id} onClick={() => openConcept(id)} className="rounded bg-slate-100 px-1.5 hover:bg-indigo-100 dark:bg-slate-800">
                        {conceptById.get(id)!.name}
                      </button>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
          </SidePanel>
        )}
      </div>
    </div>
  )
}

function Crumb({ children, active, onClick, color }: { children: React.ReactNode; active?: boolean; onClick?: () => void; color?: string }) {
  return (
    <button
      onClick={onClick}
      disabled={!onClick}
      className={`rounded-md px-2 py-0.5 ${active ? 'bg-slate-100 font-semibold dark:bg-slate-800' : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'}`}
      style={color ? { color } : undefined}
    >
      {children}
    </button>
  )
}

function SidePanel({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <aside className="panel-in absolute inset-0 z-20 flex flex-col bg-white shadow-2xl md:inset-y-0 md:left-auto md:right-0 md:w-[440px] md:border-l md:border-slate-200 dark:bg-slate-900 dark:md:border-slate-700">
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-slate-700">
        <h2 className="font-semibold">{title}</h2>
        <button onClick={onClose} className="rounded-md px-2 py-1 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800">
          ✕
        </button>
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-3">{children}</div>
    </aside>
  )
}
