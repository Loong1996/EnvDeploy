import fs from 'fs'
import os from 'os'
import path from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { downloadExecutor } from '../electron/core/executors/download'
import type { ExecContext } from '../electron/core/executor'

const ctx: ExecContext = { baseDir: process.cwd(), settings: { backupBeforeImport: true }, onProgress: () => {} }
let dir: string
beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dl-')) })
afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }) })

describe('download.validate', () => {
  it('非 http 协议报错', () => {
    expect(downloadExecutor.validate(
      { id: '1', type: 'download', name: 'd', enabled: true, url: 'ftp://x/y', target: 't', overwrite: false }))
      .toContain('仅支持 http/https 地址')
  })
  it('url/target 为空报错', () => {
    const errs = downloadExecutor.validate(
      { id: '1', type: 'download', name: 'd', enabled: true, url: '', target: '', overwrite: false })
    expect(errs.length).toBeGreaterThan(0)
  })
})

describe('download.plan', () => {
  it('目标已存在且不覆盖 → noop', async () => {
    const f = path.join(dir, 'a.bin')
    fs.writeFileSync(f, 'x')
    const r = await downloadExecutor.plan(
      { id: '1', type: 'download', name: 'd', enabled: true, url: 'https://x/a', target: f, overwrite: false }, ctx)
    expect(r.noop).toBe(true)
  })
  it('目标不存在 → download 变更', async () => {
    const r = await downloadExecutor.plan(
      { id: '1', type: 'download', name: 'd', enabled: true, url: 'https://x/a', target: path.join(dir, 'b.bin'), overwrite: false }, ctx)
    expect(r.noop).toBe(false)
    expect(r.changes[0].kind).toBe('download')
  })
  it('目标是已存在目录 → plan/execute 都明确报错', async () => {
    const d = { id: '1', type: 'download' as const, name: 'd', enabled: true, url: 'https://x/a', target: dir, overwrite: true }
    await expect(downloadExecutor.plan(d, ctx)).rejects.toThrow('已存在的目录')
    await expect(downloadExecutor.execute(d, ctx)).rejects.toThrow('已存在的目录')
  })
})
