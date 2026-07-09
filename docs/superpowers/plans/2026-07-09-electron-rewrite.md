# jz-aicoding-env-tool v2 (Electron 重写) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 用 Electron + React + TypeScript 从零重写一键搭建 AI 编程环境的桌面工具,只保留「机器开发环境部署」能力(打包/导入/JSON/环境变量四种规则),可插拔规则引擎。

**Architecture:** 主进程(electron/core)承载纯 Node 的规则引擎——执行器注册表 + 四个内置执行器 + 配置管理,不依赖任何窗口对象;preload 暴露类型安全的 `window.api`;渲染层 React 单页(侧边导航 + 规则卡片列表 + 模态编辑/多选/进度/结果)。核心引擎全部 Vitest 单测,UI 手动验证。

**Tech Stack:** Electron, electron-vite, React 18+, TypeScript(strict), archiver(写 zip), node-stream-zip(读 zip), minimatch(通配符), electron-builder(portable 单 exe), Vitest。

**Spec:** `docs/superpowers/specs/2026-07-09-electron-rewrite-design.md`

## Global Constraints

- **仅支持 Windows**:不写任何跨平台抽象或兼容分支;可直接假定 PowerShell、HKLM、`;` 分隔 PATH。
- **零历史包袱**:不复用、不 import 旧 Python 代码;Task 1 全部删除。
- **配置格式**:统一规则表(`rules: Rule[]`,带 `type`/`id`/`enabled`),`config.json` 位于 exe 同目录,不迁移旧格式。
- **路径变量**:所有规则的路径/值字段支持 `${VAR}` 环境变量占位符,执行时展开,未定义变量报错。
- **UI 文案全部中文**;界面为全新深色主题设计,不参考旧版 tkinter 布局。
- **引擎层(electron/core/**)禁止 import electron**,保证可被 Vitest 直接测试、未来可被 CLI 复用。
- **依赖白名单**:runtime 仅 `react react-dom archiver node-stream-zip minimatch`;dev 仅 `electron electron-vite electron-builder typescript vite @vitejs/plugin-react vitest @types/*`。不新增其它依赖。
- **TypeScript strict: true**;提交前 `npx tsc --noEmit` 必须零错误。
- **提交规范**:沿用仓库现状——`feat:`/`fix:`/`docs:`/`chore:` + 中文摘要,每条提交末尾加 `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`。
- **测试命令**:`npm test`(= `vitest run`),测试文件放 `tests/*.test.ts`。

## 最终目录结构(全部任务完成后)

```
├── electron/
│   ├── main.ts                  # 窗口 + IPC 注册(唯一允许 import electron 的层之一)
│   ├── preload.ts               # contextBridge 暴露 window.api
│   └── core/                    # 纯 Node 引擎,禁止 import electron
│       ├── executor.ts          # RuleExecutor / ExecContext 接口
│       ├── engine.ts            # 注册表 + validateRule + runRules
│       ├── config.ts            # 配置读写 / 默认配置 / 备份恢复
│       ├── vars.ts              # ${VAR} 展开
│       ├── match.ts             # 通配符匹配(excludes/preserve 共用)
│       ├── fswalk.ts            # collectFiles / collectPreserved
│       ├── paths.ts             # packages 目录解析
│       └── executors/
│           ├── pack.ts
│           ├── import.ts
│           ├── json.ts
│           └── env.ts
├── shared/
│   ├── types.ts                 # Rule/AppConfig/RuleResult/ProgressEvent 等
│   └── api.ts                   # window.api 的接口类型
├── src/                         # React 渲染层
│   ├── main.tsx
│   ├── App.tsx
│   ├── global.d.ts
│   ├── theme.css
│   ├── utils/rules.ts           # newRule / moveRule / ruleSummary
│   ├── pages/LogsPage.tsx
│   └── components/
│       ├── Modal.tsx
│       ├── TagInput.tsx
│       ├── RuleCard.tsx
│       ├── RuleList.tsx
│       ├── RuleEditor.tsx
│       ├── SelectionDialog.tsx
│       ├── RunOverlay.tsx
│       └── SettingsDialog.tsx
├── tests/                       # Vitest
├── index.html
├── electron.vite.config.ts
├── vitest.config.ts
├── tsconfig.json
├── electron-builder.yml
└── package.json
```

---

### Task 1: 清理旧 Python 实现

**Files:**
- Delete(git 跟踪): `main.py`, `config.py`, `core/`(全部), `ui/`(全部)
- Delete(未跟踪产物): `build/`, `dist/`, `__pycache__/`, `plugins/`, `Administrator/`, `DeployConfigTool.spec`, `config.json`, `config_backups/`, `packages/`
- Rewrite: `.gitignore`

**Interfaces:**
- Consumes: 无
- Produces: 干净的仓库(只剩 `.gitignore`、`README.md`、`docs/`、`.claude/`)

- [ ] **Step 1: 删除 git 跟踪的 Python 源码**

```bash
git rm -r main.py config.py core ui
```

- [ ] **Step 2: 删除未跟踪的旧产物**

```bash
rm -rf build dist __pycache__ plugins Administrator DeployConfigTool.spec config.json config_backups packages
```

- [ ] **Step 3: 重写 .gitignore**

写入 `.gitignore`(整文件覆盖):

```
node_modules/
out/
release/
dist/
config.json
config_backups/
packages/
*.log
```

- [ ] **Step 4: 验证仓库只剩预期文件**

Run: `git status --short && git ls-files`
Expected: ls-files 仅剩 `.gitignore`、`README.md`、`docs/...`;status 显示删除与 .gitignore 修改。

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: 移除旧 Python 实现，为 Electron 重写清场

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: 脚手架 — electron-vite + React + TS + Vitest

**Files:**
- Create: `package.json`, `tsconfig.json`, `electron.vite.config.ts`, `vitest.config.ts`, `index.html`, `electron/main.ts`(临时最小版), `electron/preload.ts`(临时空桥), `src/main.tsx`, `src/App.tsx`(占位), `src/theme.css`(空文件占位), `tests/smoke.test.ts`

**Interfaces:**
- Consumes: 无
- Produces: `npm run dev` 打开窗口显示占位页;`npm test` 通过;`npx tsc --noEmit` 零错误。别名 `@shared/*` → `shared/*` 在 main/preload/renderer/vitest 四处一致可用。

- [ ] **Step 1: 初始化 package.json 并安装依赖**

创建 `package.json`:

```json
{
  "name": "jz-aicoding-env-tool",
  "version": "2.0.0",
  "description": "一键搭建 AI 编程环境的桌面工具",
  "main": "out/main/index.js",
  "author": "Loong",
  "license": "MIT",
  "scripts": {
    "dev": "electron-vite dev",
    "build": "electron-vite build",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "dist": "electron-vite build && electron-builder --win portable"
  }
}
```

安装依赖(取当前兼容最新版):

```bash
npm install react react-dom archiver node-stream-zip minimatch
npm install -D electron electron-vite electron-builder typescript vite @vitejs/plugin-react vitest @types/node @types/react @types/react-dom @types/archiver
```

- [ ] **Step 2: 写 tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "jsx": "react-jsx",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "noEmit": true,
    "types": ["node"],
    "baseUrl": ".",
    "paths": { "@shared/*": ["shared/*"] }
  },
  "include": ["electron", "shared", "src", "tests"]
}
```

- [ ] **Step 3: 写 electron.vite.config.ts**

```ts
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

const shared = resolve(__dirname, 'shared')

export default defineConfig({
  main: {
    build: { rollupOptions: { input: { index: resolve(__dirname, 'electron/main.ts') } } },
    resolve: { alias: { '@shared': shared } },
  },
  preload: {
    build: { rollupOptions: { input: { index: resolve(__dirname, 'electron/preload.ts') } } },
    resolve: { alias: { '@shared': shared } },
  },
  renderer: {
    root: '.',
    build: { rollupOptions: { input: resolve(__dirname, 'index.html') } },
    plugins: [react()],
    resolve: { alias: { '@shared': shared } },
  },
})
```

- [ ] **Step 4: 写 vitest.config.ts**

```ts
import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

export default defineConfig({
  resolve: { alias: { '@shared': resolve(__dirname, 'shared') } },
  test: { include: ['tests/**/*.test.ts'] },
})
```

- [ ] **Step 5: 写最小主进程 electron/main.ts**

```ts
import { app, BrowserWindow } from 'electron'
import path from 'path'

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1080,
    height: 720,
    minWidth: 860,
    minHeight: 600,
    autoHideMenuBar: true,
    backgroundColor: '#0f1115',
    webPreferences: { preload: path.join(__dirname, '../preload/index.js'), sandbox: false },
  })
  if (process.env.ELECTRON_RENDERER_URL) win.loadURL(process.env.ELECTRON_RENDERER_URL)
  else win.loadFile(path.join(__dirname, '../renderer/index.html'))
}

app.whenReady().then(createWindow)
app.on('window-all-closed', () => app.quit())
```

- [ ] **Step 6: 写空 preload 桥 electron/preload.ts**

```ts
import { contextBridge } from 'electron'

contextBridge.exposeInMainWorld('api', {})
```

- [ ] **Step 7: 写渲染层入口**

`index.html`:

```html
<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'" />
  <title>jz-aicoding-env-tool</title>
</head>
<body>
  <div id="root"></div>
  <script type="module" src="/src/main.tsx"></script>
</body>
</html>
```

`src/main.tsx`:

```tsx
import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './theme.css'

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
```

`src/App.tsx`(占位,Task 12 重写):

```tsx
export default function App() {
  return <h1 style={{ color: '#e6e9f0', fontFamily: 'sans-serif' }}>jz-aicoding-env-tool v2 脚手架 OK</h1>
}
```

`src/theme.css`(占位,Task 12 重写):

```css
body { margin: 0; background: #0f1115; }
```

- [ ] **Step 8: 写冒烟测试 tests/smoke.test.ts**

```ts
import { describe, expect, it } from 'vitest'

describe('vitest 冒烟', () => {
  it('运行正常', () => {
    expect(1 + 1).toBe(2)
  })
})
```

- [ ] **Step 9: 全面验证**

Run: `npm test`
Expected: 1 passed。

Run: `npx tsc --noEmit`
Expected: 无输出(零错误)。

Run: `npm run dev`(后台起,确认后关闭)
Expected: 打开深色窗口,显示「jz-aicoding-env-tool v2 脚手架 OK」。

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "feat: Electron + React + Vite + TS 脚手架

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: 共享类型 + 路径变量展开 vars.ts

**Files:**
- Create: `shared/types.ts`, `electron/core/vars.ts`
- Test: `tests/vars.test.ts`

**Interfaces:**
- Consumes: 无
- Produces:
  - `shared/types.ts` 导出:`RuleType`, `RuleBase`, `PackRule`, `ImportRule`, `JsonRule`, `JsonOp`, `EnvRule`, `EnvOp`, `Rule`, `Settings`, `AppConfig`, `RuleResult`, `ProgressEvent`, `RuleTypeInfo`, `BackupInfo`(后续所有任务的类型基础,字段名以下方代码为准,不得改名)
  - `expandVars(input: string, env?: NodeJS.ProcessEnv): string` — `${VAR}` 展开,未定义抛 `Error('未定义的环境变量: VAR')`

- [ ] **Step 1: 写 shared/types.ts(无需先行测试,纯类型)**

```ts
export type RuleType = 'pack' | 'import' | 'json' | 'env'

export interface RuleBase {
  id: string
  type: RuleType
  name: string
  enabled: boolean
}

export interface PackRule extends RuleBase {
  type: 'pack'
  source: string
  output: string
  excludes: string[]
}

export interface ImportRule extends RuleBase {
  type: 'import'
  zip: string
  target: string
  preserve: string[]
  rename: string
}

export type JsonOp = 'append' | 'modify' | 'upsert' | 'overwrite'

export interface JsonRule extends RuleBase {
  type: 'json'
  file: string
  op: JsonOp
  data: Record<string, unknown>
}

export type EnvOp = 'set' | 'append_path'

export interface EnvRule extends RuleBase {
  type: 'env'
  key: string
  value: string
  op: EnvOp
}

export type Rule = PackRule | ImportRule | JsonRule | EnvRule

export interface Settings {
  backupBeforeImport: boolean
}

export interface AppConfig {
  version: number
  rules: Rule[]
  settings: Settings
  selectionMemory: {
    pack: Record<string, boolean>
    deploy: Record<string, boolean>
  }
  uiState: { page?: string }
}

export interface RuleResult {
  ruleId: string
  name: string
  ok: boolean
  message: string
}

export interface ProgressEvent {
  ruleIndex: number
  ruleCount: number
  ruleName: string
  current: number
  total: number
  detail: string
}

export interface RuleTypeInfo {
  type: RuleType
  label: string
}

export interface BackupInfo {
  file: string
  path: string
  mtime: number
}
```

- [ ] **Step 2: 写失败测试 tests/vars.test.ts**

```ts
import { describe, expect, it } from 'vitest'
import { expandVars } from '../electron/core/vars'

describe('expandVars', () => {
  it('展开已定义的变量', () => {
    expect(expandVars('${HOME}/x', { HOME: 'C:\\Users\\a' })).toBe('C:\\Users\\a/x')
  })
  it('同一字符串支持多个变量', () => {
    expect(expandVars('${A}-${B}', { A: '1', B: '2' })).toBe('1-2')
  })
  it('未定义变量抛出错误', () => {
    expect(() => expandVars('${NOPE}', {})).toThrow('未定义的环境变量: NOPE')
  })
  it('无占位符原样返回', () => {
    expect(expandVars('plain/path', {})).toBe('plain/path')
  })
  it('默认使用 process.env', () => {
    process.env.__VARS_TEST__ = 'ok'
    expect(expandVars('${__VARS_TEST__}')).toBe('ok')
    delete process.env.__VARS_TEST__
  })
})
```

- [ ] **Step 3: 运行确认失败**

Run: `npm test`
Expected: FAIL — 找不到模块 `../electron/core/vars`。

- [ ] **Step 4: 实现 electron/core/vars.ts**

```ts
export function expandVars(input: string, env: NodeJS.ProcessEnv = process.env): string {
  return input.replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (_m, name: string) => {
    const value = env[name]
    if (value === undefined) throw new Error(`未定义的环境变量: ${name}`)
    return value
  })
}
```

- [ ] **Step 5: 运行确认通过**

Run: `npm test`
Expected: vars 相关 5 个用例全部 PASS。

Run: `npx tsc --noEmit`
Expected: 零错误。

- [ ] **Step 6: Commit**

```bash
git add shared/types.ts electron/core/vars.ts tests/vars.test.ts
git commit -m "feat: 共享类型定义与 \${VAR} 路径变量展开

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: 通配符匹配 match.ts + 目录遍历 fswalk.ts + paths.ts

**Files:**
- Create: `electron/core/match.ts`, `electron/core/fswalk.ts`, `electron/core/paths.ts`
- Test: `tests/match.test.ts`, `tests/fswalk.test.ts`

**Interfaces:**
- Consumes: 无
- Produces:
  - `normalizePatterns(patterns: string[] | undefined): string[]` — trim、反斜杠转正斜杠、去尾部斜杠、去空
  - `isExcluded(relPath: string, name: string, patterns: string[]): boolean` — 含 `/` 的模式匹配相对路径,否则匹配文件名;dot 文件可匹配;大小写不敏感
  - `collectFiles(source: string, patterns: string[]): { abs: string; rel: string }[]` — 递归收集未被排除的文件(被排除目录不下钻)
  - `collectPreserved(root: string, patterns: string[]): { abs: string; rel: string }[]` — 收集匹配的文件/目录(匹配的目录整体保留、不下钻)
  - `packagesDir(baseDir: string): string` — `baseDir/packages`,确保存在
  - `resolvePackagePath(baseDir: string, p: string): string` — 绝对路径原样 normalize;相对路径挂到 packages 下

- [ ] **Step 1: 写失败测试 tests/match.test.ts**

```ts
import { describe, expect, it } from 'vitest'
import { isExcluded, normalizePatterns } from '../electron/core/match'

describe('normalizePatterns', () => {
  it('清洗模式列表', () => {
    expect(normalizePatterns([' plugins/ ', 'a\\b\\', '', '  '])).toEqual(['plugins', 'a/b'])
  })
  it('空输入返回空数组', () => {
    expect(normalizePatterns(undefined)).toEqual([])
    expect(normalizePatterns([])).toEqual([])
  })
})

describe('isExcluded', () => {
  it('纯名字模式匹配任意层级的文件名', () => {
    expect(isExcluded('a/b/node_modules', 'node_modules', ['node_modules'])).toBe(true)
    expect(isExcluded('a/b/keep.txt', 'keep.txt', ['node_modules'])).toBe(false)
  })
  it('含斜杠的模式匹配相对路径', () => {
    expect(isExcluded('src/tmp/x.txt', 'x.txt', ['src/tmp/*'])).toBe(true)
    expect(isExcluded('other/tmp/x.txt', 'x.txt', ['src/tmp/*'])).toBe(false)
  })
  it('反斜杠相对路径也能匹配', () => {
    expect(isExcluded('src\\tmp\\x.txt', 'x.txt', ['src/tmp/*'])).toBe(true)
  })
  it('dot 文件可被通配符匹配', () => {
    expect(isExcluded('.claude.json', '.claude.json', ['*.json'])).toBe(true)
  })
  it('大小写不敏感', () => {
    expect(isExcluded('README.MD', 'README.MD', ['*.md'])).toBe(true)
  })
  it('空模式列表永远不匹配', () => {
    expect(isExcluded('a.txt', 'a.txt', [])).toBe(false)
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `npm test`
Expected: FAIL — 找不到 `../electron/core/match`。

- [ ] **Step 3: 实现 electron/core/match.ts**

```ts
import { minimatch } from 'minimatch'

export function normalizePatterns(patterns: string[] | undefined): string[] {
  if (!patterns) return []
  return patterns
    .map(p => p.trim().replace(/\\/g, '/').replace(/\/+$/, ''))
    .filter(Boolean)
}

export function isExcluded(relPath: string, name: string, patterns: string[]): boolean {
  if (!patterns.length) return false
  const rel = relPath.replace(/\\/g, '/')
  const opts = { dot: true, nocase: true }
  return patterns.some(pat =>
    pat.includes('/') ? minimatch(rel, pat, opts) : minimatch(name, pat, opts),
  )
}
```

- [ ] **Step 4: 运行 match 测试确认通过**

Run: `npm test`
Expected: match 相关用例全部 PASS。

- [ ] **Step 5: 写失败测试 tests/fswalk.test.ts**

```ts
import fs from 'fs'
import os from 'os'
import path from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { collectFiles, collectPreserved } from '../electron/core/fswalk'
import { packagesDir, resolvePackagePath } from '../electron/core/paths'

let tmp: string

function write(rel: string, content = 'x'): void {
  const p = path.join(tmp, rel)
  fs.mkdirSync(path.dirname(p), { recursive: true })
  fs.writeFileSync(p, content)
}

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'jz-fswalk-'))
})
afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true })
})

describe('collectFiles', () => {
  it('递归收集并跳过排除项(目录不下钻)', () => {
    write('a.txt')
    write('sub/b.txt')
    write('node_modules/c.txt')
    write('.dot/d.txt')
    const rels = collectFiles(tmp, ['node_modules']).map(f => f.rel.replace(/\\/g, '/')).sort()
    expect(rels).toEqual(['.dot/d.txt', 'a.txt', 'sub/b.txt'])
  })
  it('空模式收集全部', () => {
    write('a.txt')
    write('sub/b.txt')
    expect(collectFiles(tmp, []).length).toBe(2)
  })
})

describe('collectPreserved', () => {
  it('收集匹配的文件与目录(目录整体保留、不下钻)', () => {
    write('config.json')
    write('other.txt')
    write('keepdir/inner.txt')
    const rels = collectPreserved(tmp, ['config.json', 'keepdir']).map(f => f.rel.replace(/\\/g, '/')).sort()
    expect(rels).toEqual(['config.json', 'keepdir'])
  })
  it('空模式返回空', () => {
    write('a.txt')
    expect(collectPreserved(tmp, [])).toEqual([])
  })
})

describe('paths', () => {
  it('packagesDir 创建并返回 packages 子目录', () => {
    const dir = packagesDir(tmp)
    expect(dir).toBe(path.join(tmp, 'packages'))
    expect(fs.existsSync(dir)).toBe(true)
  })
  it('resolvePackagePath 相对路径挂到 packages,绝对路径原样', () => {
    expect(resolvePackagePath(tmp, 'a.zip')).toBe(path.join(tmp, 'packages', 'a.zip'))
    expect(resolvePackagePath(tmp, 'C:\\abs\\b.zip')).toBe(path.normalize('C:\\abs\\b.zip'))
  })
})
```

- [ ] **Step 6: 运行确认失败**

Run: `npm test`
Expected: FAIL — 找不到 fswalk / paths 模块。

- [ ] **Step 7: 实现 electron/core/fswalk.ts 与 electron/core/paths.ts**

`electron/core/fswalk.ts`:

```ts
import fs from 'fs'
import path from 'path'
import { isExcluded } from './match'

export function collectFiles(source: string, patterns: string[]): { abs: string; rel: string }[] {
  const result: { abs: string; rel: string }[] = []
  const walk = (dir: string): void => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const abs = path.join(dir, entry.name)
      const rel = path.relative(source, abs)
      if (isExcluded(rel, entry.name, patterns)) continue
      if (entry.isDirectory()) walk(abs)
      else if (entry.isFile()) result.push({ abs, rel })
    }
  }
  walk(source)
  return result
}

export function collectPreserved(root: string, patterns: string[]): { abs: string; rel: string }[] {
  if (!patterns.length) return []
  const result: { abs: string; rel: string }[] = []
  const walk = (dir: string): void => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const abs = path.join(dir, entry.name)
      const rel = path.relative(root, abs)
      if (isExcluded(rel, entry.name, patterns)) {
        result.push({ abs, rel })
        continue
      }
      if (entry.isDirectory()) walk(abs)
    }
  }
  walk(root)
  return result
}
```

`electron/core/paths.ts`:

```ts
import fs from 'fs'
import path from 'path'

export function packagesDir(baseDir: string): string {
  const dir = path.join(baseDir, 'packages')
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

export function resolvePackagePath(baseDir: string, p: string): string {
  return path.isAbsolute(p) ? path.normalize(p) : path.join(packagesDir(baseDir), p)
}
```

- [ ] **Step 8: 运行确认全部通过**

Run: `npm test && npx tsc --noEmit`
Expected: 全部 PASS,类型零错误。

- [ ] **Step 9: Commit**

```bash
git add electron/core/match.ts electron/core/fswalk.ts electron/core/paths.ts tests/match.test.ts tests/fswalk.test.ts
git commit -m "feat: 通配符匹配与目录遍历基础设施

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: 执行器接口 + 配置管理 config.ts

**Files:**
- Create: `electron/core/executor.ts`, `electron/core/config.ts`
- Test: `tests/config.test.ts`

**Interfaces:**
- Consumes: `@shared/types` 的 `AppConfig`/`BackupInfo`/`Rule`/`Settings`
- Produces:
  - `ExecContext { baseDir: string; settings: Settings; onProgress(current, total, detail): void }`
  - `RuleExecutor<T extends Rule = Rule> { type: T['type']; label: string; validate(rule: T): string[]; execute(rule: T, ctx: ExecContext): Promise<string> }`
  - `defaultConfig(): AppConfig`(内置 AI 编程环境预设规则)
  - `configPath(baseDir): string`、`loadConfig(baseDir): AppConfig`(不存在则落盘默认;缺字段兜底补全)
  - `saveConfig(baseDir, cfg): void`
  - `backupConfig(baseDir): string`(存 `config_backups/config-<时间戳>.json`,保留最近 10 份)
  - `listBackups(baseDir): BackupInfo[]`(新→旧排序)
  - `restoreConfig(baseDir, backupPath): AppConfig`

- [ ] **Step 1: 写 electron/core/executor.ts(纯接口)**

```ts
import type { Rule, Settings } from '@shared/types'

export interface ExecContext {
  baseDir: string
  settings: Settings
  onProgress(current: number, total: number, detail: string): void
}

export interface RuleExecutor<T extends Rule = Rule> {
  type: T['type']
  label: string
  validate(rule: T): string[]
  execute(rule: T, ctx: ExecContext): Promise<string>
}
```

- [ ] **Step 2: 写失败测试 tests/config.test.ts**

```ts
import fs from 'fs'
import os from 'os'
import path from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  backupConfig, configPath, defaultConfig, listBackups, loadConfig, restoreConfig, saveConfig,
} from '../electron/core/config'

let tmp: string
beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'jz-config-'))
})
afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true })
})

describe('config', () => {
  it('defaultConfig 带 AI 预设规则且结构完整', () => {
    const cfg = defaultConfig()
    expect(cfg.version).toBe(1)
    expect(cfg.rules.length).toBeGreaterThanOrEqual(3)
    expect(cfg.rules.every(r => r.id && r.name && r.enabled)).toBe(true)
    expect(cfg.settings.backupBeforeImport).toBe(true)
  })

  it('loadConfig 首次调用生成默认配置并落盘', () => {
    const cfg = loadConfig(tmp)
    expect(fs.existsSync(configPath(tmp))).toBe(true)
    expect(cfg.rules.length).toBeGreaterThan(0)
  })

  it('save + load 往返一致', () => {
    const cfg = loadConfig(tmp)
    cfg.rules = []
    cfg.settings.backupBeforeImport = false
    saveConfig(tmp, cfg)
    const again = loadConfig(tmp)
    expect(again.rules).toEqual([])
    expect(again.settings.backupBeforeImport).toBe(false)
  })

  it('手改后缺字段能兜底补全', () => {
    fs.writeFileSync(configPath(tmp), JSON.stringify({ version: 1, rules: [] }), 'utf8')
    const cfg = loadConfig(tmp)
    expect(cfg.settings.backupBeforeImport).toBe(true)
    expect(cfg.selectionMemory).toEqual({ pack: {}, deploy: {} })
    expect(cfg.uiState).toEqual({})
  })

  it('backup/list/restore 闭环且最多保留 10 份', () => {
    loadConfig(tmp)
    const dest = backupConfig(tmp)
    expect(fs.existsSync(dest)).toBe(true)
    expect(listBackups(tmp).length).toBe(1)

    // 预置 12 份旧备份,再 backup 一次后总数不超过 10
    const dir = path.join(tmp, 'config_backups')
    for (let i = 0; i < 12; i++) {
      const p = path.join(dir, `config-old-${String(i).padStart(2, '0')}.json`)
      fs.writeFileSync(p, '{}')
      fs.utimesSync(p, new Date(2020, 0, 1 + i), new Date(2020, 0, 1 + i))
    }
    backupConfig(tmp)
    expect(listBackups(tmp).length).toBeLessThanOrEqual(10)

    // restore 覆盖当前配置
    const cfg = loadConfig(tmp)
    cfg.rules = []
    saveConfig(tmp, cfg)
    const restored = restoreConfig(tmp, dest)
    expect(restored.rules.length).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 3: 运行确认失败**

Run: `npm test`
Expected: FAIL — 找不到 `../electron/core/config`。

- [ ] **Step 4: 实现 electron/core/config.ts**

```ts
import fs from 'fs'
import path from 'path'
import { randomUUID } from 'crypto'
import type { AppConfig, BackupInfo } from '@shared/types'

const CONFIG_FILE = 'config.json'
const BACKUP_DIR = 'config_backups'
const MAX_BACKUPS = 10

export function defaultConfig(): AppConfig {
  return {
    version: 1,
    rules: [
      {
        id: randomUUID(), type: 'pack', name: '导出 Claude 配置', enabled: true,
        source: '${USERPROFILE}/.claude', output: 'claude.zip',
        excludes: ['projects', 'shell-snapshots', 'todos', 'plugins', 'session-env'],
      },
      {
        id: randomUUID(), type: 'import', name: '部署 Claude 配置', enabled: true,
        zip: 'claude.zip', target: '${USERPROFILE}/.claude', preserve: [], rename: '',
      },
      {
        id: randomUUID(), type: 'env', name: 'Python 控制台 UTF-8', enabled: true,
        key: 'PYTHONUTF8', value: '1', op: 'set',
      },
    ],
    settings: { backupBeforeImport: true },
    selectionMemory: { pack: {}, deploy: {} },
    uiState: {},
  }
}

export function configPath(baseDir: string): string {
  return path.join(baseDir, CONFIG_FILE)
}

export function loadConfig(baseDir: string): AppConfig {
  const file = configPath(baseDir)
  if (!fs.existsSync(file)) {
    const cfg = defaultConfig()
    saveConfig(baseDir, cfg)
    return cfg
  }
  const raw = JSON.parse(fs.readFileSync(file, 'utf8')) as Partial<AppConfig>
  const def = defaultConfig()
  return {
    version: raw.version ?? def.version,
    rules: Array.isArray(raw.rules) ? raw.rules : [],
    settings: { ...def.settings, ...raw.settings },
    selectionMemory: { pack: {}, deploy: {}, ...raw.selectionMemory },
    uiState: raw.uiState ?? {},
  }
}

export function saveConfig(baseDir: string, cfg: AppConfig): void {
  fs.writeFileSync(configPath(baseDir), JSON.stringify(cfg, null, 2), 'utf8')
}

function timestamp(): string {
  const d = new Date()
  const p = (n: number, w = 2): string => String(n).padStart(w, '0')
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}${p(d.getMilliseconds(), 3)}`
}

export function backupConfig(baseDir: string): string {
  const src = configPath(baseDir)
  if (!fs.existsSync(src)) throw new Error('配置文件不存在，无可备份内容')
  const dir = path.join(baseDir, BACKUP_DIR)
  fs.mkdirSync(dir, { recursive: true })
  const dest = path.join(dir, `config-${timestamp()}.json`)
  fs.copyFileSync(src, dest)
  for (const extra of listBackups(baseDir).slice(MAX_BACKUPS)) fs.rmSync(extra.path)
  return dest
}

export function listBackups(baseDir: string): BackupInfo[] {
  const dir = path.join(baseDir, BACKUP_DIR)
  if (!fs.existsSync(dir)) return []
  return fs.readdirSync(dir)
    .filter(f => f.endsWith('.json'))
    .map(f => {
      const p = path.join(dir, f)
      return { file: f, path: p, mtime: fs.statSync(p).mtimeMs }
    })
    .sort((a, b) => b.mtime - a.mtime)
}

export function restoreConfig(baseDir: string, backupPath: string): AppConfig {
  fs.copyFileSync(backupPath, configPath(baseDir))
  return loadConfig(baseDir)
}
```

- [ ] **Step 5: 运行确认通过**

Run: `npm test && npx tsc --noEmit`
Expected: 全部 PASS,类型零错误。

- [ ] **Step 6: Commit**

```bash
git add electron/core/executor.ts electron/core/config.ts tests/config.test.ts
git commit -m "feat: 执行器接口与配置管理（默认 AI 预设/备份恢复）

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 6: JSON 执行器

**Files:**
- Create: `electron/core/executors/json.ts`
- Test: `tests/json.test.ts`

**Interfaces:**
- Consumes: `RuleExecutor`/`ExecContext`(Task 5)、`expandVars`(Task 3)、`JsonRule`(Task 3)
- Produces:
  - `deepMerge(base: Record<string, unknown>, overlay: Record<string, unknown>): Record<string, unknown>`(导出,供测试)
  - `jsonExecutor: RuleExecutor<JsonRule>`,`label: 'JSON'`;op 语义:`append` key 已存在报错 / `modify` key 不存在报错 / `upsert` 有则改无则加 / `overwrite` 全量覆盖(可建新文件);非 overwrite 要求文件存在且顶层为对象;写前复制 `.bak`

- [ ] **Step 1: 写失败测试 tests/json.test.ts**

```ts
import fs from 'fs'
import os from 'os'
import path from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { deepMerge, jsonExecutor } from '../electron/core/executors/json'
import type { ExecContext } from '../electron/core/executor'
import type { JsonRule } from '../shared/types'

let tmp: string
beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'jz-json-'))
})
afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true })
})

const ctx = (): ExecContext => ({
  baseDir: tmp,
  settings: { backupBeforeImport: true },
  onProgress: () => {},
})

function rule(partial: Partial<JsonRule>): JsonRule {
  return {
    id: 'r1', type: 'json', name: 't', enabled: true,
    file: path.join(tmp, 'a.json'), op: 'upsert', data: {},
    ...partial,
  }
}

function writeJson(obj: unknown): string {
  const p = path.join(tmp, 'a.json')
  fs.writeFileSync(p, JSON.stringify(obj), 'utf8')
  return p
}

describe('deepMerge', () => {
  it('嵌套对象逐层合并而非整体替换', () => {
    expect(deepMerge({ a: { x: 1, y: 2 }, b: 1 }, { a: { y: 3 }, c: 4 }))
      .toEqual({ a: { x: 1, y: 3 }, b: 1, c: 4 })
  })
  it('数组整体替换', () => {
    expect(deepMerge({ a: [1, 2] }, { a: [3] })).toEqual({ a: [3] })
  })
})

describe('jsonExecutor', () => {
  it('upsert 深度合并并生成 .bak', async () => {
    const p = writeJson({ a: { x: 1 }, keep: true })
    await jsonExecutor.execute(rule({ op: 'upsert', data: { a: { y: 2 }, add: 1 } }), ctx())
    expect(JSON.parse(fs.readFileSync(p, 'utf8'))).toEqual({ a: { x: 1, y: 2 }, keep: true, add: 1 })
    expect(fs.existsSync(p + '.bak')).toBe(true)
  })
  it('append 冲突 key 报错', async () => {
    writeJson({ a: 1 })
    await expect(jsonExecutor.execute(rule({ op: 'append', data: { a: 2 } }), ctx()))
      .rejects.toThrow('已存在')
  })
  it('modify 缺失 key 报错', async () => {
    writeJson({ a: 1 })
    await expect(jsonExecutor.execute(rule({ op: 'modify', data: { b: 2 } }), ctx()))
      .rejects.toThrow('不存在')
  })
  it('overwrite 可创建新文件', async () => {
    const p = path.join(tmp, 'new', 'b.json')
    await jsonExecutor.execute(rule({ file: p, op: 'overwrite', data: { fresh: true } }), ctx())
    expect(JSON.parse(fs.readFileSync(p, 'utf8'))).toEqual({ fresh: true })
  })
  it('非 overwrite 时文件不存在报错', async () => {
    await expect(jsonExecutor.execute(rule({ file: path.join(tmp, 'nope.json') }), ctx()))
      .rejects.toThrow('文件不存在')
  })
  it('文件路径支持 ${VAR}', async () => {
    process.env.__JSON_TEST_DIR__ = tmp
    writeJson({ a: 1 })
    await jsonExecutor.execute(rule({ file: '${__JSON_TEST_DIR__}/a.json', op: 'upsert', data: { b: 2 } }), ctx())
    delete process.env.__JSON_TEST_DIR__
    expect(JSON.parse(fs.readFileSync(path.join(tmp, 'a.json'), 'utf8'))).toEqual({ a: 1, b: 2 })
  })
  it('validate 校验必填与数据类型', () => {
    expect(jsonExecutor.validate(rule({ file: ' ' }))).toContain('文件路径不能为空')
    expect(jsonExecutor.validate(rule({ data: [] as unknown as Record<string, unknown> })))
      .toContain('数据必须是 JSON 对象')
    expect(jsonExecutor.validate(rule({}))).toEqual([])
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `npm test`
Expected: FAIL — 找不到 `executors/json` 模块。

- [ ] **Step 3: 实现 electron/core/executors/json.ts**

```ts
import fs from 'fs'
import path from 'path'
import type { JsonRule } from '@shared/types'
import type { RuleExecutor } from '../executor'
import { expandVars } from '../vars'

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

export function deepMerge(
  base: Record<string, unknown>,
  overlay: Record<string, unknown>,
): Record<string, unknown> {
  const result: Record<string, unknown> = { ...base }
  for (const [k, v] of Object.entries(overlay)) {
    const cur = result[k]
    result[k] = isPlainObject(cur) && isPlainObject(v) ? deepMerge(cur, v) : v
  }
  return result
}

export const jsonExecutor: RuleExecutor<JsonRule> = {
  type: 'json',
  label: 'JSON',

  validate(rule) {
    const errs: string[] = []
    if (!rule.file?.trim()) errs.push('文件路径不能为空')
    if (!isPlainObject(rule.data)) errs.push('数据必须是 JSON 对象')
    return errs
  },

  async execute(rule, ctx) {
    const filepath = path.normalize(expandVars(rule.file))
    const data = rule.data
    if (!isPlainObject(data)) throw new Error('数据必须是 JSON 对象')
    ctx.onProgress(0, 1, path.basename(filepath))

    if (rule.op === 'overwrite') {
      fs.mkdirSync(path.dirname(filepath), { recursive: true })
      if (fs.existsSync(filepath)) fs.copyFileSync(filepath, filepath + '.bak')
      fs.writeFileSync(filepath, JSON.stringify(data, null, 2), 'utf8')
      ctx.onProgress(1, 1, path.basename(filepath))
      return `已全量覆盖 ${filepath}`
    }

    if (!fs.existsSync(filepath)) throw new Error(`文件不存在: ${filepath}`)
    const existing: unknown = JSON.parse(fs.readFileSync(filepath, 'utf8'))
    if (!isPlainObject(existing)) throw new Error(`JSON 文件顶层不是对象: ${filepath}`)

    fs.copyFileSync(filepath, filepath + '.bak')

    let merged: Record<string, unknown>
    let msg: string
    if (rule.op === 'append') {
      const conflicts = Object.keys(data).filter(k => k in existing)
      if (conflicts.length) throw new Error(`以下 key 已存在，无法追加: ${conflicts.join(', ')}`)
      merged = deepMerge(existing, data)
      msg = `已追加 ${Object.keys(data).length} 个 key 到 ${filepath}`
    } else if (rule.op === 'modify') {
      const missing = Object.keys(data).filter(k => !(k in existing))
      if (missing.length) throw new Error(`以下 key 不存在，无法修改: ${missing.join(', ')}`)
      merged = deepMerge(existing, data)
      msg = `已修改 ${Object.keys(data).length} 个 key 在 ${filepath}`
    } else if (rule.op === 'upsert') {
      merged = deepMerge(existing, data)
      msg = `已合并 ${Object.keys(data).length} 个 key 到 ${filepath}`
    } else {
      throw new Error(`未知操作: ${String(rule.op)}`)
    }

    fs.writeFileSync(filepath, JSON.stringify(merged, null, 2), 'utf8')
    ctx.onProgress(1, 1, path.basename(filepath))
    return msg
  },
}
```

- [ ] **Step 4: 运行确认通过**

Run: `npm test && npx tsc --noEmit`
Expected: 全部 PASS,类型零错误。

- [ ] **Step 5: Commit**

```bash
git add electron/core/executors/json.ts tests/json.test.ts
git commit -m "feat: JSON 规则执行器（append/modify/upsert/overwrite + 深度合并）

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 7: 打包执行器 pack

**Files:**
- Create: `electron/core/executors/pack.ts`
- Test: `tests/pack.test.ts`

**Interfaces:**
- Consumes: `RuleExecutor`/`ExecContext`、`expandVars`、`normalizePatterns`、`collectFiles`、`resolvePackagePath`、`PackRule`
- Produces: `packExecutor: RuleExecutor<PackRule>`,`label: '打包'`;目录→zip(excludes 生效,zip 内路径用 `/`);输出非 `.zip` 后缀时仅支持单文件源直拷;相对输出路径落到 `baseDir/packages/`;逐文件回调进度

- [ ] **Step 1: 写失败测试 tests/pack.test.ts**

```ts
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

  it('validate 校验必填', () => {
    expect(packExecutor.validate(rule({ source: ' ' }))).toContain('源路径不能为空')
    expect(packExecutor.validate(rule({ output: '' }))).toContain('输出文件不能为空')
    expect(packExecutor.validate(rule({}))).toEqual([])
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `npm test`
Expected: FAIL — 找不到 `executors/pack` 模块。

- [ ] **Step 3: 实现 electron/core/executors/pack.ts**

```ts
import fs from 'fs'
import path from 'path'
import archiver from 'archiver'
import type { PackRule } from '@shared/types'
import type { RuleExecutor } from '../executor'
import { expandVars } from '../vars'
import { normalizePatterns } from '../match'
import { collectFiles } from '../fswalk'
import { resolvePackagePath } from '../paths'

export const packExecutor: RuleExecutor<PackRule> = {
  type: 'pack',
  label: '打包',

  validate(rule) {
    const errs: string[] = []
    if (!rule.source?.trim()) errs.push('源路径不能为空')
    if (!rule.output?.trim()) errs.push('输出文件不能为空')
    return errs
  },

  async execute(rule, ctx) {
    const source = path.normalize(expandVars(rule.source))
    const output = resolvePackagePath(ctx.baseDir, expandVars(rule.output))
    if (!fs.existsSync(source)) throw new Error(`源路径不存在: ${source}`)
    fs.mkdirSync(path.dirname(output), { recursive: true })

    if (!output.toLowerCase().endsWith('.zip')) {
      if (!fs.statSync(source).isFile()) throw new Error(`非 zip 输出仅支持单文件源: ${source}`)
      fs.copyFileSync(source, output)
      ctx.onProgress(1, 1, path.basename(output))
      return `已复制文件到 ${output}`
    }

    const files = fs.statSync(source).isFile()
      ? [{ abs: source, rel: path.basename(source) }]
      : collectFiles(source, normalizePatterns(rule.excludes))

    await new Promise<void>((resolve, reject) => {
      const out = fs.createWriteStream(output)
      const archive = archiver('zip', { zlib: { level: 6 } })
      let done = 0
      archive.on('entry', entry => ctx.onProgress(++done, files.length, entry.name))
      archive.on('error', reject)
      out.on('error', reject)
      out.on('close', () => resolve())
      archive.pipe(out)
      for (const f of files) archive.file(f.abs, { name: f.rel.replace(/\\/g, '/') })
      void archive.finalize()
    })

    return `已打包 ${files.length} 个文件到 ${output}`
  },
}
```

- [ ] **Step 4: 运行确认通过**

Run: `npm test && npx tsc --noEmit`
Expected: 全部 PASS,类型零错误。

- [ ] **Step 5: Commit**

```bash
git add electron/core/executors/pack.ts tests/pack.test.ts
git commit -m "feat: 打包规则执行器（zip 导出 + excludes + 单文件直拷）

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 8: 导入执行器 import

**Files:**
- Create: `electron/core/executors/import.ts`
- Test: `tests/import.test.ts`

**Interfaces:**
- Consumes: `RuleExecutor`/`ExecContext`、`expandVars`、`normalizePatterns`、`collectPreserved`、`resolvePackagePath`、`ImportRule`;测试用 `packExecutor` 造 zip
- Produces: `importExecutor: RuleExecutor<ImportRule>`,`label: '导入'`;zip 源:暂存 preserve → 备份(移走)或删除目标目录 → 解压(防 zip-slip)→ 还原 preserve;非 zip 源:单文件复制,支持 `rename`;`settings.backupBeforeImport` 为 true 时目标改名为 `<目标>-backup-<时间戳>` 保留

- [ ] **Step 1: 写失败测试 tests/import.test.ts**

```ts
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

  it('backupBeforeImport 时旧目录被移走保留', async () => {
    write('zipsrc/a.txt')
    await makeZip()
    write('target/old.txt', 'OLD')
    await importExecutor.execute(rule({}), ctx(true))
    const backups = fs.readdirSync(tmp).filter(f => f.startsWith('target-backup-'))
    expect(backups.length).toBe(1)
    expect(fs.readFileSync(path.join(tmp, backups[0], 'old.txt'), 'utf8')).toBe('OLD')
    expect(fs.existsSync(path.join(tmp, 'target', 'old.txt'))).toBe(false)
  })

  it('非 zip 源按单文件复制并支持 rename', async () => {
    write('packages/tool.bin', 'BIN')
    const msg = await importExecutor.execute(rule({ zip: 'tool.bin', rename: 'renamed.bin' }), ctx())
    expect(fs.readFileSync(path.join(tmp, 'target', 'renamed.bin'), 'utf8')).toBe('BIN')
    expect(msg).toContain('已复制')
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
```

- [ ] **Step 2: 运行确认失败**

Run: `npm test`
Expected: FAIL — 找不到 `executors/import` 模块。

- [ ] **Step 3: 实现 electron/core/executors/import.ts**

```ts
import fs from 'fs'
import os from 'os'
import path from 'path'
import StreamZip from 'node-stream-zip'
import type { ImportRule } from '@shared/types'
import type { RuleExecutor } from '../executor'
import { expandVars } from '../vars'
import { normalizePatterns } from '../match'
import { collectPreserved } from '../fswalk'
import { resolvePackagePath } from '../paths'

function isZipFile(file: string): boolean {
  const buf = Buffer.alloc(4)
  const fd = fs.openSync(file, 'r')
  try {
    fs.readSync(fd, buf, 0, 4, 0)
  } finally {
    fs.closeSync(fd)
  }
  return buf.equals(Buffer.from([0x50, 0x4b, 0x03, 0x04]))
}

function timestamp(): string {
  const d = new Date()
  const p = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
}

/** 把已存在的文件/目录移到旁边的 -backup-<时间戳> 位置 */
function backupAside(target: string): string {
  let dest = `${target}-backup-${timestamp()}`
  let n = 1
  while (fs.existsSync(dest)) dest = `${target}-backup-${timestamp()}-${n++}`
  fs.renameSync(target, dest)
  return dest
}

/** 防 zip-slip:目标必须落在 root 内 */
function safeJoin(root: string, entryName: string): string {
  const dest = path.join(root, entryName)
  const resolved = path.resolve(dest)
  const rootResolved = path.resolve(root)
  if (resolved !== rootResolved && !resolved.startsWith(rootResolved + path.sep)) {
    throw new Error(`非法压缩条目: ${entryName}`)
  }
  return dest
}

export const importExecutor: RuleExecutor<ImportRule> = {
  type: 'import',
  label: '导入',

  validate(rule) {
    const errs: string[] = []
    if (!rule.zip?.trim()) errs.push('源文件不能为空')
    if (!rule.target?.trim()) errs.push('目标目录不能为空')
    return errs
  },

  async execute(rule, ctx) {
    // 扩展预留:zip 字段语义为「本地路径或 URL」,远程源暂未实现
    if (/^https?:\/\//i.test(rule.zip)) throw new Error('暂不支持远程 zip 源（未来扩展）')
    const src = resolvePackagePath(ctx.baseDir, expandVars(rule.zip))
    const target = path.normalize(expandVars(rule.target))
    if (!fs.existsSync(src) || !fs.statSync(src).isFile()) throw new Error(`源文件不存在: ${src}`)

    // 非 zip:单文件复制
    if (!isZipFile(src)) {
      const filename = rule.rename.trim() || path.basename(src)
      fs.mkdirSync(target, { recursive: true })
      const dest = path.join(target, filename)
      if (fs.existsSync(dest)) {
        if (ctx.settings.backupBeforeImport) backupAside(dest)
        else fs.rmSync(dest, { recursive: true, force: true })
      }
      fs.copyFileSync(src, dest)
      ctx.onProgress(1, 1, filename)
      return `已复制文件到 ${dest}`
    }

    // 暂存 preserve 匹配项
    let tmpDir: string | null = null
    if (fs.existsSync(target)) {
      const preserved = collectPreserved(target, normalizePatterns(rule.preserve))
      if (preserved.length) {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jz-preserve-'))
        for (const { abs, rel } of preserved) {
          const dst = path.join(tmpDir, rel)
          fs.mkdirSync(path.dirname(dst), { recursive: true })
          fs.cpSync(abs, dst, { recursive: true })
        }
      }
      if (ctx.settings.backupBeforeImport) backupAside(target)
      else fs.rmSync(target, { recursive: true, force: true })
    }
    fs.mkdirSync(target, { recursive: true })

    const zip = new StreamZip.async({ file: src })
    let total = 0
    try {
      const entries = Object.values(await zip.entries())
      total = entries.length
      let done = 0
      for (const entry of entries) {
        const dest = safeJoin(target, entry.name)
        if (entry.isDirectory) {
          fs.mkdirSync(dest, { recursive: true })
        } else {
          fs.mkdirSync(path.dirname(dest), { recursive: true })
          await zip.extract(entry.name, dest)
        }
        ctx.onProgress(++done, total, entry.name)
      }
    } finally {
      await zip.close()
    }

    // 还原保留项(覆盖 zip 同名内容)
    if (tmpDir) {
      fs.cpSync(tmpDir, target, { recursive: true, force: true })
      fs.rmSync(tmpDir, { recursive: true, force: true })
    }

    return `已解压 ${total} 个文件到 ${target}`
  },
}
```

- [ ] **Step 4: 运行确认通过**

Run: `npm test && npx tsc --noEmit`
Expected: 全部 PASS,类型零错误。

- [ ] **Step 5: Commit**

```bash
git add electron/core/executors/import.ts tests/import.test.ts
git commit -m "feat: 导入规则执行器（解压/preserve/备份/rename/防 zip-slip）

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 9: 环境变量执行器 env

**Files:**
- Create: `electron/core/executors/env.ts`
- Test: `tests/env.test.ts`(只测纯函数,不动真实注册表)

**Interfaces:**
- Consumes: `RuleExecutor`/`ExecContext`、`expandVars`、`EnvRule`
- Produces:
  - `ENV_KEY`(HKLM 环境变量注册表路径常量)
  - `psQuote(s: string): string` — PowerShell 单引号转义
  - `buildReadScript(name: string): string` — 读原始值(不展开 REG_EXPAND_SZ)
  - `buildSetScript(name: string, value: string): string` — Set-ItemProperty(含 `%` 用 ExpandString,否则 String)+ WM_SETTINGCHANGE 广播
  - `mergePath(current: string, addition: string): { value: string; changed: boolean }` — 分号列表去重追加(大小写/尾斜杠不敏感)
  - `isAdmin(): boolean` — `net session` 探测
  - `envExecutor: RuleExecutor<EnvRule>`,`label: '环境变量'`;非管理员执行时抛错

- [ ] **Step 1: 写失败测试 tests/env.test.ts**

```ts
import { describe, expect, it } from 'vitest'
import {
  ENV_KEY, buildReadScript, buildSetScript, mergePath, psQuote,
} from '../electron/core/executors/env'

describe('psQuote', () => {
  it('单引号包裹并转义内部单引号', () => {
    expect(psQuote("a'b")).toBe("'a''b'")
    expect(psQuote('plain')).toBe("'plain'")
  })
})

describe('mergePath', () => {
  it('追加新路径', () => {
    expect(mergePath('C:\\a;C:\\b', 'C:\\c')).toEqual({ value: 'C:\\a;C:\\b;C:\\c', changed: true })
  })
  it('大小写与尾斜杠不敏感去重', () => {
    expect(mergePath('C:\\Tools\\;D:\\x', 'c:\\tools').changed).toBe(false)
  })
  it('空当前值直接成为唯一项', () => {
    expect(mergePath('', 'C:\\c')).toEqual({ value: 'C:\\c', changed: true })
  })
  it('清理空段', () => {
    expect(mergePath('C:\\a;;C:\\b;', 'C:\\c').value).toBe('C:\\a;C:\\b;C:\\c')
  })
})

describe('buildSetScript', () => {
  it('普通值用 String 类型并包含广播', () => {
    const s = buildSetScript('MY_VAR', 'hello')
    expect(s).toContain('Set-ItemProperty')
    expect(s).toContain("-Type String")
    expect(s).toContain(ENV_KEY)
    expect(s).toContain('SendMessageTimeout')
  })
  it('含 % 的值用 ExpandString', () => {
    expect(buildSetScript('P', '%SystemRoot%\\bin')).toContain('-Type ExpandString')
  })
})

describe('buildReadScript', () => {
  it('读原始值不展开', () => {
    const s = buildReadScript('Path')
    expect(s).toContain('DoNotExpandEnvironmentNames')
    expect(s).toContain("'Path'")
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `npm test`
Expected: FAIL — 找不到 `executors/env` 模块。

- [ ] **Step 3: 实现 electron/core/executors/env.ts**

```ts
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
```

- [ ] **Step 4: 运行确认通过**

Run: `npm test && npx tsc --noEmit`
Expected: 全部 PASS,类型零错误。

- [ ] **Step 5: Commit**

```bash
git add electron/core/executors/env.ts tests/env.test.ts
git commit -m "feat: 环境变量规则执行器（HKLM 写入 + PATH 追加去重 + 变更广播）

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 10: 规则引擎 engine.ts

**Files:**
- Create: `electron/core/engine.ts`
- Test: `tests/engine.test.ts`

**Interfaces:**
- Consumes: 四个执行器(Task 6-9)、`RuleExecutor`/`ExecContext`(Task 5)、`Rule`/`RuleResult`/`ProgressEvent`/`RuleTypeInfo`/`Settings`(Task 3)
- Produces:
  - `registerExecutor(ex: RuleExecutor): void`
  - `getExecutor(type: string): RuleExecutor`(未知类型抛 `未知规则类型: <type>`)
  - `listRuleTypes(): RuleTypeInfo[]`(按注册顺序)
  - `registerBuiltins(): void`(注册 pack/import/json/env,幂等)
  - `validateRule(rule: Rule): string[]`(通用名称校验 + 执行器校验)
  - `runRules(rules: Rule[], opts: { baseDir: string; settings: Settings }, emit?: (p: ProgressEvent) => void): Promise<RuleResult[]>` — 逐条执行,单条失败不中断

- [ ] **Step 1: 写失败测试 tests/engine.test.ts**

```ts
import { beforeEach, describe, expect, it } from 'vitest'
import {
  getExecutor, listRuleTypes, registerBuiltins, registerExecutor, runRules, validateRule,
} from '../electron/core/engine'
import type { RuleExecutor } from '../electron/core/executor'
import type { ProgressEvent, Rule } from '../shared/types'

function fakeRule(id: string, type = 'fake-ok'): Rule {
  return { id, type, name: `规则${id}`, enabled: true } as unknown as Rule
}

const okExecutor: RuleExecutor = {
  type: 'fake-ok' as never,
  label: '假成功',
  validate: () => [],
  execute: async (_r, ctx) => {
    ctx.onProgress(1, 1, 'done')
    return '成功'
  },
}

const failExecutor: RuleExecutor = {
  type: 'fake-fail' as never,
  label: '假失败',
  validate: () => ['总是错'],
  execute: async () => {
    throw new Error('炸了')
  },
}

beforeEach(() => {
  registerExecutor(okExecutor)
  registerExecutor(failExecutor)
})

describe('registry', () => {
  it('未知类型抛错', () => {
    expect(() => getExecutor('nope')).toThrow('未知规则类型: nope')
  })
  it('registerBuiltins 注册四种内置类型', () => {
    registerBuiltins()
    const types = listRuleTypes().map(t => t.type)
    expect(types).toEqual(expect.arrayContaining(['pack', 'import', 'json', 'env']))
    const labels = Object.fromEntries(listRuleTypes().map(t => [t.type, t.label]))
    expect(labels.pack).toBe('打包')
    expect(labels.import).toBe('导入')
    expect(labels.json).toBe('JSON')
    expect(labels.env).toBe('环境变量')
  })
})

describe('validateRule', () => {
  it('名称为空 + 执行器错误合并返回', () => {
    const r = { ...fakeRule('1', 'fake-fail'), name: ' ' }
    expect(validateRule(r)).toEqual(['名称不能为空', '总是错'])
  })
})

describe('runRules', () => {
  it('单条失败不中断,结果逐条返回', async () => {
    const events: ProgressEvent[] = []
    const results = await runRules(
      [fakeRule('1'), fakeRule('2', 'fake-fail'), fakeRule('3')],
      { baseDir: '.', settings: { backupBeforeImport: true } },
      p => events.push(p),
    )
    expect(results.map(r => r.ok)).toEqual([true, false, true])
    expect(results[1].message).toBe('炸了')
    expect(results[0].ruleId).toBe('1')
    // 进度事件带规则序号与总数
    expect(events.some(e => e.ruleIndex === 0 && e.ruleCount === 3 && e.ruleName === '规则1')).toBe(true)
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `npm test`
Expected: FAIL — 找不到 `../electron/core/engine`。

- [ ] **Step 3: 实现 electron/core/engine.ts**

```ts
import type { ProgressEvent, Rule, RuleResult, RuleTypeInfo, Settings } from '@shared/types'
import type { ExecContext, RuleExecutor } from './executor'
import { packExecutor } from './executors/pack'
import { importExecutor } from './executors/import'
import { jsonExecutor } from './executors/json'
import { envExecutor } from './executors/env'

const registry = new Map<string, RuleExecutor>()

export function registerExecutor(ex: RuleExecutor): void {
  registry.set(ex.type, ex)
}

export function getExecutor(type: string): RuleExecutor {
  const ex = registry.get(type)
  if (!ex) throw new Error(`未知规则类型: ${type}`)
  return ex
}

export function listRuleTypes(): RuleTypeInfo[] {
  return [...registry.values()].map(ex => ({ type: ex.type, label: ex.label })) as RuleTypeInfo[]
}

export function registerBuiltins(): void {
  for (const ex of [packExecutor, importExecutor, jsonExecutor, envExecutor]) {
    registerExecutor(ex as unknown as RuleExecutor)
  }
}

export function validateRule(rule: Rule): string[] {
  const errs: string[] = []
  if (!rule.name?.trim()) errs.push('名称不能为空')
  return [...errs, ...getExecutor(rule.type).validate(rule)]
}

export async function runRules(
  rules: Rule[],
  opts: { baseDir: string; settings: Settings },
  emit: (p: ProgressEvent) => void = () => {},
): Promise<RuleResult[]> {
  const results: RuleResult[] = []
  for (let i = 0; i < rules.length; i++) {
    const rule = rules[i]
    const ctx: ExecContext = {
      baseDir: opts.baseDir,
      settings: opts.settings,
      onProgress: (current, total, detail) =>
        emit({ ruleIndex: i, ruleCount: rules.length, ruleName: rule.name, current, total, detail }),
    }
    try {
      const message = await getExecutor(rule.type).execute(rule, ctx)
      results.push({ ruleId: rule.id, name: rule.name, ok: true, message })
    } catch (err) {
      results.push({
        ruleId: rule.id,
        name: rule.name,
        ok: false,
        message: err instanceof Error ? err.message : String(err),
      })
    }
  }
  return results
}
```

- [ ] **Step 4: 运行确认通过**

Run: `npm test && npx tsc --noEmit`
Expected: 全部 PASS(含此前所有用例),类型零错误。

- [ ] **Step 5: Commit**

```bash
git add electron/core/engine.ts tests/engine.test.ts
git commit -m "feat: 可插拔规则引擎（注册表 + 批量执行 + 失败不中断）

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 11: IPC 层 — main.ts 完整版 + preload 桥 + shared/api.ts

**Files:**
- Create: `shared/api.ts`, `src/global.d.ts`
- Modify: `electron/main.ts`(整文件替换), `electron/preload.ts`(整文件替换)

**Interfaces:**
- Consumes: `engine`(Task 10)、`config`(Task 5)、`isAdmin`(Task 9)、`@shared/types` 全部
- Produces: `window.api: Api`,渲染层唯一的系统入口。IPC 通道名:`config:load` `config:save` `config:backup` `config:list-backups` `config:restore` `rule-types` `sys:is-admin` `dialog:pick-file` `dialog:pick-dir` `rules:run`;进度推送事件 `rules:progress`

- [ ] **Step 1: 写 shared/api.ts**

```ts
import type { AppConfig, BackupInfo, ProgressEvent, RuleResult, RuleTypeInfo } from './types'

export interface Api {
  loadConfig(): Promise<AppConfig>
  saveConfig(cfg: AppConfig): Promise<void>
  backupConfig(): Promise<string>
  listBackups(): Promise<BackupInfo[]>
  restoreConfig(backupPath: string): Promise<AppConfig>
  ruleTypes(): Promise<RuleTypeInfo[]>
  isAdmin(): Promise<boolean>
  pickFile(): Promise<string | null>
  pickDir(): Promise<string | null>
  runRules(ruleIds: string[]): Promise<RuleResult[]>
  /** 订阅执行进度,返回退订函数 */
  onProgress(cb: (p: ProgressEvent) => void): () => void
}
```

- [ ] **Step 2: 写 src/global.d.ts**

```ts
import type { Api } from '@shared/api'

declare global {
  interface Window {
    api: Api
  }
}

export {}
```

- [ ] **Step 3: 整文件替换 electron/main.ts**

```ts
import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import path from 'path'
import type { AppConfig } from '@shared/types'
import {
  backupConfig, listBackups, loadConfig, restoreConfig, saveConfig,
} from './core/config'
import { listRuleTypes, registerBuiltins, runRules } from './core/engine'
import { isAdmin } from './core/executors/env'

registerBuiltins()

/** 配置/packages 的落盘基准目录:portable 下为 exe 所在目录 */
function appDir(): string {
  if (process.env.PORTABLE_EXECUTABLE_DIR) return process.env.PORTABLE_EXECUTABLE_DIR
  if (app.isPackaged) return path.dirname(app.getPath('exe'))
  return process.cwd()
}

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1080,
    height: 720,
    minWidth: 860,
    minHeight: 600,
    autoHideMenuBar: true,
    backgroundColor: '#0f1115',
    show: false,
    webPreferences: { preload: path.join(__dirname, '../preload/index.js'), sandbox: false },
  })
  win.once('ready-to-show', () => win.show())
  if (process.env.ELECTRON_RENDERER_URL) win.loadURL(process.env.ELECTRON_RENDERER_URL)
  else win.loadFile(path.join(__dirname, '../renderer/index.html'))
}

app.whenReady().then(() => {
  ipcMain.handle('config:load', () => loadConfig(appDir()))
  ipcMain.handle('config:save', (_e, cfg: AppConfig) => saveConfig(appDir(), cfg))
  ipcMain.handle('config:backup', () => backupConfig(appDir()))
  ipcMain.handle('config:list-backups', () => listBackups(appDir()))
  ipcMain.handle('config:restore', (_e, p: string) => restoreConfig(appDir(), p))
  ipcMain.handle('rule-types', () => listRuleTypes())
  ipcMain.handle('sys:is-admin', () => isAdmin())

  ipcMain.handle('dialog:pick-file', async () => {
    const r = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [{ name: '所有文件', extensions: ['*'] }],
    })
    return r.canceled ? null : r.filePaths[0]
  })

  ipcMain.handle('dialog:pick-dir', async () => {
    const r = await dialog.showOpenDialog({ properties: ['openDirectory'] })
    return r.canceled ? null : r.filePaths[0]
  })

  ipcMain.handle('rules:run', async (e, ruleIds: string[]) => {
    const cfg = loadConfig(appDir())
    const rules = ruleIds
      .map(id => cfg.rules.find(r => r.id === id))
      .filter((r): r is NonNullable<typeof r> => r !== undefined)
    return runRules(rules, { baseDir: appDir(), settings: cfg.settings }, p => {
      e.sender.send('rules:progress', p)
    })
  })

  createWindow()
})

app.on('window-all-closed', () => app.quit())
```

- [ ] **Step 4: 整文件替换 electron/preload.ts**

```ts
import { contextBridge, ipcRenderer } from 'electron'
import type { IpcRendererEvent } from 'electron'
import type { Api } from '@shared/api'
import type { AppConfig, ProgressEvent } from '@shared/types'

const api: Api = {
  loadConfig: () => ipcRenderer.invoke('config:load'),
  saveConfig: (cfg: AppConfig) => ipcRenderer.invoke('config:save', cfg),
  backupConfig: () => ipcRenderer.invoke('config:backup'),
  listBackups: () => ipcRenderer.invoke('config:list-backups'),
  restoreConfig: (p: string) => ipcRenderer.invoke('config:restore', p),
  ruleTypes: () => ipcRenderer.invoke('rule-types'),
  isAdmin: () => ipcRenderer.invoke('sys:is-admin'),
  pickFile: () => ipcRenderer.invoke('dialog:pick-file'),
  pickDir: () => ipcRenderer.invoke('dialog:pick-dir'),
  runRules: (ids: string[]) => ipcRenderer.invoke('rules:run', ids),
  onProgress: (cb: (p: ProgressEvent) => void) => {
    const handler = (_e: IpcRendererEvent, p: ProgressEvent): void => cb(p)
    ipcRenderer.on('rules:progress', handler)
    return () => {
      ipcRenderer.removeListener('rules:progress', handler)
    }
  },
}

contextBridge.exposeInMainWorld('api', api)
```

- [ ] **Step 5: 验证**

Run: `npm test && npx tsc --noEmit`
Expected: 全部 PASS,类型零错误。

Run: `npm run dev`,打开 DevTools(Ctrl+Shift+I),Console 执行:
```js
await window.api.loadConfig()
await window.api.ruleTypes()
await window.api.isAdmin()
```
Expected: 依次返回带 AI 预设规则的配置对象、四个类型 `[{type:'pack',label:'打包'},…]`、布尔值;项目根目录出现 `config.json`。确认后关闭。

- [ ] **Step 6: Commit**

```bash
git add shared/api.ts src/global.d.ts electron/main.ts electron/preload.ts
git commit -m "feat: IPC 层与类型安全 window.api 桥

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 12: UI 基座 — 主题 + App 骨架 + 导航 + 渲染层工具函数

**Files:**
- Create: `src/utils/rules.ts`, `src/pages/LogsPage.tsx`
- Modify: `src/theme.css`(整文件替换), `src/App.tsx`(整文件替换)
- Test: `tests/rules-utils.test.ts`

**Interfaces:**
- Consumes: `window.api`(Task 11)、`@shared/types`
- Produces:
  - `newRule(type: RuleType): Rule`(带 `crypto.randomUUID()` 的空白规则)
  - `moveRule(all: Rule[], draggedId: string, targetId: string): Rule[]`(把 dragged 移到 target 前,纯函数)
  - `ruleSummary(r: Rule): string`(卡片摘要行)
  - `App` 提供状态与回调给后续任务的组件;导出 `LogEntry { time: string; ok: boolean; summary: string; details: string[] }`
  - 页面骨架:顶栏(品牌 + 一键打包/一键部署/设置齿轮 + 非管理员警示)、侧边导航(打包规则/部署规则/操作日志)、内容区。Task 13-16 的组件挂进此骨架:本任务先用占位 `<div className="empty">`,后续任务替换。

- [ ] **Step 1: 写失败测试 tests/rules-utils.test.ts**

```ts
import { describe, expect, it } from 'vitest'
import { moveRule, newRule, ruleSummary } from '../src/utils/rules'
import type { Rule } from '../shared/types'

const r = (id: string): Rule =>
  ({ id, type: 'env', name: id, enabled: true, key: 'K', value: 'V', op: 'set' })

describe('newRule', () => {
  it('各类型生成合法空白规则', () => {
    expect(newRule('pack')).toMatchObject({ type: 'pack', enabled: true, excludes: [] })
    expect(newRule('import')).toMatchObject({ type: 'import', preserve: [], rename: '' })
    expect(newRule('json')).toMatchObject({ type: 'json', op: 'upsert', data: {} })
    expect(newRule('env')).toMatchObject({ type: 'env', op: 'set' })
    expect(newRule('pack').id).not.toBe(newRule('pack').id)
  })
})

describe('moveRule', () => {
  it('把拖拽项移到目标项之前', () => {
    const all = [r('a'), r('b'), r('c'), r('d')]
    expect(moveRule(all, 'd', 'b').map(x => x.id)).toEqual(['a', 'd', 'b', 'c'])
    expect(moveRule(all, 'a', 'c').map(x => x.id)).toEqual(['b', 'a', 'c', 'd'])
  })
  it('拖到自身或未知 id 时原样返回', () => {
    const all = [r('a'), r('b')]
    expect(moveRule(all, 'a', 'a')).toEqual(all)
    expect(moveRule(all, 'x', 'b')).toEqual(all)
  })
})

describe('ruleSummary', () => {
  it('各类型摘要', () => {
    expect(ruleSummary({ ...newRule('pack'), source: 'S', output: 'O' } as Rule)).toBe('S → O')
    expect(ruleSummary({ ...newRule('import'), zip: 'Z', target: 'T' } as Rule)).toBe('Z → T')
    expect(ruleSummary({ ...newRule('json'), file: 'F', op: 'upsert' } as Rule)).toBe('F (upsert)')
    expect(ruleSummary({ ...newRule('env'), key: 'K', value: 'V' } as Rule)).toBe('K = V')
    expect(ruleSummary({ ...newRule('env'), key: 'Path', value: 'V', op: 'append_path' } as Rule)).toBe('Path += V')
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `npm test`
Expected: FAIL — 找不到 `../src/utils/rules`。

- [ ] **Step 3: 实现 src/utils/rules.ts**

```ts
import type { Rule, RuleType } from '@shared/types'

export function newRule(type: RuleType): Rule {
  const base = { id: crypto.randomUUID(), name: '', enabled: true }
  switch (type) {
    case 'pack':
      return { ...base, type, source: '', output: '', excludes: [] }
    case 'import':
      return { ...base, type, zip: '', target: '', preserve: [], rename: '' }
    case 'json':
      return { ...base, type, file: '', op: 'upsert', data: {} }
    case 'env':
      return { ...base, type, key: '', value: '', op: 'set' }
  }
}

export function moveRule(all: Rule[], draggedId: string, targetId: string): Rule[] {
  if (draggedId === targetId) return all
  const from = all.findIndex(r => r.id === draggedId)
  if (from < 0 || !all.some(r => r.id === targetId)) return all
  const next = [...all]
  const [moved] = next.splice(from, 1)
  next.splice(next.findIndex(r => r.id === targetId), 0, moved)
  return next
}

export function ruleSummary(r: Rule): string {
  switch (r.type) {
    case 'pack':
      return `${r.source} → ${r.output}`
    case 'import':
      return `${r.zip} → ${r.target}`
    case 'json':
      return `${r.file} (${r.op})`
    case 'env':
      return r.op === 'append_path' ? `${r.key} += ${r.value}` : `${r.key} = ${r.value}`
  }
}
```

- [ ] **Step 4: 运行确认通过**

Run: `npm test`
Expected: rules-utils 用例全部 PASS。

- [ ] **Step 5: 整文件替换 src/theme.css**

```css
/* ── 基础 ─────────────────────────────────────────── */
:root {
  --bg: #0f1115;
  --bg-panel: #151923;
  --bg-card: #1b2130;
  --bg-hover: #222a3d;
  --border: #2a3247;
  --text: #e6e9f0;
  --text-dim: #8b93a7;
  --accent: #4f8cff;
  --accent-2: #7c5cff;
  --ok: #3fbf7f;
  --err: #ff5d5d;
  --warn: #f5a623;
  --badge-pack: #4f8cff;
  --badge-import: #3fbf7f;
  --badge-json: #f5a623;
  --badge-env: #b97cff;
  --radius: 10px;
}

* { box-sizing: border-box; }

body {
  margin: 0;
  background: var(--bg);
  color: var(--text);
  font-family: 'Segoe UI', 'Microsoft YaHei', sans-serif;
  font-size: 14px;
  user-select: none;
}

input, textarea, select {
  background: var(--bg);
  color: var(--text);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 7px 10px;
  font: inherit;
  outline: none;
  user-select: text;
}
input:focus, textarea:focus, select:focus { border-color: var(--accent); }
textarea { resize: vertical; font-family: Consolas, monospace; }

.app { display: flex; flex-direction: column; height: 100vh; }
.spacer { flex: 1; }
.dim { color: var(--text-dim); }
.empty { color: var(--text-dim); text-align: center; padding: 48px 0; }
.loading { color: var(--text-dim); text-align: center; padding-top: 40vh; }

/* ── 顶栏 ─────────────────────────────────────────── */
.topbar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 18px;
  background: var(--bg-panel);
  border-bottom: 1px solid var(--border);
}
.brand { font-size: 15px; font-weight: 600; margin-right: 12px; white-space: nowrap; }

.hero {
  border: none;
  border-radius: 8px;
  padding: 9px 22px;
  font-size: 14px;
  font-weight: 600;
  color: #fff;
  cursor: pointer;
  transition: filter 0.15s;
}
.hero:hover { filter: brightness(1.15); }
.hero-pack { background: linear-gradient(135deg, #4f8cff, #7c5cff); }
.hero-deploy { background: linear-gradient(135deg, #2fae6e, #3fbf7f); }

.admin-warn { color: var(--warn); font-size: 13px; }

.icon-btn {
  background: none;
  border: none;
  color: var(--text-dim);
  font-size: 18px;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 6px;
}
.icon-btn:hover { color: var(--text); background: var(--bg-hover); }

/* ── 主体布局 ─────────────────────────────────────── */
.body { display: flex; flex: 1; min-height: 0; }

.sidebar {
  width: 148px;
  background: var(--bg-panel);
  border-right: 1px solid var(--border);
  padding: 12px 8px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.nav {
  background: none;
  border: none;
  color: var(--text-dim);
  text-align: left;
  padding: 10px 14px;
  border-radius: 8px;
  font-size: 14px;
  cursor: pointer;
}
.nav:hover { background: var(--bg-hover); color: var(--text); }
.nav.active { background: var(--bg-card); color: var(--text); font-weight: 600; }

.content { flex: 1; overflow-y: auto; padding: 16px 20px; }

/* ── 工具条 / 筛选 ────────────────────────────────── */
.toolbar { display: flex; align-items: center; gap: 10px; margin-bottom: 14px; flex-wrap: wrap; }
.segments { display: flex; background: var(--bg-panel); border: 1px solid var(--border); border-radius: 8px; overflow: hidden; }
.seg { background: none; border: none; color: var(--text-dim); padding: 7px 14px; cursor: pointer; font-size: 13px; }
.seg:hover { color: var(--text); }
.seg.active { background: var(--accent); color: #fff; }
.search { width: 220px; }

/* ── 按钮 ─────────────────────────────────────────── */
.btn {
  background: var(--bg-card);
  border: 1px solid var(--border);
  color: var(--text);
  border-radius: 6px;
  padding: 6px 14px;
  font-size: 13px;
  cursor: pointer;
}
.btn:hover:not(:disabled) { background: var(--bg-hover); border-color: var(--accent); }
.btn:disabled { opacity: 0.4; cursor: default; }
.btn-primary { background: var(--accent); border-color: var(--accent); color: #fff; }
.btn-primary:hover:not(:disabled) { background: var(--accent); filter: brightness(1.15); }
.btn-danger:hover:not(:disabled) { border-color: var(--err); color: var(--err); }

/* ── 规则卡片 ─────────────────────────────────────── */
.card {
  display: flex;
  align-items: center;
  gap: 12px;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 12px 16px;
  margin-bottom: 10px;
  cursor: grab;
  transition: border-color 0.15s;
}
.card:hover { border-color: var(--accent); }
.card.disabled { opacity: 0.5; }
.card-main { flex: 1; min-width: 0; }
.card-title { display: flex; align-items: center; gap: 8px; margin-bottom: 4px; }
.card-title .name { font-weight: 600; }
.card-summary {
  color: var(--text-dim);
  font-size: 12.5px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.card-actions { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }

.badge {
  font-size: 11px;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 20px;
  color: #fff;
}
.badge-pack { background: var(--badge-pack); }
.badge-import { background: var(--badge-import); }
.badge-json { background: var(--badge-json); color: #1a1a1a; }
.badge-env { background: var(--badge-env); }

/* ── 开关 ─────────────────────────────────────────── */
.switch { position: relative; width: 36px; height: 20px; display: inline-block; }
.switch input { display: none; }
.switch .slider {
  position: absolute; inset: 0;
  background: var(--border);
  border-radius: 20px;
  transition: background 0.15s;
}
.switch .slider::before {
  content: '';
  position: absolute;
  width: 14px; height: 14px;
  left: 3px; top: 3px;
  background: #fff;
  border-radius: 50%;
  transition: transform 0.15s;
}
.switch input:checked + .slider { background: var(--ok); }
.switch input:checked + .slider::before { transform: translateX(16px); }

/* ── 模态 ─────────────────────────────────────────── */
.modal-mask {
  position: fixed; inset: 0;
  background: rgba(0, 0, 0, 0.55);
  display: flex; align-items: center; justify-content: center;
  z-index: 100;
}
.modal {
  background: var(--bg-panel);
  border: 1px solid var(--border);
  border-radius: 12px;
  width: min(560px, 92vw);
  max-height: 86vh;
  display: flex; flex-direction: column;
}
.modal-head {
  display: flex; align-items: center; justify-content: space-between;
  padding: 14px 18px;
  border-bottom: 1px solid var(--border);
  font-weight: 600;
}
.modal-body { padding: 16px 18px; overflow-y: auto; }
.modal-foot {
  display: flex; align-items: center; gap: 10px;
  padding: 12px 18px;
  border-top: 1px solid var(--border);
}

/* ── 表单 ─────────────────────────────────────────── */
.field { display: flex; flex-direction: column; gap: 6px; margin-bottom: 14px; }
.field-label { font-size: 12.5px; color: var(--text-dim); }
.field input, .field textarea, .field select { width: 100%; }
.path-row { display: flex; gap: 8px; }
.path-row input { flex: 1; }
.form-errors { color: var(--err); font-size: 13px; margin-top: 4px; line-height: 1.7; }

/* ── Tag 输入 ─────────────────────────────────────── */
.tag-input {
  display: flex; flex-wrap: wrap; gap: 6px;
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 6px;
  background: var(--bg);
}
.tag-input input { border: none; flex: 1; min-width: 120px; padding: 4px; }
.tag {
  display: inline-flex; align-items: center; gap: 4px;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 5px;
  padding: 2px 4px 2px 8px;
  font-size: 12.5px;
}
.tag button {
  background: none; border: none; color: var(--text-dim);
  cursor: pointer; font-size: 13px; padding: 0 4px;
}
.tag button:hover { color: var(--err); }

/* ── 多选列表 / 结果 / 日志 ───────────────────────── */
.check-list { display: flex; flex-direction: column; gap: 2px; }
.check-item {
  display: flex; align-items: center; gap: 10px;
  padding: 8px 10px;
  border-radius: 6px;
  cursor: pointer;
}
.check-item:hover { background: var(--bg-hover); }
.check-item .name { font-weight: 500; white-space: nowrap; }
.check-item .dim { font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.progress-label { margin-bottom: 10px; }
.progress-bar {
  height: 8px;
  background: var(--bg);
  border-radius: 4px;
  overflow: hidden;
  border: 1px solid var(--border);
}
.progress-fill { height: 100%; background: linear-gradient(90deg, var(--accent), var(--accent-2)); transition: width 0.2s; }
.progress-detail { margin-top: 8px; font-size: 12.5px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.result-list { display: flex; flex-direction: column; gap: 6px; }
.result { display: flex; gap: 10px; padding: 8px 10px; border-radius: 6px; background: var(--bg); font-size: 13px; }
.result.ok > span:first-child { color: var(--ok); }
.result.err > span:first-child { color: var(--err); }
.result .name { font-weight: 600; white-space: nowrap; }
.result .msg { color: var(--text-dim); word-break: break-all; }

.logs { display: flex; flex-direction: column; gap: 10px; }
.log { background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius); padding: 10px 14px; }
.log.ok { border-left: 3px solid var(--ok); }
.log.err { border-left: 3px solid var(--err); }
.log-head { display: flex; gap: 12px; margin-bottom: 4px; }
.log-detail { color: var(--text-dim); font-size: 12.5px; line-height: 1.8; word-break: break-all; }

/* ── 设置 ─────────────────────────────────────────── */
.section-title { display: flex; align-items: center; gap: 12px; font-weight: 600; margin: 18px 0 10px; }
.backup-list { display: flex; flex-direction: column; gap: 6px; }
.backup-item { display: flex; align-items: center; gap: 12px; padding: 6px 10px; border-radius: 6px; background: var(--bg); }
.backup-item .name { flex: 1; font-size: 13px; }
```

- [ ] **Step 6: 写 src/pages/LogsPage.tsx**

```tsx
import type { LogEntry } from '../App'

export default function LogsPage({ logs }: { logs: LogEntry[] }) {
  if (!logs.length) return <div className="empty">本次会话还没有操作记录</div>
  return (
    <div className="logs">
      {logs.map((l, i) => (
        <div key={i} className={l.ok ? 'log ok' : 'log err'}>
          <div className="log-head">
            <span className="dim">{l.time}</span>
            <span>{l.summary}</span>
          </div>
          {l.details.map((d, j) => (
            <div key={j} className="log-detail">{d}</div>
          ))}
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 7: 整文件替换 src/App.tsx(骨架版,列表/弹窗位置先占位)**

```tsx
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { AppConfig, ProgressEvent, Rule, RuleResult, RuleTypeInfo } from '@shared/types'
import LogsPage from './pages/LogsPage'

export interface LogEntry {
  time: string
  ok: boolean
  summary: string
  details: string[]
}

type Page = 'pack' | 'deploy' | 'logs'

export default function App() {
  const [config, setConfig] = useState<AppConfig | null>(null)
  const [types, setTypes] = useState<RuleTypeInfo[]>([])
  const [admin, setAdmin] = useState(true)
  const [page, setPage] = useState<Page>('pack')
  const [editing, setEditing] = useState<{ rule: Rule; isNew: boolean } | null>(null)
  const [selecting, setSelecting] = useState<'pack' | 'deploy' | null>(null)
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState<ProgressEvent | null>(null)
  const [results, setResults] = useState<RuleResult[] | null>(null)
  const [showSettings, setShowSettings] = useState(false)
  const [logs, setLogs] = useState<LogEntry[]>([])

  useEffect(() => {
    void window.api.loadConfig().then(cfg => {
      setConfig(cfg)
      const p = cfg.uiState.page
      if (p === 'pack' || p === 'deploy' || p === 'logs') setPage(p)
    })
    void window.api.ruleTypes().then(setTypes)
    void window.api.isAdmin().then(setAdmin)
  }, [])

  /** 变更配置并立即持久化 */
  const update = useCallback((mut: (c: AppConfig) => AppConfig) => {
    setConfig(c => {
      if (!c) return c
      const next = mut(c)
      void window.api.saveConfig(next)
      return next
    })
  }, [])

  const selectPage = (p: Page): void => {
    setPage(p)
    update(c => ({ ...c, uiState: { ...c.uiState, page: p } }))
  }

  const packRules = useMemo(() => (config?.rules ?? []).filter(r => r.type === 'pack'), [config])
  const deployRules = useMemo(() => (config?.rules ?? []).filter(r => r.type !== 'pack'), [config])

  const runIds = useCallback(async (ids: string[]) => {
    if (!ids.length) return
    setRunning(true)
    setProgress(null)
    setResults(null)
    const off = window.api.onProgress(setProgress)
    try {
      const res = await window.api.runRules(ids)
      setResults(res)
      const ok = res.filter(r => r.ok).length
      setLogs(l => [
        {
          time: new Date().toLocaleString(),
          ok: ok === res.length,
          summary: `执行完成: ${ok} 成功 / ${res.length - ok} 失败`,
          details: res.map(r => `${r.ok ? '✓' : '✗'} ${r.name}: ${r.message}`),
        },
        ...l,
      ])
    } finally {
      off()
      setRunning(false)
    }
  }, [])

  if (!config) return <div className="loading">加载配置中…</div>

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">⚡ AI 编程环境部署</div>
        <button className="hero hero-pack" onClick={() => setSelecting('pack')}>一键打包</button>
        <button className="hero hero-deploy" onClick={() => setSelecting('deploy')}>一键部署</button>
        <div className="spacer" />
        {!admin && (
          <span className="admin-warn" title="修改系统环境变量需要管理员权限，请以管理员身份重新运行">
            ⚠ 非管理员
          </span>
        )}
        <button className="icon-btn" title="设置" onClick={() => setShowSettings(true)}>⚙</button>
      </header>

      <div className="body">
        <nav className="sidebar">
          {(
            [
              ['pack', '打包规则'],
              ['deploy', '部署规则'],
              ['logs', '操作日志'],
            ] as [Page, string][]
          ).map(([key, label]) => (
            <button key={key} className={page === key ? 'nav active' : 'nav'} onClick={() => selectPage(key)}>
              {label}
            </button>
          ))}
        </nav>

        <main className="content">
          {page === 'pack' && <div className="empty">打包规则列表（Task 13 实现）共 {packRules.length} 条</div>}
          {page === 'deploy' && <div className="empty">部署规则列表（Task 13 实现）共 {deployRules.length} 条</div>}
          {page === 'logs' && <LogsPage logs={logs} />}
        </main>
      </div>

      {/* Task 13-16 在此挂载:RuleEditor / SelectionDialog / RunOverlay / SettingsDialog */}
      {void editing}
      {void selecting}
      {void running}
      {void progress}
      {void results}
      {void showSettings}
      {void types}
      {void runIds}
    </div>
  )
}
```

注:`{void xxx}` 占位仅为通过 TS 未使用检查,Task 13-16 会逐个替换为真实组件挂载。

- [ ] **Step 8: 验证**

Run: `npm test && npx tsc --noEmit`
Expected: 全部 PASS,类型零错误。

Run: `npm run dev`,人工核对:
- 深色主题,顶栏有品牌、渐变「一键打包」「一键部署」按钮、⚙ 齿轮
- 侧边栏三项可切换,当前项高亮;切换后重启 dev,恢复上次页面
- 非管理员运行时顶栏出现「⚠ 非管理员」
确认后关闭。

- [ ] **Step 9: Commit**

```bash
git add src tests/rules-utils.test.ts
git commit -m "feat: UI 基座（深色主题 + 导航骨架 + 日志页 + 规则工具函数）

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 13: 规则列表 — 卡片 + 类型筛选 + 搜索 + 开关 + 拖拽排序 + 删除

**Files:**
- Create: `src/components/RuleCard.tsx`, `src/components/RuleList.tsx`
- Modify: `src/App.tsx`(替换两处占位 `<div className="empty">…Task 13…</div>` 为 `<RuleList …/>`,并加 import)

**Interfaces:**
- Consumes: `ruleSummary`/`moveRule`/`newRule`(Task 12)、`@shared/types`
- Produces:
  - `RuleCard` props: `{ rule: Rule; typeLabel: string; onEdit(): void; onDelete(): void; onRun(): void; onToggle(v: boolean): void; onDragStart(): void; onDropOn(): void }`
  - `RuleList` props: `{ rules: Rule[]; types: RuleTypeInfo[]; showTypeFilter: boolean; addTypes: RuleType[]; onAdd(type: RuleType): void; onEdit(rule: Rule): void; onDelete(id: string): void; onRun(id: string): void; onToggle(id: string, enabled: boolean): void; onMove(draggedId: string, targetId: string): void }`
  - 筛选选项由 `types` prop 动态生成(注册表驱动),新增 type 自动出现

- [ ] **Step 1: 写 src/components/RuleCard.tsx**

```tsx
import type { Rule } from '@shared/types'
import { ruleSummary } from '../utils/rules'

interface Props {
  rule: Rule
  typeLabel: string
  onEdit(): void
  onDelete(): void
  onRun(): void
  onToggle(v: boolean): void
  onDragStart(): void
  onDropOn(): void
}

export default function RuleCard({
  rule, typeLabel, onEdit, onDelete, onRun, onToggle, onDragStart, onDropOn,
}: Props) {
  return (
    <div
      className={rule.enabled ? 'card' : 'card disabled'}
      draggable
      onDragStart={onDragStart}
      onDragOver={e => e.preventDefault()}
      onDrop={onDropOn}
    >
      <div className="card-main">
        <div className="card-title">
          <span className={`badge badge-${rule.type}`}>{typeLabel}</span>
          <span className="name">{rule.name || '(未命名)'}</span>
        </div>
        <div className="card-summary" title={ruleSummary(rule)}>{ruleSummary(rule)}</div>
      </div>
      <div className="card-actions">
        <label className="switch" title={rule.enabled ? '已启用' : '已禁用'}>
          <input type="checkbox" checked={rule.enabled} onChange={e => onToggle(e.target.checked)} />
          <span className="slider" />
        </label>
        <button className="btn" onClick={onEdit}>编辑</button>
        <button className="btn" onClick={onRun} disabled={!rule.enabled}>执行</button>
        <button className="btn btn-danger" onClick={onDelete}>删除</button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: 写 src/components/RuleList.tsx**

```tsx
import { useMemo, useRef, useState } from 'react'
import type { Rule, RuleType, RuleTypeInfo } from '@shared/types'
import RuleCard from './RuleCard'
import { ruleSummary } from '../utils/rules'

interface Props {
  rules: Rule[]
  types: RuleTypeInfo[]
  showTypeFilter: boolean
  addTypes: RuleType[]
  onAdd(type: RuleType): void
  onEdit(rule: Rule): void
  onDelete(id: string): void
  onRun(id: string): void
  onToggle(id: string, enabled: boolean): void
  onMove(draggedId: string, targetId: string): void
}

export default function RuleList(props: Props) {
  const [typeFilter, setTypeFilter] = useState<RuleType | 'all'>('all')
  const [search, setSearch] = useState('')
  const dragId = useRef<string | null>(null)

  const labelOf = (t: RuleType): string => props.types.find(x => x.type === t)?.label ?? t

  const filtered = useMemo(() => {
    const kw = search.trim().toLowerCase()
    return props.rules.filter(r => {
      if (typeFilter !== 'all' && r.type !== typeFilter) return false
      if (kw && !r.name.toLowerCase().includes(kw) && !ruleSummary(r).toLowerCase().includes(kw)) return false
      return true
    })
  }, [props.rules, typeFilter, search])

  return (
    <div className="rule-list">
      <div className="toolbar">
        {props.showTypeFilter && (
          <div className="segments">
            <button className={typeFilter === 'all' ? 'seg active' : 'seg'} onClick={() => setTypeFilter('all')}>
              全部
            </button>
            {props.types.map(t => (
              <button
                key={t.type}
                className={typeFilter === t.type ? 'seg active' : 'seg'}
                onClick={() => setTypeFilter(t.type)}
              >
                {t.label}
              </button>
            ))}
          </div>
        )}
        <input
          className="search"
          placeholder="搜索名称 / 路径…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <div className="spacer" />
        {props.addTypes.map(t => (
          <button key={t} className="btn" onClick={() => props.onAdd(t)}>
            ＋ {labelOf(t)}规则
          </button>
        ))}
      </div>

      {filtered.length === 0 && <div className="empty">暂无规则，点击右上角新建</div>}
      {filtered.map(rule => (
        <RuleCard
          key={rule.id}
          rule={rule}
          typeLabel={labelOf(rule.type)}
          onEdit={() => props.onEdit(rule)}
          onDelete={() => props.onDelete(rule.id)}
          onRun={() => props.onRun(rule.id)}
          onToggle={v => props.onToggle(rule.id, v)}
          onDragStart={() => { dragId.current = rule.id }}
          onDropOn={() => {
            if (dragId.current) props.onMove(dragId.current, rule.id)
            dragId.current = null
          }}
        />
      ))}
    </div>
  )
}
```

- [ ] **Step 3: 修改 src/App.tsx 挂载列表**

在 import 区加:

```tsx
import RuleList from './components/RuleList'
import { moveRule, newRule } from './utils/rules'
```

用下面代码替换 `{page === 'pack' && …}` 与 `{page === 'deploy' && …}` 两行占位(共用回调,先抽出):

在 `if (!config) return …` 之前加:

```tsx
  const listCallbacks = {
    onAdd: (type: import('@shared/types').RuleType) => setEditing({ rule: newRule(type), isNew: true }),
    onEdit: (rule: Rule) => setEditing({ rule, isNew: false }),
    onDelete: (id: string) => {
      if (confirm('确定删除该规则？')) update(c => ({ ...c, rules: c.rules.filter(r => r.id !== id) }))
    },
    onRun: (id: string) => void runIds([id]),
    onToggle: (id: string, enabled: boolean) =>
      update(c => ({ ...c, rules: c.rules.map(r => (r.id === id ? { ...r, enabled } : r)) })),
    onMove: (draggedId: string, targetId: string) =>
      update(c => ({ ...c, rules: moveRule(c.rules, draggedId, targetId) })),
  }
```

内容区替换为:

```tsx
          {page === 'pack' && (
            <RuleList
              rules={packRules}
              types={types.filter(t => t.type === 'pack')}
              showTypeFilter={false}
              addTypes={['pack']}
              {...listCallbacks}
            />
          )}
          {page === 'deploy' && (
            <RuleList
              rules={deployRules}
              types={types.filter(t => t.type !== 'pack')}
              showTypeFilter
              addTypes={['import', 'json', 'env']}
              {...listCallbacks}
            />
          )}
```

同时删除占位块中已被使用的 `{void types}`、`{void runIds}`(保留其余 void 占位)。

- [ ] **Step 4: 验证**

Run: `npm test && npx tsc --noEmit`
Expected: 全部 PASS,类型零错误。

Run: `npm run dev`,人工核对(默认配置带 3 条预设规则):
- 打包页显示 1 张卡片(蓝色「打包」徽章),无类型筛选条,有搜索框
- 部署页显示 2 张卡片,类型筛选条「全部/导入/JSON/环境变量」逐个点选能过滤
- 搜索框输入「claude」只剩匹配卡片
- 开关切换后卡片变灰,「执行」按钮禁用;重启 dev 后状态保持(写入了 config.json)
- 部署页两张卡片可互相拖拽换位,顺序持久化
- 删除弹 confirm,确认后卡片消失
(「编辑」「执行」点击暂无反应属预期,Task 14/15 实现。)确认后关闭。

- [ ] **Step 5: Commit**

```bash
git add src
git commit -m "feat: 规则卡片列表（类型筛选/搜索/启用开关/拖拽排序/删除）

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 14: 规则编辑器 — Modal + TagInput + 四类型表单

**Files:**
- Create: `src/components/Modal.tsx`, `src/components/TagInput.tsx`, `src/components/RuleEditor.tsx`
- Modify: `src/App.tsx`(挂载 RuleEditor,替换 `{void editing}` 占位)

**Interfaces:**
- Consumes: `window.api.pickFile/pickDir`、`@shared/types`、Task 13 的 `setEditing` 状态
- Produces:
  - `Modal` props: `{ title: string; onClose(): void; footer?: ReactNode; children: ReactNode }`
  - `TagInput` props: `{ value: string[]; onChange(v: string[]): void; placeholder?: string }`(回车/失焦添加,× 删除,去重)
  - `RuleEditor` props: `{ rule: Rule; isNew: boolean; typeLabel: string; onSave(r: Rule): void; onClose(): void }`(保存前本地校验,错误红字列出)

- [ ] **Step 1: 写 src/components/Modal.tsx**

```tsx
import type { ReactNode } from 'react'

interface Props {
  title: string
  onClose(): void
  footer?: ReactNode
  children: ReactNode
}

export default function Modal({ title, onClose, footer, children }: Props) {
  return (
    <div
      className="modal-mask"
      onMouseDown={e => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="modal">
        <div className="modal-head">
          <span>{title}</span>
          <button className="icon-btn" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: 写 src/components/TagInput.tsx**

```tsx
import { useState } from 'react'

interface Props {
  value: string[]
  onChange(v: string[]): void
  placeholder?: string
}

export default function TagInput({ value, onChange, placeholder }: Props) {
  const [text, setText] = useState('')

  const add = (): void => {
    const t = text.trim()
    if (t && !value.includes(t)) onChange([...value, t])
    setText('')
  }

  return (
    <div className="tag-input">
      {value.map(t => (
        <span className="tag" key={t}>
          {t}
          <button onClick={() => onChange(value.filter(x => x !== t))}>×</button>
        </span>
      ))}
      <input
        value={text}
        placeholder={placeholder}
        onChange={e => setText(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter') {
            e.preventDefault()
            add()
          }
        }}
        onBlur={add}
      />
    </div>
  )
}
```

- [ ] **Step 3: 写 src/components/RuleEditor.tsx**

```tsx
import { useState, type ReactNode } from 'react'
import type { EnvOp, JsonOp, Rule } from '@shared/types'
import Modal from './Modal'
import TagInput from './TagInput'

interface Props {
  rule: Rule
  isNew: boolean
  typeLabel: string
  onSave(r: Rule): void
  onClose(): void
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="field">
      <span className="field-label">{label}</span>
      {children}
    </div>
  )
}

function PathRow({ value, onChange, pick, placeholder }: {
  value: string
  onChange(v: string): void
  pick?: 'file' | 'dir'
  placeholder?: string
}) {
  const browse = async (): Promise<void> => {
    const p = pick === 'dir' ? await window.api.pickDir() : await window.api.pickFile()
    if (p) onChange(p)
  }
  return (
    <div className="path-row">
      <input value={value} placeholder={placeholder} onChange={e => onChange(e.target.value)} />
      {pick && <button className="btn" onClick={() => void browse()}>浏览…</button>}
    </div>
  )
}

export default function RuleEditor({ rule, isNew, typeLabel, onSave, onClose }: Props) {
  const [draft, setDraft] = useState<Rule>(() => structuredClone(rule))
  const [jsonText, setJsonText] = useState(() =>
    rule.type === 'json' ? JSON.stringify(rule.data, null, 2) : '',
  )
  const [errors, setErrors] = useState<string[]>([])

  const patch = (p: object): void => setDraft(d => ({ ...d, ...p }) as Rule)

  const save = (): void => {
    const errs: string[] = []
    const final = structuredClone(draft)
    if (!final.name.trim()) errs.push('名称不能为空')
    switch (final.type) {
      case 'pack':
        if (!final.source.trim()) errs.push('源路径不能为空')
        if (!final.output.trim()) errs.push('输出文件不能为空')
        break
      case 'import':
        if (!final.zip.trim()) errs.push('源文件不能为空')
        if (!final.target.trim()) errs.push('目标目录不能为空')
        break
      case 'json': {
        if (!final.file.trim()) errs.push('文件路径不能为空')
        try {
          const d: unknown = JSON.parse(jsonText.trim() || '{}')
          if (typeof d !== 'object' || d === null || Array.isArray(d)) errs.push('数据必须是 JSON 对象')
          else final.data = d as Record<string, unknown>
        } catch {
          errs.push('JSON 数据格式错误')
        }
        break
      }
      case 'env':
        if (!final.key.trim()) errs.push('变量名不能为空')
        break
    }
    if (errs.length) {
      setErrors(errs)
      return
    }
    onSave(final)
  }

  return (
    <Modal
      title={`${isNew ? '新建' : '编辑'}${typeLabel}规则`}
      onClose={onClose}
      footer={
        <>
          <div className="spacer" />
          <button className="btn" onClick={onClose}>取消</button>
          <button className="btn btn-primary" onClick={save}>保存</button>
        </>
      }
    >
      <Field label="名称">
        <input value={draft.name} placeholder="给这条规则起个名字" onChange={e => patch({ name: e.target.value })} />
      </Field>

      {draft.type === 'pack' && (
        <>
          <Field label="源路径（目录或文件，支持 ${VAR} 环境变量）">
            <PathRow value={draft.source} onChange={v => patch({ source: v })} pick="dir" placeholder="${USERPROFILE}/.claude" />
          </Field>
          <Field label="输出文件（相对路径存入 packages/，.zip 打包、其它后缀单文件直拷）">
            <PathRow value={draft.output} onChange={v => patch({ output: v })} placeholder="claude.zip" />
          </Field>
          <Field label="排除（文件/目录名或相对路径，支持 * 通配符）">
            <TagInput value={draft.excludes} onChange={v => patch({ excludes: v })} placeholder="输入后回车添加" />
          </Field>
        </>
      )}

      {draft.type === 'import' && (
        <>
          <Field label="源文件（zip 或任意文件，相对路径从 packages/ 查找）">
            <PathRow value={draft.zip} onChange={v => patch({ zip: v })} pick="file" placeholder="claude.zip" />
          </Field>
          <Field label="目标目录（支持 ${VAR} 环境变量）">
            <PathRow value={draft.target} onChange={v => patch({ target: v })} pick="dir" placeholder="${USERPROFILE}/.claude" />
          </Field>
          <Field label="重命名（仅非 zip 单文件生效，留空保持原名）">
            <input value={draft.rename} onChange={e => patch({ rename: e.target.value })} />
          </Field>
          <Field label="保留（导入时保留目标目录中匹配的文件/目录，优先于 zip 内容）">
            <TagInput value={draft.preserve} onChange={v => patch({ preserve: v })} placeholder="输入后回车添加" />
          </Field>
        </>
      )}

      {draft.type === 'json' && (
        <>
          <Field label="JSON 文件路径（支持 ${VAR} 环境变量）">
            <PathRow value={draft.file} onChange={v => patch({ file: v })} pick="file" />
          </Field>
          <Field label="操作">
            <select value={draft.op} onChange={e => patch({ op: e.target.value as JsonOp })}>
              <option value="upsert">upsert — 有则改、无则加</option>
              <option value="append">append — 仅新增，key 已存在则报错</option>
              <option value="modify">modify — 仅修改，key 不存在则报错</option>
              <option value="overwrite">overwrite — 全量覆盖整个文件</option>
            </select>
          </Field>
          <Field label="数据（JSON 对象，嵌套对象逐层合并）">
            <textarea rows={10} value={jsonText} spellCheck={false} onChange={e => setJsonText(e.target.value)} />
          </Field>
        </>
      )}

      {draft.type === 'env' && (
        <>
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
            </select>
          </Field>
        </>
      )}

      {errors.length > 0 && (
        <div className="form-errors">
          {errors.map((e, i) => (
            <div key={i}>• {e}</div>
          ))}
        </div>
      )}
    </Modal>
  )
}
```

- [ ] **Step 4: 修改 src/App.tsx 挂载编辑器**

import 区加:

```tsx
import RuleEditor from './components/RuleEditor'
```

在 `if (!config) return …` 之前加保存回调:

```tsx
  const saveRule = (rule: Rule): void => {
    update(c => {
      const exists = c.rules.some(r => r.id === rule.id)
      return { ...c, rules: exists ? c.rules.map(r => (r.id === rule.id ? rule : r)) : [...c.rules, rule] }
    })
    setEditing(null)
  }
```

将 `{void editing}` 占位替换为:

```tsx
      {editing && (
        <RuleEditor
          rule={editing.rule}
          isNew={editing.isNew}
          typeLabel={types.find(t => t.type === editing.rule.type)?.label ?? editing.rule.type}
          onSave={saveRule}
          onClose={() => setEditing(null)}
        />
      )}
```

- [ ] **Step 5: 验证**

Run: `npm test && npx tsc --noEmit`
Expected: 全部 PASS,类型零错误。

Run: `npm run dev`,人工核对:
- 各页「＋ xx规则」打开对应类型的新建表单;卡片「编辑」回填现有值
- pack/import 表单的「浏览…」能打开系统目录/文件选择器
- excludes/preserve 输入回车变 tag,× 可删
- json 表单填非法 JSON 保存 → 红字「JSON 数据格式错误」;名称留空 → 「名称不能为空」
- 保存后卡片立即更新且 config.json 持久化;点遮罩/×/取消 关闭不保存
确认后关闭。

- [ ] **Step 6: Commit**

```bash
git add src
git commit -m "feat: 规则编辑器（四类型表单 + 路径选择器 + Tag 输入 + 校验）

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 15: 一键执行 — 多选记忆弹窗 + 进度 + 结果

**Files:**
- Create: `src/components/SelectionDialog.tsx`, `src/components/RunOverlay.tsx`
- Modify: `src/App.tsx`(挂载两组件,替换 `{void selecting}` `{void running}` `{void progress}` `{void results}` 占位)

**Interfaces:**
- Consumes: `runIds`(Task 12)、`window.api.onProgress/runRules`、`config.selectionMemory`
- Produces:
  - `SelectionDialog` props: `{ title: string; rules: Rule[]; memory: Record<string, boolean>; onConfirm(ids: string[], memory: Record<string, boolean>): void; onCancel(): void }`(勾选默认取 memory,没记忆默认勾;全选/全不选)
  - `RunOverlay` props: `{ running: boolean; progress: ProgressEvent | null; results: RuleResult[] | null; onClose(): void }`

- [ ] **Step 1: 写 src/components/SelectionDialog.tsx**

```tsx
import { useState } from 'react'
import type { Rule } from '@shared/types'
import Modal from './Modal'
import { ruleSummary } from '../utils/rules'

interface Props {
  title: string
  rules: Rule[]
  memory: Record<string, boolean>
  onConfirm(ids: string[], memory: Record<string, boolean>): void
  onCancel(): void
}

export default function SelectionDialog({ title, rules, memory, onConfirm, onCancel }: Props) {
  const [checked, setChecked] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(rules.map(r => [r.id, memory[r.id] ?? true])),
  )
  const allChecked = rules.length > 0 && rules.every(r => checked[r.id])
  const ids = rules.filter(r => checked[r.id]).map(r => r.id)

  return (
    <Modal
      title={title}
      onClose={onCancel}
      footer={
        <>
          <button
            className="btn"
            disabled={!rules.length}
            onClick={() => setChecked(Object.fromEntries(rules.map(r => [r.id, !allChecked])))}
          >
            {allChecked ? '全不选' : '全选'}
          </button>
          <div className="spacer" />
          <button className="btn" onClick={onCancel}>取消</button>
          <button className="btn btn-primary" disabled={!ids.length} onClick={() => onConfirm(ids, checked)}>
            执行 ({ids.length})
          </button>
        </>
      }
    >
      {rules.length === 0 && <div className="empty">没有已启用的规则</div>}
      <div className="check-list">
        {rules.map(r => (
          <label key={r.id} className="check-item">
            <input
              type="checkbox"
              checked={!!checked[r.id]}
              onChange={e => setChecked(c => ({ ...c, [r.id]: e.target.checked }))}
            />
            <span className="name">{r.name}</span>
            <span className="dim">{ruleSummary(r)}</span>
          </label>
        ))}
      </div>
    </Modal>
  )
}
```

- [ ] **Step 2: 写 src/components/RunOverlay.tsx**

```tsx
import type { ProgressEvent, RuleResult } from '@shared/types'
import Modal from './Modal'

interface Props {
  running: boolean
  progress: ProgressEvent | null
  results: RuleResult[] | null
  onClose(): void
}

export default function RunOverlay({ running, progress, results, onClose }: Props) {
  if (running) {
    const pct = progress && progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0
    return (
      <Modal title="执行中…" onClose={() => {}}>
        <div className="progress-label">
          {progress ? `[${progress.ruleIndex + 1}/${progress.ruleCount}] ${progress.ruleName}` : '准备中…'}
        </div>
        <div className="progress-bar">
          <div className="progress-fill" style={{ width: `${pct}%` }} />
        </div>
        <div className="progress-detail dim">{progress?.detail ?? ''}</div>
      </Modal>
    )
  }

  if (!results) return null
  const ok = results.filter(r => r.ok).length
  return (
    <Modal
      title={`执行结果: ${ok} 成功 / ${results.length - ok} 失败`}
      onClose={onClose}
      footer={
        <>
          <div className="spacer" />
          <button className="btn btn-primary" onClick={onClose}>关闭</button>
        </>
      }
    >
      <div className="result-list">
        {results.map((r, i) => (
          <div key={i} className={r.ok ? 'result ok' : 'result err'}>
            <span>{r.ok ? '✓' : '✗'}</span>
            <span className="name">{r.name}</span>
            <span className="msg">{r.message}</span>
          </div>
        ))}
      </div>
    </Modal>
  )
}
```

- [ ] **Step 3: 修改 src/App.tsx 挂载执行流**

import 区加:

```tsx
import SelectionDialog from './components/SelectionDialog'
import RunOverlay from './components/RunOverlay'
```

在 `saveRule` 后加确认回调:

```tsx
  const confirmSelection = (kind: 'pack' | 'deploy', ids: string[], memory: Record<string, boolean>): void => {
    setSelecting(null)
    update(c => ({ ...c, selectionMemory: { ...c.selectionMemory, [kind]: memory } }))
    void runIds(ids)
  }
```

将 `{void selecting}` `{void running}` `{void progress}` `{void results}` 四行占位替换为:

```tsx
      {selecting && (
        <SelectionDialog
          title={selecting === 'pack' ? '选择要打包的规则' : '选择要部署的规则'}
          rules={(selecting === 'pack' ? packRules : deployRules).filter(r => r.enabled)}
          memory={config.selectionMemory[selecting]}
          onConfirm={(ids, memory) => confirmSelection(selecting, ids, memory)}
          onCancel={() => setSelecting(null)}
        />
      )}
      {(running || results) && (
        <RunOverlay running={running} progress={progress} results={results} onClose={() => setResults(null)} />
      )}
```

- [ ] **Step 4: 验证(端到端首次真实执行)**

Run: `npm test && npx tsc --noEmit`
Expected: 全部 PASS,类型零错误。

Run: `npm run dev`,人工核对:
- 「一键打包」弹多选(默认预设 1 条,默认勾选)→ 执行 → 进度条走动 → 结果 ✓「已打包 N 个文件到 …\packages\claude.zip」;`packages/claude.zip` 真实生成
- 造一条导入规则指向临时目录执行,文件真实解压
- 取消部分勾选后确认,再次打开弹窗记忆保持(config.json 的 selectionMemory 更新)
- 卡片「执行」单条运行同样出进度和结果
- 故意造一条源路径不存在的规则参与批量:该条 ✗ 其余 ✓,批量未中断;操作日志页出现记录
确认后关闭。

- [ ] **Step 5: Commit**

```bash
git add src
git commit -m "feat: 一键打包/部署执行流（多选记忆 + 实时进度 + 结果面板）

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 16: 设置对话框 — 导入前备份开关 + 配置备份/恢复

**Files:**
- Create: `src/components/SettingsDialog.tsx`
- Modify: `src/App.tsx`(挂载,替换 `{void showSettings}` 占位)

**Interfaces:**
- Consumes: `window.api.backupConfig/listBackups/restoreConfig`、`config.settings`
- Produces: `SettingsDialog` props: `{ config: AppConfig; onChangeSettings(s: Settings): void; onRestore(cfg: AppConfig): void; onLog(summary: string, ok: boolean): void; onClose(): void }`

- [ ] **Step 1: 写 src/components/SettingsDialog.tsx**

```tsx
import { useEffect, useState } from 'react'
import type { AppConfig, BackupInfo, Settings } from '@shared/types'
import Modal from './Modal'

interface Props {
  config: AppConfig
  onChangeSettings(s: Settings): void
  onRestore(cfg: AppConfig): void
  onLog(summary: string, ok: boolean): void
  onClose(): void
}

export default function SettingsDialog({ config, onChangeSettings, onRestore, onLog, onClose }: Props) {
  const [backups, setBackups] = useState<BackupInfo[]>([])

  const refresh = (): void => {
    void window.api.listBackups().then(setBackups)
  }
  useEffect(refresh, [])

  const doBackup = async (): Promise<void> => {
    try {
      await window.api.backupConfig()
      onLog('配置已备份', true)
    } catch (e) {
      onLog(`配置备份失败: ${e instanceof Error ? e.message : String(e)}`, false)
    }
    refresh()
  }

  const doRestore = async (b: BackupInfo): Promise<void> => {
    if (!confirm(`确定恢复配置 ${b.file}？当前配置将被覆盖。`)) return
    const cfg = await window.api.restoreConfig(b.path)
    onRestore(cfg)
    onLog(`配置已恢复: ${b.file}`, true)
    onClose()
  }

  return (
    <Modal
      title="设置"
      onClose={onClose}
      footer={
        <>
          <div className="spacer" />
          <button className="btn btn-primary" onClick={onClose}>关闭</button>
        </>
      }
    >
      <label className="check-item">
        <input
          type="checkbox"
          checked={config.settings.backupBeforeImport}
          onChange={e => onChangeSettings({ ...config.settings, backupBeforeImport: e.target.checked })}
        />
        <span>导入前备份目标目录（关闭则直接删除重建）</span>
      </label>

      <div className="section-title">
        配置备份
        <button className="btn" onClick={() => void doBackup()}>立即备份</button>
      </div>
      <div className="backup-list">
        {backups.length === 0 && <div className="empty">暂无备份</div>}
        {backups.map(b => (
          <div key={b.path} className="backup-item">
            <span className="name">{b.file}</span>
            <span className="dim">{new Date(b.mtime).toLocaleString()}</span>
            <button className="btn" onClick={() => void doRestore(b)}>恢复</button>
          </div>
        ))}
      </div>
    </Modal>
  )
}
```

- [ ] **Step 2: 修改 src/App.tsx 挂载设置**

import 区加:

```tsx
import SettingsDialog from './components/SettingsDialog'
```

将 `{void showSettings}` 占位替换为(此时所有 `{void …}` 占位应已全部清除):

```tsx
      {showSettings && (
        <SettingsDialog
          config={config}
          onChangeSettings={s => update(c => ({ ...c, settings: s }))}
          onRestore={cfg => setConfig(cfg)}
          onLog={(summary, ok) =>
            setLogs(l => [{ time: new Date().toLocaleString(), ok, summary, details: [] }, ...l])
          }
          onClose={() => setShowSettings(false)}
        />
      )}
```

- [ ] **Step 3: 验证**

Run: `npm test && npx tsc --noEmit`
Expected: 全部 PASS,类型零错误。

Run: `npm run dev`,人工核对:
- ⚙ 打开设置;勾/去勾「导入前备份」立即写入 config.json
- 「立即备份」后列表出现新条目,`config_backups/` 生成文件;超过 10 份自动清理最旧
- 改动配置(如删一条规则)→「恢复」某备份 → confirm → 界面规则恢复,日志页有记录
- 开着「导入前备份」执行一次导入规则,目标目录旁生成 `<目标>-backup-<时间戳>`
确认后关闭。

- [ ] **Step 4: Commit**

```bash
git add src
git commit -m "feat: 设置对话框（导入前备份开关 + 配置备份/恢复）

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 17: portable 打包 + README 重写

**Files:**
- Create: `electron-builder.yml`
- Modify: `README.md`(整文件替换)

**Interfaces:**
- Consumes: 全部前置任务
- Produces: `npm run dist` 产出 `release/jz-aicoding-env-tool-2.0.0.exe`(portable 单文件);exe 同目录读写 `config.json`/`packages/`/`config_backups/`

- [ ] **Step 1: 写 electron-builder.yml**

```yaml
appId: com.loong.jz-aicoding-env-tool
productName: jz-aicoding-env-tool
directories:
  output: release
files:
  - out/**
win:
  target: portable
portable:
  artifactName: ${productName}-${version}.exe
electronLanguages:
  - zh-CN
```

- [ ] **Step 2: 构建**

Run: `npm run dist`
Expected: 成功产出 `release/jz-aicoding-env-tool-2.0.0.exe`(约 80-100MB)。

- [ ] **Step 3: 真机验证 portable exe**

把 exe 复制到一个干净临时目录运行,人工核对:
- 启动显示完整 UI,首次运行在 **exe 同目录**生成 `config.json`(不是 %TEMP% 或 cwd)
- 执行预设打包规则,`packages/claude.zip` 生成在 exe 同目录
- 设置里「立即备份」在 exe 同目录生成 `config_backups/`
- 以管理员身份重启 exe,顶栏「⚠ 非管理员」消失,env 规则可真实写入(用无害变量如 `JZ_TEST=1` 验证后手动删除)

- [ ] **Step 4: 整文件替换 README.md**

```markdown
# jz-aicoding-env-tool

一键搭建 AI 编程环境的 Windows 桌面工具。把源机器上的 AI 编程配置（如 `~/.claude`）打包导出，在新机器上一键部署：解压配置、修改 JSON、写入系统环境变量。

基于 Electron + React + TypeScript，分发为免安装的 portable 单 exe。**仅支持 Windows。**

## 功能

界面分三页：**打包规则**（源机器用）、**部署规则**（新机器用）、**操作日志**。

| 规则类型 | 作用 |
|----------|------|
| 打包 | 目录 → zip（支持排除通配符）；单文件直拷 |
| 导入 | zip → 目标目录（支持保留指定文件、导入前备份、单文件重命名） |
| JSON | 对 JSON 文件 append / modify / upsert / overwrite（嵌套深度合并，写前自动 .bak） |
| 环境变量 | 写系统环境变量 / 追加 PATH 去重（需管理员，自动广播生效） |

- 顶部「一键打包」「一键部署」：多选规则批量执行，记忆上次勾选
- 规则卡片：启用开关、单条执行、拖拽排序（部署顺序）、类型筛选、关键字搜索
- 所有路径支持 `${VAR}` 环境变量占位符（如 `${USERPROFILE}/.claude`），同一份规则跨机器通用
- 配置备份/恢复（保留最近 10 份）

## 使用

发布目录结构（全部文件跟随 exe 所在目录）：

```
任意目录/
├── jz-aicoding-env-tool-2.0.0.exe   ← 主程序
├── config.json                      ← 首次运行自动生成
├── packages/                        ← 打包输出 / 导入来源
└── config_backups/                  ← 配置备份
```

典型流程：
1. **源机器**：配好打包规则 → 一键打包 → 把 exe + config.json + packages/ 一起拷走
2. **新机器**：以管理员身份运行 → 一键部署

## 开发

```bash
npm install
npm run dev        # 开发窗口
npm test           # 核心引擎单测（Vitest）
npm run typecheck  # tsc --noEmit
npm run dist       # 打包 portable exe 到 release/
```

## 架构

```
electron/core/          # 纯 Node 规则引擎（不依赖 Electron，可单测/未来可 CLI 化）
├── engine.ts           # 执行器注册表 + 批量执行
├── executors/          # pack / import / json / env（新增动作类型在此扩展）
├── config.ts           # 配置读写/备份
└── ...
electron/main.ts        # 窗口 + IPC
electron/preload.ts     # 类型安全 window.api
shared/                 # 主进程/渲染层共享类型
src/                    # React 界面
```

新增规则类型 = 新写一个 executor + 注册一行 + 一个编辑表单分支，执行/进度/日志/多选记忆全部复用。
```

- [ ] **Step 5: 全量回归**

Run: `npm test && npx tsc --noEmit && npm run build`
Expected: 测试全过、类型零错误、构建成功。

- [ ] **Step 6: Commit**

```bash
git add electron-builder.yml README.md
git commit -m "feat: portable 单 exe 打包与 README 重写

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## 验收清单(对照 spec)

- [ ] §2 技术栈:Electron + React + TS + archiver/node-stream-zip + PowerShell env + portable(Task 2/7/8/9/17)
- [ ] §3 可插拔引擎:注册表 + 四执行器 + 引擎层不依赖窗口(Task 5/6/7/8/9/10;CLI 预留=架构纪律)
- [ ] §3.2 路径变量 `${VAR}`(Task 3,各执行器接入 6/7/8/9)
- [ ] §4 统一规则表 config.json + `enabled` + 默认 AI 预设 + exe 同目录(Task 5/11/17)
- [ ] §5 UI:卡片/筛选(注册表驱动)/搜索/拖拽/单条执行/多选记忆/进度/结果/日志/设置(Task 12-16)
- [ ] §7 错误处理:单条失败不中断(Task 10)、validate 前置(各执行器 + 编辑表单)、非管理员明确报错(Task 9)
- [ ] §8 扩展预留:version+id(Task 5)、引擎无窗口依赖(Task 10)、执行器注册表(Task 10)
- [ ] §9 不做:无同步/时间戳模块、无旧配置迁移、无跨平台分支、无旧代码复用(Task 1 起全新)
