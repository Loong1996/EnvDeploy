import { useState } from 'react'
import type { Rule } from '@shared/types'
import Modal from './Modal'
import { ruleSummary } from '../utils/rules'

interface Props {
  title: string
  rules: Rule[]
  memory: Record<string, boolean>
  onConfirm(ids: string[], memory: Record<string, boolean>): void
  onCancel(): void
}

export default function SelectionDialog({ title, rules, memory, onConfirm, onCancel }: Props) {
  const [checked, setChecked] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(rules.map(r => [r.id, memory[r.id] ?? true])),
  )
  const allChecked = rules.length > 0 && rules.every(r => checked[r.id])
  const ids = rules.filter(r => checked[r.id]).map(r => r.id)

  return (
    <Modal
      title={title}
      onClose={onCancel}
      footer={
        <>
          <button
            className="btn"
            disabled={!rules.length}
            onClick={() => setChecked(Object.fromEntries(rules.map(r => [r.id, !allChecked])))}
          >
            {allChecked ? '全不选' : '全选'}
          </button>
          <div className="spacer" />
          <button className="btn" onClick={onCancel}>取消</button>
          <button className="btn btn-primary" disabled={!ids.length} onClick={() => onConfirm(ids, checked)}>
            执行 ({ids.length})
          </button>
        </>
      }
    >
      {rules.length === 0 && <div className="empty">没有已启用的规则</div>}
      <div className="check-list">
        {rules.map(r => (
          <label key={r.id} className="check-item">
            <input
              type="checkbox"
              checked={!!checked[r.id]}
              onChange={e => setChecked(c => ({ ...c, [r.id]: e.target.checked }))}
            />
            <span className="name">{r.name}</span>
            <span className="dim">{ruleSummary(r)}</span>
          </label>
        ))}
      </div>
    </Modal>
  )
}
