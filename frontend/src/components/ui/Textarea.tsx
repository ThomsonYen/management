import { forwardRef, type TextareaHTMLAttributes } from 'react'
import { inputBase, inputInvalid, textareaSize } from '../../theme/inputs'
import { cn } from './cn'

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  invalid?: boolean
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { invalid, className, ...rest },
  ref,
) {
  return (
    <textarea
      ref={ref}
      className={cn(
        inputBase,
        textareaSize,
        'w-full resize-y',
        invalid && inputInvalid,
        className,
      )}
      {...rest}
    />
  )
})
