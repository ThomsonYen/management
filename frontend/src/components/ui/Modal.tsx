import { useEffect, type HTMLAttributes, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { modalBody, modalFooter, modalHeader, modalOverlay, modalPanel, modalSizes, type ModalSize } from '../../theme/surfaces'
import { cn } from './cn'
import { IconButton } from './IconButton'

export interface ModalProps {
  open: boolean
  onClose: () => void
  size?: ModalSize
  children?: ReactNode
  className?: string
  // Prevents click-outside/Escape closing (for destructive prompts)
  dismissible?: boolean
}

interface ModalComponent extends React.FC<ModalProps> {
  Header: typeof ModalHeader
  Body: typeof ModalBody
  Footer: typeof ModalFooter
}

const ModalImpl: React.FC<ModalProps> = ({ open, onClose, size = 'md', className, children, dismissible = true }) => {
  useEffect(() => {
    if (!open || !dismissible) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, dismissible, onClose])

  if (!open) return null

  return createPortal(
    <div
      className={modalOverlay}
      onClick={(e) => {
        if (dismissible && e.target === e.currentTarget) onClose()
      }}
    >
      <div className={cn(modalPanel, modalSizes[size], className)}>
        {children}
      </div>
    </div>,
    document.body,
  )
}

interface ModalHeaderProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  title?: ReactNode
  onClose?: () => void
}
function ModalHeader({ title, onClose, className, children, ...rest }: ModalHeaderProps) {
  return (
    <div className={cn(modalHeader, className)} {...rest}>
      {title ? <h2 className="text-md font-semibold text-fg m-0">{title}</h2> : children}
      {onClose && (
        <IconButton size="sm" variant="ghost" onClick={onClose} aria-label="Close">
          <X size={16} />
        </IconButton>
      )}
    </div>
  )
}
function ModalBody({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn(modalBody, className)} {...rest} />
}
function ModalFooter({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn(modalFooter, className)} {...rest} />
}

export const Modal = ModalImpl as ModalComponent
Modal.Header = ModalHeader
Modal.Body = ModalBody
Modal.Footer = ModalFooter
