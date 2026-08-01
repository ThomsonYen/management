import { useState, useRef, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { DayPicker } from 'react-day-picker'
import { format, parse } from 'date-fns'

interface DatePickerProps {
 value: string // YYYY-MM-DD or ''
 onChange: (value: string) => void
 /** "inline" = clickable text label, "input" = bordered input field */
 variant?: 'inline' | 'input'
 placeholder?: string
 className?: string
 /** Extra classes applied to the trigger button/input */
 triggerClassName?: string
}

export default function DatePicker({
 value,
 onChange,
 variant = 'inline',
 placeholder = 'Set date',
 className = '',
 triggerClassName = '',
}: DatePickerProps) {
 const [open, setOpen] = useState(false)
 const triggerRef = useRef<HTMLButtonElement>(null)
 const popoverRef = useRef<HTMLDivElement>(null)
 const [pos, setPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 })
 const selected = value ? parse(value, 'yyyy-MM-dd', new Date()) : undefined

 const updatePosition = useCallback(() => {
 if (!triggerRef.current) return
 const rect = triggerRef.current.getBoundingClientRect()
 const popoverWidth = 288
 const popoverHeight = 320
 let top = rect.bottom + 4
 let left = rect.left

 // Flip up if not enough room below
 if (top + popoverHeight > window.innerHeight) {
 top = rect.top - popoverHeight - 4
 }
 // Push left if overflowing right
 if (left + popoverWidth > window.innerWidth) {
 left = window.innerWidth - popoverWidth - 8
 }

 setPos({ top, left })
 }, [])

 useEffect(() => {
 if (!open) return
 updatePosition()
 const onClickOutside = (e: MouseEvent) => {
 if (
 triggerRef.current?.contains(e.target as Node) ||
 popoverRef.current?.contains(e.target as Node)
 ) return
 setOpen(false)
 }
 document.addEventListener('mousedown', onClickOutside)
 window.addEventListener('scroll', updatePosition, true)
 window.addEventListener('resize', updatePosition)
 return () => {
 document.removeEventListener('mousedown', onClickOutside)
 window.removeEventListener('scroll', updatePosition, true)
 window.removeEventListener('resize', updatePosition)
 }
 }, [open, updatePosition])

 const triggerBase =
 variant === 'input'
 ? `w-full text-left px-3 py-2 text-sm border border-border rounded-lg bg-surface focus:outline-none focus:ring-2 focus:ring-accent ${!value ? 'text-fg-subtle' : 'text-fg'}`
 : 'font-bold text-xs hover:text-accent dark:hover:text-accent dark:text-fg transition-colors'

 return (
 <div className={`relative inline-block ${className}`}>
 <button
 ref={triggerRef}
 type="button"
 onClick={(e) => { e.stopPropagation(); setOpen(!open) }}
 className={`${triggerBase} ${triggerClassName}`}
 >
 {value || placeholder}
 </button>
 {open && createPortal(
 <div
 ref={popoverRef}
 style={{ position: 'fixed', top: pos.top, left: pos.left, zIndex: 9999 }}
 className="bg-surface rounded-xl shadow-lg border border-border p-2"
 >
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
 root: 'text-sm text-fg',
 months: 'flex flex-col',
 month: 'space-y-2',
 month_caption: 'flex justify-center items-center h-8',
 caption_label: 'text-sm font-semibold text-fg',
 nav: 'flex items-center justify-between absolute top-2 left-2 right-2',
 button_previous: 'p-1 rounded hover:bg-inset text-fg-muted',
 button_next: 'p-1 rounded hover:bg-inset text-fg-muted',
 month_grid: 'border-collapse',
 weekdays: '',
 weekday: 'text-xs font-medium text-fg-subtle w-8 h-8',
 week: '',
 day: 'text-center',
 day_button: 'w-8 h-8 rounded-lg text-xs font-medium transition-colors hover:bg-accent-1 dark:hover:bg-accent-1 hover:text-accent dark:hover:text-accent',
 selected: 'bg-accent text-white hover:bg-accent-hover hover:text-white rounded-lg dark:bg-accent dark:hover:bg-accent-hover',
 today: 'font-bold text-accent',
 outside: 'text-fg-faint dark:text-fg-muted',
 disabled: 'text-fg-faint dark:text-fg',
 chevron: 'w-4 h-4',
 }}
 />
 {value && (
 <button
 type="button"
 onClick={() => { onChange(''); setOpen(false) }}
 className="w-full mt-1 text-xs text-fg-subtle hover:text-danger transition-colors py-1"
 >
 Clear date
 </button>
 )}
 </div>,
 document.body,
 )}
 </div>
 )
}
