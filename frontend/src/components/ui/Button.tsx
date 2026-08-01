import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { buttonBase, buttonSizes, buttonVariants, type ButtonSize, type ButtonVariant } from '../../theme/buttons'
import { cn } from './cn'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  leadingIcon?: ReactNode
  trailingIcon?: ReactNode
  fullWidth?: boolean
  loading?: boolean
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'sm', leadingIcon, trailingIcon, fullWidth, loading, className, disabled, children, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      className={cn(
        buttonBase,
        buttonVariants[variant],
        variant !== 'link' && buttonSizes[size],
        fullWidth && 'w-full',
        className,
      )}
      {...rest}
    >
      {leadingIcon}
      {children}
      {trailingIcon}
    </button>
  )
})
