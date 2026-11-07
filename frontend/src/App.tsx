import { createContext, useContext, useState, type ReactNode } from 'react'
import { Input } from '@fluentui/react-components'
import {
  ChatMultiple24Regular, ClipboardTaskListLtr24Regular, DataBarVertical24Regular, Flag24Regular,
  Play24Regular, Search20Regular, ShieldError24Regular,
} from '@fluentui/react-icons'
import { NavLink, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { readStorage, writeStorage } from './format'
import AnalyticsPage from './pages/AnalyticsPage'
import AppealsPage from './pages/AppealsPage'
import ChecklistsPage from './pages/ChecklistsPage'
import ConversationPage from './pages/ConversationPage'
import ConversationsPage from './pages/ConversationsPage'
import GrossPage from './pages/GrossPage'
import RunPage from './pages/RunPage'

export type Role = 'supervisor' | 'reviewer'

const RoleContext = createContext<Role>('supervisor')
export const useRole = () => useContext(RoleContext)

const NAV: { to: string; label: string; icon: ReactNode; end?: boolean }[] = [
  { to: '/', label: 'Диалоги', icon: <ChatMultiple24Regular />, end: true },
  { to: '/gross', label: 'Грубые нарушения', icon: <ShieldError24Regular /> },
  { to: '/run', label: 'Оценка', icon: <Play24Regular /> },
  { to: '/checklists', label: 'Чек-листы', icon: <ClipboardTaskListLtr24Regular /> },
  { to: '/appeals', label: 'Апелляции', icon: <Flag24Regular /> },
  { to: '/analytics', label: 'Аналитика', icon: <DataBarVertical24Regular /> },
]

function crumbs(path: string): string[] {
  if (path.startsWith('/conversations/')) return ['Диалоги', `Диалог ${path.split('/')[2]}`]
  if (path.startsWith('/gross')) return ['Контроль качества', 'Грубые нарушения']
  if (path.startsWith('/run')) return ['Оценка', 'Запуск оценки']
  if (path.startsWith('/checklists')) return ['Настройка', 'Чек-листы']
  if (path.startsWith('/appeals')) return ['Контроль качества', 'Апелляции']
  if (path.startsWith('/analytics')) return ['Аналитика', 'Аналитика качества']
  return ['Контроль качества', 'Журнал диалогов']
}

export default function App() {
  const location = useLocation()
  const navigate = useNavigate()
  const [role, setRole] = useState<Role>(() =>
    readStorage('cqa-role') === 'reviewer' ? 'reviewer' : 'supervisor',
  )
  const [search, setSearch] = useState('')
  const trail = crumbs(location.pathname)

  const changeRole = (next: Role) => {
    setRole(next)
    writeStorage('cqa-role', next)
  }

  return (
    <RoleContext.Provider value={role}>
      <div className="shell">
        <header className="topbar">
          <div className="brand">
            <svg width="24" height="26" viewBox="0 0 16 18" aria-hidden="true">
              <path fill="#138A4E" d="M8 0l8 2.5v6.2C16 13 12.8 16.3 8 18 3.2 16.3 0 13 0 8.7V2.5z" />
            </svg>
            <span>Журнал<br />контроля</span>
          </div>
          <div className="crumbs grow">
            {trail[0]} › <b>{trail[1]}</b>
          </div>
          <form
            className="search"
            onSubmit={(event) => {
              event.preventDefault()
              navigate(`/?q=${encodeURIComponent(search)}`)
            }}
          >
            <Input
              style={{ width: '100%' }}
              contentBefore={<Search20Regular />}
              placeholder="Поиск по ID, оператору, тексту"
              value={search}
              onChange={(_, data) => setSearch(data.value)}
            />
          </form>
          <div className="segments" role="group" aria-label="Роль">
            <button className={role === 'supervisor' ? 'on' : ''} onClick={() => changeRole('supervisor')}>
              Супервизор
            </button>
            <button className={role === 'reviewer' ? 'on' : ''} onClick={() => changeRole('reviewer')}>
              Проверяющий
            </button>
          </div>
        </header>
        <nav className="nav">
          {NAV.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.end}>
              {item.icon}
              {item.label}
            </NavLink>
          ))}
        </nav>
        <Routes>
          <Route path="/" element={<ConversationsPage />} />
          <Route path="/conversations/:id" element={<ConversationPage />} />
          <Route path="/gross" element={<GrossPage />} />
          <Route path="/run" element={<RunPage />} />
          <Route path="/checklists" element={<ChecklistsPage />} />
          <Route path="/appeals" element={<AppealsPage />} />
          <Route path="/analytics" element={<AnalyticsPage />} />
        </Routes>
      </div>
    </RoleContext.Provider>
  )
}
