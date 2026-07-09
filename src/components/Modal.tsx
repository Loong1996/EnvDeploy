import type { ReactNode } from 'react'

interface Props {
  title: string
  onClose(): void
  footer?: ReactNode
  children: ReactNode
}

export default function Modal({ title, onClose, footer, children }: Props) {
  return (
    <div
      className="modal-mask"
      onMouseDown={e => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="modal">
        <div className="modal-head">
          <span>{title}</span>
          <button className="icon-btn" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  )
}
