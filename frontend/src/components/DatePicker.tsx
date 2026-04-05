import { useState, useRef, useEffect } from 'react'
import { DayPicker } from 'react-day-picker'
import { format, parse } from 'date-fns'

interface DatePickerProps {
  value: string // YYYY-MM-DD
  onChange: (value: string) => void
  className?: string
}

export default function DatePicker({ value, onChange, className = '' }: DatePickerProps) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const selected = value ? parse(value, 'yyyy-MM-dd', new Date()) : undefined

  useEffect(() => {
    const onClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    if (open) document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [open])

  return (
    <div ref={containerRef} className={`relative inline-block ${className}`}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="font-bold text-xs hover:text-indigo-600 dark:hover:text-indigo-400 dark:text-slate-300 transition-colors"
      >
        {value || 'Set date'}
      </button>
      {open && (
        <div className="absolute z-50 mt-1 bg-white dark:bg-slate-800 rounded-xl shadow-lg border border-slate-200 dark:border-slate-700 p-2">
          <DayPicker
            mode="single"
            selected={selected}
            defaultMonth={selected}
            onSelect={(day) => {
              if (day) {
                onChange(format(day, 'yyyy-MM-dd'))
                setOpen(false)
              }
            }}
            classNames={{
              root: 'text-sm text-slate-800 dark:text-slate-100',
              months: 'flex flex-col',
              month: 'space-y-2',
              month_caption: 'flex justify-center items-center h-8',
              caption_label: 'text-sm font-semibold text-slate-700 dark:text-slate-200',
              nav: 'flex items-center justify-between absolute top-2 left-2 right-2',
              button_previous: 'p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400',
              button_next: 'p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400',
              month_grid: 'border-collapse',
              weekdays: '',
              weekday: 'text-xs font-medium text-slate-400 dark:text-slate-500 w-8 h-8',
              week: '',
              day: 'text-center',
              day_button: 'w-8 h-8 rounded-lg text-xs font-medium transition-colors hover:bg-indigo-50 dark:hover:bg-indigo-900/40 hover:text-indigo-600 dark:hover:text-indigo-400',
              selected: 'bg-indigo-600 text-white hover:bg-indigo-700 hover:text-white rounded-lg dark:bg-indigo-500 dark:hover:bg-indigo-600',
              today: 'font-bold text-indigo-600 dark:text-indigo-400',
              outside: 'text-slate-300 dark:text-slate-600',
              disabled: 'text-slate-200 dark:text-slate-700',
              chevron: 'w-4 h-4',
            }}
          />
        </div>
      )}
    </div>
  )
}
