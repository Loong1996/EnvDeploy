import type { Rule, Settings } from '@shared/types'

export interface ExecContext {
  baseDir: string
  settings: Settings
  onProgress(current: number, total: number, detail: string): void
}

export interface RuleExecutor<T extends Rule = Rule> {
  type: T['type']
  label: string
  validate(rule: T): string[]
  execute(rule: T, ctx: ExecContext): Promise<string>
}
