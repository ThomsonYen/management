import { Check } from 'lucide-react'

/**
 * Round done toggle: an outlined ring that previews a faint tick on hover and
 * fills green with a white tick when done. Shared by Must Do and Keep in mind.
 */
export default function DoneCheck({ done, onClick, label, className = '' }: {
  done: boolean
  onClick: () => void
  label: string
  className?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={done}
      title={done ? 'Mark not done' : 'Mark done'}
      className={`group/check shrink-0 w-[18px] h-[18px] rounded-full grid place-items-center transition-all duration-150 active:scale-90 ${
        done
          ? 'bg-success text-white shadow-sm ring-2 ring-success/25'
          : 'border-[1.5px] border-border-strong text-transparent hover:border-success hover:bg-success-bg hover:text-success'
      } ${className}`}
    >
      <Check size={11} strokeWidth={3.5} className={done ? '' : 'opacity-0 group-hover/check:opacity-100 transition-opacity'} />
    </button>
  )
}
