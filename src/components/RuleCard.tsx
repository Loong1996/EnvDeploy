import type { Rule } from '@shared/types'
import { ruleSummary } from '../utils/rules'

interface Props {
  rule: Rule
  typeLabel: string
  onEdit(): void
  onDelete(): void
  onRun(): void
  onToggle(v: boolean): void
  onDragStart(): void
  onDropOn(): void
}

export default function RuleCard({
  rule, typeLabel, onEdit, onDelete, onRun, onToggle, onDragStart, onDropOn,
}: Props) {
  return (
    <div
      className={rule.enabled ? 'card' : 'card disabled'}
      draggable
      onDragStart={onDragStart}
      onDragOver={e => e.preventDefault()}
      onDrop={onDropOn}
    >
      <div className="card-main">
        <div className="card-title">
          <span className={`badge badge-${rule.type}`}>{typeLabel}</span>
          <span className="name">{rule.name || '(未命名)'}</span>
        </div>
        <div className="card-summary" title={ruleSummary(rule)}>{ruleSummary(rule)}</div>
      </div>
      <div className="card-actions">
        <label className="switch" title={rule.enabled ? '已启用' : '已禁用'}>
          <input type="checkbox" checked={rule.enabled} onChange={e => onToggle(e.target.checked)} />
          <span className="slider" />
        </label>
        <button className="btn" onClick={onEdit}>编辑</button>
        <button className="btn" onClick={onRun} disabled={!rule.enabled}>执行</button>
        <button className="btn btn-danger" onClick={onDelete}>删除</button>
      </div>
    </div>
  )
}
