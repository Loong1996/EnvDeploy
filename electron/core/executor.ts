import type { Rule, Settings, PlanResult } from '@shared/types'

export interface ExecContext {
  baseDir: string
  settings: Settings
  onProgress(current: number, total: number, detail: string): void
}

export interface RuleExecutor<T extends Rule = Rule> {
  type: T['type']
  label: string
  validate(rule: T): string[]
  plan(rule: T, ctx: ExecContext): Promise<PlanResult>
  execute(rule: T, ctx: ExecContext): Promise<string>
}
