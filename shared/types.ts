export type RuleType = 'pack' | 'import' | 'json' | 'env'

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

export type EnvOp = 'set' | 'append_path'

export interface EnvRule extends RuleBase {
  type: 'env'
  key: string
  value: string
  op: EnvOp
}

export type Rule = PackRule | ImportRule | JsonRule | EnvRule

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
