import type { ReactNode } from 'react'

interface Props {
  title: string
  onClose(): void
  footer?: ReactNode
  children: ReactNode
}

export default function Modal({ title, onClose, footer, children }: Props) {
  // 不再「点遮罩关闭」：避免填表时误点外面导致内容丢失。只能用 ×/取消/关闭 关闭。
  return (
    <div className="modal-mask">
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
