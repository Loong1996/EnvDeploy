import { useState } from 'react'
import type { Person } from '@shared/types'
import Modal from './Modal'

interface Props {
  people: Person[]
  /** 上次会话记住的人员;默认选中它而不是重置回「全部」,× 关闭也保持不变 */
  initial: string | null
  onConfirm(id: string | null): void
}

/** 启动时选择本次使用人员;默认停在上次记住的人员(无则「全部」)。之后仍可在顶栏切换。 */
export default function PersonPrompt({ people, initial, onConfirm }: Props) {
  const [sel, setSel] = useState<string | null>(initial)
  const options: { id: string | null; name: string }[] = [
    { id: null, name: '👥 全部人员' },
    ...people.map(p => ({ id: p.id, name: p.name })),
  ]

  return (
    <Modal
      title="选择使用人员"
      onClose={() => onConfirm(initial)}
      footer={
        <>
          <div className="spacer" />
          <button className="btn btn-primary" onClick={() => onConfirm(sel)}>进入</button>
        </>
      }
    >
      <div className="dim">选择本次要打包/部署的人员,列表与一键操作会据此筛选;之后仍可在顶栏随时切换。</div>
      <div className="person-prompt">
        {options.map(o => (
          <button
            key={o.id ?? '__all__'}
            type="button"
            className={sel === o.id ? 'chip chip-on' : 'chip'}
            onClick={() => setSel(o.id)}
          >
            {o.name}
          </button>
        ))}
      </div>
    </Modal>
  )
}
