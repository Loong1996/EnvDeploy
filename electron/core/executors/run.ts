import fs from 'fs'
import os from 'os'
import path from 'path'
import { execFileSync, spawn } from 'child_process'
import type { RunRule, RunShell } from '@shared/types'
import type { RuleExecutor } from '../executor'
import { expandVars } from '../vars'
import { isAdmin, psQuote } from './env'

export function scriptExt(shell: RunShell): string {
  return shell === 'cmd' ? '.bat' : '.ps1'
}

export function shellInvocation(shell: RunShell, scriptFile: string): { cmd: string; args: string[] } {
  if (shell === 'cmd') return { cmd: 'cmd.exe', args: ['/c', scriptFile] }
  return {
    cmd: 'powershell.exe',
    args: ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', scriptFile],
  }
}

function firstLine(s: string): string {
  const line = s.split(/\r?\n/).find(l => l.trim()) ?? ''
  return line.length > 80 ? line.slice(0, 80) + '…' : line
}

export function scriptBody(command: string, shell: RunShell): string {
  if (shell === 'cmd') return `@chcp 65001 >nul\r\n${command}`   // no BOM for cmd; switch console to UTF-8
  return `﻿${command}`                                     // UTF-8 BOM so Windows PowerShell reads UTF-8
}

function writeScript(command: string, shell: RunShell): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'envdeploy-run-'))
  const file = path.join(dir, `script${scriptExt(shell)}`)
  fs.writeFileSync(file, scriptBody(command, shell), 'utf8')
  return file
}

/**
 * 非管理员 + elevated：经 UAC 提权执行。
 * `-Verb RunAs`（ShellExecute）与 `-RedirectStandardOutput`（CreateProcess）不能同时使用，
 * 否则 Start-Process 抛 Win32 error 87。故把重定向放进被提权的子进程内部：
 * 写一个 wrapper.ps1，在其中用 `*>` 把子进程全部输出流重定向到文件。
 */
function runElevated(
  inv: { cmd: string; args: string[] },
  cwd: string,
  wrapperFile: string,
  outFile: string,
): number {
  const lines: string[] = []
  if (cwd) lines.push(`Set-Location -LiteralPath ${psQuote(cwd)}`)
  const argList = inv.args.map(a => psQuote(a)).join(' ')
  lines.push(`& ${psQuote(inv.cmd)} ${argList} *> ${psQuote(outFile)}; exit $LASTEXITCODE`)
  fs.writeFileSync(wrapperFile, `﻿${lines.join('\r\n')}`, 'utf8')
  const outer =
    `$p = Start-Process -FilePath 'powershell.exe' ` +
    `-ArgumentList '-NoProfile','-ExecutionPolicy','Bypass','-File',${psQuote(wrapperFile)} ` +
    `-Verb RunAs -Wait -PassThru; exit $p.ExitCode`
  try {
    execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', outer], { stdio: 'ignore' })
    return 0
  } catch (e) {
    const code = (e as { status?: number }).status
    return typeof code === 'number' ? code : 1
  }
}

export const runExecutor: RuleExecutor<RunRule> = {
  type: 'run',
  label: '命令',

  validate(rule) {
    const errs: string[] = []
    if (!rule.command?.trim()) errs.push('命令不能为空')
    return errs
  },

  async plan(rule) {
    const detail = `执行（${rule.shell}${rule.elevated ? '·管理员' : ''}）: ${firstLine(rule.command)}`
    return { noop: false, changes: [{ kind: 'run', detail }] }
  },

  async execute(rule, ctx) {
    const command = expandVars(rule.command)
    const cwd = rule.cwd ? path.normalize(expandVars(rule.cwd)) : undefined
    if (cwd && !fs.existsSync(cwd)) throw new Error(`工作目录不存在: ${cwd}`)
    const scriptFile = writeScript(command, rule.shell)
    const inv = shellInvocation(rule.shell, scriptFile)
    ctx.onProgress(0, 1, firstLine(command))

    try {
      if (rule.elevated && !isAdmin()) {
        const outFile = `${scriptFile}.out`
        const wrapperFile = path.join(path.dirname(scriptFile), 'elevated.ps1')
        const code = runElevated(inv, cwd ?? '', wrapperFile, outFile)
        if (fs.existsSync(outFile)) {
          for (const line of fs.readFileSync(outFile, 'utf8').split(/\r?\n/)) {
            if (line.trim()) ctx.onProgress(1, 1, line)
          }
        }
        if (code !== 0) throw new Error(`命令以非零退出码结束: ${code}`)
        ctx.onProgress(1, 1, '（已提权执行）')
        return `命令执行成功（已提权）`
      }

      const code = await new Promise<number>((resolve, reject) => {
        const child = spawn(inv.cmd, inv.args, { cwd, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
        const onData = (buf: Buffer): void => {
          for (const line of buf.toString().split(/\r?\n/)) if (line.trim()) ctx.onProgress(1, 1, line)
        }
        child.stdout.on('data', onData)
        child.stderr.on('data', onData)
        child.on('error', reject)
        child.on('close', c => resolve(c ?? 0))
      })
      if (code !== 0) throw new Error(`命令以非零退出码结束: ${code}`)
      ctx.onProgress(1, 1, '完成')
      return `命令执行成功`
    } finally {
      fs.rmSync(path.dirname(scriptFile), { recursive: true, force: true })
    }
  },
}
