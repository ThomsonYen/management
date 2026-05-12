import { Link } from 'react-router-dom'

interface Props {
  name: string
  count?: number
  active?: boolean
  size?: 'xs' | 'sm'
}

export default function TagPill({ name, count, active, size = 'xs' }: Props) {
  const px = size === 'sm' ? 'px-2.5 py-1' : 'px-2 py-0.5'
  const text = size === 'sm' ? 'text-xs' : 'text-[11px]'
  return (
    <Link
      to={`/notes?tag=${encodeURIComponent(name)}`}
      className={`inline-flex items-center gap-1 ${px} ${text} font-medium rounded-full border transition-colors ${
        active
          ? 'bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 border-indigo-300 dark:border-indigo-700'
          : 'bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:border-indigo-300 dark:hover:border-indigo-600 hover:text-indigo-700 dark:hover:text-indigo-300'
      }`}
      title={count != null ? `${count} note${count !== 1 ? 's' : ''} with #${name}` : undefined}
    >
      <span>#{name}</span>
      {count != null && (
        <span className={active ? 'text-indigo-500 dark:text-indigo-400' : 'text-slate-400 dark:text-slate-500'}>
          {count}
        </span>
      )}
    </Link>
  )
}
