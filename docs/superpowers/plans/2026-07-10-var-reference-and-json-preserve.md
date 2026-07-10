# `${VAR}` 快查面板 + JSON 保留指定 key 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development 或 executing-plans 按任务逐条实现。步骤用 `- [ ]` 勾选跟踪。

**Goal:** 加一个 `${VAR}` 环境变量快查面板，并让 JSON 规则的 overwrite/upsert 支持「保留原文件指定 key」。

**Architecture:** 引擎层（`electron/core/**`）加点路径工具与统一 preserve 收尾；新增一个 IPC 暴露主进程环境变量；渲染层加两个新组件（查阅面板、逐行路径编辑器）并接入编辑器。

**Tech Stack:** Electron 43 + React 19 + TypeScript(strict) + Vitest。

## Global Constraints

- 引擎层 `electron/core/**` 不得 import electron。
- 危险 key（`__proto__`/`constructor`/`prototype`）在任何对象写入路径都要跳过，复用 `DANGEROUS_KEYS`。
- `preserve` 仅对 `overwrite`、`upsert` 生效；`append`/`modify` 忽略且界面不显示。
- 语义：preserve 路径永远保持**原文件**的值（原值优先于 data）。只统计/回写「原文件里实际存在」的路径。
- 全局 `body { user-select: none }`；查阅面板容器需显式 `user-select: text`。
- 全部改动完成后 `npm run test`、`npm run typecheck` 必须通过。

---

### Task 1: JSON 点路径工具 + preserve 语义（引擎，TDD）

**Files:**
- Modify: `shared/types.ts`（`JsonRule` 加 `preserve?: string[]`）
- Modify: `electron/core/executors/json.ts`
- Test: `tests/json.test.ts`

**Interfaces:**
- Produces:
  - `getByPath(obj: Record<string, unknown>, path: string): unknown`
  - `setByPath(obj: Record<string, unknown>, path: string, value: unknown): void`
  - `applyPreserve(result: Record<string, unknown>, existing: Record<string, unknown>, preserve: string[] | undefined): void`
  - JSON executor 的 overwrite/upsert 应用 preserve；`plan()` 汇报保留项。

- [ ] **Step 1: 写失败测试** —— 在 `tests/json.test.ts` 追加：

```ts
import { getByPath, setByPath } from '../electron/core/executors/json'

describe('getByPath', () => {
  it('命中嵌套值', () => {
    expect(getByPath({ a: { b: { c: 1 } } }, 'a.b.c')).toBe(1)
  })
  it('路径不存在 → undefined', () => {
    expect(getByPath({ a: {} }, 'a.b.c')).toBeUndefined()
  })
  it('中途非对象 → undefined', () => {
    expect(getByPath({ a: 5 }, 'a.b')).toBeUndefined()
  })
  it('空段非法 → undefined', () => {
    expect(getByPath({ a: { b: 1 } }, 'a..b')).toBeUndefined()
  })
})

describe('setByPath', () => {
  it('新建嵌套对象', () => {
    const o: Record<string, unknown> = {}
    setByPath(o, 'a.b.c', 9)
    expect(o).toEqual({ a: { b: { c: 9 } } })
  })
  it('中途非对象则替换为对象', () => {
    const o: Record<string, unknown> = { a: 5 }
    setByPath(o, 'a.b', 1)
    expect(o).toEqual({ a: { b: 1 } })
  })
  it('危险 key 整条跳过', () => {
    const o: Record<string, unknown> = {}
    setByPath(o, '__proto__.polluted', true)
    expect(({} as Record<string, unknown>).polluted).toBeUndefined()
  })
  it('空段非法则跳过', () => {
    const o: Record<string, unknown> = {}
    setByPath(o, 'a..b', 1)
    expect(o).toEqual({})
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run tests/json.test.ts`
Expected: FAIL（`getByPath`/`setByPath` 未导出）

- [ ] **Step 3: 实现工具** —— 在 `json.ts` 顶部（`DANGEROUS_KEYS` 之后）加：

```ts
function splitPath(path: string): string[] | null {
  const segs = path.split('.')
  if (segs.some(s => s.length === 0)) return null
  return segs
}

export function getByPath(obj: Record<string, unknown>, path: string): unknown {
  const segs = splitPath(path)
  if (!segs) return undefined
  let cur: unknown = obj
  for (const s of segs) {
    if (!isPlainObject(cur)) return undefined
    cur = cur[s]
  }
  return cur
}

export function setByPath(obj: Record<string, unknown>, path: string, value: unknown): void {
  const segs = splitPath(path)
  if (!segs || segs.some(s => DANGEROUS_KEYS.has(s))) return
  let cur: Record<string, unknown> = obj
  for (let i = 0; i < segs.length - 1; i++) {
    const s = segs[i]
    if (!isPlainObject(cur[s])) cur[s] = {}
    cur = cur[s] as Record<string, unknown>
  }
  cur[segs[segs.length - 1]] = value
}

function applyPreserve(
  result: Record<string, unknown>,
  existing: Record<string, unknown>,
  preserve: string[] | undefined,
): string[] {
  const kept: string[] = []
  for (const p of preserve ?? []) {
    const old = getByPath(existing, p)
    if (old !== undefined) {
      setByPath(result, p, old)
      kept.push(p)
    }
  }
  return kept
}
```

- [ ] **Step 4: 类型** —— `shared/types.ts` 的 `JsonRule` 加 `preserve?: string[]`。

- [ ] **Step 5: overwrite/upsert 应用 preserve（execute）** —— 改 `json.ts` execute：

overwrite 分支写入前：
```ts
if (rule.op === 'overwrite') {
  fs.mkdirSync(path.dirname(filepath), { recursive: true })
  const out = structuredClone(data)
  if (fs.existsSync(filepath)) {
    const prev: unknown = JSON.parse(fs.readFileSync(filepath, 'utf8'))
    if (isPlainObject(prev)) applyPreserve(out, prev, rule.preserve)
    fs.copyFileSync(filepath, filepath + '.bak')
  }
  fs.writeFileSync(filepath, JSON.stringify(out, null, 2), 'utf8')
  ctx.onProgress(1, 1, path.basename(filepath))
  return `已全量覆盖 ${filepath}`
}
```
upsert 分支：`merged = deepMerge(existing, data)` 后加 `applyPreserve(merged, existing, rule.preserve)`。

- [ ] **Step 6: plan() 汇报保留项** —— overwrite plan 分支返回时，若存在 preserve 命中（读原文件用 `getByPath` 判断存在），changes 末尾追加 `{ kind: 'noop', detail: '保留 N 项：a.b, …' }`；upsert（走通用合并分支）同理在返回前追加。仅统计原文件实际存在的路径。

- [ ] **Step 7: 写 preserve 行为测试** —— 追加（用临时文件，参考本文件既有 fs 测试写法；若无则用 `os.tmpdir()`）：overwrite 保留存在路径的原值、跳过不存在路径、文件不存在时普通覆盖；upsert 下 data 写了该路径但原值优先。

- [ ] **Step 8: 跑全部引擎测试 + typecheck**

Run: `npx vitest run` 然后 `npm run typecheck`
Expected: PASS

- [ ] **Step 9: Commit** `feat(json): overwrite/upsert 支持保留原文件指定 key（点路径）`

---

### Task 2: 环境变量 IPC + api

**Files:**
- Modify: `electron/main.ts`、`electron/preload.ts`、`shared/api.ts`

**Interfaces:**
- Produces: `window.api.envVars(): Promise<Record<string, string>>`

- [ ] **Step 1: main** —— 加：
```ts
ipcMain.handle('sys:env-vars', () => {
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(process.env)) if (v !== undefined) out[k] = v
  return out
})
```

- [ ] **Step 2: preload** —— `api` 加 `envVars: () => ipcRenderer.invoke('sys:env-vars'),`

- [ ] **Step 3: shared/api.ts** —— `Api` 接口加 `envVars(): Promise<Record<string, string>>`

- [ ] **Step 4: typecheck** `npm run typecheck` → PASS

- [ ] **Step 5: Commit** `feat(ipc): 暴露主进程环境变量供快查面板`

---

### Task 3: `${VAR}` 快查面板组件 + 入口 + 样式

**Files:**
- Create: `src/components/VarReference.tsx`
- Modify: `src/components/RuleEditor.tsx`（顶部「查看可用变量」按钮 + 状态）
- Modify: `src/theme.css`（`.var-ref*` 样式，含 `user-select: text`）

**Interfaces:**
- Consumes: `window.api.envVars()`、既有 `Modal`
- Produces: `<VarReference onClose />`

- [ ] **Step 1: 组件** —— `VarReference.tsx`：`useEffect` 拉 `envVars()`；`useState` 搜索词；常用候选名单常量（见 spec §2.2，大小写不敏感匹配实际 key）；渲染「常用」「全部」两组（有搜索词时合并过滤）；每行 `${NAME}` + 值 + 「复制」按钮（`navigator.clipboard.writeText('${'+name+'}')`）。用 `Modal` 外壳，标题「可用环境变量（${VAR}）」。

- [ ] **Step 2: 入口** —— `RuleEditor` 加 `const [showVars, setShowVars] = useState(false)`；表单顶部（名称字段之前）加一行：`<button className="btn" onClick={() => setShowVars(true)}>查看可用变量 ${'{VAR}'}</button>`；末尾条件渲染 `{showVars && <VarReference onClose={() => setShowVars(false)} />}`。

- [ ] **Step 3: 样式** —— `theme.css` 加 `.var-ref { user-select: text; }` 及行布局（名字等宽、值 `word-break`、复制按钮右对齐）、搜索框、分组标题样式。

- [ ] **Step 4: typecheck + 构建冒烟** `npm run typecheck` PASS；`npm run build` 成功。

- [ ] **Step 5: Commit** `feat(ui): ${VAR} 环境变量快查面板`

---

### Task 4: JSON 逐行路径编辑器 + 编辑器接入 + 摘要

**Files:**
- Create: `src/components/KeyPathList.tsx`
- Modify: `src/components/RuleEditor.tsx`（json 分支接入）
- Modify: `src/utils/rules.ts`（`newRule('json')` 加 `preserve: []`；`ruleSummary` json 分支附加）

**Interfaces:**
- Consumes: `KeyPathList` props `{ value: string[]; onChange(v: string[]): void }`

- [ ] **Step 1: 组件** —— `KeyPathList.tsx`：`value` 每项一行 `<input>` + 「删除」按钮；底部「＋ 添加」追加空串；`onChange` 直接回传当前数组（保存时在 RuleEditor.save 里过滤空串）。

- [ ] **Step 2: newRule** —— `rules.ts` `case 'json'` 返回加 `preserve: []`。

- [ ] **Step 3: 接入编辑器** —— RuleEditor json 分支：`draft.op === 'overwrite' || draft.op === 'upsert'` 时渲染 `<Field label="保留（覆盖/合并时保持原文件的这些 key，点路径如 a.b.c）"><KeyPathList value={draft.preserve ?? []} onChange={v => patch({ preserve: v })} /></Field>`；`save()` 的 json 分支把 `final.preserve` 过滤空串（`(final.preserve ?? []).map(s=>s.trim()).filter(Boolean)`）。

- [ ] **Step 4: 摘要** —— `ruleSummary` json 分支：`preserve?.length` 时附加 ` · 保留 ${n} 项`。

- [ ] **Step 5: typecheck + test + 构建** `npm run typecheck`、`npx vitest run`、`npm run build` 全绿。

- [ ] **Step 6: Commit** `feat(ui): JSON preserve 逐行路径编辑器 + 接入编辑器`

---

## 完成后

- `npm run test` + `npm run typecheck` 全绿。
- 手动 GUI 验证（`npm run dev`）：查看可用变量面板（搜索、选中复制、常用分组）；JSON overwrite/upsert 下的逐行保留编辑器 + 预览「保留 N 项」。
