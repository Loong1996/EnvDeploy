import type { Person, Rule } from './types'

/** 规则是否应在「选中 personId」时出现。personId===null 表示「全部」,不筛选 */
export function ruleMatchesPerson(rule: Rule, personId: string | null): boolean {
  if (personId === null) return true
  if (rule.common) return true
  return (rule.people ?? []).includes(personId)
}

/** 各类型易缺字段的默认值:手写/旧版规则集 JSON 可能缺这些字段,缺省补齐,避免执行时对 undefined 调字符串方法 */
function typeDefaults(type: Rule['type']): Record<string, unknown> {
  switch (type) {
    case 'pack': return { excludes: [] }
    case 'import': return { rename: '', preserve: [] }
    case 'json': return { data: {} }
    case 'env': return { value: '' }
    case 'run': return { cwd: '', shell: 'powershell', elevated: false }
    case 'download': return { overwrite: false }
    default: return {}
  }
}

/**
 * 规范化:common 保证为 boolean(未显式给定时按「无 people 即通用」推断),people 保证为数组,
 * enabled 缺省为 true,类型专属可选字段补默认值。
 * 通用规则不保留人员标签(people 置空),避免「通用 + 具名」共存导致导出冗余、卡片歧义。
 */
export function normalizeRule<T extends Rule>(rule: T): T {
  const raw = Array.isArray(rule.people) ? rule.people : []
  const common = typeof rule.common === 'boolean' ? rule.common : raw.length === 0
  return {
    ...typeDefaults(rule.type),
    ...rule,
    enabled: rule.enabled ?? true,
    common,
    people: common ? [] : raw,
  }
}

/** 追加一个人员(去空白;名称为空或与现有人员同名则原样返回,不改原数组) */
export function addPerson(people: Person[], id: string, name: string): Person[] {
  const n = name.trim()
  if (!n || people.some(p => p.name === n)) return people
  return [...people, { id, name: n }]
}

/** 改名(去空白;名称为空或与其他人员重名则原样返回——导出/导入按名字回填 id,重名会归错人) */
export function renamePerson(people: Person[], id: string, name: string): Person[] {
  const n = name.trim()
  if (!n || people.some(p => p.id !== id && p.name === n)) return people
  return people.map(p => (p.id === id ? { ...p, name: n } : p))
}

/** 删除人员,并从所有规则的 people[] 级联剔除其 id */
export function removePerson(
  people: Person[],
  rules: Rule[],
  id: string,
): { people: Person[]; rules: Rule[] } {
  return {
    people: people.filter(p => p.id !== id),
    rules: rules.map(r =>
      (r.people ?? []).includes(id) ? { ...r, people: (r.people ?? []).filter(x => x !== id) } : r,
    ),
  }
}

/** 导入协调:规则的 people 此时是人员名,按名精确匹配名单、缺则建人,回填成 id */
export function reconcileImportedPeople(
  roster: Person[],
  rules: Rule[],
  makeId: () => string,
): { people: Person[]; rules: Rule[] } {
  const people = [...roster]
  const idOfName = (name: string): string => {
    const hit = people.find(p => p.name === name)
    if (hit) return hit.id
    const id = makeId()
    people.push({ id, name })
    return id
  }
  const outRules = rules.map(r => ({ ...r, people: (r.people ?? []).map(idOfName) }))
  return { people, rules: outRules }
}
