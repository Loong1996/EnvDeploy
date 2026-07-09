import { beforeEach, describe, expect, it } from 'vitest'
import {
  getExecutor, listRuleTypes, registerBuiltins, registerExecutor, runRules, validateRule,
} from '../electron/core/engine'
import type { RuleExecutor } from '../electron/core/executor'
import type { ProgressEvent, Rule } from '../shared/types'

function fakeRule(id: string, type = 'fake-ok'): Rule {
  return { id, type, name: `规则${id}`, enabled: true } as unknown as Rule
}

const okExecutor: RuleExecutor = {
  type: 'fake-ok' as never,
  label: '假成功',
  validate: () => [],
  plan: async () => ({ noop: true, changes: [] }),
  execute: async (_r, ctx) => {
    ctx.onProgress(1, 1, 'done')
    return '成功'
  },
}

const failExecutor: RuleExecutor = {
  type: 'fake-fail' as never,
  label: '假失败',
  validate: () => ['总是错'],
  plan: async () => {
    throw new Error('炸了')
  },
  execute: async () => {
    throw new Error('炸了')
  },
}

beforeEach(() => {
  registerExecutor(okExecutor)
  registerExecutor(failExecutor)
})

describe('registry', () => {
  it('未知类型抛错', () => {
    expect(() => getExecutor('nope')).toThrow('未知规则类型: nope')
  })
  it('registerBuiltins 注册四种内置类型', () => {
    registerBuiltins()
    const types = listRuleTypes().map(t => t.type)
    expect(types).toEqual(expect.arrayContaining(['pack', 'import', 'json', 'env']))
    const labels = Object.fromEntries(listRuleTypes().map(t => [t.type, t.label]))
    expect(labels.pack).toBe('打包')
    expect(labels.import).toBe('导入')
    expect(labels.json).toBe('JSON')
    expect(labels.env).toBe('环境变量')
  })
})

describe('validateRule', () => {
  it('名称为空 + 执行器错误合并返回', () => {
    const r = { ...fakeRule('1', 'fake-fail'), name: ' ' }
    expect(validateRule(r)).toEqual(['名称不能为空', '总是错'])
  })
})

describe('runRules', () => {
  it('单条失败不中断,结果逐条返回', async () => {
    const events: ProgressEvent[] = []
    const results = await runRules(
      [fakeRule('1'), fakeRule('2', 'fake-fail'), fakeRule('3')],
      { baseDir: '.', settings: { backupBeforeImport: true } },
      p => events.push(p),
    )
    expect(results.map(r => r.ok)).toEqual([true, false, true])
    expect(results[1].message).toBe('炸了')
    expect(results[0].ruleId).toBe('1')
    // 进度事件带规则序号与总数
    expect(events.some(e => e.ruleIndex === 0 && e.ruleCount === 3 && e.ruleName === '规则1')).toBe(true)
  })
})
