import { Link, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, SearchX } from 'lucide-react'
import { fetchProjects, fetchTodo } from '../../api'
import type { Project, Todo } from '../../types'
import { useSession } from '../../hooks/useSession'
import MemberTodoCard from '../../components/member/MemberTodoCard'
import { EmptyState } from '../../components/ui'

export default function MemberTodoPage() {
  const { id } = useParams<{ id: string }>()
  const todoId = Number(id)
  const user = useSession()
  const { data: todo, isLoading } = useQuery<Todo>({
    queryKey: ['todo', todoId],
    queryFn: () => fetchTodo(todoId),
    retry: false,
    enabled: Number.isFinite(todoId),
  })
  const { data: projects = [] } = useQuery<Project[]>({ queryKey: ['projects'], queryFn: fetchProjects })

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto">
      <Link to="/" className="inline-flex items-center gap-1.5 text-sm text-fg-muted hover:text-fg mb-4">
        <ArrowLeft size={16} /> My items
      </Link>
      {isLoading && <p className="text-sm text-fg-subtle">Loading…</p>}
      {!isLoading && !todo && (
        <div className="bg-surface rounded-xl border border-border shadow-sm">
          <EmptyState icon={SearchX} title="Not found" description="This todo does not exist or is not visible to you." />
        </div>
      )}
      {todo && (
        <MemberTodoCard
          todo={todo}
          editable={user.access_level === 'edit' && todo.assignee_id === user.person_id}
          showAssignee
          expanded
          onToggle={() => {}}
          projects={projects}
        />
      )}
    </div>
  )
}
