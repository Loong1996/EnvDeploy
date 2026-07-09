import { execFileSync, spawnSync } from 'child_process'
import type { EnvRule } from '@shared/types'
import type { RuleExecutor } from '../executor'
import { expandVars } from '../vars'

export const ENV_KEY = 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Environment'

const BROADCAST = [
  `$sig = '[DllImport("user32.dll", SetLastError = true, CharSet = CharSet.Auto)] public static extern IntPtr SendMessageTimeout(IntPtr hWnd, uint Msg, UIntPtr wParam, string lParam, uint fuFlags, uint uTimeout, out UIntPtr lpdwResult);'`,
  `$native = Add-Type -MemberDefinition $sig -Name Broadcast -Namespace Win32 -PassThru`,
  `[UIntPtr]$out = [UIntPtr]::Zero`,
  `$native::SendMessageTimeout([IntPtr]0xffff, 0x1A, [UIntPtr]::Zero, 'Environment', 2, 5000, [ref]$out) | Out-Null`,
].join('\n')

export function psQuote(s: string): string {
  return `'${s.replace(/'/g, "''")}'`
}

export function buildReadScript(name: string): string {
  return `(Get-Item ${psQuote(ENV_KEY)}).GetValue(${psQuote(name)}, '', 'DoNotExpandEnvironmentNames')`
}

export function buildSetScript(name: string, value: string): string {
  const type = value.includes('%') ? 'ExpandString' : 'String'
  return [
    `Set-ItemProperty -Path ${psQuote(ENV_KEY)} -Name ${psQuote(name)} -Value ${psQuote(value)} -Type ${type}`,
    BROADCAST,
  ].join('\n')
}

export function mergePath(current: string, addition: string): { value: string; changed: boolean } {
  const parts = current.split(';').map(p => p.trim()).filter(Boolean)
  const norm = (p: string): string => p.replace(/[\\/]+$/, '').toLowerCase()
  const add = addition.trim().replace(/[\\/]+$/, '')
  if (parts.some(p => norm(p) === norm(add))) return { value: parts.join(';'), changed: false }
  return { value: [...parts, add].join(';'), changed: true }
}

export function isAdmin(): boolean {
  return spawnSync('net', ['session'], { stdio: 'ignore' }).status === 0
}

function runPs(script: string): string {
  return execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
    encoding: 'utf8',
  }).trim()
}

export const envExecutor: RuleExecutor<EnvRule> = {
  type: 'env',
  label: '环境变量',

  validate(rule) {
    const errs: string[] = []
    if (!rule.key?.trim()) errs.push('变量名不能为空')
    return errs
  },

  async execute(rule, ctx) {
    if (!isAdmin()) throw new Error('需要以管理员身份运行才能修改系统环境变量')
    const key = rule.key.trim()
    const value = expandVars(rule.value)
    ctx.onProgress(0, 1, key)

    if (rule.op === 'append_path') {
      const current = runPs(buildReadScript(key))
      const merged = mergePath(current, value)
      if (!merged.changed) {
        ctx.onProgress(1, 1, key)
        return `路径已存在于 ${key} 中，无需重复添加: ${value}`
      }
      runPs(buildSetScript(key, merged.value))
      ctx.onProgress(1, 1, key)
      return `已追加路径到 ${key}: ${value}`
    }

    runPs(buildSetScript(key, value))
    ctx.onProgress(1, 1, key)
    return `已设置环境变量 ${key} = ${value}`
  },
}
