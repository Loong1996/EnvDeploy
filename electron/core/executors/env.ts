import { execFileSync, spawnSync } from 'child_process'
import type { EnvRule, EnvScope, PathPosition } from '@shared/types'
import type { RuleExecutor } from '../executor'
import { expandVars } from '../vars'

export const ENV_KEY = 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Environment'
export const ENV_USER_KEY = 'HKCU:\\Environment'

export function regRoot(scope: EnvScope): string {
  return scope === 'machine' ? ENV_KEY : ENV_USER_KEY
}

/**
 * 重要系统变量：禁止「整体删除」，避免误删破坏系统。
 * 仍可通过「填值移除条目」从这些变量中移除单项。
 */
const PROTECTED_VARS = new Set([
  'path', 'pathext', 'temp', 'tmp', 'comspec', 'systemroot', 'systemdrive', 'windir',
  'userprofile', 'homedrive', 'homepath', 'appdata', 'localappdata', 'programdata',
  'programfiles', 'programfiles(x86)', 'commonprogramfiles', 'public', 'username',
  'userdomain', 'allusersprofile', 'os', 'number_of_processors', 'processor_architecture',
  'psmodulepath', 'driverdata',
])

export function isProtectedVar(name: string): boolean {
  return PROTECTED_VARS.has(name.trim().toLowerCase())
}

/**
 * 广播 WM_SETTINGCHANGE 通知运行中的应用刷新环境变量。
 * 用 SendNotifyMessage（异步、立即返回），而非 SendMessageTimeout（会逐个同步等待每个顶层窗口，
 * 遇到不响应的窗口会阻塞数十秒）。新进程无论如何都会从注册表读到新值，此广播只为让已运行的应用尽快刷新。
 */
const BROADCAST = [
  `$sig = '[DllImport("user32.dll", SetLastError = true, CharSet = CharSet.Auto)] public static extern bool SendNotifyMessage(IntPtr hWnd, uint Msg, UIntPtr wParam, string lParam);'`,
  `$native = Add-Type -MemberDefinition $sig -Name Broadcast -Namespace Win32 -PassThru`,
  `$native::SendNotifyMessage([IntPtr]0xffff, 0x1A, [UIntPtr]::Zero, 'Environment') | Out-Null`,
].join('\n')

export function psQuote(s: string): string {
  return `'${s.replace(/'/g, "''")}'`
}

export function buildReadScript(root: string, name: string): string {
  return `(Get-Item ${psQuote(root)}).GetValue(${psQuote(name)}, '', 'DoNotExpandEnvironmentNames')`
}

/**
 * 写入环境变量：注册表写入（含 % 用 REG_EXPAND_SZ 保留展开语义，否则 REG_SZ）+ 非阻塞广播。
 */
export function buildWriteScript(scope: EnvScope, name: string, value: string): string {
  const type = value.includes('%') ? 'ExpandString' : 'String'
  return [
    `Set-ItemProperty -Path ${psQuote(regRoot(scope))} -Name ${psQuote(name)} -Value ${psQuote(value)} -Type ${type}`,
    BROADCAST,
  ].join('\n')
}

/** 删除整个环境变量 + 非阻塞广播 */
export function buildDeleteScript(scope: EnvScope, name: string): string {
  return [
    `Remove-ItemProperty -Path ${psQuote(regRoot(scope))} -Name ${psQuote(name)} -ErrorAction SilentlyContinue`,
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

const PROTECTED_DELETE_MSG = (key: string): string =>
  `拒绝删除受保护的系统变量 ${key}；如需移除其中某一项，请在「值」中填写要移除的条目`

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
      const entry = value.trim()
      if (entry) {
        // 填了值：只移除列表中的该条目（适用于任意变量）
        const r = removePath(current, entry)
        return r.changed
          ? { noop: false, changes: [{ kind: 'modify', detail: `${key} -= ${entry}` }] }
          : { noop: true, changes: [{ kind: 'noop', detail: `${key} 不含 ${entry}` }] }
      }
      // 未填值：删除整个变量 —— 受保护变量在预览阶段即报错
      if (isProtectedVar(key)) throw new Error(PROTECTED_DELETE_MSG(key))
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
      runPs(buildWriteScript(scope, key, merged.value))
      ctx.onProgress(1, 1, key)
      return `已${rule.pathPosition === 'prepend' ? '前置' : '追加'}路径到 ${key}: ${value}`
    }

    if (rule.op === 'remove') {
      const entry = value.trim()
      if (entry) {
        // 填了值：只从列表中移除该条目，绝不删整个变量
        const current = runPs(buildReadScript(root, key))
        const r = removePath(current, entry)
        if (!r.changed) {
          ctx.onProgress(1, 1, key)
          return `${key} 中不含 ${entry}，无需移除`
        }
        runPs(buildWriteScript(scope, key, r.value))
        ctx.onProgress(1, 1, key)
        return `已从 ${key} 移除: ${entry}`
      }
      // 未填值：删除整个变量 —— 保护重要系统变量
      if (isProtectedVar(key)) throw new Error(PROTECTED_DELETE_MSG(key))
      runPs(buildDeleteScript(scope, key))
      ctx.onProgress(1, 1, key)
      return `已删除环境变量 ${key}`
    }

    runPs(buildWriteScript(scope, key, value))
    ctx.onProgress(1, 1, key)
    return `已设置环境变量 ${key} = ${value}（${scope === 'machine' ? '机器级' : '用户级'}）`
  },
}
