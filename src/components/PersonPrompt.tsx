import { useState } from 'react'
import type { Person } from '@shared/types'
import Modal from './Modal'

interface Props {
  people: Person[]
  onConfirm(id: string | null): void
}

/** 启动时选择本次使用人员;默认停在「全部人员」(null)。之后仍可在顶栏切换。 */
export default function PersonPrompt({ people, onConfirm }: Props) {
  const [sel, setSel] = useState<string | null>(null)
  const options: { id: string | null; name: string }[] = [
    { id: null, name: '👥 全部人员' },
    ...people.map(p => ({ id: p.id, name: p.name })),
  ]

  return (
    <Modal
      title="选择使用人员"
      onClose={() => onConfirm(null)}
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
