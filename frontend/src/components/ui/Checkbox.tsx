import { forwardRef, useEffect, useRef, type InputHTMLAttributes } from 'react'
import { cn } from './cn'

export interface CheckboxProps extends InputHTMLAttributes<HTMLInputElement> {
  indeterminate?: boolean
}

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(function Checkbox(
  { indeterminate, className, ...rest },
  ref,
) {
  const localRef = useRef<HTMLInputElement | null>(null)
  useEffect(() => {
    if (localRef.current) localRef.current.indeterminate = !!indeterminate
  }, [indeterminate])
  return (
    <input
      type="checkbox"
      ref={(el) => {
        localRef.current = el
        if (typeof ref === 'function') ref(el)
        else if (ref) (ref as React.MutableRefObject<HTMLInputElement | null>).current = el
      }}
      className={cn(
        'h-4 w-4 rounded border-border cursor-pointer',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40',
        className,
      )}
      {...rest}
    />
  )
})
