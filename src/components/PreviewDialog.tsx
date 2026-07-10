import type { RulePlan } from '@shared/types'
import Modal from './Modal'

interface Props {
  plans: RulePlan[]
  onConfirm(): void
  onCancel(): void
}

export default function PreviewDialog({ plans, onConfirm, onCancel }: Props) {
  const noop = plans.filter(p => p.ok && p.noop).length
  const err = plans.filter(p => !p.ok).length
  return (
    <Modal
      title="部署预览"
      onClose={onCancel}
      footer={
        <>
          <div className="spacer" />
          <button className="btn" onClick={onCancel}>取消</button>
          <button className="btn btn-primary" onClick={onConfirm}>确认执行</button>
        </>
      }
    >
      <div className="preview-summary dim">共 {plans.length} 条 · {noop} 条无变化 · {err} 条预检失败 · 从上到下依次执行</div>
      <div className="preview-list">
        {plans.map((p, i) => (
          <div key={p.ruleId} className={!p.ok ? 'preview-item err' : p.noop ? 'preview-item noop' : 'preview-item'}>
            <div className="preview-head">
              <span className="idx">{i + 1}</span>
              <span className="name">{p.name}</span>
              {p.ok && p.noop && <span className="tag">无变化</span>}
              {!p.ok && <span className="tag tag-err">预检失败</span>}
            </div>
            {p.ok
              ? p.changes.map((c, i) => <div key={i} className="preview-change">• {c.detail}</div>)
              : <div className="preview-change err">✗ {p.error}</div>}
          </div>
        ))}
      </div>
    </Modal>
  )
}
