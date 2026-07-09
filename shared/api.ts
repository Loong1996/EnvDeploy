import type { AppConfig, BackupInfo, ProgressEvent, RulePlan, RuleResult, RuleTypeInfo } from './types'

export interface Api {
  loadConfig(): Promise<AppConfig>
  saveConfig(cfg: AppConfig): Promise<void>
  backupConfig(): Promise<string>
  listBackups(): Promise<BackupInfo[]>
  restoreConfig(backupPath: string): Promise<AppConfig>
  ruleTypes(): Promise<RuleTypeInfo[]>
  isAdmin(): Promise<boolean>
  pickFile(): Promise<string | null>
  pickDir(): Promise<string | null>
  runRules(ruleIds: string[]): Promise<RuleResult[]>
  planRules(ruleIds: string[]): Promise<RulePlan[]>
  exportRules(ruleIds: string[]): Promise<{ ok: boolean; path?: string; canceled?: boolean }>
  importRules(): Promise<{ ok: boolean; config?: AppConfig; added?: number; canceled?: boolean; error?: string }>
  importExample(): Promise<{ ok: boolean; config?: AppConfig; added?: number; error?: string }>
  /** 订阅执行进度,返回退订函数 */
  onProgress(cb: (p: ProgressEvent) => void): () => void
}
