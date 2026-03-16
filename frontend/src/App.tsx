import { NavLink, Route, Routes, useNavigate } from 'react-router-dom'
import { LayoutDashboard, CheckSquare, FolderKanban, Users } from 'lucide-react'
import Dashboard from './pages/Dashboard'
import TodosPage from './pages/TodosPage'
import ProjectsPage from './pages/ProjectsPage'
import PeoplePage from './pages/PeoplePage'
import TodoDetailPage from './pages/TodoDetailPage'

const navItems = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/todos', label: 'Todos', icon: CheckSquare, end: false },
  { to: '/projects', label: 'Projects', icon: FolderKanban, end: false },
  { to: '/people', label: 'People', icon: Users, end: false },
]

export default function App() {
  const navigate = useNavigate()

  return (
    <div className="flex h-screen bg-slate-100 overflow-hidden">
      {/* Sidebar */}
      <aside className="w-56 bg-slate-900 text-white flex flex-col flex-shrink-0 shadow-xl">
        <div className="px-5 py-5 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 bg-indigo-500 rounded-lg flex items-center justify-center flex-shrink-0">
              <LayoutDashboard size={14} className="text-white" />
            </div>
            <div>
              <h1 className="text-sm font-bold tracking-tight text-white leading-none">Management</h1>
              <p className="text-slate-400 text-xs mt-0.5 leading-none">Work tracker</p>
            </div>
          </div>
        </div>
        <nav className="flex-1 py-3 px-2">
          {navItems.map((item) => {
            const Icon = item.icon
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  `w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors mb-0.5 ${
                    isActive
                      ? 'bg-indigo-600 text-white'
                      : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                  }`
                }
              >
                <Icon size={16} />
                {item.label}
              </NavLink>
            )
          })}
        </nav>
        <div className="px-5 py-4 border-t border-slate-800">
          <p className="text-slate-500 text-xs">9h/day per person</p>
          <p className="text-slate-500 text-xs mt-0.5">3 windows × 3h</p>
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
