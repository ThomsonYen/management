import { useState } from 'react'
import Dashboard from './pages/Dashboard'
import TodosPage from './pages/TodosPage'
import ProjectsPage from './pages/ProjectsPage'
import PeoplePage from './pages/PeoplePage'
import TodoDetailPage from './pages/TodoDetailPage'

type Tab = 'dashboard' | 'todos' | 'projects' | 'people'

const navItems: { id: Tab; label: string; icon: string }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: '⊞' },
  { id: 'todos', label: 'Todos', icon: '✓' },
  { id: 'projects', label: 'Projects', icon: '◈' },
  { id: 'people', label: 'People', icon: '◉' },
]

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>('dashboard')
  const [selectedTodoId, setSelectedTodoId] = useState<number | null>(null)

  const openTodo = (id: number) => setSelectedTodoId(id)
  const closeTodo = () => setSelectedTodoId(null)

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
            <button
              key={item.id}
              onClick={() => { setActiveTab(item.id); closeTodo() }}
              className={`w-full flex items-center gap-3 px-6 py-3 text-sm font-medium transition-colors ${
                activeTab === item.id && !selectedTodoId
                  ? 'bg-indigo-700 text-white'
                  : 'text-indigo-300 hover:bg-indigo-800 hover:text-white'
              }`}
            >
              <span className="text-base">{item.icon}</span>
              {item.label}
            </button>
          ))}
        </nav>
        <div className="px-6 py-4 border-t border-indigo-800">
          <p className="text-indigo-400 text-xs">9h/day per person</p>
          <p className="text-indigo-400 text-xs">3 windows × 3h</p>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto">
        {selectedTodoId !== null ? (
          <TodoDetailPage
            todoId={selectedTodoId}
            onBack={closeTodo}
            onOpenTodo={openTodo}
          />
        ) : (
          <>
            {activeTab === 'dashboard' && <Dashboard onOpenTodo={openTodo} />}
            {activeTab === 'todos' && <TodosPage onOpenTodo={openTodo} />}
            {activeTab === 'projects' && <ProjectsPage onOpenTodo={openTodo} />}
            {activeTab === 'people' && <PeoplePage onOpenTodo={openTodo} />}
          </>
        )}
      </main>
    </div>
  )
}
