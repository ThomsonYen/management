import { forwardRef, type InputHTMLAttributes } from 'react'
import { inputBase, inputInvalid, inputSizes, type InputSize } from '../../theme/inputs'
import { cn } from './cn'

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  inputSize?: InputSize
  invalid?: boolean
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { inputSize = 'md', invalid, className, ...rest },
  ref,
) {
  return (
    <input
      ref={ref}
      className={cn(
        inputBase,
        inputSizes[inputSize],
        'w-full',
        invalid && inputInvalid,
        className,
      )}
      {...rest}
    />
  )
})
