import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { AppConfig, Person, ProgressEvent, Rule, RulePlan, RuleResult, RuleTypeInfo } from '@shared/types'
import { ruleMatchesPerson } from '@shared/people'
import LogsPage from './pages/LogsPage'
import RuleList from './components/RuleList'
import RuleEditor from './components/RuleEditor'
import SelectionDialog from './components/SelectionDialog'
import PreviewDialog from './components/PreviewDialog'
import RunOverlay from './components/RunOverlay'
import SettingsDialog from './components/SettingsDialog'
import PeopleManager from './components/PeopleManager'
import PersonPrompt from './components/PersonPrompt'
import { moveRule, newRule } from './utils/rules'

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
  const [selecting, setSelecting] = useState<'pack' | 'deploy' | 'preview' | 'export' | null>(null)
  const [preview, setPreview] = useState<{ ids: string[]; plans: RulePlan[] } | null>(null)
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState<ProgressEvent | null>(null)
  const [results, setResults] = useState<RuleResult[] | null>(null)
  const [showSettings, setShowSettings] = useState(false)
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [managingPeople, setManagingPeople] = useState(false)
  const [askPerson, setAskPerson] = useState(false)

  useEffect(() => {
    void window.api.loadConfig().then(cfg => {
      setConfig(cfg)
      const p = cfg.uiState.page
      if (p === 'pack' || p === 'deploy' || p === 'logs') setPage(p)
      if (cfg.people.length > 0) setAskPerson(true) // 有人员名单时,启动询问本次使用人员
    })
    void window.api.ruleTypes().then(setTypes)
    void window.api.isAdmin().then(setAdmin)
  }, [])

  // 持久化放在 effect 里而非 setState updater 内:updater 需保持纯函数(StrictMode 会双调用,副作用会执行两次)
  const loadedRef = useRef(false)
  useEffect(() => {
    if (!config) return
    if (!loadedRef.current) { loadedRef.current = true; return } // 首次是刚从磁盘加载的,无需回写
    void window.api.saveConfig(config)
  }, [config])

  /** 变更配置(随 config 变化由上方 effect 持久化) */
  const update = useCallback((mut: (c: AppConfig) => AppConfig) => {
    setConfig(c => (c ? mut(c) : c))
  }, [])

  const selectPage = (p: Page): void => {
    setPage(p)
    update(c => ({ ...c, uiState: { ...c.uiState, page: p } }))
  }

  const packRules = useMemo(() => (config?.rules ?? []).filter(r => r.type === 'pack'), [config])
  const deployRules = useMemo(() => (config?.rules ?? []).filter(r => r.type !== 'pack'), [config])

  const people = config?.people ?? []
  // 全局人员筛选:一个下拉作用于两页(存的 id 不在名单则回退「全部」)
  const person = useMemo(() => {
    const id = config?.uiState.person
    return id && people.some(p => p.id === id) ? id : null
  }, [config?.uiState.person, people])

  const selectPerson = (id: string | null): void =>
    update(c => ({ ...c, uiState: { ...c.uiState, person: id ?? undefined } }))

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
    } catch (e) {
      // 规则内部错误已由主进程逐条捕获；这里兜底 IPC 层异常（如配置读取失败），避免静默无提示
      setLogs(l => [{
        time: new Date().toLocaleString(),
        ok: false,
        summary: `执行失败: ${e instanceof Error ? e.message : String(e)}`,
        details: [],
      }, ...l])
    } finally {
      off()
      setRunning(false)
    }
  }, [])

  const listCallbacks = {
    onAdd: (type: import('@shared/types').RuleType) => setEditing({ rule: newRule(type), isNew: true }),
    onEdit: (rule: Rule) => setEditing({ rule, isNew: false }),
    onDelete: (id: string) => {
      if (confirm('确定删除该规则？')) update(c => {
        // 同步清掉勾选记忆，避免已删规则的 id 永久残留在配置里
        const { [id]: _p, ...pack } = c.selectionMemory.pack
        const { [id]: _d, ...deploy } = c.selectionMemory.deploy
        return { ...c, rules: c.rules.filter(r => r.id !== id), selectionMemory: { pack, deploy } }
      })
    },
    onRun: (id: string) => void runIds([id]),
    onToggle: (id: string, enabled: boolean) =>
      update(c => ({ ...c, rules: c.rules.map(r => (r.id === id ? { ...r, enabled } : r)) })),
    onMove: (draggedId: string, targetId: string) =>
      update(c => ({ ...c, rules: moveRule(c.rules, draggedId, targetId) })),
  }

  const saveRule = (rule: Rule): void => {
    update(c => {
      const exists = c.rules.some(r => r.id === rule.id)
      return { ...c, rules: exists ? c.rules.map(r => (r.id === rule.id ? rule : r)) : [...c.rules, rule] }
    })
    setEditing(null)
  }

  const confirmSelection = (kind: 'pack' | 'deploy', ids: string[], memory: Record<string, boolean>): void => {
    setSelecting(null)
    update(c => ({ ...c, selectionMemory: { ...c.selectionMemory, [kind]: memory } }))
    void runIds(ids)
  }

  const doPreview = async (ids: string[], memory: Record<string, boolean>): Promise<void> => {
    setSelecting(null)
    update(c => ({ ...c, selectionMemory: { ...c.selectionMemory, deploy: memory } }))
    if (!ids.length) return
    try {
      const plans = await window.api.planRules(ids)
      setPreview({ ids, plans })
    } catch (e) {
      setLogs(l => [{
        time: new Date().toLocaleString(),
        ok: false,
        summary: `预览失败: ${e instanceof Error ? e.message : String(e)}`,
        details: [],
      }, ...l])
    }
  }

  const applyImportResult = (r: { ok: boolean; config?: AppConfig; added?: number; canceled?: boolean; error?: string }): void => {
    if (r.canceled) return
    if (r.ok && r.config) {
      setConfig(r.config)
      const added = r.added ?? 0
      const summary = added > 0
        ? `已导入 ${added} 条规则（可能含 run/download 动作，部署前请在预览中核对）`
        : `已导入 ${added} 条规则`
      setLogs(l => [{ time: new Date().toLocaleString(), ok: true, summary, details: [] }, ...l])
    } else {
      setLogs(l => [{ time: new Date().toLocaleString(), ok: false, summary: `导入失败: ${r.error ?? '未知错误'}`, details: [] }, ...l])
    }
  }

  const doImport = async (): Promise<void> => { applyImportResult(await window.api.importRules()) }
  const doImportExample = async (): Promise<void> => { applyImportResult(await window.api.importExample()) }

  const doExport = async (ids: string[], memory: Record<string, boolean>): Promise<void> => {
    setSelecting(null)
    if (!ids.length) return
    const r = await window.api.exportRules(ids)
    if (r.ok) setLogs(l => [{ time: new Date().toLocaleString(), ok: true, summary: `已导出到 ${r.path}`, details: [] }, ...l])
  }

  if (!config) return <div className="loading">加载配置中…</div>

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">🧩 环境部署工具</div>
        <button className="hero hero-pack" onClick={() => setSelecting('pack')}>一键打包</button>
        <button className="hero hero-deploy" onClick={() => setSelecting('deploy')}>一键部署</button>
        <button className="hero hero-preview" onClick={() => setSelecting('preview')}>预览</button>
        <select
          className="person-select"
          title="按人员筛选(作用于两页的列表与一键操作)"
          value={person ?? ''}
          onChange={e => selectPerson(e.target.value === '' ? null : e.target.value)}
        >
          <option value="">👥 全部人员</option>
          {people.map(p => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
        <button className="btn" title="新增/改名/删除人员" onClick={() => setManagingPeople(true)}>管理人员</button>
        <div className="spacer" />
        {!admin && (
          <span className="admin-warn" title="修改系统环境变量需要管理员权限，请以管理员身份重新运行">
            ⚠ 非管理员
          </span>
        )}
        <button className="icon-btn" title="导入规则集" onClick={() => void doImport()}>⬇</button>
        <button className="icon-btn" title="导出规则集" onClick={() => setSelecting('export')}>⬆</button>
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
          {page === 'pack' && (
            <RuleList
              rules={packRules}
              people={people}
              personId={person}
              types={types.filter(t => t.type === 'pack')}
              showTypeFilter={false}
              addTypes={['pack']}
              onImport={() => void doImport()}
              {...listCallbacks}
            />
          )}
          {page === 'deploy' && (
            <RuleList
              rules={deployRules}
              people={people}
              personId={person}
              types={types.filter(t => t.type !== 'pack')}
              showTypeFilter
              addTypes={['import', 'json', 'env', 'run', 'download']}
              onImport={() => void doImport()}
              onImportExample={() => void doImportExample()}
              {...listCallbacks}
            />
          )}
          {page === 'logs' && <LogsPage logs={logs} />}
        </main>
      </div>

      {/* Task 13-16 在此挂载:RuleEditor / SelectionDialog / RunOverlay / SettingsDialog */}
      {editing && (
        <RuleEditor
          rule={editing.rule}
          isNew={editing.isNew}
          typeLabel={types.find(t => t.type === editing.rule.type)?.label ?? editing.rule.type}
          people={people}
          backupDefault={config.settings.backupBeforeImport}
          onSave={saveRule}
          onClose={() => setEditing(null)}
        />
      )}
      {selecting && (
        <SelectionDialog
          title={
            selecting === 'pack' ? '选择要打包的规则'
              : selecting === 'preview' ? '选择要预览的规则'
              : selecting === 'export' ? '选择要导出的规则'
              : '选择要部署的规则'
          }
          rules={
            selecting === 'export' ? config.rules
              : (selecting === 'pack' ? packRules : deployRules)
                  .filter(r => r.enabled && ruleMatchesPerson(r, person))
          }
          memory={selecting === 'export' ? {} : config.selectionMemory[selecting === 'pack' ? 'pack' : 'deploy']}
          confirmLabel={selecting === 'preview' ? '预览' : selecting === 'export' ? '导出' : '执行'}
          onConfirm={(ids, memory) => {
            if (selecting === 'preview') return void doPreview(ids, memory)
            if (selecting === 'export') return void doExport(ids, memory)
            confirmSelection(selecting === 'pack' ? 'pack' : 'deploy', ids, memory)
          }}
          onCancel={() => setSelecting(null)}
        />
      )}
      {preview && (
        <PreviewDialog
          plans={preview.plans}
          onConfirm={() => { const ids = preview.ids; setPreview(null); void runIds(ids) }}
          onCancel={() => setPreview(null)}
        />
      )}
      {(running || results) && (
        <RunOverlay running={running} progress={progress} results={results} onClose={() => setResults(null)} />
      )}
      {showSettings && (
        <SettingsDialog
          config={config}
          onChangeSettings={s => update(c => ({ ...c, settings: s }))}
          onRestore={cfg => setConfig(cfg)}
          onLog={(summary, ok) =>
            setLogs(l => [{ time: new Date().toLocaleString(), ok, summary, details: [] }, ...l])
          }
          onClose={() => setShowSettings(false)}
        />
      )}
      {askPerson && (
        <PersonPrompt
          people={config.people}
          initial={person}
          onConfirm={id => { selectPerson(id); setAskPerson(false) }}
        />
      )}
      {managingPeople && (
        <PeopleManager
          people={config.people}
          rules={config.rules}
          onChange={(people, rules) => update(c => ({ ...c, people, rules }))}
          onClose={() => setManagingPeople(false)}
        />
      )}
    </div>
  )
}
