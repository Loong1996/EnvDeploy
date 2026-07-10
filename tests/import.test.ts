import fs from 'fs'
import os from 'os'
import path from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { importExecutor } from '../electron/core/executors/import'
import { packExecutor } from '../electron/core/executors/pack'
import type { ExecContext } from '../electron/core/executor'
import type { ImportRule, PackRule } from '../shared/types'

let tmp: string
beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'jz-import-'))
})
afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true })
})

const ctx = (backup = false): ExecContext => ({
  baseDir: tmp,
  settings: { backupBeforeImport: backup },
  onProgress: () => {},
})

function write(rel: string, content = 'x'): void {
  const p = path.join(tmp, rel)
  fs.mkdirSync(path.dirname(p), { recursive: true })
  fs.writeFileSync(p, content)
}

/** 用 packExecutor 从 tmp/zipsrc 生成 packages/pkg.zip */
async function makeZip(): Promise<void> {
  const r: PackRule = {
    id: 'p', type: 'pack', name: 'p', enabled: true,
    source: path.join(tmp, 'zipsrc'), output: 'pkg.zip', excludes: [],
  }
  await packExecutor.execute(r, ctx())
}

function rule(partial: Partial<ImportRule>): ImportRule {
  return {
    id: 'r1', type: 'import', name: 't', enabled: true,
    zip: 'pkg.zip', target: path.join(tmp, 'target'), preserve: [], rename: '',
    ...partial,
  }
}

describe('importExecutor', () => {
  it('全新解压 zip 到目标目录', async () => {
    write('zipsrc/a.txt', 'A')
    write('zipsrc/sub/b.txt', 'B')
    await makeZip()
    const msg = await importExecutor.execute(rule({}), ctx())
    expect(fs.readFileSync(path.join(tmp, 'target', 'a.txt'), 'utf8')).toBe('A')
    expect(fs.readFileSync(path.join(tmp, 'target', 'sub', 'b.txt'), 'utf8')).toBe('B')
    expect(msg).toContain('已解压')
  })

  it('preserve 项在覆盖导入后保留(优先于 zip 内容)', async () => {
    write('zipsrc/a.txt', 'NEW')
    await makeZip()
    write('target/a.txt', 'OLD-A')
    write('target/keep.json', 'KEEP')
    write('target/gone.txt', 'GONE')
    await importExecutor.execute(rule({ preserve: ['keep.json', 'a.txt'] }), ctx())
    expect(fs.readFileSync(path.join(tmp, 'target', 'keep.json'), 'utf8')).toBe('KEEP')
    expect(fs.readFileSync(path.join(tmp, 'target', 'a.txt'), 'utf8')).toBe('OLD-A')
    expect(fs.existsSync(path.join(tmp, 'target', 'gone.txt'))).toBe(false)
  })

  it('备份时旧目录复制到 exe/backups/ 保留（不再 rename）', async () => {
    write('zipsrc/a.txt')
    await makeZip()
    write('target/old.txt', 'OLD')
    await importExecutor.execute(rule({}), ctx(true))
    const store = path.join(tmp, 'backups')
    const backups = fs.readdirSync(store).filter(f => f.startsWith('target-backup-'))
    expect(backups.length).toBe(1)
    expect(fs.readFileSync(path.join(store, backups[0], 'old.txt'), 'utf8')).toBe('OLD')
    expect(fs.existsSync(path.join(tmp, 'target', 'old.txt'))).toBe(false)
  })

  it('规则级 backup:false 覆盖全局设置：不备份直接覆盖', async () => {
    write('zipsrc/a.txt')
    await makeZip()
    write('target/old.txt', 'OLD')
    await importExecutor.execute(rule({ backup: false }), ctx(true))
    expect(fs.existsSync(path.join(tmp, 'backups'))).toBe(false)
    expect(fs.existsSync(path.join(tmp, 'target', 'old.txt'))).toBe(false)
  })

  it('规则级 backup:true 覆盖全局设置：即使全局关也备份', async () => {
    write('zipsrc/a.txt')
    await makeZip()
    write('target/old.txt', 'OLD')
    await importExecutor.execute(rule({ backup: true }), ctx(false))
    const backups = fs.readdirSync(path.join(tmp, 'backups')).filter(f => f.startsWith('target-backup-'))
    expect(backups.length).toBe(1)
  })

  it('单文件覆盖时也备份到 exe/backups/', async () => {
    write('packages/tool.bin', 'NEW')
    write('target/tool.bin', 'OLD')
    await importExecutor.execute(rule({ zip: 'tool.bin' }), ctx(true))
    expect(fs.readFileSync(path.join(tmp, 'target', 'tool.bin'), 'utf8')).toBe('NEW')
    const backups = fs.readdirSync(path.join(tmp, 'backups')).filter(f => f.startsWith('tool.bin-backup-'))
    expect(backups.length).toBe(1)
    expect(fs.readFileSync(path.join(tmp, 'backups', backups[0]), 'utf8')).toBe('OLD')
  })

  it('merge 模式不清空目标，叠加保留原有文件', async () => {
    write('zipsrc/a.txt', 'A')
    await makeZip()
    write('target/old.txt', 'OLD')
    const msg = await importExecutor.execute(rule({ mode: 'merge' }), ctx())
    expect(fs.readFileSync(path.join(tmp, 'target', 'a.txt'), 'utf8')).toBe('A')
    expect(fs.readFileSync(path.join(tmp, 'target', 'old.txt'), 'utf8')).toBe('OLD')
    expect(msg).toContain('已叠加')
  })

  it('replace 模式清空目标（对照）', async () => {
    write('zipsrc/a.txt', 'A')
    await makeZip()
    write('target/old.txt', 'OLD')
    await importExecutor.execute(rule({ mode: 'replace' }), ctx())
    expect(fs.existsSync(path.join(tmp, 'target', 'old.txt'))).toBe(false)
  })

  it('同一次部署同一目标只备份一次（去重）', async () => {
    write('zipsrc/a.txt')
    await makeZip()
    write('target/old.txt', 'OLD')
    const shared = new Set<string>()
    const c = (): ExecContext => ({ baseDir: tmp, settings: { backupBeforeImport: true }, backedUp: shared, onProgress: () => {} })
    await importExecutor.execute(rule({ mode: 'merge' }), c())
    await importExecutor.execute(rule({ mode: 'merge' }), c())
    const backups = fs.readdirSync(path.join(tmp, 'backups')).filter(f => f.startsWith('target-backup-'))
    expect(backups.length).toBe(1)
  })

  it('非 zip 源按单文件复制并支持 rename', async () => {
    write('packages/tool.bin', 'BIN')
    const msg = await importExecutor.execute(rule({ zip: 'tool.bin', rename: 'renamed.bin' }), ctx())
    expect(fs.readFileSync(path.join(tmp, 'target', 'renamed.bin'), 'utf8')).toBe('BIN')
    expect(msg).toContain('已复制')
  })

  it('rename 路径穿越被钳制为纯文件名', async () => {
    write('packages/tool.bin', 'BIN')
    await importExecutor.execute(rule({ zip: 'tool.bin', rename: '..\\..\\evil.bin' }), ctx())
    expect(fs.existsSync(path.join(tmp, 'target', 'evil.bin'))).toBe(true)
    expect(fs.existsSync(path.join(tmp, 'evil.bin'))).toBe(false)
  })

  it('目标路径支持 ${VAR}', async () => {
    write('zipsrc/a.txt')
    await makeZip()
    process.env.__IMPORT_TEST_DIR__ = tmp
    await importExecutor.execute(rule({ target: '${__IMPORT_TEST_DIR__}/vtarget' }), ctx())
    delete process.env.__IMPORT_TEST_DIR__
    expect(fs.existsSync(path.join(tmp, 'vtarget', 'a.txt'))).toBe(true)
  })

  it('源文件不存在报错', async () => {
    await expect(importExecutor.execute(rule({ zip: 'nope.zip' }), ctx()))
      .rejects.toThrow('源文件不存在')
  })

  it('远程 URL 源报暂不支持(扩展预留)', async () => {
    await expect(importExecutor.execute(rule({ zip: 'https://x.com/a.zip' }), ctx()))
      .rejects.toThrow('暂不支持远程 zip 源')
  })

  it('validate 校验必填', () => {
    expect(importExecutor.validate(rule({ zip: ' ' }))).toContain('源文件不能为空')
    expect(importExecutor.validate(rule({ target: '' }))).toContain('目标目录不能为空')
    expect(importExecutor.validate(rule({}))).toEqual([])
  })
})
