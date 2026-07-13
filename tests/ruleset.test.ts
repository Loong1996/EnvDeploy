import { beforeAll, describe, expect, it } from 'vitest'
import { serializeRuleset, parseRuleset } from '../electron/core/ruleset'
import { reconcileImportedPeople } from '../shared/people'
import { registerBuiltins } from '../electron/core/engine'
import type { Person, Rule } from '@shared/types'

beforeAll(() => registerBuiltins())

const sample: Rule[] = [
  { id: 'x', type: 'env', name: '示例', enabled: true, key: 'FOO', value: '1', op: 'set', scope: 'user', common: true, people: [] },
]

describe('serializeRuleset', () => {
  it('剥离 id,带 version 2', () => {
    const doc = JSON.parse(serializeRuleset(sample))
    expect(doc.version).toBe(2)
    expect(doc.rules[0].id).toBeUndefined()
    expect(doc.rules[0].name).toBe('示例')
    expect(doc.rules[0].common).toBe(true)
  })
  it('把 people 的 id 解析为人员名', () => {
    const roster: Person[] = [{ id: 'p1', name: '张三' }]
    const rules: Rule[] = [{ ...sample[0], common: false, people: ['p1'] }]
    const doc = JSON.parse(serializeRuleset(rules, roster))
    expect(doc.rules[0].people).toEqual(['张三'])
  })
})

describe('parseRuleset', () => {
  it('重新生成 id 并通过校验', () => {
    const out = parseRuleset(serializeRuleset(sample))
    expect(out).toHaveLength(1)
    expect(out[0].id).toBeTruthy()
    expect(out[0].id).not.toBe('x')
  })
  it('人员名往返:导出→解析→按名协调回 id,归属保留', () => {
    const roster: Person[] = [{ id: 'p1', name: '张三' }]
    const rules: Rule[] = [{ ...sample[0], common: false, people: ['p1'] }]
    const parsed = parseRuleset(serializeRuleset(rules, roster))
    expect(parsed[0].people).toEqual(['张三']) // 解析后仍是名
    const out = reconcileImportedPeople([{ id: 'q1', name: '张三' }], parsed, () => 'z')
    expect(out.rules[0].people).toEqual(['q1']) // 目标名单里同名 → 复用其 id
  })
  it('v1 规则集(无 common/people)导入 → 规范化为通用', () => {
    const v1 = JSON.stringify({ version: 1, rules: [{ type: 'env', name: 'old', enabled: true, key: 'K', value: 'V', op: 'set' }] })
    const out = parseRuleset(v1)
    expect(out[0].common).toBe(true)
    expect(out[0].people).toEqual([])
  })
  it('非法 JSON 报错', () => {
    expect(() => parseRuleset('{bad')).toThrow()
  })
  it('版本不支持报错', () => {
    expect(() => parseRuleset(JSON.stringify({ version: 99, rules: [] }))).toThrow()
  })
  it('未知规则类型报错', () => {
    expect(() => parseRuleset(JSON.stringify({ version: 2, rules: [{ type: 'nope', name: 'n' }] }))).toThrow()
  })
})
