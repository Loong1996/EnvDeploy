import { describe, expect, it } from 'vitest'
import { moveRule, newRule, ruleSummary } from '../src/utils/rules'
import type { Rule } from '../shared/types'

const r = (id: string): Rule =>
  ({ id, type: 'env', name: id, enabled: true, key: 'K', value: 'V', op: 'set' })

describe('newRule', () => {
  it('各类型生成合法空白规则', () => {
    expect(newRule('pack')).toMatchObject({ type: 'pack', enabled: true, excludes: [] })
    expect(newRule('import')).toMatchObject({ type: 'import', preserve: [], rename: '' })
    expect(newRule('json')).toMatchObject({ type: 'json', op: 'upsert', data: {} })
    expect(newRule('env')).toMatchObject({ type: 'env', op: 'set' })
    expect(newRule('pack').id).not.toBe(newRule('pack').id)
  })
})

describe('moveRule', () => {
  it('把拖拽项移到目标项之前', () => {
    const all = [r('a'), r('b'), r('c'), r('d')]
    expect(moveRule(all, 'd', 'b').map(x => x.id)).toEqual(['a', 'd', 'b', 'c'])
    expect(moveRule(all, 'a', 'c').map(x => x.id)).toEqual(['b', 'a', 'c', 'd'])
  })
  it('拖到自身或未知 id 时原样返回', () => {
    const all = [r('a'), r('b')]
    expect(moveRule(all, 'a', 'a')).toEqual(all)
    expect(moveRule(all, 'x', 'b')).toEqual(all)
  })
})

describe('ruleSummary', () => {
  it('各类型摘要', () => {
    expect(ruleSummary({ ...newRule('pack'), source: 'S', output: 'O' } as Rule)).toBe('S → O')
    expect(ruleSummary({ ...newRule('import'), zip: 'Z', target: 'T' } as Rule)).toBe('Z → T')
    expect(ruleSummary({ ...newRule('json'), file: 'F', op: 'upsert' } as Rule)).toBe('F (upsert)')
    expect(ruleSummary({ ...newRule('env'), key: 'K', value: 'V' } as Rule)).toBe('K = V')
    expect(ruleSummary({ ...newRule('env'), key: 'Path', value: 'V', op: 'append_path' } as Rule)).toBe('Path += V')
  })
})
