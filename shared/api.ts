import type { AppConfig, BackupInfo, ProgressEvent, RulePlan, RuleResult, RuleTypeInfo } from './types'

export interface Api {
  loadConfig(): Promise<AppConfig>
  saveConfig(cfg: AppConfig): Promise<void>
  backupConfig(): Promise<string>
  listBackups(): Promise<BackupInfo[]>
  restoreConfig(backupPath: string): Promise<AppConfig>
  ruleTypes(): Promise<RuleTypeInfo[]>
  isAdmin(): Promise<boolean>
  /** 主进程环境变量（${VAR} 展开的真实来源），供快查面板 */
  envVars(): Promise<Record<string, string>>
  pickFile(): Promise<string | null>
  pickDir(): Promise<string | null>
  /** 导入源文件专用：默认打开 packages/，选中 packages 内文件时返回相对路径 */
  pickPackageFile(): Promise<string | null>
  runRules(ruleIds: string[]): Promise<RuleResult[]>
  planRules(ruleIds: string[]): Promise<RulePlan[]>
  exportRules(ruleIds: string[]): Promise<{ ok: boolean; path?: string; canceled?: boolean }>
  importRules(): Promise<{ ok: boolean; config?: AppConfig; added?: number; canceled?: boolean; error?: string }>
  importExample(): Promise<{ ok: boolean; config?: AppConfig; added?: number; error?: string }>
  /** 订阅执行进度,返回退订函数 */
  onProgress(cb: (p: ProgressEvent) => void): () => void
}
