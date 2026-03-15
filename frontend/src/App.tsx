import { NavLink, Route, Routes, useNavigate } from 'react-router-dom'
import Dashboard from './pages/Dashboard'
import TodosPage from './pages/TodosPage'
import ProjectsPage from './pages/ProjectsPage'
import PeoplePage from './pages/PeoplePage'
import TodoDetailPage from './pages/TodoDetailPage'

const navItems = [
  { to: '/', label: 'Dashboard', icon: '⊞', end: true },
  { to: '/todos', label: 'Todos', icon: '✓', end: false },
  { to: '/projects', label: 'Projects', icon: '◈', end: false },
  { to: '/people', label: 'People', icon: '◉', end: false },
]

export default function App() {
  const navigate = useNavigate()

  return (
    <div className="flex h-screen bg-slate-100 overflow-hidden">
      {/* Sidebar */}
      <aside className="w-56 bg-indigo-900 text-white flex flex-col flex-shrink-0">
        <div className="px-6 py-5 border-b border-indigo-800">
          <h1 className="text-xl font-bold tracking-tight text-white">Management</h1>
          <p className="text-indigo-300 text-xs mt-0.5">Work tracker</p>
        </div>
        <nav className="flex-1 py-4">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `w-full flex items-center gap-3 px-6 py-3 text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-indigo-700 text-white'
                    : 'text-indigo-300 hover:bg-indigo-800 hover:text-white'
                }`
              }
            >
              <span className="text-base">{item.icon}</span>
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="px-6 py-4 border-t border-indigo-800">
          <p className="text-indigo-400 text-xs">9h/day per person</p>
          <p className="text-indigo-400 text-xs">3 windows × 3h</p>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto">
        <Routes>
          <Route path="/" element={<Dashboard onOpenTodo={(id) => navigate(`/todos/${id}`)} />} />
          <Route path="/todos" element={<TodosPage onOpenTodo={(id) => navigate(`/todos/${id}`)} />} />
          <Route path="/todos/:id" element={<TodoDetailPage />} />
          <Route path="/projects" element={<ProjectsPage onOpenTodo={(id) => navigate(`/todos/${id}`)} />} />
          <Route path="/people" element={<PeoplePage onOpenTodo={(id) => navigate(`/todos/${id}`)} />} />
        </Routes>
      </main>
    </div>
  )
}
