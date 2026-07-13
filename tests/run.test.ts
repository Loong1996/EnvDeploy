import { describe, expect, it } from 'vitest'
import { decodeOutFile, runExecutor, shellInvocation, scriptExt, scriptBody } from '../electron/core/executors/run'
import type { ExecContext } from '../electron/core/executor'

const ctx: ExecContext = { baseDir: process.cwd(), settings: { backupBeforeImport: true }, onProgress: () => {} }

describe('scriptExt', () => {
  it('powershell→.ps1，cmd→.bat', () => {
    expect(scriptExt('powershell')).toBe('.ps1')
    expect(scriptExt('cmd')).toBe('.bat')
  })
})

describe('shellInvocation', () => {
  it('powershell 用 -File 且 Bypass', () => {
    const r = shellInvocation('powershell', 'C:\\t\\s.ps1')
    expect(r.cmd).toBe('powershell.exe')
    expect(r.args).toContain('-File')
    expect(r.args).toContain('C:\\t\\s.ps1')
    expect(r.args.join(' ')).toContain('Bypass')
  })
  it('cmd 用 /c', () => {
    const r = shellInvocation('cmd', 'C:\\t\\s.bat')
    expect(r.cmd).toBe('cmd.exe')
    expect(r.args).toEqual(['/c', 'C:\\t\\s.bat'])
  })
})

describe('scriptBody', () => {
  it('powershell 加 UTF-8 BOM', () => {
    const b = scriptBody('echo 你好', 'powershell')
    expect(b.startsWith('﻿')).toBe(true)
    expect(b).toContain('echo 你好')
  })
  it('cmd 加 chcp 65001 且无 BOM', () => {
    const b = scriptBody('echo 你好', 'cmd')
    expect(b.startsWith('@chcp 65001')).toBe(true)
    expect(b.startsWith('﻿')).toBe(false)
  })
  it('cmd 行尾归一为 CRLF（批处理解析器对 LF-only 有边缘问题）', () => {
    const b = scriptBody('echo a\necho b\r\necho c', 'cmd')
    expect(b).toContain('echo a\r\necho b\r\necho c')
    expect(/[^\r]\n/.test(b)).toBe(false) // 不存在孤立 LF
  })
  it('powershell 不改动行尾', () => {
    expect(scriptBody('echo a\necho b', 'powershell')).toBe('﻿echo a\necho b')
  })
})

describe('decodeOutFile', () => {
  it('UTF-16LE BOM（PowerShell 5.1 *> 重定向的默认编码）', () => {
    expect(decodeOutFile(Buffer.from('﻿hello 你好', 'utf16le'))).toBe('hello 你好')
  })
  it('UTF-8 BOM', () => {
    expect(decodeOutFile(Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from('hi 你好', 'utf8')]))).toBe('hi 你好')
  })
  it('无 BOM 按 UTF-8', () => {
    expect(decodeOutFile(Buffer.from('plain', 'utf8'))).toBe('plain')
  })
  it('空文件', () => {
    expect(decodeOutFile(Buffer.alloc(0))).toBe('')
  })
})

describe('run.validate', () => {
  it('命令为空报错', () => {
    expect(runExecutor.validate(
      { id: '1', type: 'run', name: 'r', enabled: true, command: '  ', shell: 'powershell', cwd: '', elevated: false }))
      .toContain('命令不能为空')
  })
})

describe('run.plan', () => {
  it('返回将执行的描述，非 noop', async () => {
    const r = await runExecutor.plan(
      { id: '1', type: 'run', name: 'r', enabled: true, command: 'echo hi\necho bye', shell: 'cmd', cwd: '', elevated: false }, ctx)
    expect(r.noop).toBe(false)
    expect(r.changes[0].kind).toBe('run')
    expect(r.changes[0].detail).toContain('echo hi')
  })
})
