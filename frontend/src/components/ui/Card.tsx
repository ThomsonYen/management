import { forwardRef, type HTMLAttributes, type ReactNode } from 'react'
import { cardBase, cardElevated, cardInteractive, cardPadded } from '../../theme/surfaces'
import { cn } from './cn'

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  interactive?: boolean
  padded?: boolean
  elevated?: boolean
  children?: ReactNode
}

interface CardComponent extends React.ForwardRefExoticComponent<CardProps & React.RefAttributes<HTMLDivElement>> {
  Header: typeof CardHeader
  Body: typeof CardBody
  Footer: typeof CardFooter
}

const CardImpl = forwardRef<HTMLDivElement, CardProps>(function Card(
  { interactive, padded = true, elevated, className, children, ...rest },
  ref,
) {
  return (
    <div
      ref={ref}
      className={cn(
        cardBase,
        padded && cardPadded,
        elevated && cardElevated,
        interactive && cardInteractive,
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  )
})

function CardHeader({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('px-4 py-3 border-b border-border', className)} {...rest} />
}
function CardBody({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('px-4 py-3', className)} {...rest} />
}
function CardFooter({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('px-4 py-3 border-t border-border flex items-center justify-end gap-2', className)} {...rest} />
}

export const Card = CardImpl as CardComponent
Card.Header = CardHeader
Card.Body = CardBody
Card.Footer = CardFooter
