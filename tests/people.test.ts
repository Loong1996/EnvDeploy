import { describe, expect, it } from 'vitest'
import {
  addPerson, normalizeRule, reconcileImportedPeople, removePerson, renamePerson, ruleMatchesPerson,
} from '../shared/people'
import type { Person, Rule } from '../shared/types'

const envRule = (over: Partial<Rule>): Rule =>
  ({ id: 'r1', type: 'env', name: 'r', enabled: true, key: 'K', value: 'V', op: 'set', ...over }) as Rule

describe('ruleMatchesPerson', () => {
  it('personId=null(全部)恒真', () => {
    expect(ruleMatchesPerson(envRule({ common: false, people: ['a'] }), null)).toBe(true)
  })
  it('common=true 恒真', () => {
    expect(ruleMatchesPerson(envRule({ common: true, people: [] }), 'a')).toBe(true)
  })
  it('带标签命中/不命中', () => {
    expect(ruleMatchesPerson(envRule({ common: false, people: ['a'] }), 'a')).toBe(true)
    expect(ruleMatchesPerson(envRule({ common: false, people: ['a'] }), 'b')).toBe(false)
  })
  it('老数据规范化后在任意人员下可见', () => {
    const r = normalizeRule(envRule({ common: undefined, people: undefined }))
    expect(ruleMatchesPerson(r, 'anybody')).toBe(true)
  })
})

describe('normalizeRule', () => {
  it('无 common 无 people → 通用', () => {
    const r = normalizeRule(envRule({ common: undefined, people: undefined }))
    expect(r.common).toBe(true)
    expect(r.people).toEqual([])
  })
  it('无 common 但有 people → 非通用', () => {
    const r = normalizeRule(envRule({ common: undefined, people: ['a'] }))
    expect(r.common).toBe(false)
    expect(r.people).toEqual(['a'])
  })
  it('显式 common=false 且无 people → 保持非通用', () => {
    const r = normalizeRule(envRule({ common: false, people: [] }))
    expect(r.common).toBe(false)
    expect(r.people).toEqual([])
  })
  it('common=true 时清空 people(不保留具名标签)', () => {
    const r = normalizeRule(envRule({ common: true, people: ['a', 'b'] }))
    expect(r.common).toBe(true)
    expect(r.people).toEqual([])
  })
  it('补齐类型专属缺失字段(导入的规则集可能缺)', () => {
    const imp = normalizeRule({ id: 'i1', type: 'import', name: 'i', enabled: true, zip: 'z', target: 't' } as Rule)
    expect(imp).toMatchObject({ rename: '', preserve: [] })
    const env = normalizeRule({ id: 'e1', type: 'env', name: 'e', enabled: true, key: 'K', op: 'set' } as Rule)
    expect(env).toMatchObject({ value: '' })
    const run = normalizeRule({ id: 'x1', type: 'run', name: 'x', enabled: true, command: 'echo' } as Rule)
    expect(run).toMatchObject({ cwd: '', shell: 'powershell', elevated: false })
  })
  it('缺失字段不覆盖已有值,enabled 缺省 true、显式 false 保留', () => {
    const r = normalizeRule(envRule({ value: 'KEEP' }))
    expect(r).toMatchObject({ value: 'KEEP', enabled: true })
    const off = normalizeRule(envRule({ enabled: false }))
    expect(off.enabled).toBe(false)
    const noEnabled = normalizeRule({ id: 'n1', type: 'env', name: 'n', key: 'K', value: '', op: 'set' } as Rule)
    expect(noEnabled.enabled).toBe(true)
  })
})

describe('roster 增删改', () => {
  const base: Person[] = [{ id: 'a', name: '张三' }]
  it('addPerson 追加,空白名/重名原样返回', () => {
    expect(addPerson(base, 'b', '李四')).toEqual([{ id: 'a', name: '张三' }, { id: 'b', name: '李四' }])
    expect(addPerson(base, 'b', '   ')).toEqual(base)
    expect(addPerson(base, 'b', '张三')).toBe(base) // 重名不追加
  })
  it('renamePerson 改中目标,空白名原样返回', () => {
    expect(renamePerson(base, 'a', '张三丰')).toEqual([{ id: 'a', name: '张三丰' }])
    expect(renamePerson(base, 'a', '  ')).toEqual(base)
  })
  it('renamePerson 与其他人员重名原样返回,重名自身允许', () => {
    const two: Person[] = [{ id: 'a', name: '张三' }, { id: 'b', name: '李四' }]
    expect(renamePerson(two, 'b', '张三')).toBe(two) // 撞他人名 → 拒绝
    expect(renamePerson(two, 'a', '张三')).toEqual(two) // 改回自己原名 → 允许(无变化)
  })
  it('removePerson 删名单并从规则级联剔除该 id', () => {
    const rules = [
      envRule({ id: 'r1', common: false, people: ['a', 'b'] }),
      envRule({ id: 'r2', common: true, people: [] }),
    ]
    const out = removePerson([{ id: 'a', name: '张三' }, { id: 'b', name: '李四' }], rules, 'a')
    expect(out.people).toEqual([{ id: 'b', name: '李四' }])
    expect(out.rules[0].people).toEqual(['b'])
    expect(out.rules[1].people).toEqual([]) // 不含 a 的规则内容不变
  })
})

describe('reconcileImportedPeople', () => {
  it('按名匹配现有名单,缺失者建人并回填 id', () => {
    let n = 0
    const makeId = (): string => `new-${n++}`
    const roster: Person[] = [{ id: 'a', name: '张三' }]
    const rules = [envRule({ id: 'r1', common: false, people: ['张三', '王五'] })]
    const out = reconcileImportedPeople(roster, rules, makeId)
    expect(out.people).toEqual([{ id: 'a', name: '张三' }, { id: 'new-0', name: '王五' }])
    expect(out.rules[0].people).toEqual(['a', 'new-0'])
  })
  it('通用规则(people 空)原样通过', () => {
    const out = reconcileImportedPeople([], [envRule({ common: true, people: [] })], () => 'x')
    expect(out.people).toEqual([])
    expect(out.rules[0].people).toEqual([])
  })
})
