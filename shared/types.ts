export type RuleType = 'pack' | 'import' | 'json' | 'env' | 'run' | 'download'

export interface RuleBase {
  id: string
  type: RuleType
  name: string
  enabled: boolean
  /** 通用:选任意人员都执行。缺省(老数据)加载时规范化为 true */
  common?: boolean
  /** 归属人员 id 列表;仅当 common=false 时生效。缺省规范化为 [] */
  people?: string[]
}

export interface PackRule extends RuleBase {
  type: 'pack'
  source: string
  output: string
  excludes: string[]
}

export type ImportMode = 'replace' | 'merge'

export interface ImportRule extends RuleBase {
  type: 'import'
  zip: string
  target: string
  preserve: string[]
  rename: string
  /** 导入前是否备份到 exe 目录 backups/；缺省时回退到全局设置 backupBeforeImport */
  backup?: boolean
  /** replace(默认)=清空目标后解压；merge=不清空，直接叠加覆盖同名 */
  mode?: ImportMode
}

export type JsonOp = 'append' | 'modify' | 'upsert' | 'overwrite'

export interface JsonRule extends RuleBase {
  type: 'json'
  file: string
  op: JsonOp
  data: Record<string, unknown>
  /** 点路径列表；仅 overwrite/upsert 生效：这些 key 保持原文件的值 */
  preserve?: string[]
}

export type EnvOp = 'set' | 'append_path' | 'remove'
export type EnvScope = 'user' | 'machine'
export type PathPosition = 'append' | 'prepend'

export interface EnvRule extends RuleBase {
  type: 'env'
  key: string
  value: string
  op: EnvOp
  scope?: EnvScope        // 缺省视为 'user'
  pathPosition?: PathPosition  // 仅 op=append_path 生效，缺省 'append'
}

export type RunShell = 'powershell' | 'cmd'

export interface RunRule extends RuleBase {
  type: 'run'
  command: string
  shell: RunShell
  cwd: string
  elevated: boolean
}

export interface DownloadRule extends RuleBase {
  type: 'download'
  url: string
  target: string
  overwrite: boolean
}

export type Rule = PackRule | ImportRule | JsonRule | EnvRule | RunRule | DownloadRule

export interface Settings {
  backupBeforeImport: boolean
}

export interface Person {
  id: string
  name: string
}

export interface AppConfig {
  version: number
  people: Person[]
  rules: Rule[]
  settings: Settings
  selectionMemory: {
    pack: Record<string, boolean>
    deploy: Record<string, boolean>
  }
  uiState: { page?: string; person?: string }
}

export interface RuleResult {
  ruleId: string
  name: string
  ok: boolean
  message: string
}

export type PlanChangeKind = 'create' | 'modify' | 'delete' | 'run' | 'download' | 'noop'

export interface PlanChange {
  kind: PlanChangeKind
  detail: string
}

export interface PlanResult {
  noop: boolean
  changes: PlanChange[]
}

export interface RulePlan {
  ruleId: string
  name: string
  ok: boolean
  noop: boolean
  changes: PlanChange[]
  error?: string
}

export interface ProgressEvent {
  ruleIndex: number
  ruleCount: number
  ruleName: string
  current: number
  total: number
  detail: string
}

export interface RuleTypeInfo {
  type: RuleType
  label: string
}

export interface BackupInfo {
  file: string
  path: string
  mtime: number
}
