export type RuleType = 'pack' | 'import' | 'json' | 'env' | 'run' | 'download'

export interface RuleBase {
  id: string
  type: RuleType
  name: string
  enabled: boolean
}

export interface PackRule extends RuleBase {
  type: 'pack'
  source: string
  output: string
  excludes: string[]
}

export interface ImportRule extends RuleBase {
  type: 'import'
  zip: string
  target: string
  preserve: string[]
  rename: string
}

export type JsonOp = 'append' | 'modify' | 'upsert' | 'overwrite'

export interface JsonRule extends RuleBase {
  type: 'json'
  file: string
  op: JsonOp
  data: Record<string, unknown>
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

export interface AppConfig {
  version: number
  rules: Rule[]
  settings: Settings
  selectionMemory: {
    pack: Record<string, boolean>
    deploy: Record<string, boolean>
  }
  uiState: { page?: string }
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
