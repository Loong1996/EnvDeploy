import type { ProgressEvent, RuleResult } from '@shared/types'
import Modal from './Modal'

interface Props {
  running: boolean
  progress: ProgressEvent | null
  results: RuleResult[] | null
  onClose(): void
}

export default function RunOverlay({ running, progress, results, onClose }: Props) {
  if (running) {
    const pct = progress && progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0
    return (
      <Modal title="执行中…" onClose={() => {}}>
        <div className="progress-label">
          {progress ? `[${progress.ruleIndex + 1}/${progress.ruleCount}] ${progress.ruleName}` : '准备中…'}
        </div>
        <div className="progress-bar">
          <div className="progress-fill" style={{ width: `${pct}%` }} />
        </div>
        <div className="progress-detail dim">{progress?.detail ?? ''}</div>
      </Modal>
    )
  }

  if (!results) return null
  const ok = results.filter(r => r.ok).length
  return (
    <Modal
      title={`执行结果: ${ok} 成功 / ${results.length - ok} 失败`}
      onClose={onClose}
      footer={
        <>
          <div className="spacer" />
          <button className="btn btn-primary" onClick={onClose}>关闭</button>
        </>
      }
    >
      <div className="result-list">
        {results.map((r, i) => (
          <div key={i} className={r.ok ? 'result ok' : 'result err'}>
            <span>{r.ok ? '✓' : '✗'}</span>
            <span className="name">{r.name}</span>
            <span className="msg">{r.message}</span>
          </div>
        ))}
      </div>
    </Modal>
  )
}
