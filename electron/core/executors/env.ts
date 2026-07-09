import { execFileSync, spawnSync } from 'child_process'
import type { EnvRule, EnvScope, PathPosition } from '@shared/types'
import type { RuleExecutor } from '../executor'
import { expandVars } from '../vars'

export const ENV_KEY = 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Environment'
export const ENV_USER_KEY = 'HKCU:\\Environment'

export function regRoot(scope: EnvScope): string {
  return scope === 'machine' ? ENV_KEY : ENV_USER_KEY
}

const BROADCAST = [
  `$sig = '[DllImport("user32.dll", SetLastError = true, CharSet = CharSet.Auto)] public static extern IntPtr SendMessageTimeout(IntPtr hWnd, uint Msg, UIntPtr wParam, string lParam, uint fuFlags, uint uTimeout, out UIntPtr lpdwResult);'`,
  `$native = Add-Type -MemberDefinition $sig -Name Broadcast -Namespace Win32 -PassThru`,
  `[UIntPtr]$out = [UIntPtr]::Zero`,
  `$native::SendMessageTimeout([IntPtr]0xffff, 0x1A, [UIntPtr]::Zero, 'Environment', 2, 5000, [ref]$out) | Out-Null`,
].join('\n')

export function psQuote(s: string): string {
  return `'${s.replace(/'/g, "''")}'`
}

export function isPathKey(name: string): boolean {
  return name.trim().toLowerCase() === 'path'
}

export function buildReadScript(root: string, name: string): string {
  return `(Get-Item ${psQuote(root)}).GetValue(${psQuote(name)}, '', 'DoNotExpandEnvironmentNames')`
}

export function buildSetScript(root: string, name: string, value: string): string {
  const type = value.includes('%') ? 'ExpandString' : 'String'
  return [
    `Set-ItemProperty -Path ${psQuote(root)} -Name ${psQuote(name)} -Value ${psQuote(value)} -Type ${type}`,
    BROADCAST,
  ].join('\n')
}

export function buildRemoveScript(root: string, name: string): string {
  return [
    `Remove-ItemProperty -Path ${psQuote(root)} -Name ${psQuote(name)} -ErrorAction SilentlyContinue`,
    BROADCAST,
  ].join('\n')
}

const normSeg = (p: string): string => p.replace(/[\\/]+$/, '').toLowerCase()

export function mergePath(
  current: string,
  addition: string,
  position: PathPosition = 'append',
): { value: string; changed: boolean } {
  const parts = current.split(';').map(p => p.trim()).filter(Boolean)
  const add = addition.trim().replace(/[\\/]+$/, '')
  if (parts.some(p => normSeg(p) === normSeg(add))) return { value: parts.join(';'), changed: false }
  const next = position === 'prepend' ? [add, ...parts] : [...parts, add]
  return { value: next.join(';'), changed: true }
}

export function removePath(current: string, entry: string): { value: string; changed: boolean } {
  const parts = current.split(';').map(p => p.trim()).filter(Boolean)
  const kept = parts.filter(p => normSeg(p) !== normSeg(entry))
  return { value: kept.join(';'), changed: kept.length !== parts.length }
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

  async plan(rule) {
    const key = rule.key.trim()
    const scope: EnvScope = rule.scope ?? 'user'
    const root = regRoot(scope)
    const value = expandVars(rule.value)
    const current = runPs(buildReadScript(root, key))

    if (rule.op === 'append_path') {
      const merged = mergePath(current, value, rule.pathPosition ?? 'append')
      return merged.changed
        ? { noop: false, changes: [{ kind: 'modify', detail: `${key} += ${value}` }] }
        : { noop: true, changes: [{ kind: 'noop', detail: `${key} 已包含 ${value}` }] }
    }
    if (rule.op === 'remove') {
      if (isPathKey(key)) {
        const r = removePath(current, value)
        return r.changed
          ? { noop: false, changes: [{ kind: 'modify', detail: `${key} -= ${value}` }] }
          : { noop: true, changes: [{ kind: 'noop', detail: `${key} 不含 ${value}` }] }
      }
      return current
        ? { noop: false, changes: [{ kind: 'delete', detail: `删除变量 ${key}` }] }
        : { noop: true, changes: [{ kind: 'noop', detail: `${key} 不存在` }] }
    }
    return current === value
      ? { noop: true, changes: [{ kind: 'noop', detail: `${key} 已是 ${value}` }] }
      : { noop: false, changes: [{ kind: current ? 'modify' : 'create', detail: `${key}: ${current || '(空)'} → ${value}` }] }
  },

  async execute(rule, ctx) {
    const scope: EnvScope = rule.scope ?? 'user'
    if (scope === 'machine' && !isAdmin())
      throw new Error('修改机器级（HKLM）环境变量需要管理员权限，请以管理员身份重新运行')
    const key = rule.key.trim()
    const root = regRoot(scope)
    const value = expandVars(rule.value)
    ctx.onProgress(0, 1, key)

    if (rule.op === 'append_path') {
      const current = runPs(buildReadScript(root, key))
      const merged = mergePath(current, value, rule.pathPosition ?? 'append')
      if (!merged.changed) {
        ctx.onProgress(1, 1, key)
        return `路径已存在于 ${key}，无需重复添加: ${value}`
      }
      runPs(buildSetScript(root, key, merged.value))
      ctx.onProgress(1, 1, key)
      return `已${rule.pathPosition === 'prepend' ? '前置' : '追加'}路径到 ${key}: ${value}`
    }

    if (rule.op === 'remove') {
      if (isPathKey(key)) {
        const current = runPs(buildReadScript(root, key))
        const r = removePath(current, value)
        if (!r.changed) {
          ctx.onProgress(1, 1, key)
          return `${key} 中不含 ${value}，无需移除`
        }
        runPs(buildSetScript(root, key, r.value))
        ctx.onProgress(1, 1, key)
        return `已从 ${key} 移除: ${value}`
      }
      runPs(buildRemoveScript(root, key))
      ctx.onProgress(1, 1, key)
      return `已删除环境变量 ${key}`
    }

    runPs(buildSetScript(root, key, value))
    ctx.onProgress(1, 1, key)
    return `已设置环境变量 ${key} = ${value}（${scope === 'machine' ? '机器级' : '用户级'}）`
  },
}
