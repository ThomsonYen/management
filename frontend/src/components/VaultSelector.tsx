import { FolderOpen } from 'lucide-react'
import type { Vault } from '../types'

interface Props {
  vaults: Vault[]
  value: string // vault id as string, or 'all'
  onChange: (next: string) => void
}

export default function VaultSelector({ vaults, value, onChange }: Props) {
  // Hide the selector entirely until there's a real choice (managed + ≥1 external).
  if (vaults.length <= 1) return null

  const sorted = [...vaults].sort((a, b) => {
    if (a.is_managed !== b.is_managed) return a.is_managed ? -1 : 1
    return a.name.localeCompare(b.name)
  })

  return (
    <div className="relative">
      <FolderOpen size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="pl-9 pr-8 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-400 appearance-none cursor-pointer"
        title="Filter list, and target vault for new notes"
      >
        <option value="all">All vaults</option>
        {sorted.map((v) => (
          <option key={v.id} value={String(v.id)}>
            {v.name}
            {v.is_managed ? ' (managed)' : ''}
          </option>
        ))}
      </select>
    </div>
  )
}
