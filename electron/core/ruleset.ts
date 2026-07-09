import { randomUUID } from 'crypto'
import type { Rule } from '@shared/types'
import { validateRule } from './engine'

const RULESET_VERSION = 1

export function serializeRuleset(rules: Rule[]): string {
  const stripped = rules.map(({ id: _id, ...rest }) => rest)
  return JSON.stringify({ version: RULESET_VERSION, rules: stripped }, null, 2)
}

export function parseRuleset(text: string): Rule[] {
  let doc: unknown
  try {
    doc = JSON.parse(text)
  } catch {
    throw new Error('文件不是合法 JSON')
  }
  if (typeof doc !== 'object' || doc === null) throw new Error('规则集格式错误')
  const d = doc as { version?: unknown; rules?: unknown }
  if (d.version !== RULESET_VERSION) throw new Error(`不支持的规则集版本: ${String(d.version)}`)
  if (!Array.isArray(d.rules)) throw new Error('规则集缺少 rules 数组')
  const rules = d.rules.map(r => ({ ...(r as Record<string, unknown>), id: randomUUID() }) as Rule)
  for (const r of rules) {
    const errs = validateRule(r)
    if (errs.length) throw new Error(`规则「${r.name || '未命名'}」校验失败: ${errs.join('; ')}`)
  }
  return rules
}
