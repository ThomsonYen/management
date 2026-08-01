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
 ? 'bg-accent-1 text-accent-fg border-accent-2 dark:border-accent-hover'
 : 'bg-inset text-fg-muted border-border hover:border-accent-2 dark:hover:border-accent hover:text-accent-fg dark:hover:text-accent'
 }`}
 title={count != null ? `${count} note${count !== 1 ? 's' : ''} with #${name}` : undefined}
 >
 <span>#{name}</span>
 {count != null && (
 <span className={active ? 'text-accent dark:text-accent' : 'text-fg-subtle'}>
 {count}
 </span>
 )}
 </Link>
 )
}
