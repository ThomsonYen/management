import { useState, useCallback } from 'react'
import { Navigate, NavLink, Route, Routes, useNavigate } from 'react-router-dom'
import { LayoutDashboard, Settings, ChevronsLeft, ChevronsRight, Square, Sun, Moon } from 'lucide-react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { updateTodo, createNote } from './api'
import { useResizableSidebar } from './hooks/useResizableSidebar'
import { useHotkeys, useTheme, useTimezone } from './SettingsContext'
import { useHotkey } from './hooks/useHotkey'
import { useRecording } from './RecordingContext'
import { getTodayString } from './dateUtils'
import { APP_VERSION } from './config'
import Dashboard from './pages/Dashboard'
import TodosPage from './pages/TodosPage'
import ProjectsPage from './pages/ProjectsPage'
import PeoplePage from './pages/PeoplePage'
import TodoDetailPage from './pages/TodoDetailPage'
import RecentlyDonePage from './pages/RecentlyDonePage'
import RecentlyDeletedPage from './pages/RecentlyDeletedPage'
import FocusPage from './pages/FocusPage'
import SettingsPage from './pages/SettingsPage'
import MeetingNotesPage from './pages/MeetingNotesPage'
import PersonalNotesPage from './pages/PersonalNotesPage'
import NoteDetailPage from './pages/NoteDetailPage'
import WeeklyGoalsPage from './pages/WeeklyGoalsPage'
import ProgressPage from './pages/ProgressPage'
import TodoModal from './components/TodoModal'
import CommandPalette from './components/CommandPalette'
import InstallHint from './components/mobile/InstallHint'
import RequireAuth from './components/RequireAuth'
import LoginPage from './pages/LoginPage'
import InviteAcceptPage from './pages/InviteAcceptPage'
import MemberShell from './components/member/MemberShell'
import ApiErrorToaster from './components/ApiErrorToaster'
import { useSession } from './hooks/useSession'

import { navItems } from './navItems'
import MobileHeader from './components/mobile/MobileHeader'
import MobileTabBar from './components/mobile/MobileTabBar'

function AppShell() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [dragOverFocus, setDragOverFocus] = useState(false)
  const [showNewTodoModal, setShowNewTodoModal] = useState(false)
  const [showCommandPalette, setShowCommandPalette] = useState(false)
  const { width: sidebarWidth, collapsed: sidebarCollapsed, startResize, toggleCollapsed: toggleSidebar } = useResizableSidebar('sidebarWidth', 224)
  const { bindings } = useHotkeys()
  const { theme, setTheme } = useTheme()
  const { timezone } = useTimezone()
  const { isRecording, noteId: recordingNoteId, duration, isUploading, stop: stopRecording } = useRecording()

  // Sidebar toggle
  const stableToggleSidebar = useCallback(() => toggleSidebar(), [toggleSidebar])
  useHotkey(bindings.toggleMainSidebar, stableToggleSidebar)

  // Navigation hotkeys
  useHotkey(bindings.goToDashboard, useCallback(() => navigate('/'), [navigate]))
  useHotkey(bindings.goToFocus, useCallback(() => navigate('/focus'), [navigate]))
  useHotkey(bindings.goToTodos, useCallback(() => navigate('/todos'), [navigate]))
  useHotkey(bindings.goToProjects, useCallback(() => navigate('/projects'), [navigate]))
  useHotkey(bindings.goToPeople, useCallback(() => navigate('/people'), [navigate]))
  useHotkey(bindings.goToMeetings, useCallback(() => navigate('/meeting-notes'), [navigate]))
  useHotkey(bindings.goToNotes, useCallback(() => navigate('/notes'), [navigate]))
  useHotkey(bindings.goToDone, useCallback(() => navigate('/done'), [navigate]))

  // Theme toggle
  useHotkey(bindings.toggleTheme, useCallback(() => {
    setTheme(theme === 'dark' ? 'light' : 'dark')
  }, [theme, setTheme]))

  // New todo (global)
  useHotkey(bindings.newTodo, useCallback(() => setShowNewTodoModal(true), []))

  // Command palette (global)
  useHotkey(bindings.openCommandPalette, useCallback(() => setShowCommandPalette(true), []))

  // New meeting note (global)
  const newMeetingNoteMutation = useMutation({
    mutationFn: createNote,
    onSuccess: (note) => {
      queryClient.invalidateQueries({ queryKey: ['notes'] })
      navigate(`/meeting-notes/${note.id}`)
    },
  })
  useHotkey(bindings.newMeetingNote, useCallback(() => {
    if (newMeetingNoteMutation.isPending) return
    const todayStr = getTodayString(timezone)
    newMeetingNoteMutation.mutate({ title: `Untitled-Meeting`, kind: 'meeting', date: todayStr, template: 'default_meeting' })
  }, [newMeetingNoteMutation, timezone]))

  const newPersonalNoteMutation = useMutation({
    mutationFn: createNote,
    onSuccess: (note) => {
      queryClient.invalidateQueries({ queryKey: ['notes'] })
      navigate(`/notes/${note.id}`)
    },
  })
  const startNewPersonalNote = useCallback(() => {
    if (newPersonalNoteMutation.isPending) return
    newPersonalNoteMutation.mutate({ title: 'Untitled', kind: 'personal' })
  }, [newPersonalNoteMutation])
  useHotkey(bindings.newPersonalNote, startNewPersonalNote)

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
    <div className="flex h-dvh bg-app overflow-hidden">
      {/* Sidebar */}
      <aside
        style={{ width: sidebarCollapsed ? 56 : sidebarWidth }}
        className="bg-surface border-r border-border text-fg hidden md:flex flex-col flex-shrink-0 relative transition-[width] duration-200"
      >
        <div className={`py-5 border-b border-border ${sidebarCollapsed ? 'px-2' : 'px-5'}`}>
          <div className="flex items-center gap-2.5 justify-center">
            <div className="w-7 h-7 bg-accent rounded-md flex items-center justify-center flex-shrink-0">
              <LayoutDashboard size={14} className="text-fg-on-accent" />
            </div>
            {!sidebarCollapsed && (
              <div>
                <h1 className="text-sm font-semibold tracking-tight text-fg leading-none">Management</h1>
                <p className="text-fg-subtle text-xs mt-0.5 leading-none">Work tracker · v{APP_VERSION}</p>
              </div>
            )}
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
                title={sidebarCollapsed ? item.label : undefined}
                onDrop={isFocusItem ? handleDrop : undefined}
                onDragOver={isFocusItem ? handleDragOver : undefined}
                onDragLeave={isFocusItem ? handleDragLeave : undefined}
                className={({ isActive }) =>
                  `w-full flex items-center ${sidebarCollapsed ? 'justify-center' : 'gap-3'} px-3 py-2 rounded-md text-sm font-medium transition-colors mb-0.5 ${
                    isFocusItem && dragOverFocus
                      ? 'bg-accent text-fg-on-accent ring-2 ring-accent/40'
                      : isActive
                        ? 'bg-accent-1 text-accent-fg'
                        : 'text-fg-muted hover:bg-inset hover:text-fg'
                  }`
                }
              >
                <Icon size={16} />
                {!sidebarCollapsed && item.label}
                {!sidebarCollapsed && isFocusItem && dragOverFocus && (
                  <span className="ml-auto text-xs opacity-75">Drop here</span>
                )}
              </NavLink>
            )
          })}
        </nav>
        {/* Global recording indicator */}
        {(isRecording || isUploading) && recordingNoteId != null && (
          <div className="px-2 py-2 border-t border-border">
            <div
              className="flex items-center gap-2 px-3 py-2 rounded-md bg-danger-bg cursor-pointer hover:opacity-90 transition-opacity"
              onClick={() => navigate(`/meeting-notes/${recordingNoteId}`)}
              title="Go to recording"
            >
              {isRecording && (
                <span className="relative flex h-2.5 w-2.5 flex-shrink-0">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-danger opacity-75" />
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-danger" />
                </span>
              )}
              {!sidebarCollapsed && (
                <span className="text-xs font-mono text-danger flex-1 truncate">
                  {isUploading
                    ? 'Uploading...'
                    : `REC ${Math.floor(duration / 60)}:${(duration % 60).toString().padStart(2, '0')}`}
                </span>
              )}
              {isRecording && (
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    stopRecording()
                  }}
                  className="p-1 rounded text-danger hover:opacity-80 transition-opacity flex-shrink-0"
                  title="Stop recording"
                >
                  <Square size={12} />
                </button>
              )}
            </div>
          </div>
        )}
        <div className="border-t border-border">
          <div className="px-2 py-2">
            <NavLink
              to="/settings"
              title={sidebarCollapsed ? 'Settings' : undefined}
              className={({ isActive }) =>
                `w-full flex items-center ${sidebarCollapsed ? 'justify-center' : 'gap-3'} px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-accent-1 text-accent-fg'
                    : 'text-fg-muted hover:bg-inset hover:text-fg'
                }`
              }
            >
              <Settings size={16} />
              {!sidebarCollapsed && 'Settings'}
            </NavLink>
            <button
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              title={sidebarCollapsed ? (theme === 'dark' ? 'Switch to light' : 'Switch to dark') : undefined}
              className={`mt-0.5 w-full flex items-center ${sidebarCollapsed ? 'justify-center' : 'gap-3'} px-3 py-2 rounded-md text-sm font-medium transition-colors text-fg-muted hover:bg-inset hover:text-fg`}
            >
              {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
              {!sidebarCollapsed && (theme === 'dark' ? 'Light mode' : 'Dark mode')}
            </button>
          </div>
          {!sidebarCollapsed && (
            <div className="px-5 py-3 border-t border-border">
              <p className="text-fg-subtle text-xs">9h/day per person</p>
              <p className="text-fg-subtle text-xs mt-0.5">3 windows × 3h</p>
            </div>
          )}
          <div className="px-2 py-2 border-t border-border">
            <button
              onClick={toggleSidebar}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-md text-sm text-fg-muted hover:bg-inset hover:text-fg transition-colors"
              title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              {sidebarCollapsed ? <ChevronsRight size={16} /> : <ChevronsLeft size={16} />}
              {!sidebarCollapsed && <span className="text-xs">Collapse</span>}
            </button>
          </div>
        </div>
        {!sidebarCollapsed && (
          <div
            onMouseDown={startResize}
            className="absolute top-0 right-0 w-1.5 h-full cursor-col-resize hover:bg-accent/50 active:bg-accent/50 transition-colors"
          />
        )}
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto bg-app pb-[calc(4rem+env(safe-area-inset-bottom))] md:pb-0">
        <MobileHeader
          onNewTodo={() => setShowNewTodoModal(true)}
          onOpenSearch={() => setShowCommandPalette(true)}
        />
        <Routes>
          <Route path="/" element={<Dashboard onOpenTodo={(id) => navigate(`/todos/${id}`)} />} />
          <Route path="/focus" element={<FocusPage onOpenTodo={(id) => navigate(`/todos/${id}`)} />} />
          <Route path="/todos" element={<TodosPage onOpenTodo={(id) => navigate(`/todos/${id}`)} />} />
          <Route path="/todos/:id" element={<TodoDetailPage />} />
          <Route path="/projects" element={<ProjectsPage onOpenTodo={(id) => navigate(`/todos/${id}`)} />} />
          <Route path="/people" element={<PeoplePage onOpenTodo={(id) => navigate(`/todos/${id}`)} />} />
          <Route path="/done" element={<RecentlyDonePage />} />
          <Route path="/deleted" element={<RecentlyDeletedPage />} />
          <Route path="/meeting-notes" element={<MeetingNotesPage />} />
          <Route path="/meeting-notes/:id" element={<NoteDetailPage />} />
          <Route path="/notes" element={<PersonalNotesPage />} />
          <Route path="/notes/:id" element={<NoteDetailPage />} />
          <Route path="/weekly-goals" element={<WeeklyGoalsPage />} />
          <Route path="/progress" element={<ProgressPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>

      <MobileTabBar />

      {/* Global new todo modal */}
      {showNewTodoModal && (
        <TodoModal
          todo={null}
          onClose={() => setShowNewTodoModal(false)}
          invalidateKeys={[['todos']]}
        />
      )}

      {/* Global command palette */}
      {showCommandPalette && (
        <CommandPalette
          onClose={() => setShowCommandPalette(false)}
          onNewTodo={() => setShowNewTodoModal(true)}
          onNewMeetingNote={() => {
            if (newMeetingNoteMutation.isPending) return
            const todayStr = getTodayString(timezone)
            newMeetingNoteMutation.mutate({ title: `Untitled-Meeting`, kind: 'meeting', date: todayStr, template: 'default_meeting' })
          }}
          onNewPersonalNote={startNewPersonalNote}
        />
      )}

      {/* iOS Safari (non-installed) — how to Add to Home Screen */}
      <InstallHint />
    </div>
  )
}

/** Owner → the full app; member → the small "My items" shell. */
function RoleShell() {
  const user = useSession()
  return user.role === 'member' ? <MemberShell /> : <AppShell />
}

export default function App() {
  return (
    <>
      <ApiErrorToaster />
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/invite/:token" element={<InviteAcceptPage />} />
        <Route
          path="/*"
          element={
            <RequireAuth>
              <RoleShell />
            </RequireAuth>
          }
        />
      </Routes>
    </>
  )
}
