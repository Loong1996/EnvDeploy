import { useCallback, useEffect, useMemo, useState } from 'react'
import type { AppConfig, ProgressEvent, Rule, RuleResult, RuleTypeInfo } from '@shared/types'
import LogsPage from './pages/LogsPage'

export interface LogEntry {
  time: string
  ok: boolean
  summary: string
  details: string[]
}

type Page = 'pack' | 'deploy' | 'logs'

export default function App() {
  const [config, setConfig] = useState<AppConfig | null>(null)
  const [types, setTypes] = useState<RuleTypeInfo[]>([])
  const [admin, setAdmin] = useState(true)
  const [page, setPage] = useState<Page>('pack')
  const [editing, setEditing] = useState<{ rule: Rule; isNew: boolean } | null>(null)
  const [selecting, setSelecting] = useState<'pack' | 'deploy' | null>(null)
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState<ProgressEvent | null>(null)
  const [results, setResults] = useState<RuleResult[] | null>(null)
  const [showSettings, setShowSettings] = useState(false)
  const [logs, setLogs] = useState<LogEntry[]>([])

  useEffect(() => {
    void window.api.loadConfig().then(cfg => {
      setConfig(cfg)
      const p = cfg.uiState.page
      if (p === 'pack' || p === 'deploy' || p === 'logs') setPage(p)
    })
    void window.api.ruleTypes().then(setTypes)
    void window.api.isAdmin().then(setAdmin)
  }, [])

  /** 变更配置并立即持久化 */
  const update = useCallback((mut: (c: AppConfig) => AppConfig) => {
    setConfig(c => {
      if (!c) return c
      const next = mut(c)
      void window.api.saveConfig(next)
      return next
    })
  }, [])

  const selectPage = (p: Page): void => {
    setPage(p)
    update(c => ({ ...c, uiState: { ...c.uiState, page: p } }))
  }

  const packRules = useMemo(() => (config?.rules ?? []).filter(r => r.type === 'pack'), [config])
  const deployRules = useMemo(() => (config?.rules ?? []).filter(r => r.type !== 'pack'), [config])

  const runIds = useCallback(async (ids: string[]) => {
    if (!ids.length) return
    setRunning(true)
    setProgress(null)
    setResults(null)
    const off = window.api.onProgress(setProgress)
    try {
      const res = await window.api.runRules(ids)
      setResults(res)
      const ok = res.filter(r => r.ok).length
      setLogs(l => [
        {
          time: new Date().toLocaleString(),
          ok: ok === res.length,
          summary: `执行完成: ${ok} 成功 / ${res.length - ok} 失败`,
          details: res.map(r => `${r.ok ? '✓' : '✗'} ${r.name}: ${r.message}`),
        },
        ...l,
      ])
    } finally {
      off()
      setRunning(false)
    }
  }, [])

  if (!config) return <div className="loading">加载配置中…</div>

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">⚡ AI 编程环境部署</div>
        <button className="hero hero-pack" onClick={() => setSelecting('pack')}>一键打包</button>
        <button className="hero hero-deploy" onClick={() => setSelecting('deploy')}>一键部署</button>
        <div className="spacer" />
        {!admin && (
          <span className="admin-warn" title="修改系统环境变量需要管理员权限，请以管理员身份重新运行">
            ⚠ 非管理员
          </span>
        )}
        <button className="icon-btn" title="设置" onClick={() => setShowSettings(true)}>⚙</button>
      </header>

      <div className="body">
        <nav className="sidebar">
          {(
            [
              ['pack', '打包规则'],
              ['deploy', '部署规则'],
              ['logs', '操作日志'],
            ] as [Page, string][]
          ).map(([key, label]) => (
            <button key={key} className={page === key ? 'nav active' : 'nav'} onClick={() => selectPage(key)}>
              {label}
            </button>
          ))}
        </nav>

        <main className="content">
          {page === 'pack' && <div className="empty">打包规则列表（Task 13 实现）共 {packRules.length} 条</div>}
          {page === 'deploy' && <div className="empty">部署规则列表（Task 13 实现）共 {deployRules.length} 条</div>}
          {page === 'logs' && <LogsPage logs={logs} />}
        </main>
      </div>

      {/* Task 13-16 在此挂载:RuleEditor / SelectionDialog / RunOverlay / SettingsDialog */}
      {void editing}
      {void selecting}
      {void running}
      {void progress}
      {void results}
      {void showSettings}
      {void types}
      {void runIds}
    </div>
  )
}
