import fs from 'fs'
import os from 'os'
import path from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { jsonExecutor } from '../electron/core/executors/json'
import { packExecutor } from '../electron/core/executors/pack'
import { importExecutor } from '../electron/core/executors/import'
import type { ExecContext } from '../electron/core/executor'

const ctx: ExecContext = { baseDir: process.cwd(), settings: { backupBeforeImport: true }, onProgress: () => {} }

let dir: string
beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'plan-')) })
afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }) })

describe('json.plan 幂等', () => {
  it('已是目标状态 → noop', async () => {
    const f = path.join(dir, 'a.json')
    fs.writeFileSync(f, JSON.stringify({ a: 1 }))
    const r = await jsonExecutor.plan(
      { id: '1', type: 'json', name: 'x', enabled: true, file: f, op: 'upsert', data: { a: 1 } }, ctx)
    expect(r.noop).toBe(true)
  })
  it('有变化 → 列出 key', async () => {
    const f = path.join(dir, 'b.json')
    fs.writeFileSync(f, JSON.stringify({ a: 1 }))
    const r = await jsonExecutor.plan(
      { id: '1', type: 'json', name: 'x', enabled: true, file: f, op: 'upsert', data: { b: 2 } }, ctx)
    expect(r.noop).toBe(false)
    expect(r.changes.some(c => c.detail.includes('b'))).toBe(true)
  })
})

describe('pack.plan', () => {
  it('目录源列出文件数', async () => {
    fs.writeFileSync(path.join(dir, 'f1.txt'), 'x')
    fs.writeFileSync(path.join(dir, 'f2.txt'), 'y')
    const r = await packExecutor.plan(
      { id: '1', type: 'pack', name: 'p', enabled: true, source: dir, output: 'o.zip', excludes: [] }, ctx)
    expect(r.noop).toBe(false)
    expect(r.changes[0].detail).toContain('2')
  })
})

describe('import.plan 单文件/zip 区分', () => {
  it('非 zip 源报告复制文件，而非清空目标目录', async () => {
    const src = path.join(dir, 'tool.bin')
    fs.writeFileSync(src, 'BIN')
    const target = path.join(dir, 'target')
    fs.mkdirSync(target, { recursive: true })
    const r = await importExecutor.plan(
      { id: '1', type: 'import', name: 'i', enabled: true, zip: src, target, preserve: [], rename: '' }, ctx)
    expect(r.changes.some(c => c.detail.includes('清空目标目录'))).toBe(false)
    expect(r.changes.some(c => c.detail.includes('复制文件'))).toBe(true)
  })
})
