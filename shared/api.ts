import type { AppConfig, BackupInfo, ProgressEvent, RuleResult, RuleTypeInfo } from './types'

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
  /** 订阅执行进度,返回退订函数 */
  onProgress(cb: (p: ProgressEvent) => void): () => void
}
