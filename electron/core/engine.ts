import type { ProgressEvent, Rule, RulePlan, RuleResult, RuleTypeInfo, Settings } from '@shared/types'
import type { ExecContext, RuleExecutor } from './executor'
import { packExecutor } from './executors/pack'
import { importExecutor } from './executors/import'
import { jsonExecutor } from './executors/json'
import { envExecutor } from './executors/env'
import { runExecutor } from './executors/run'

const registry = new Map<string, RuleExecutor>()

export function registerExecutor(ex: RuleExecutor): void {
  registry.set(ex.type, ex)
}

export function getExecutor(type: string): RuleExecutor {
  const ex = registry.get(type)
  if (!ex) throw new Error(`未知规则类型: ${type}`)
  return ex
}

export function listRuleTypes(): RuleTypeInfo[] {
  return [...registry.values()].map(ex => ({ type: ex.type, label: ex.label })) as RuleTypeInfo[]
}

export function registerBuiltins(): void {
  for (const ex of [packExecutor, importExecutor, jsonExecutor, envExecutor, runExecutor]) {
    registerExecutor(ex as unknown as RuleExecutor)
  }
}

export function validateRule(rule: Rule): string[] {
  const errs: string[] = []
  if (!rule.name?.trim()) errs.push('名称不能为空')
  return [...errs, ...getExecutor(rule.type).validate(rule)]
}

export async function runRules(
  rules: Rule[],
  opts: { baseDir: string; settings: Settings },
  emit: (p: ProgressEvent) => void = () => {},
): Promise<RuleResult[]> {
  const results: RuleResult[] = []
  for (let i = 0; i < rules.length; i++) {
    const rule = rules[i]
    const ctx: ExecContext = {
      baseDir: opts.baseDir,
      settings: opts.settings,
      onProgress: (current, total, detail) =>
        emit({ ruleIndex: i, ruleCount: rules.length, ruleName: rule.name, current, total, detail }),
    }
    try {
      const message = await getExecutor(rule.type).execute(rule, ctx)
      results.push({ ruleId: rule.id, name: rule.name, ok: true, message })
    } catch (err) {
      results.push({
        ruleId: rule.id,
        name: rule.name,
        ok: false,
        message: err instanceof Error ? err.message : String(err),
      })
    }
  }
  return results
}

export async function planRules(
  rules: Rule[],
  opts: { baseDir: string; settings: Settings },
): Promise<RulePlan[]> {
  const out: RulePlan[] = []
  for (const rule of rules) {
    const ctx: ExecContext = { baseDir: opts.baseDir, settings: opts.settings, onProgress: () => {} }
    try {
      const res = await getExecutor(rule.type).plan(rule, ctx)
      out.push({ ruleId: rule.id, name: rule.name, ok: true, noop: res.noop, changes: res.changes })
    } catch (err) {
      out.push({
        ruleId: rule.id, name: rule.name, ok: false, noop: false, changes: [],
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }
  return out
}
