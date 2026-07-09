import fs from 'fs'
import os from 'os'
import path from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { deepMerge, jsonExecutor } from '../electron/core/executors/json'
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
