import type { Person, Rule } from './types'

/** 规则是否应在「选中 personId」时出现。personId===null 表示「全部」,不筛选 */
export function ruleMatchesPerson(rule: Rule, personId: string | null): boolean {
  if (personId === null) return true
  if (rule.common) return true
  return (rule.people ?? []).includes(personId)
}

/** 规范化:common 保证为 boolean(未显式给定时按「无 people 即通用」推断),people 保证为数组 */
export function normalizeRule<T extends Rule>(rule: T): T {
  const people = Array.isArray(rule.people) ? rule.people : []
  const common = typeof rule.common === 'boolean' ? rule.common : people.length === 0
  return { ...rule, common, people }
}

/** 追加一个人员(去空白;名称为空则原样返回,不改原数组) */
export function addPerson(people: Person[], id: string, name: string): Person[] {
  const n = name.trim()
  if (!n) return people
  return [...people, { id, name: n }]
}

/** 改名(去空白;名称为空则原样返回) */
export function renamePerson(people: Person[], id: string, name: string): Person[] {
  const n = name.trim()
  if (!n) return people
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
