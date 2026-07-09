import type { LogEntry } from '../App'

export default function LogsPage({ logs }: { logs: LogEntry[] }) {
  if (!logs.length) return <div className="empty">本次会话还没有操作记录</div>
  return (
    <div className="logs">
      {logs.map((l, i) => (
        <div key={i} className={l.ok ? 'log ok' : 'log err'}>
          <div className="log-head">
            <span className="dim">{l.time}</span>
            <span>{l.summary}</span>
          </div>
          {l.details.map((d, j) => (
            <div key={j} className="log-detail">{d}</div>
          ))}
        </div>
      ))}
    </div>
  )
}
