# EnvDeploy 通用化扩展 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把工具从「AI 编程环境专用」升级为通用环境部署工具 EnvDeploy，新增 `run`/`download` 动作、增强 `env`、加入执行前预览（dry-run）与规则集导入/导出。

**Architecture:** 沿用 v2 的可插拔规则引擎（`electron/core` 引擎层不依赖 Electron）。新增两个 executor（run/download），改造 env executor；给 `RuleExecutor` 接口加只读的 `plan()`（dry-run），引擎加 `planRules`；渲染层加三种编辑表单、预览面板与规则集导入导出入口。

**Tech Stack:** Electron + React 19 + TypeScript（strict）+ electron-vite + Vitest。运行时依赖白名单不变（archiver / node-stream-zip / minimatch / react / react-dom），download 只用 Node 内置 `https`/`http`，run 只用 Node 内置 `child_process`。

## Global Constraints

- 仅支持 Windows；不做任何跨平台抽象/分支。
- 引擎层（`electron/core/**`）**禁止 import electron**（CLI 就绪纪律）。
- 不新增运行时依赖；download 用 Node 内置 `https`/`http`，run 用内置 `child_process`。
- TS strict；无 `any` 泄漏；代码风格与现有一致（2 空格缩进、无分号、单引号）。
- `${VAR}` 展开沿用 `expandVars`，应用到 run 的 `command`/`cwd` 与 download 的 `url`/`target`。
- 产品名/exe：`EnvDeploy`；窗口标题/应用内标题：「环境部署工具」；GitHub 仓库名与 `package.json` `name` **不改**。
- 默认配置改为空规则集；原 AI 预设改为随包示例规则集 `examples/ai-coding-env.rules.json`。
- 规则集导出**剥离 id**，导入**重新生成 id**。
- 提交信息结尾附：`Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`
- 每个 executor 的 `plan()` 为**只读**：不写文件、不改注册表、不执行命令。
- 每步之后 `npm run test` 与 `npm run typecheck` 必须绿。

---

## File Structure

```
electron/core/
  executor.ts                 # 改：RuleExecutor 接口加 plan()
  engine.ts                   # 改：注册 run/download；加 planRules
  ruleset.ts                  # 新：规则集 序列化/解析（剥离/重生 id + 校验）
  executors/
    env.ts                    # 改：scope(HKCU/HKLM) + pathPosition + remove + plan()
    pack.ts                   # 改：加 plan()
    import.ts                 # 改：加 plan()
    json.ts                   # 改：加 plan()
    run.ts                    # 新
    download.ts               # 新
electron/main.ts              # 改：IPC rules:plan / ruleset:export|import|import-example
electron/preload.ts           # 改：暴露 planRules / exportRules / importRules / importExample
shared/types.ts               # 改：RunRule/DownloadRule/EnvRule 扩展/PlanChange/PlanResult/RulePlan/RuleType/Rule
shared/api.ts                 # 改：Api 加 planRules/exportRules/importRules/importExample
src/utils/rules.ts            # 改：newRule/ruleSummary 覆盖 env增强 + run + download
src/components/RuleEditor.tsx # 改：run/download/env 表单分支 + 校验
src/components/PreviewDialog.tsx  # 新：dry-run 预览面板
src/components/RuleList.tsx   # 改：空状态引导（可导入）
src/App.tsx                   # 改：预览/导入/导出入口 + 品牌名 + addTypes
src/theme.css                 # 改：badge-run/badge-download/hero-preview/preview-* 样式
index.html                    # 改：标题
electron-builder.yml          # 改：productName EnvDeploy + extraResources examples
examples/ai-coding-env.rules.json  # 新：AI 预设示例规则集
tests/env.test.ts             # 改：适配新签名 + 新增用例
tests/run.test.ts             # 新
tests/download.test.ts        # 新
tests/plan.test.ts            # 新
tests/ruleset.test.ts         # 新
```

---

## Task 1: env executor 增强（scope / pathPosition / remove）

**Files:**
- Modify: `shared/types.ts`
- Modify: `electron/core/executors/env.ts`
- Modify: `src/utils/rules.ts`
- Test: `tests/env.test.ts`

**Interfaces:**
- Produces: `EnvRule`（新增可选 `scope?: 'user'|'machine'`、`pathPosition?: 'append'|'prepend'`；`op` 加 `'remove'`）；env 导出 `ENV_USER_KEY`、`regRoot`、`removePath`、`buildRemoveScript`，`buildSetScript`/`buildReadScript` 改为首参 `root`。

- [ ] **Step 1: 改类型（`shared/types.ts`）**

替换第 34~41 行的 `EnvOp`/`EnvRule` 为：

```ts
export type EnvOp = 'set' | 'append_path' | 'remove'
export type EnvScope = 'user' | 'machine'
export type PathPosition = 'append' | 'prepend'

export interface EnvRule extends RuleBase {
  type: 'env'
  key: string
  value: string
  op: EnvOp
  scope?: EnvScope        // 缺省视为 'user'
  pathPosition?: PathPosition  // 仅 op=append_path 生效，缺省 'append'
}
```

- [ ] **Step 2: 写失败测试（`tests/env.test.ts`）**

把现有 `buildSetScript`/`buildReadScript` 用例改为带 root 首参，并新增 `regRoot`/`removePath`/`buildRemoveScript`/`mergePath` 位置用例。追加/替换：

```ts
import {
  ENV_KEY, ENV_USER_KEY, regRoot, buildReadScript, buildSetScript, buildRemoveScript,
  mergePath, removePath, psQuote,
} from '../electron/core/executors/env'

describe('regRoot', () => {
  it('user→HKCU，machine→HKLM', () => {
    expect(regRoot('user')).toBe(ENV_USER_KEY)
    expect(regRoot('machine')).toBe(ENV_KEY)
  })
})

describe('mergePath 位置', () => {
  it('prepend 插到最前', () => {
    expect(mergePath('C:\\a;C:\\b', 'C:\\c', 'prepend'))
      .toEqual({ value: 'C:\\c;C:\\a;C:\\b', changed: true })
  })
  it('append 追加到末尾（默认）', () => {
    expect(mergePath('C:\\a', 'C:\\c').value).toBe('C:\\a;C:\\c')
  })
})

describe('removePath', () => {
  it('大小写/尾斜杠不敏感移除', () => {
    expect(removePath('C:\\a;C:\\Tools\\;D:\\x', 'c:\\tools'))
      .toEqual({ value: 'C:\\a;D:\\x', changed: true })
  })
  it('不含则不变', () => {
    expect(removePath('C:\\a;C:\\b', 'C:\\z').changed).toBe(false)
  })
})

describe('buildSetScript(root,...)', () => {
  it('写入指定 root 并含广播', () => {
    const s = buildSetScript(ENV_USER_KEY, 'MY_VAR', 'hello')
    expect(s).toContain('Set-ItemProperty')
    expect(s).toContain('-Type String')
    expect(s).toContain(ENV_USER_KEY)
    expect(s).toContain('SendMessageTimeout')
  })
  it('含 % 用 ExpandString', () => {
    expect(buildSetScript(ENV_KEY, 'P', '%SystemRoot%\\bin')).toContain('-Type ExpandString')
  })
})

describe('buildRemoveScript', () => {
  it('用 Remove-ItemProperty 且含广播', () => {
    const s = buildRemoveScript(ENV_USER_KEY, 'MY_VAR')
    expect(s).toContain('Remove-ItemProperty')
    expect(s).toContain('MY_VAR')
    expect(s).toContain('SendMessageTimeout')
  })
})

describe('buildReadScript(root,...)', () => {
  it('读原始值不展开', () => {
    const s = buildReadScript(ENV_KEY, 'Path')
    expect(s).toContain('DoNotExpandEnvironmentNames')
    expect(s).toContain("'Path'")
  })
})
```

- [ ] **Step 3: 运行测试确认失败**

Run: `npx vitest run tests/env.test.ts`
Expected: FAIL（签名/导出不存在）。

- [ ] **Step 4: 改实现（`electron/core/executors/env.ts`）**

完整替换文件为：

```ts
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
```

> 注：`RuleExecutor` 接口在 Task 2 才加 `plan`。本任务的 `envExecutor` **不含 `plan` 方法**（否则对象字面量的多余属性会被 TS 拒绝）；`plan` 由 Task 2 统一补入。本步只落 `execute` + 导出的纯函数与常量。

- [ ] **Step 5: 更新 UI 工具（`src/utils/rules.ts`）**

`newRule` 的 env 分支改为带 scope/position：

```ts
    case 'env':
      return { ...base, type, key: '', value: '', op: 'set', scope: 'user', pathPosition: 'append' }
```

`ruleSummary` 的 env 分支替换为：

```ts
    case 'env': {
      const tag = r.scope === 'machine' ? '[机器]' : '[用户]'
      if (r.op === 'remove') return `${tag} 移除 ${r.key}${r.value ? ` (${r.value})` : ''}`
      if (r.op === 'append_path') return `${tag} ${r.key} ${r.pathPosition === 'prepend' ? '^=' : '+='} ${r.value}`
      return `${tag} ${r.key} = ${r.value}`
    }
```

- [ ] **Step 6: 运行测试与类型检查**

Run: `npm run test && npm run typecheck`
Expected: PASS。

- [ ] **Step 7: 提交**

```bash
git add shared/types.ts electron/core/executors/env.ts src/utils/rules.ts tests/env.test.ts
git commit -m "feat: env 支持用户级/机器级作用域、PATH 前置/后置、移除操作"
```

---

## Task 2: dry-run 基础设施（plan 接口 + planRules + 各 executor plan）

**Files:**
- Modify: `shared/types.ts`
- Modify: `electron/core/executor.ts`
- Modify: `electron/core/engine.ts`
- Modify: `electron/core/executors/{pack,import,json,env}.ts`
- Test: `tests/plan.test.ts`

**Interfaces:**
- Produces: `PlanChange`、`PlanResult`、`RulePlan` 类型；`RuleExecutor.plan(rule, ctx): Promise<PlanResult>`；`engine.planRules(rules, opts): Promise<RulePlan[]>`。
- Consumes: Task 1 的 env 纯函数。

- [ ] **Step 1: 加类型（`shared/types.ts`）**

在 `RuleResult` 之后插入：

```ts
export type PlanChangeKind = 'create' | 'modify' | 'delete' | 'run' | 'download' | 'noop'

export interface PlanChange {
  kind: PlanChangeKind
  detail: string
}

export interface PlanResult {
  noop: boolean
  changes: PlanChange[]
}

export interface RulePlan {
  ruleId: string
  name: string
  ok: boolean
  noop: boolean
  changes: PlanChange[]
  error?: string
}
```

- [ ] **Step 2: 加接口方法（`electron/core/executor.ts`）**

在 `execute` 上方加：

```ts
  plan(rule: T, ctx: ExecContext): Promise<PlanResult>
```

并 `import type { Rule, Settings, PlanResult } from '@shared/types'`。

- [ ] **Step 3: 写失败测试（`tests/plan.test.ts`）**

```ts
import fs from 'fs'
import os from 'os'
import path from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { jsonExecutor } from '../electron/core/executors/json'
import { packExecutor } from '../electron/core/executors/pack'
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
```

Run: `npx vitest run tests/plan.test.ts` → FAIL（plan 未实现）。

- [ ] **Step 4: 实现 `plan()`**

`electron/core/executors/pack.ts` —— 在 `validate` 与 `execute` 之间加：

```ts
  async plan(rule, ctx) {
    const source = path.normalize(expandVars(rule.source))
    const output = resolvePackagePath(ctx.baseDir, expandVars(rule.output))
    if (!fs.existsSync(source)) throw new Error(`源路径不存在: ${source}`)
    if (!output.toLowerCase().endsWith('.zip')) {
      return { noop: false, changes: [{ kind: 'create', detail: `复制文件 → ${output}` }] }
    }
    const files = fs.statSync(source).isFile()
      ? [{ abs: source, rel: path.basename(source) }]
      : collectFiles(source, normalizePatterns(rule.excludes))
    return { noop: false, changes: [{ kind: 'create', detail: `打包 ${files.length} 个文件 → ${output}` }] }
  },
```

`electron/core/executors/import.ts` —— 加：

```ts
  async plan(rule, ctx) {
    if (/^https?:\/\//i.test(rule.zip)) throw new Error('暂不支持远程 zip 源（未来扩展）')
    const src = resolvePackagePath(ctx.baseDir, expandVars(rule.zip))
    const target = path.normalize(expandVars(rule.target))
    if (!fs.existsSync(src) || !fs.statSync(src).isFile()) throw new Error(`源文件不存在: ${src}`)
    const changes: PlanChange[] = []
    if (fs.existsSync(target)) {
      changes.push({
        kind: 'delete',
        detail: ctx.settings.backupBeforeImport ? `备份并清空目标目录: ${target}` : `删除目标目录: ${target}`,
      })
    }
    changes.push({ kind: 'create', detail: `导入到 ${target}` })
    return { noop: false, changes }
  },
```

在 import.ts 顶部 `import type { ImportRule } from '@shared/types'` 改为 `import type { ImportRule, PlanChange } from '@shared/types'`。

`electron/core/executors/json.ts` —— 加：

```ts
  async plan(rule) {
    const filepath = path.normalize(expandVars(rule.file))
    const data = rule.data
    if (!isPlainObject(data)) return { noop: false, changes: [{ kind: 'modify', detail: '数据不是对象' }] }
    if (rule.op === 'overwrite') {
      const exists = fs.existsSync(filepath)
      return { noop: false, changes: [{ kind: exists ? 'modify' : 'create', detail: `全量写入 ${filepath}` }] }
    }
    if (!fs.existsSync(filepath)) throw new Error(`文件不存在: ${filepath}`)
    const existing: unknown = JSON.parse(fs.readFileSync(filepath, 'utf8'))
    if (!isPlainObject(existing)) throw new Error(`JSON 文件顶层不是对象: ${filepath}`)
    if (rule.op === 'append') {
      const conflicts = Object.keys(data).filter(k => k in existing)
      if (conflicts.length) throw new Error(`以下 key 已存在，无法追加: ${conflicts.join(', ')}`)
    } else if (rule.op === 'modify') {
      const missing = Object.keys(data).filter(k => !(k in existing))
      if (missing.length) throw new Error(`以下 key 不存在，无法修改: ${missing.join(', ')}`)
    }
    const merged = deepMerge(existing, data)
    if (JSON.stringify(merged) === JSON.stringify(existing)) {
      return { noop: true, changes: [{ kind: 'noop', detail: '已是目标状态，无变化' }] }
    }
    return {
      noop: false,
      changes: Object.keys(data).map(k => ({
        kind: (k in existing ? 'modify' : 'create') as PlanChange['kind'],
        detail: `${k}`,
      })),
    }
  },
```

在 json.ts 顶部改 `import type { JsonRule, PlanChange } from '@shared/types'`。

`electron/core/executors/env.ts` —— 在 `validate` 与 `execute` 之间插入 `plan()`：

```ts
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
```

- [ ] **Step 5: 引擎加 `planRules`（`electron/core/engine.ts`）**

`import type` 行加 `PlanResult, RulePlan`（PlanResult 供类型对齐，可省），并在文件末尾追加：

```ts
export async function planRules(
  rules: Rule[],
  opts: { baseDir: string; settings: Settings },
): Promise<RulePlan[]> {
  const out: RulePlan[] = []
  for (const rule of rules) {
    const ctx: ExecContext = { baseDir: opts.baseDir, settings: opts.settings, onProgress: () => {} }
    try {
      const res = await getExecutor(rule.type).plan(rule, ctx)
      out.push({ ruleId: rule.id, name: rule.name, ok: true, noop: res.noop, changes: res.changes })
    } catch (err) {
      out.push({
        ruleId: rule.id, name: rule.name, ok: false, noop: false, changes: [],
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }
  return out
}
```

顶部第 1 行 import 增加 `RulePlan`：`import type { ProgressEvent, Rule, RulePlan, RuleResult, RuleTypeInfo, Settings } from '@shared/types'`。

- [ ] **Step 6: 测试 + 类型检查**

Run: `npm run test && npm run typecheck`
Expected: PASS。

- [ ] **Step 7: 提交**

```bash
git add shared/types.ts electron/core/executor.ts electron/core/engine.ts electron/core/executors tests/plan.test.ts
git commit -m "feat: 规则引擎加只读 plan() 预演与 planRules（dry-run 基础）"
```

---

## Task 3: run executor

**Files:**
- Modify: `shared/types.ts`
- Create: `electron/core/executors/run.ts`
- Modify: `electron/core/engine.ts`
- Modify: `src/utils/rules.ts`
- Test: `tests/run.test.ts`

**Interfaces:**
- Produces: `RunRule`、`RunShell`；`'run'` 加入 `RuleType`/`Rule`；`runExecutor`；导出纯函数 `shellInvocation(shell, scriptFile)`、`scriptExt(shell)`。

- [ ] **Step 1: 类型（`shared/types.ts`）**

`RuleType` 加 `'run'`：

```ts
export type RuleType = 'pack' | 'import' | 'json' | 'env' | 'run'
```

在 `EnvRule` 之后加：

```ts
export type RunShell = 'powershell' | 'cmd'

export interface RunRule extends RuleBase {
  type: 'run'
  command: string
  shell: RunShell
  cwd: string
  elevated: boolean
}
```

`Rule` 联合加 `RunRule`：

```ts
export type Rule = PackRule | ImportRule | JsonRule | EnvRule | RunRule
```

- [ ] **Step 2: 失败测试（`tests/run.test.ts`）**

```ts
import { describe, expect, it } from 'vitest'
import { runExecutor, shellInvocation, scriptExt } from '../electron/core/executors/run'
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
```

Run: `npx vitest run tests/run.test.ts` → FAIL。

- [ ] **Step 3: 实现（`electron/core/executors/run.ts`）**

```ts
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
```

- [ ] **Step 4: 注册（`electron/core/engine.ts`）**

`import { runExecutor } from './executors/run'`，并把 `registerBuiltins` 的数组加入 `runExecutor`：

```ts
    for (const ex of [packExecutor, importExecutor, jsonExecutor, envExecutor, runExecutor]) {
```

- [ ] **Step 5: UI 工具（`src/utils/rules.ts`）**

`newRule` switch 加：

```ts
    case 'run':
      return { ...base, type, command: '', shell: 'powershell', cwd: '', elevated: false }
```

`ruleSummary` switch 加：

```ts
    case 'run': {
      const head = r.command.split(/\r?\n/).find(l => l.trim()) ?? '(空命令)'
      return `${r.shell}${r.elevated ? '·管理员' : ''}: ${head}`
    }
```

- [ ] **Step 6: 测试 + 类型检查**

Run: `npm run test && npm run typecheck`
Expected: PASS。

- [ ] **Step 7: 提交**

```bash
git add shared/types.ts electron/core/executors/run.ts electron/core/engine.ts src/utils/rules.ts tests/run.test.ts
git commit -m "feat: 新增 run 动作类型（多行脚本 + shell/cwd/提权）"
```

---

## Task 4: download executor

**Files:**
- Modify: `shared/types.ts`
- Create: `electron/core/executors/download.ts`
- Modify: `electron/core/engine.ts`
- Modify: `src/utils/rules.ts`
- Test: `tests/download.test.ts`

**Interfaces:**
- Produces: `DownloadRule`；`'download'` 加入 `RuleType`/`Rule`；`downloadExecutor`。

- [ ] **Step 1: 类型（`shared/types.ts`）**

`RuleType` 加 `'download'`：

```ts
export type RuleType = 'pack' | 'import' | 'json' | 'env' | 'run' | 'download'
```

在 `RunRule` 后加：

```ts
export interface DownloadRule extends RuleBase {
  type: 'download'
  url: string
  target: string
  overwrite: boolean
}
```

`Rule` 联合加 `DownloadRule`：

```ts
export type Rule = PackRule | ImportRule | JsonRule | EnvRule | RunRule | DownloadRule
```

- [ ] **Step 2: 失败测试（`tests/download.test.ts`）**

```ts
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
})
```

Run: `npx vitest run tests/download.test.ts` → FAIL。

- [ ] **Step 3: 实现（`electron/core/executors/download.ts`）**

```ts
import fs from 'fs'
import path from 'path'
import http from 'http'
import https from 'https'
import type { DownloadRule } from '@shared/types'
import type { ExecContext, RuleExecutor } from '../executor'
import { expandVars } from '../vars'

const MAX_REDIRECT = 5

function fetchTo(url: string, dest: string, ctx: ExecContext, redirects = 0): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    if (redirects > MAX_REDIRECT) return reject(new Error('重定向次数过多'))
    const mod = url.startsWith('https:') ? https : http
    const req = mod.get(url, res => {
      const status = res.statusCode ?? 0
      if (status >= 300 && status < 400 && res.headers.location) {
        res.resume()
        const next = new URL(res.headers.location, url).toString()
        resolve(fetchTo(next, dest, ctx, redirects + 1))
        return
      }
      if (status !== 200) {
        res.resume()
        reject(new Error(`下载失败，HTTP ${status}`))
        return
      }
      const total = Number(res.headers['content-length'] ?? 0)
      let received = 0
      const tmp = `${dest}.download`
      const out = fs.createWriteStream(tmp)
      res.on('data', chunk => {
        received += chunk.length
        ctx.onProgress(received, total || received, `${(received / 1048576).toFixed(1)} MiB`)
      })
      res.pipe(out)
      out.on('error', reject)
      out.on('finish', () => out.close(() => {
        fs.renameSync(tmp, dest)
        resolve()
      }))
    })
    req.on('error', reject)
  })
}

export const downloadExecutor: RuleExecutor<DownloadRule> = {
  type: 'download',
  label: '下载',

  validate(rule) {
    const errs: string[] = []
    if (!rule.url?.trim()) errs.push('下载地址不能为空')
    else if (!/^https?:\/\//i.test(rule.url.trim())) errs.push('仅支持 http/https 地址')
    if (!rule.target?.trim()) errs.push('保存路径不能为空')
    return errs
  },

  async plan(rule) {
    const target = path.normalize(expandVars(rule.target))
    if (fs.existsSync(target) && !rule.overwrite) {
      return { noop: true, changes: [{ kind: 'noop', detail: `已存在，跳过: ${target}` }] }
    }
    return { noop: false, changes: [{ kind: 'download', detail: `下载 ${rule.url} → ${target}` }] }
  },

  async execute(rule, ctx) {
    const url = expandVars(rule.url).trim()
    if (!/^https?:\/\//i.test(url)) throw new Error('仅支持 http/https 地址')
    const target = path.normalize(expandVars(rule.target))
    if (fs.existsSync(target) && !rule.overwrite) {
      ctx.onProgress(1, 1, path.basename(target))
      return `目标已存在，跳过下载: ${target}`
    }
    fs.mkdirSync(path.dirname(target), { recursive: true })
    ctx.onProgress(0, 1, path.basename(target))
    await fetchTo(url, target, ctx)
    return `已下载到 ${target}`
  },
}
```

- [ ] **Step 4: 注册（`electron/core/engine.ts`）**

`import { downloadExecutor } from './executors/download'`，加入 `registerBuiltins`：

```ts
    for (const ex of [packExecutor, importExecutor, jsonExecutor, envExecutor, runExecutor, downloadExecutor]) {
```

- [ ] **Step 5: UI 工具（`src/utils/rules.ts`）**

`newRule` 加：

```ts
    case 'download':
      return { ...base, type, url: '', target: '', overwrite: false }
```

`ruleSummary` 加：

```ts
    case 'download':
      return `${r.url} → ${r.target}`
```

- [ ] **Step 6: 测试 + 类型检查**

Run: `npm run test && npm run typecheck`
Expected: PASS。

- [ ] **Step 7: 提交**

```bash
git add shared/types.ts electron/core/executors/download.ts electron/core/engine.ts src/utils/rules.ts tests/download.test.ts
git commit -m "feat: 新增 download 动作类型（URL 下载 + 覆盖开关 + 进度）"
```

---

## Task 5: 改名 EnvDeploy + 默认配置通用化 + 示例规则集

**Files:**
- Modify: `electron-builder.yml`
- Modify: `package.json`
- Modify: `index.html`
- Modify: `electron/core/config.ts`
- Modify: `src/App.tsx`（仅品牌名一处）
- Create: `examples/ai-coding-env.rules.json`

**Interfaces:**
- Produces: `defaultConfig()` 返回空 `rules: []`。

- [ ] **Step 1: 默认配置置空（`electron/core/config.ts`）**

`defaultConfig()` 的 `rules` 数组替换为 `[]`（保留 version/settings/selectionMemory/uiState）：

```ts
export function defaultConfig(): AppConfig {
  return {
    version: 1,
    rules: [],
    settings: { backupBeforeImport: true },
    selectionMemory: { pack: {}, deploy: {} },
    uiState: {},
  }
}
```

删除文件顶部现在未使用的 `import { randomUUID } from 'crypto'`（若无其它引用）。

- [ ] **Step 2: 示例规则集（`examples/ai-coding-env.rules.json`）**

```json
{
  "version": 1,
  "rules": [
    { "type": "pack", "name": "导出 Claude 配置", "enabled": true, "source": "${USERPROFILE}/.claude", "output": "claude.zip", "excludes": ["projects", "shell-snapshots", "todos", "plugins", "session-env"] },
    { "type": "import", "name": "部署 Claude 配置", "enabled": true, "zip": "claude.zip", "target": "${USERPROFILE}/.claude", "preserve": [], "rename": "" },
    { "type": "env", "name": "Python 控制台 UTF-8", "enabled": true, "key": "PYTHONUTF8", "value": "1", "op": "set", "scope": "user" }
  ]
}
```

- [ ] **Step 3: 品牌与标题**

`src/App.tsx` 第 118 行品牌文案改为：

```tsx
        <div className="brand">🧩 环境部署工具</div>
```

`index.html` 的 `<title>` 改为 `环境部署工具`。

`electron/main.ts` `createWindow` 的 `BrowserWindow` 选项加 `title: '环境部署工具'`（在 `width` 上方或任意位置）。

- [ ] **Step 4: 打包配置（`electron-builder.yml`）**

```yaml
appId: com.loong.envdeploy
productName: EnvDeploy
directories:
  output: release
files:
  - out/**
extraResources:
  - examples/**
win:
  target: portable
portable:
  artifactName: ${productName}-${version}.exe
electronLanguages:
  - zh-CN
```

`package.json` 的 `description` 改为 `通用环境部署工具（EnvDeploy）`；`name`、`version` 不动。

- [ ] **Step 5: 测试 + 类型检查**

Run: `npm run test && npm run typecheck`
Expected: PASS（注意：若有测试断言 defaultConfig 含 3 条规则，需同步更新；当前测试无此断言）。

- [ ] **Step 6: 提交**

```bash
git add electron-builder.yml package.json index.html electron/core/config.ts electron/main.ts src/App.tsx examples/ai-coding-env.rules.json
git commit -m "feat: 改名 EnvDeploy、默认配置通用化、内置 AI 示例规则集"
```

---

## Task 6: 规则集导入/导出（core + IPC + api）

**Files:**
- Create: `electron/core/ruleset.ts`
- Modify: `electron/main.ts`
- Modify: `electron/preload.ts`
- Modify: `shared/api.ts`
- Test: `tests/ruleset.test.ts`

**Interfaces:**
- Produces: `serializeRuleset(rules): string`、`parseRuleset(text): Rule[]`（重生 id + 校验）；IPC `ruleset:export|import|import-example`、`rules:plan`；`Api.planRules/exportRules/importRules/importExample`。

- [ ] **Step 1: 失败测试（`tests/ruleset.test.ts`）**

```ts
import { beforeAll, describe, expect, it } from 'vitest'
import { serializeRuleset, parseRuleset } from '../electron/core/ruleset'
import { registerBuiltins } from '../electron/core/engine'
import type { Rule } from '@shared/types'

beforeAll(() => registerBuiltins())

const sample: Rule[] = [
  { id: 'x', type: 'env', name: '示例', enabled: true, key: 'FOO', value: '1', op: 'set', scope: 'user' },
]

describe('serializeRuleset', () => {
  it('剥离 id，带 version', () => {
    const doc = JSON.parse(serializeRuleset(sample))
    expect(doc.version).toBe(1)
    expect(doc.rules[0].id).toBeUndefined()
    expect(doc.rules[0].name).toBe('示例')
  })
})

describe('parseRuleset', () => {
  it('重新生成 id 并通过校验', () => {
    const out = parseRuleset(serializeRuleset(sample))
    expect(out).toHaveLength(1)
    expect(out[0].id).toBeTruthy()
    expect(out[0].id).not.toBe('x')
  })
  it('非法 JSON 报错', () => {
    expect(() => parseRuleset('{bad')).toThrow()
  })
  it('版本不支持报错', () => {
    expect(() => parseRuleset(JSON.stringify({ version: 99, rules: [] }))).toThrow()
  })
  it('未知规则类型报错', () => {
    expect(() => parseRuleset(JSON.stringify({ version: 1, rules: [{ type: 'nope', name: 'n' }] }))).toThrow()
  })
})
```

Run: `npx vitest run tests/ruleset.test.ts` → FAIL。

- [ ] **Step 2: 实现（`electron/core/ruleset.ts`）**

```ts
import { randomUUID } from 'crypto'
import type { Rule } from '@shared/types'
import { validateRule } from './engine'

const RULESET_VERSION = 1

export function serializeRuleset(rules: Rule[]): string {
  const stripped = rules.map(({ id: _id, ...rest }) => rest)
  return JSON.stringify({ version: RULESET_VERSION, rules: stripped }, null, 2)
}

export function parseRuleset(text: string): Rule[] {
  let doc: unknown
  try {
    doc = JSON.parse(text)
  } catch {
    throw new Error('文件不是合法 JSON')
  }
  if (typeof doc !== 'object' || doc === null) throw new Error('规则集格式错误')
  const d = doc as { version?: unknown; rules?: unknown }
  if (d.version !== RULESET_VERSION) throw new Error(`不支持的规则集版本: ${String(d.version)}`)
  if (!Array.isArray(d.rules)) throw new Error('规则集缺少 rules 数组')
  const rules = d.rules.map(r => ({ ...(r as Record<string, unknown>), id: randomUUID() }) as Rule)
  for (const r of rules) {
    const errs = validateRule(r)
    if (errs.length) throw new Error(`规则「${r.name || '未命名'}」校验失败: ${errs.join('; ')}`)
  }
  return rules
}
```

- [ ] **Step 3: IPC（`electron/main.ts`）**

顶部 import 增补：

```ts
import { listRuleTypes, planRules, registerBuiltins, runRules } from './core/engine'
import { parseRuleset, serializeRuleset } from './core/ruleset'
import fs from 'fs'
```

在 `app.whenReady().then(() => { ... })` 内、`rules:run` 之后加：

```ts
  ipcMain.handle('rules:plan', async (_e, ruleIds: string[]) => {
    const cfg = loadConfig(appDir())
    const rules = ruleIds
      .map(id => cfg.rules.find(r => r.id === id))
      .filter((r): r is NonNullable<typeof r> => r !== undefined)
    return planRules(rules, { baseDir: appDir(), settings: cfg.settings })
  })

  ipcMain.handle('ruleset:export', async (_e, ruleIds: string[]) => {
    const cfg = loadConfig(appDir())
    const rules = cfg.rules.filter(r => ruleIds.includes(r.id))
    const r = await dialog.showSaveDialog({
      defaultPath: 'ruleset.rules.json',
      filters: [{ name: '规则集', extensions: ['json'] }],
    })
    if (r.canceled || !r.filePath) return { ok: false, canceled: true }
    fs.writeFileSync(r.filePath, serializeRuleset(rules), 'utf8')
    return { ok: true, path: r.filePath }
  })

  const importFrom = (file: string): { ok: boolean; config?: AppConfig; added?: number; error?: string } => {
    try {
      const imported = parseRuleset(fs.readFileSync(file, 'utf8'))
      const cfg = loadConfig(appDir())
      cfg.rules = [...cfg.rules, ...imported]
      saveConfig(appDir(), cfg)
      return { ok: true, config: cfg, added: imported.length }
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) }
    }
  }

  ipcMain.handle('ruleset:import', async () => {
    const r = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [{ name: '规则集', extensions: ['json'] }],
    })
    if (r.canceled) return { ok: false, canceled: true }
    return importFrom(r.filePaths[0])
  })

  ipcMain.handle('ruleset:import-example', () => {
    const file = app.isPackaged
      ? path.join(process.resourcesPath, 'examples', 'ai-coding-env.rules.json')
      : path.join(process.cwd(), 'examples', 'ai-coding-env.rules.json')
    return importFrom(file)
  })
```

- [ ] **Step 4: preload（`electron/preload.ts`）**

在 `api` 对象里 `runRules` 之后加：

```ts
  planRules: (ids: string[]) => ipcRenderer.invoke('rules:plan', ids),
  exportRules: (ids: string[]) => ipcRenderer.invoke('ruleset:export', ids),
  importRules: () => ipcRenderer.invoke('ruleset:import'),
  importExample: () => ipcRenderer.invoke('ruleset:import-example'),
```

- [ ] **Step 5: Api 类型（`shared/api.ts`）**

`import type` 行加 `RulePlan`；在接口内加：

```ts
  planRules(ruleIds: string[]): Promise<RulePlan[]>
  exportRules(ruleIds: string[]): Promise<{ ok: boolean; path?: string; canceled?: boolean }>
  importRules(): Promise<{ ok: boolean; config?: AppConfig; added?: number; canceled?: boolean; error?: string }>
  importExample(): Promise<{ ok: boolean; config?: AppConfig; added?: number; error?: string }>
```

- [ ] **Step 6: 测试 + 类型检查**

Run: `npm run test && npm run typecheck`
Expected: PASS。

- [ ] **Step 7: 提交**

```bash
git add electron/core/ruleset.ts electron/main.ts electron/preload.ts shared/api.ts tests/ruleset.test.ts
git commit -m "feat: 规则集导入/导出与 dry-run/示例导入 IPC 通道"
```

---

## Task 7: RuleEditor 表单（run / download / env 增强）

**Files:**
- Modify: `src/components/RuleEditor.tsx`
- Modify: `src/App.tsx`（deploy 页 `addTypes`）
- Modify: `src/theme.css`（badge-run/badge-download）

**Interfaces:**
- Consumes: `RunShell`、`EnvScope`、`PathPosition`、`EnvOp`、`RunRule`、`DownloadRule`。

- [ ] **Step 1: 编辑器表单（`src/components/RuleEditor.tsx`）**

顶部类型 import 改为：

```ts
import type { EnvOp, EnvScope, JsonOp, PathPosition, Rule, RunShell } from '@shared/types'
```

`save()` 的 `switch (final.type)` 内，`env` 分支之后加：

```ts
      case 'run':
        if (!final.command.trim()) errs.push('命令不能为空')
        break
      case 'download':
        if (!final.url.trim()) errs.push('下载地址不能为空')
        else if (!/^https?:\/\//i.test(final.url.trim())) errs.push('仅支持 http/https 地址')
        if (!final.target.trim()) errs.push('保存路径不能为空')
        break
```

把现有 env 分支（第 151~166 行）整段替换为增强版：

```tsx
      {draft.type === 'env' && (
        <>
          <Field label="作用域">
            <select value={draft.scope ?? 'user'} onChange={e => patch({ scope: e.target.value as EnvScope })}>
              <option value="user">用户级（HKCU，免管理员）</option>
              <option value="machine">机器级（HKLM，需管理员）</option>
            </select>
          </Field>
          <Field label="变量名">
            <input value={draft.key} placeholder="PYTHONUTF8 / Path" onChange={e => patch({ key: e.target.value })} />
          </Field>
          <Field label="值（支持 ${VAR} 环境变量；含 % 时按可展开字符串写入）">
            <input value={draft.value} onChange={e => patch({ value: e.target.value })} />
          </Field>
          <Field label="操作">
            <select value={draft.op} onChange={e => patch({ op: e.target.value as EnvOp })}>
              <option value="set">set — 直接设置变量值</option>
              <option value="append_path">append_path — 追加到分号分隔列表（自动去重）</option>
              <option value="remove">remove — 删除变量 / 从 PATH 移除该值</option>
            </select>
          </Field>
          {draft.op === 'append_path' && (
            <Field label="插入位置">
              <select value={draft.pathPosition ?? 'append'} onChange={e => patch({ pathPosition: e.target.value as PathPosition })}>
                <option value="append">追加到末尾</option>
                <option value="prepend">插入到最前（优先生效）</option>
              </select>
            </Field>
          )}
        </>
      )}

      {draft.type === 'run' && (
        <>
          <Field label="Shell">
            <select value={draft.shell} onChange={e => patch({ shell: e.target.value as RunShell })}>
              <option value="powershell">PowerShell</option>
              <option value="cmd">CMD</option>
            </select>
          </Field>
          <Field label="命令（多行脚本，支持 ${VAR} 环境变量）">
            <textarea rows={8} value={draft.command} spellCheck={false} onChange={e => patch({ command: e.target.value })} />
          </Field>
          <Field label="工作目录（可选，支持 ${VAR}）">
            <PathRow value={draft.cwd} onChange={v => patch({ cwd: v })} pick="dir" />
          </Field>
          <label className="check-item">
            <input type="checkbox" checked={draft.elevated} onChange={e => patch({ elevated: e.target.checked })} />
            <span>以管理员身份运行（非管理员时会弹 UAC）</span>
          </label>
        </>
      )}

      {draft.type === 'download' && (
        <>
          <Field label="下载地址（http/https）">
            <input value={draft.url} placeholder="https://example.com/tool.zip" onChange={e => patch({ url: e.target.value })} />
          </Field>
          <Field label="保存到（支持 ${VAR} 环境变量）">
            <PathRow value={draft.target} onChange={v => patch({ target: v })} pick="file" placeholder="${USERPROFILE}/Downloads/tool.zip" />
          </Field>
          <label className="check-item">
            <input type="checkbox" checked={draft.overwrite} onChange={e => patch({ overwrite: e.target.checked })} />
            <span>已存在时覆盖重新下载</span>
          </label>
        </>
      )}
```

- [ ] **Step 2: deploy 页可新建 run/download（`src/App.tsx`）**

deploy 页 `RuleList` 的 `addTypes` 改为：

```tsx
              addTypes={['import', 'json', 'env', 'run', 'download']}
```

- [ ] **Step 3: 徽章样式（`src/theme.css`）**

参照已有 `.badge-env`/`.badge-json` 的写法，补两条（配色自选，与现有区分）：

```css
.badge-run { background: #7c3aed33; color: #c4b5fd; }
.badge-download { background: #0891b233; color: #67e8f9; }
```

- [ ] **Step 4: 类型检查 + 手动核对**

Run: `npm run typecheck && npm run test`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add src/components/RuleEditor.tsx src/App.tsx src/theme.css
git commit -m "feat: 规则编辑器支持 run/download 表单与 env 作用域/位置/移除"
```

---

## Task 8: dry-run 预览面板与流程

**Files:**
- Create: `src/components/PreviewDialog.tsx`
- Modify: `src/App.tsx`
- Modify: `src/theme.css`（preview-* / hero-preview）

**Interfaces:**
- Consumes: `Api.planRules`、`RulePlan`。

- [ ] **Step 1: 预览面板（`src/components/PreviewDialog.tsx`）**

```tsx
import type { RulePlan } from '@shared/types'
import Modal from './Modal'

interface Props {
  plans: RulePlan[]
  onConfirm(): void
  onCancel(): void
}

export default function PreviewDialog({ plans, onConfirm, onCancel }: Props) {
  const noop = plans.filter(p => p.ok && p.noop).length
  const err = plans.filter(p => !p.ok).length
  return (
    <Modal
      title="部署预览"
      onClose={onCancel}
      footer={
        <>
          <div className="spacer" />
          <button className="btn" onClick={onCancel}>取消</button>
          <button className="btn btn-primary" onClick={onConfirm}>确认执行</button>
        </>
      }
    >
      <div className="preview-summary dim">共 {plans.length} 条 · {noop} 条无变化 · {err} 条预检失败</div>
      <div className="preview-list">
        {plans.map(p => (
          <div key={p.ruleId} className={!p.ok ? 'preview-item err' : p.noop ? 'preview-item noop' : 'preview-item'}>
            <div className="preview-head">
              <span className="name">{p.name}</span>
              {p.ok && p.noop && <span className="tag">无变化</span>}
              {!p.ok && <span className="tag tag-err">预检失败</span>}
            </div>
            {p.ok
              ? p.changes.map((c, i) => <div key={i} className="preview-change">• {c.detail}</div>)
              : <div className="preview-change err">✗ {p.error}</div>}
          </div>
        ))}
      </div>
    </Modal>
  )
}
```

- [ ] **Step 2: App 接线（`src/App.tsx`）**

import 加 `import PreviewDialog from './components/PreviewDialog'` 与类型 `RulePlan`。

`selecting` state 扩展为含 `'preview'`：

```tsx
  const [selecting, setSelecting] = useState<'pack' | 'deploy' | 'preview' | null>(null)
  const [preview, setPreview] = useState<{ ids: string[]; plans: RulePlan[] } | null>(null)
```

topbar 在「一键部署」按钮之后加预览按钮：

```tsx
        <button className="hero hero-preview" onClick={() => setSelecting('preview')}>预览</button>
```

新增预览处理函数（放在 `confirmSelection` 附近）：

```tsx
  const doPreview = async (ids: string[], memory: Record<string, boolean>): Promise<void> => {
    setSelecting(null)
    update(c => ({ ...c, selectionMemory: { ...c.selectionMemory, deploy: memory } }))
    if (!ids.length) return
    const plans = await window.api.planRules(ids)
    setPreview({ ids, plans })
  }
```

`SelectionDialog` 渲染块改为支持 preview（替换现有 `{selecting && (...)}`）：

```tsx
      {selecting && (
        <SelectionDialog
          title={selecting === 'pack' ? '选择要打包的规则' : selecting === 'preview' ? '选择要预览的规则' : '选择要部署的规则'}
          rules={(selecting === 'pack' ? packRules : deployRules).filter(r => r.enabled)}
          memory={config.selectionMemory[selecting === 'pack' ? 'pack' : 'deploy']}
          onConfirm={(ids, memory) =>
            selecting === 'preview' ? void doPreview(ids, memory)
              : confirmSelection(selecting === 'pack' ? 'pack' : 'deploy', ids, memory)}
          onCancel={() => setSelecting(null)}
        />
      )}
```

在 `RunOverlay` 之前加 PreviewDialog：

```tsx
      {preview && (
        <PreviewDialog
          plans={preview.plans}
          onConfirm={() => { const ids = preview.ids; setPreview(null); void runIds(ids) }}
          onCancel={() => setPreview(null)}
        />
      )}
```

- [ ] **Step 3: 样式（`src/theme.css`）**

参照现有 `.hero-deploy` 加 `.hero-preview`（配色区分），并加预览列表样式：

```css
.hero-preview { background: #334155; color: #e2e8f0; }
.preview-summary { margin-bottom: 8px; }
.preview-list { display: flex; flex-direction: column; gap: 8px; max-height: 52vh; overflow: auto; }
.preview-item { padding: 8px 10px; border: 1px solid #2a2f3a; border-radius: 8px; }
.preview-item.noop { opacity: 0.6; }
.preview-item.err { border-color: #7f1d1d; }
.preview-head { display: flex; align-items: center; gap: 8px; }
.preview-head .name { font-weight: 600; }
.preview-head .tag { font-size: 12px; padding: 1px 6px; border-radius: 6px; background: #334155; color: #cbd5e1; }
.preview-head .tag-err { background: #7f1d1d; color: #fecaca; }
.preview-change { font-size: 13px; color: #94a3b8; margin-top: 3px; }
.preview-change.err { color: #fca5a5; }
```

- [ ] **Step 4: 类型检查 + 手动核对**

Run: `npm run typecheck && npm run test`
Expected: PASS。手动：`npm run dev` → 点「预览」→ 选规则 → 看到差异/无变化 → 确认执行。

- [ ] **Step 5: 提交**

```bash
git add src/components/PreviewDialog.tsx src/App.tsx src/theme.css
git commit -m "feat: 执行前 dry-run 预览（真实差异 + 幂等无变化标记）"
```

---

## Task 9: 规则集导入/导出入口 + 空状态引导

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/components/RuleList.tsx`
- Modify: `src/components/SettingsDialog.tsx`（导出入口，可选放此）

**Interfaces:**
- Consumes: `Api.exportRules/importRules/importExample`。

- [ ] **Step 1: App 顶栏加导入/导出（`src/App.tsx`）**

`selecting` 扩展含 `'export'`：

```tsx
  const [selecting, setSelecting] = useState<'pack' | 'deploy' | 'preview' | 'export' | null>(null)
```

topbar 在 `⚙` 设置按钮前加两个按钮：

```tsx
        <button className="icon-btn" title="导入规则集" onClick={() => void doImport()}>⬇</button>
        <button className="icon-btn" title="导出规则集" onClick={() => setSelecting('export')}>⬆</button>
```

新增处理函数：

```tsx
  const applyImportResult = (r: { ok: boolean; config?: AppConfig; added?: number; canceled?: boolean; error?: string }): void => {
    if (r.canceled) return
    if (r.ok && r.config) {
      setConfig(r.config)
      setLogs(l => [{ time: new Date().toLocaleString(), ok: true, summary: `已导入 ${r.added ?? 0} 条规则`, details: [] }, ...l])
    } else {
      setLogs(l => [{ time: new Date().toLocaleString(), ok: false, summary: `导入失败: ${r.error ?? '未知错误'}`, details: [] }, ...l])
    }
  }

  const doImport = async (): Promise<void> => { applyImportResult(await window.api.importRules()) }
  const doImportExample = async (): Promise<void> => { applyImportResult(await window.api.importExample()) }

  const doExport = async (ids: string[], memory: Record<string, boolean>): Promise<void> => {
    setSelecting(null)
    update(c => ({ ...c, selectionMemory: { ...c.selectionMemory, deploy: memory } }))
    if (!ids.length) return
    const r = await window.api.exportRules(ids)
    if (r.ok) setLogs(l => [{ time: new Date().toLocaleString(), ok: true, summary: `已导出到 ${r.path}`, details: [] }, ...l])
  }
```

`SelectionDialog` 块支持 `'export'`（导出面向全部规则）：把上一步的 SelectionDialog 渲染扩展——当 `selecting === 'export'` 时 `rules` 用 `config.rules`（不限 enabled），`title` 为「选择要导出的规则」，`onConfirm` 调 `doExport`。合并后的完整块：

```tsx
      {selecting && (
        <SelectionDialog
          title={
            selecting === 'pack' ? '选择要打包的规则'
              : selecting === 'preview' ? '选择要预览的规则'
              : selecting === 'export' ? '选择要导出的规则'
              : '选择要部署的规则'
          }
          rules={
            selecting === 'export' ? config.rules
              : (selecting === 'pack' ? packRules : deployRules).filter(r => r.enabled)
          }
          memory={config.selectionMemory[selecting === 'pack' ? 'pack' : 'deploy']}
          onConfirm={(ids, memory) => {
            if (selecting === 'preview') return void doPreview(ids, memory)
            if (selecting === 'export') return void doExport(ids, memory)
            confirmSelection(selecting === 'pack' ? 'pack' : 'deploy', ids, memory)
          }}
          onCancel={() => setSelecting(null)}
        />
      )}
```

- [ ] **Step 2: 空状态引导（`src/components/RuleList.tsx`）**

给 `Props` 加可选回调：

```ts
  onImport?(): void
  onImportExample?(): void
```

把现有空状态：

```tsx
      {filtered.length === 0 && <div className="empty">暂无规则，点击右上角新建</div>}
```

替换为：

```tsx
      {filtered.length === 0 && (
        <div className="empty">
          <div>暂无规则</div>
          <div className="empty-actions">
            {props.addTypes[0] && (
              <button className="btn" onClick={() => props.onAdd(props.addTypes[0])}>＋ 新建规则</button>
            )}
            {props.onImport && <button className="btn" onClick={props.onImport}>导入规则集</button>}
            {props.onImportExample && <button className="btn" onClick={props.onImportExample}>导入 AI 示例</button>}
          </div>
        </div>
      )}
```

`App.tsx` 给 deploy 页 `RuleList` 传 `onImport={() => void doImport()} onImportExample={() => void doImportExample()}`（pack 页可只传 onImport）。

- [ ] **Step 3: 空状态样式（`src/theme.css`）**

```css
.empty-actions { display: flex; gap: 8px; justify-content: center; margin-top: 10px; }
```

- [ ] **Step 4: 类型检查 + 手动核对**

Run: `npm run typecheck && npm run test`
Expected: PASS。手动：导出选中规则 → `.rules.json`；空配置下「导入 AI 示例」→ 出现 3 条规则。

- [ ] **Step 5: 提交**

```bash
git add src/App.tsx src/components/RuleList.tsx src/theme.css
git commit -m "feat: 规则集导入/导出入口与空状态引导"
```

---

## Task 10: 收尾——README 与整体验证

**Files:**
- Modify: `README.md`

- [ ] **Step 1: 更新 README**

改标题为 EnvDeploy / 通用环境部署工具；补 run/download/env 增强/预览/规则集导入导出说明；去掉「AI 编程环境专用」表述，改为「AI 编程环境作为示例规则集」。

- [ ] **Step 2: 全量验证**

Run: `npm run test && npm run typecheck && npm run build`
Expected: 测试全绿、tsc 0 错、electron-vite build 成功。

- [ ] **Step 3: 便携产物冒烟（可选，手动）**

Run: `npm run dist`
Expected: 生成 `release/EnvDeploy-2.0.0.exe`；双击后 config.json 为空规则集；`examples/ai-coding-env.rules.json` 存在于 resources；「导入 AI 示例」可载入。

- [ ] **Step 4: 提交**

```bash
git add README.md
git commit -m "docs: README 更新为 EnvDeploy 通用环境部署工具"
```

---

## 自查

- **Spec 覆盖**：命名(T5)、run(T3)、download(T4)、env 增强(T1)、dry-run(T2 引擎 + T8 UI)、规则集导入导出(T6 core/IPC + T9 UI) 均有对应任务。
- **占位符**：无 TODO/TBD；每个代码步骤含完整代码。
- **类型一致性**：`plan`/`PlanResult`/`RulePlan` 在 executor.ts、engine.ts、各 executor、preload、api、PreviewDialog 中签名一致；`EnvOp`/`EnvScope`/`PathPosition`/`RunShell` 命名跨 types/utils/RuleEditor 一致；`RuleType`/`Rule` 联合随 T1/T3/T4 增量扩展且各任务末尾编译绿。
