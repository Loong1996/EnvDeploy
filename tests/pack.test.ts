import fs from 'fs'
import os from 'os'
import path from 'path'
import StreamZip from 'node-stream-zip'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { packExecutor } from '../electron/core/executors/pack'
import type { ExecContext } from '../electron/core/executor'
import type { PackRule } from '../shared/types'

let tmp: string
beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'jz-pack-'))
})
afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true })
})

const ctx = (onProgress: ExecContext['onProgress'] = () => {}): ExecContext => ({
  baseDir: tmp,
  settings: { backupBeforeImport: true },
  onProgress,
})

function write(rel: string, content = 'x'): void {
  const p = path.join(tmp, 'src', rel)
  fs.mkdirSync(path.dirname(p), { recursive: true })
  fs.writeFileSync(p, content)
}

function rule(partial: Partial<PackRule>): PackRule {
  return {
    id: 'r1', type: 'pack', name: 't', enabled: true,
    source: path.join(tmp, 'src'), output: 'out.zip', excludes: [],
    ...partial,
  }
}

async function zipEntries(zipPath: string): Promise<string[]> {
  const zip = new StreamZip.async({ file: zipPath })
  const names = Object.keys(await zip.entries()).sort()
  await zip.close()
  return names
}

describe('packExecutor', () => {
  it('目录打包为 zip,excludes 生效,相对输出落入 packages/', async () => {
    write('a.txt')
    write('sub/b.txt')
    write('node_modules/c.txt')
    const calls: number[] = []
    const msg = await packExecutor.execute(
      rule({ excludes: ['node_modules'] }),
      ctx((cur, total) => calls.push(cur / total)),
    )
    const zipPath = path.join(tmp, 'packages', 'out.zip')
    expect(fs.existsSync(zipPath)).toBe(true)
    expect(await zipEntries(zipPath)).toEqual(['a.txt', 'sub/b.txt'])
    expect(msg).toContain('2 个文件')
    expect(calls.length).toBe(2)
  })

  it('源路径支持 ${VAR}', async () => {
    write('a.txt')
    process.env.__PACK_TEST_DIR__ = tmp
    await packExecutor.execute(rule({ source: '${__PACK_TEST_DIR__}/src' }), ctx())
    delete process.env.__PACK_TEST_DIR__
    expect(fs.existsSync(path.join(tmp, 'packages', 'out.zip'))).toBe(true)
  })

  it('单文件源 + 非 zip 输出走直拷', async () => {
    write('tool.exe', 'bin')
    const msg = await packExecutor.execute(
      rule({ source: path.join(tmp, 'src', 'tool.exe'), output: 'tool.exe' }),
      ctx(),
    )
    expect(fs.readFileSync(path.join(tmp, 'packages', 'tool.exe'), 'utf8')).toBe('bin')
    expect(msg).toContain('已复制')
  })

  it('目录源 + 非 zip 输出报错', async () => {
    write('a.txt')
    await expect(packExecutor.execute(rule({ output: 'out.bin' }), ctx()))
      .rejects.toThrow('非 zip 输出仅支持单文件源')
  })

  it('源不存在报错', async () => {
    await expect(packExecutor.execute(rule({ source: path.join(tmp, 'nope') }), ctx()))
      .rejects.toThrow('源路径不存在')
  })

  it('输出落在源目录内被拒绝（防自包含无限增长）', async () => {
    write('a.txt')
    // baseDir=tmp，源=tmp（则输出 tmp/packages/out.zip 落在源内）
    await expect(packExecutor.execute(rule({ source: tmp, output: 'out.zip' }), ctx()))
      .rejects.toThrow('输出文件不能位于源目录内')
    // plan 同样拦截
    await expect(packExecutor.plan(rule({ source: tmp, output: 'out.zip' }), ctx()))
      .rejects.toThrow('输出文件不能位于源目录内')
  })

  it('validate 校验必填', () => {
    expect(packExecutor.validate(rule({ source: ' ' }))).toContain('源路径不能为空')
    expect(packExecutor.validate(rule({ output: '' }))).toContain('输出文件不能为空')
    expect(packExecutor.validate(rule({}))).toEqual([])
  })
})
