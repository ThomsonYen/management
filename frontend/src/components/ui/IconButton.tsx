import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { buttonBase, buttonVariants, iconButtonSizes, type ButtonSize, type ButtonVariant } from '../../theme/buttons'
import { cn } from './cn'

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  'aria-label': string
  children: ReactNode
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { variant = 'ghost', size = 'sm', className, type = 'button', children, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(
        buttonBase,
        buttonVariants[variant],
        iconButtonSizes[size],
        'p-0',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  )
})
