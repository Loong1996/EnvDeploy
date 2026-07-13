import fs from 'fs'
import os from 'os'
import path from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { deepMerge, deleteByPath, getByPath, jsonExecutor, setByPath } from '../electron/core/executors/json'
import type { ExecContext } from '../electron/core/executor'
import type { JsonRule } from '../shared/types'

let tmp: string
beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'jz-json-'))
})
afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true })
})

const ctx = (): ExecContext => ({
  baseDir: tmp,
  settings: { backupBeforeImport: true },
  onProgress: () => {},
})

function rule(partial: Partial<JsonRule>): JsonRule {
  return {
    id: 'r1', type: 'json', name: 't', enabled: true,
    file: path.join(tmp, 'a.json'), op: 'upsert', data: {},
    ...partial,
  }
}

function writeJson(obj: unknown): string {
  const p = path.join(tmp, 'a.json')
  fs.writeFileSync(p, JSON.stringify(obj), 'utf8')
  return p
}

describe('deepMerge', () => {
  it('嵌套对象逐层合并而非整体替换', () => {
    expect(deepMerge({ a: { x: 1, y: 2 }, b: 1 }, { a: { y: 3 }, c: 4 }))
      .toEqual({ a: { x: 1, y: 3 }, b: 1, c: 4 })
  })
  it('数组整体替换', () => {
    expect(deepMerge({ a: [1, 2] }, { a: [3] })).toEqual({ a: [3] })
  })
  it('忽略原型污染键', () => {
    const overlay = JSON.parse('{"__proto__": {"polluted": 1}, "safe": 2}') as Record<string, unknown>
    const result = deepMerge({ a: 1 }, overlay)
    expect(result).toEqual({ a: 1, safe: 2 })
    expect(({} as Record<string, unknown>).polluted).toBeUndefined()
  })
})

describe('getByPath', () => {
  it('命中嵌套值', () => {
    expect(getByPath({ a: { b: { c: 1 } } }, 'a.b.c')).toBe(1)
  })
  it('路径不存在 → undefined', () => {
    expect(getByPath({ a: {} }, 'a.b.c')).toBeUndefined()
  })
  it('中途非对象 → undefined', () => {
    expect(getByPath({ a: 5 }, 'a.b')).toBeUndefined()
  })
  it('空段非法 → undefined', () => {
    expect(getByPath({ a: { b: 1 } }, 'a..b')).toBeUndefined()
  })
})

describe('setByPath', () => {
  it('新建嵌套对象', () => {
    const o: Record<string, unknown> = {}
    setByPath(o, 'a.b.c', 9)
    expect(o).toEqual({ a: { b: { c: 9 } } })
  })
  it('中途非对象则替换为对象', () => {
    const o: Record<string, unknown> = { a: 5 }
    setByPath(o, 'a.b', 1)
    expect(o).toEqual({ a: { b: 1 } })
  })
  it('危险 key 整条跳过', () => {
    const o: Record<string, unknown> = {}
    setByPath(o, '__proto__.polluted', true)
    expect(({} as Record<string, unknown>).polluted).toBeUndefined()
    expect(o).toEqual({})
  })
  it('空段非法则跳过', () => {
    const o: Record<string, unknown> = {}
    setByPath(o, 'a..b', 1)
    expect(o).toEqual({})
  })
})

describe('deleteByPath', () => {
  it('删除顶层 key', () => {
    const o: Record<string, unknown> = { a: 1, b: 2 }
    expect(deleteByPath(o, 'a')).toBe(true)
    expect(o).toEqual({ b: 2 })
  })
  it('删除嵌套 key，保留同级其它', () => {
    const o: Record<string, unknown> = { a: { x: 1, y: 2 } }
    expect(deleteByPath(o, 'a.x')).toBe(true)
    expect(o).toEqual({ a: { y: 2 } })
  })
  it('路径不存在 → false 且不改动', () => {
    const o: Record<string, unknown> = { a: { y: 2 } }
    expect(deleteByPath(o, 'a.x')).toBe(false)
    expect(o).toEqual({ a: { y: 2 } })
  })
  it('中途非对象 → false', () => {
    const o: Record<string, unknown> = { a: 5 }
    expect(deleteByPath(o, 'a.b')).toBe(false)
    expect(o).toEqual({ a: 5 })
  })
  it('危险 key → false 且不改动', () => {
    const o: Record<string, unknown> = { a: 1 }
    expect(deleteByPath(o, '__proto__.x')).toBe(false)
    expect(o).toEqual({ a: 1 })
  })
  it('空段非法 → false', () => {
    const o: Record<string, unknown> = { a: { b: 1 } }
    expect(deleteByPath(o, 'a..b')).toBe(false)
    expect(o).toEqual({ a: { b: 1 } })
  })
})

describe('jsonExecutor delete', () => {
  it('删除指定 key 并生成 .bak', async () => {
    const p = writeJson({ a: 1, b: 2, nested: { keep: 1, drop: 2 } })
    const msg = await jsonExecutor.execute(rule({ op: 'delete', keys: ['b', 'nested.drop'] }), ctx())
    expect(JSON.parse(fs.readFileSync(p, 'utf8'))).toEqual({ a: 1, nested: { keep: 1 } })
    expect(fs.existsSync(p + '.bak')).toBe(true)
    expect(msg).toContain('已删除 2 个 key')
  })
  it('不存在的 key 自动跳过，只计已删数量', async () => {
    const p = writeJson({ a: 1 })
    const msg = await jsonExecutor.execute(rule({ op: 'delete', keys: ['a', 'missing', 'x.y'] }), ctx())
    expect(JSON.parse(fs.readFileSync(p, 'utf8'))).toEqual({})
    expect(msg).toContain('已删除 1 个 key')
  })
  it('文件不存在报错', async () => {
    await expect(jsonExecutor.execute(rule({ file: path.join(tmp, 'nope.json'), op: 'delete', keys: ['a'] }), ctx()))
      .rejects.toThrow('文件不存在')
  })
  it('plan 只汇报实际存在的 key', async () => {
    writeJson({ a: 1, nested: { drop: 2 } })
    const res = await jsonExecutor.plan(rule({ op: 'delete', keys: ['a', 'nested.drop', 'missing'] }), ctx())
    expect(res.noop).toBe(false)
    expect(res.changes.map(c => c.detail)).toEqual(['a', 'nested.drop'])
    expect(res.changes.every(c => c.kind === 'delete')).toBe(true)
  })
  it('plan 目标 key 均不存在 → noop', async () => {
    writeJson({ a: 1 })
    const res = await jsonExecutor.plan(rule({ op: 'delete', keys: ['missing'] }), ctx())
    expect(res.noop).toBe(true)
  })
  it('validate 要求至少一个 key', () => {
    expect(jsonExecutor.validate(rule({ op: 'delete', keys: [] }))).toContain('请至少指定一个要删除的 key')
    expect(jsonExecutor.validate(rule({ op: 'delete', keys: ['a'] }))).toEqual([])
  })
})

describe('jsonExecutor dataFile', () => {
  // packages/ 相对路径：ctx.baseDir=tmp，故数据文件写到 tmp/packages 下
  function writePackageData(name: string, obj: unknown): void {
    const dir = path.join(tmp, 'packages')
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(dir, name), JSON.stringify(obj), 'utf8')
  }

  it('upsert 数据取自 packages 相对路径文件', async () => {
    const p = writeJson({ a: { x: 1 }, keep: true })
    writePackageData('src.json', { a: { y: 2 }, add: 1 })
    await jsonExecutor.execute(rule({ op: 'upsert', dataFile: 'src.json', data: {} }), ctx())
    expect(JSON.parse(fs.readFileSync(p, 'utf8'))).toEqual({ a: { x: 1, y: 2 }, keep: true, add: 1 })
  })

  it('overwrite 数据取自文件（可创建新文件）', async () => {
    const p = path.join(tmp, 'out.json')
    writePackageData('full.json', { fresh: true, n: 3 })
    await jsonExecutor.execute(rule({ file: p, op: 'overwrite', dataFile: 'full.json', data: {} }), ctx())
    expect(JSON.parse(fs.readFileSync(p, 'utf8'))).toEqual({ fresh: true, n: 3 })
  })

  it('dataFile 优先于内联 data', async () => {
    const p = writeJson({ a: 1 })
    writePackageData('src.json', { fromFile: true })
    await jsonExecutor.execute(rule({ op: 'upsert', dataFile: 'src.json', data: { inline: true } }), ctx())
    expect(JSON.parse(fs.readFileSync(p, 'utf8'))).toEqual({ a: 1, fromFile: true })
  })

  it('数据文件不存在 → 报错', async () => {
    writeJson({ a: 1 })
    await expect(jsonExecutor.execute(rule({ op: 'upsert', dataFile: 'missing.json', data: {} }), ctx()))
      .rejects.toThrow('数据文件不存在')
  })

  it('数据文件非法 JSON → 报错', async () => {
    writeJson({ a: 1 })
    const dir = path.join(tmp, 'packages')
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(dir, 'bad.json'), '{ not json', 'utf8')
    await expect(jsonExecutor.execute(rule({ op: 'upsert', dataFile: 'bad.json', data: {} }), ctx()))
      .rejects.toThrow('不是合法 JSON')
  })

  it('数据文件顶层非对象 → 报错', async () => {
    writeJson({ a: 1 })
    writePackageData('arr.json', [1, 2, 3])
    await expect(jsonExecutor.execute(rule({ op: 'upsert', dataFile: 'arr.json', data: {} }), ctx()))
      .rejects.toThrow('顶层不是对象')
  })

  it('绝对路径数据文件也支持', async () => {
    const p = writeJson({ a: 1 })
    const abs = path.join(tmp, 'abs-src.json')
    fs.writeFileSync(abs, JSON.stringify({ b: 2 }), 'utf8')
    await jsonExecutor.execute(rule({ op: 'upsert', dataFile: abs, data: {} }), ctx())
    expect(JSON.parse(fs.readFileSync(p, 'utf8'))).toEqual({ a: 1, b: 2 })
  })

  it('plan 汇报来自文件的 key 变更', async () => {
    writeJson({ a: 1 })
    writePackageData('src.json', { b: 2 })
    const res = await jsonExecutor.plan(rule({ op: 'upsert', dataFile: 'src.json', data: {} }), ctx())
    expect(res.noop).toBe(false)
    expect(res.changes.some(c => c.detail === 'b')).toBe(true)
  })

  it('validate：dataFile 非空时不强制内联 data 为对象', () => {
    expect(jsonExecutor.validate(rule({ op: 'upsert', dataFile: 'src.json', data: [] as unknown as Record<string, unknown> })))
      .toEqual([])
  })
})

describe('jsonExecutor preserve', () => {
  it('overwrite 保留原文件存在的路径（原值优先）', async () => {
    const p = writeJson({ token: 'SECRET', nested: { keep: 1, drop: 2 }, gone: true })
    await jsonExecutor.execute(
      rule({ op: 'overwrite', data: { token: 'NEW', nested: { keep: 9 }, fresh: 1 }, preserve: ['token', 'nested.keep'] }),
      ctx(),
    )
    expect(JSON.parse(fs.readFileSync(p, 'utf8'))).toEqual({ token: 'SECRET', nested: { keep: 1 }, fresh: 1 })
  })
  it('overwrite 保留路径原文件不存在则跳过', async () => {
    const p = writeJson({ a: 1 })
    await jsonExecutor.execute(
      rule({ op: 'overwrite', data: { b: 2 }, preserve: ['missing.path'] }),
      ctx(),
    )
    expect(JSON.parse(fs.readFileSync(p, 'utf8'))).toEqual({ b: 2 })
  })
  it('overwrite 文件不存在时 preserve 无副作用（普通覆盖）', async () => {
    const p = path.join(tmp, 'new', 'c.json')
    await jsonExecutor.execute(
      rule({ file: p, op: 'overwrite', data: { x: 1 }, preserve: ['x'] }),
      ctx(),
    )
    expect(JSON.parse(fs.readFileSync(p, 'utf8'))).toEqual({ x: 1 })
  })
  it('upsert 下 data 写了保留路径但原值优先', async () => {
    const p = writeJson({ a: { b: 'old' }, other: 1 })
    await jsonExecutor.execute(
      rule({ op: 'upsert', data: { a: { b: 'new' }, add: 2 }, preserve: ['a.b'] }),
      ctx(),
    )
    expect(JSON.parse(fs.readFileSync(p, 'utf8'))).toEqual({ a: { b: 'old' }, other: 1, add: 2 })
  })
  it('plan overwrite 汇报保留 N 项（仅原文件存在的）', async () => {
    writeJson({ token: 'X', other: 1 })
    const res = await jsonExecutor.plan(
      rule({ op: 'overwrite', data: { token: 'Y' }, preserve: ['token', 'missing'] }),
      ctx(),
    )
    expect(res.changes.some(c => c.detail.includes('保留 1 项'))).toBe(true)
  })
})

describe('jsonExecutor', () => {
  it('upsert 深度合并并生成 .bak', async () => {
    const p = writeJson({ a: { x: 1 }, keep: true })
    await jsonExecutor.execute(rule({ op: 'upsert', data: { a: { y: 2 }, add: 1 } }), ctx())
    expect(JSON.parse(fs.readFileSync(p, 'utf8'))).toEqual({ a: { x: 1, y: 2 }, keep: true, add: 1 })
    expect(fs.existsSync(p + '.bak')).toBe(true)
  })
  it('append 冲突 key 报错', async () => {
    writeJson({ a: 1 })
    await expect(jsonExecutor.execute(rule({ op: 'append', data: { a: 2 } }), ctx()))
      .rejects.toThrow('已存在')
  })
  it('modify 缺失 key 报错', async () => {
    writeJson({ a: 1 })
    await expect(jsonExecutor.execute(rule({ op: 'modify', data: { b: 2 } }), ctx()))
      .rejects.toThrow('不存在')
  })
  it('overwrite 可创建新文件', async () => {
    const p = path.join(tmp, 'new', 'b.json')
    await jsonExecutor.execute(rule({ file: p, op: 'overwrite', data: { fresh: true } }), ctx())
    expect(JSON.parse(fs.readFileSync(p, 'utf8'))).toEqual({ fresh: true })
  })
  it('非 overwrite 时文件不存在报错', async () => {
    await expect(jsonExecutor.execute(rule({ file: path.join(tmp, 'nope.json') }), ctx()))
      .rejects.toThrow('文件不存在')
  })
  it('文件路径支持 ${VAR}', async () => {
    process.env.__JSON_TEST_DIR__ = tmp
    writeJson({ a: 1 })
    await jsonExecutor.execute(rule({ file: '${__JSON_TEST_DIR__}/a.json', op: 'upsert', data: { b: 2 } }), ctx())
    delete process.env.__JSON_TEST_DIR__
    expect(JSON.parse(fs.readFileSync(path.join(tmp, 'a.json'), 'utf8'))).toEqual({ a: 1, b: 2 })
  })
  it('validate 校验必填与数据类型', () => {
    expect(jsonExecutor.validate(rule({ file: ' ' }))).toContain('文件路径不能为空')
    expect(jsonExecutor.validate(rule({ data: [] as unknown as Record<string, unknown> })))
      .toContain('数据必须是 JSON 对象')
    expect(jsonExecutor.validate(rule({}))).toEqual([])
  })
})
