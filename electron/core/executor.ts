import type { Rule, Settings, PlanResult } from '@shared/types'

export interface ExecContext {
  baseDir: string
  settings: Settings
  onProgress(current: number, total: number, detail: string): void
  /** 一次部署/预览内共享：已备份过的目标（规范化路径），用于同一文件夹只备份一次 */
  backedUp?: Set<string>
}

export interface RuleExecutor<T extends Rule = Rule> {
  type: T['type']
  label: string
  validate(rule: T): string[]
  plan(rule: T, ctx: ExecContext): Promise<PlanResult>
  execute(rule: T, ctx: ExecContext): Promise<string>
}
