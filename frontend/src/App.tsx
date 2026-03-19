import { useState } from 'react'
import { NavLink, Route, Routes, useNavigate } from 'react-router-dom'
import { LayoutDashboard, CheckSquare, FolderKanban, Users, CheckCircle2, Crosshair, Settings } from 'lucide-react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { updateTodo } from './api'
import Dashboard from './pages/Dashboard'
import TodosPage from './pages/TodosPage'
import ProjectsPage from './pages/ProjectsPage'
import PeoplePage from './pages/PeoplePage'
import TodoDetailPage from './pages/TodoDetailPage'
import RecentlyDonePage from './pages/RecentlyDonePage'
import FocusPage from './pages/FocusPage'
import SettingsPage from './pages/SettingsPage'

const navItems = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/focus', label: 'Focus', icon: Crosshair, end: false, isDropTarget: true },
  { to: '/todos', label: 'Todos', icon: CheckSquare, end: false },
  { to: '/projects', label: 'Projects', icon: FolderKanban, end: false },
  { to: '/people', label: 'People', icon: Users, end: false },
  { to: '/done', label: 'Recently Done', icon: CheckCircle2, end: false },
]

export default function App() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [dragOverFocus, setDragOverFocus] = useState(false)

  const focusMutation = useMutation({
    mutationFn: (todoId: number) => updateTodo(todoId, { is_focused: true }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['todos'] })
    },
  })

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOverFocus(false)
    const todoId = e.dataTransfer.getData('application/x-todo-id')
    if (todoId) {
      focusMutation.mutate(parseInt(todoId))
    }
  }

  const handleDragOver = (e: React.DragEvent) => {
    if (e.dataTransfer.types.includes('application/x-todo-id')) {
      e.preventDefault()
      e.dataTransfer.dropEffect = 'link'
      setDragOverFocus(true)
    }
  }

  const handleDragLeave = (e: React.DragEvent) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setDragOverFocus(false)
    }
  }

  return (
    <div className="flex h-screen bg-slate-100 dark:bg-slate-950 overflow-hidden">
      {/* Sidebar */}
      <aside className="w-56 bg-slate-900 dark:bg-slate-900 dark:border-r dark:border-slate-800 text-white flex flex-col flex-shrink-0 shadow-xl">
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
            const isFocusItem = item.isDropTarget
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                onDrop={isFocusItem ? handleDrop : undefined}
                onDragOver={isFocusItem ? handleDragOver : undefined}
                onDragLeave={isFocusItem ? handleDragLeave : undefined}
                className={({ isActive }) =>
                  `w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors mb-0.5 ${
                    isFocusItem && dragOverFocus
                      ? 'bg-indigo-500 text-white ring-2 ring-indigo-300 scale-105'
                      : isActive
                        ? 'bg-indigo-600 text-white'
                        : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                  }`
                }
              >
                <Icon size={16} />
                {item.label}
                {isFocusItem && dragOverFocus && (
                  <span className="ml-auto text-xs opacity-75">Drop here</span>
                )}
              </NavLink>
            )
          })}
        </nav>
        <div className="border-t border-slate-800">
          <div className="px-2 py-2">
            <NavLink
              to="/settings"
              className={({ isActive }) =>
                `w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-indigo-600 text-white'
                    : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                }`
              }
            >
              <Settings size={16} />
              Settings
            </NavLink>
          </div>
          <div className="px-5 py-3 border-t border-slate-800">
            <p className="text-slate-500 text-xs">9h/day per person</p>
            <p className="text-slate-500 text-xs mt-0.5">3 windows × 3h</p>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto dark:bg-slate-950">
        <Routes>
          <Route path="/" element={<Dashboard onOpenTodo={(id) => navigate(`/todos/${id}`)} />} />
          <Route path="/focus" element={<FocusPage onOpenTodo={(id) => navigate(`/todos/${id}`)} />} />
          <Route path="/todos" element={<TodosPage onOpenTodo={(id) => navigate(`/todos/${id}`)} />} />
          <Route path="/todos/:id" element={<TodoDetailPage />} />
          <Route path="/projects" element={<ProjectsPage onOpenTodo={(id) => navigate(`/todos/${id}`)} />} />
          <Route path="/people" element={<PeoplePage onOpenTodo={(id) => navigate(`/todos/${id}`)} />} />
          <Route path="/done" element={<RecentlyDonePage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Routes>
      </main>
    </div>
  )
}
