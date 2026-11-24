import { NavLink, Navigate, Route, Routes } from 'react-router-dom'
import Explorer from './explorer/Explorer'
import Flashcards from './flashcards/Flashcards'
import Quiz from './quiz/Quiz'
import Ask from './ask/Ask'
import Practice from './practice/Practice'

const NAV = [
  { to: '/explorer', label: 'Concept Explorer', icon: '🗺' },
  { to: '/flashcards', label: 'Flashcards', icon: '🃏' },
  { to: '/quiz', label: 'Pop Quiz', icon: '⏱' },
  { to: '/practice', label: 'Practice', icon: '✍️' },
  { to: '/ask', label: 'Ask a Question', icon: '💬' },
]

export default function App() {
  return (
    <div className="flex h-screen flex-col">
      <header className="flex flex-wrap items-center gap-x-6 gap-y-1 border-b border-slate-200 bg-white px-4 py-2 dark:border-slate-700 dark:bg-slate-900">
        <div className="font-semibold">
          ACCT673 <span className="font-normal text-slate-500">Data Governance &amp; Quality</span>
        </div>
        <nav className="flex flex-wrap gap-1">
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              className={({ isActive }) =>
                `rounded-md px-3 py-1.5 text-sm ${isActive ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'}`
              }
            >
              {n.icon} {n.label}
            </NavLink>
          ))}
        </nav>
      </header>
      <main className="min-h-0 flex-1">
        <Routes>
          <Route path="/" element={<Navigate to="/explorer" replace />} />
          <Route path="/explorer" element={<Explorer />} />
          <Route path="/explorer/:themeId" element={<Explorer />} />
          <Route path="/explorer/:themeId/:conceptId" element={<Explorer />} />
          <Route path="/flashcards" element={<Flashcards />} />
          <Route path="/quiz" element={<Quiz />} />
          <Route path="/ask" element={<Ask />} />
          <Route path="/practice" element={<Practice />} />
          <Route path="/practice/:id" element={<Practice />} />
          <Route path="*" element={<ComingSoon />} />
        </Routes>
      </main>
    </div>
  )
}

function ComingSoon() {
  return (
    <div className="flex h-full items-center justify-center text-slate-500">
      Page not found.
    </div>
  )
}
