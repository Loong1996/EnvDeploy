import { randomUUID } from 'crypto'
import type { Person, Rule } from '@shared/types'
import { normalizeRule } from '@shared/people'
import { validateRule } from './engine'

const RULESET_VERSION = 2
const SUPPORTED = new Set([1, 2])

export function serializeRuleset(rules: Rule[], people: Person[] = []): string {
  const nameOf = new Map(people.map(p => [p.id, p.name]))
  const stripped = rules.map(rule => {
    const n = normalizeRule(rule)
    const { id: _id, ...rest } = n
    const peopleNames = (n.people ?? []).map(pid => nameOf.get(pid)).filter((x): x is string => !!x)
    return { ...rest, people: peopleNames }
  })
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
  if (typeof d.version !== 'number' || !SUPPORTED.has(d.version)) {
    throw new Error(`不支持的规则集版本: ${String(d.version)}`)
  }
  if (!Array.isArray(d.rules)) throw new Error('规则集缺少 rules 数组')
  // 重生成 id;normalizeRule 保证 common/people 存在(v1 → 通用)。此处 people 仍为人员名,由调用方 reconcile。
  const rules = d.rules.map(r =>
    normalizeRule({ ...(r as Record<string, unknown>), id: randomUUID() } as Rule),
  )
  for (const r of rules) {
    const errs = validateRule(r)
    if (errs.length) throw new Error(`规则「${r.name || '未命名'}」校验失败: ${errs.join('; ')}`)
  }
  return rules
}
