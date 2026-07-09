import { beforeAll, describe, expect, it } from 'vitest'
import { serializeRuleset, parseRuleset } from '../electron/core/ruleset'
import { registerBuiltins } from '../electron/core/engine'
import type { Rule } from '@shared/types'

beforeAll(() => registerBuiltins())

const sample: Rule[] = [
  { id: 'x', type: 'env', name: '示例', enabled: true, key: 'FOO', value: '1', op: 'set', scope: 'user' },
]

describe('serializeRuleset', () => {
  it('剥离 id，带 version', () => {
    const doc = JSON.parse(serializeRuleset(sample))
    expect(doc.version).toBe(1)
    expect(doc.rules[0].id).toBeUndefined()
    expect(doc.rules[0].name).toBe('示例')
  })
})

describe('parseRuleset', () => {
  it('重新生成 id 并通过校验', () => {
    const out = parseRuleset(serializeRuleset(sample))
    expect(out).toHaveLength(1)
    expect(out[0].id).toBeTruthy()
    expect(out[0].id).not.toBe('x')
  })
  it('非法 JSON 报错', () => {
    expect(() => parseRuleset('{bad')).toThrow()
  })
  it('版本不支持报错', () => {
    expect(() => parseRuleset(JSON.stringify({ version: 99, rules: [] }))).toThrow()
  })
  it('未知规则类型报错', () => {
    expect(() => parseRuleset(JSON.stringify({ version: 1, rules: [{ type: 'nope', name: 'n' }] }))).toThrow()
  })
})
