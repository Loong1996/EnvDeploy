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

function writeScript(command: string, shell: RunShell): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'envdeploy-run-'))
  const file = path.join(dir, `script${scriptExt(shell)}`)
  fs.writeFileSync(file, command, 'utf8')
  return file
}

/** 非管理员 + elevated：经 UAC 提权执行，输出重定向到文件后回读 */
function runElevated(inv: { cmd: string; args: string[] }, cwd: string, outFile: string): number {
  const argList = inv.args.map(a => psQuote(a)).join(', ')
  const wd = cwd ? `-WorkingDirectory ${psQuote(cwd)} ` : ''
  const script =
    `$p = Start-Process -FilePath ${psQuote(inv.cmd)} -ArgumentList ${argList} ${wd}` +
    `-Verb RunAs -Wait -PassThru -RedirectStandardOutput ${psQuote(outFile)}; exit $p.ExitCode`
  try {
    execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { stdio: 'ignore' })
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
        const code = runElevated(inv, cwd ?? '', outFile)
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
        const child = spawn(inv.cmd, inv.args, { cwd, windowsHide: true })
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
