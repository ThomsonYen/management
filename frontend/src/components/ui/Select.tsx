import { forwardRef, type SelectHTMLAttributes } from 'react'
import { inputBase, inputSizes, selectCaret, type InputSize } from '../../theme/inputs'
import { cn } from './cn'

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  inputSize?: InputSize
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { inputSize = 'md', className, children, ...rest },
  ref,
) {
  return (
    <select
      ref={ref}
      className={cn(
        inputBase,
        inputSizes[inputSize],
        selectCaret,
        'w-full',
        className,
      )}
      {...rest}
    >
      {children}
    </select>
  )
})
