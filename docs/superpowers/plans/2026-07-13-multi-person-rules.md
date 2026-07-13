# 多人员定制规则 + 基础通用配置 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 给每条规则加「通用 / 归属人员」标签,打包页与部署页顶部各有一个人员单选器,选中某人只显示并执行「通用 + 该人员」的规则;人员由一份统一名单集中增删改。

**Architecture:** 在 `RuleBase` 加可选字段 `common`/`people`,`AppConfig` 顶层加 `people: Person[]` 名单。所有纯逻辑(过滤谓词、名单增删改、加载规范化、导入协调)放 `shared/people.ts`(主进程与渲染层共用,Vitest 直测)。引擎按显式 rule id 执行,不感知人员,不改动。导入/导出在序列化边界把「人员 id ↔ 人员名」互转,保证跨机器可移植。

**Tech Stack:** Electron 43 + React 19 + Vite 7 + TypeScript(strict);Vitest 单测;测试统一放仓库根 `tests/`。

## Global Constraints

- **仅 Windows**;分发为免安装绿色文件夹;数据落盘沿用 `appDir()`,不改。
- **零破坏迁移**:任何现有 `config.json` 加载后行为不变——缺 `common`/`people` 的老规则视为通用(所有人可见)。
- **TypeScript strict**;新增字段均为可选(`common?`/`people?`);规范化后内存中 `common` 为 `boolean`、`people` 为数组。
- 面向用户文案一律**中文**,与现有 UI 一致。
- 纯逻辑无 Electron 依赖,放 `shared/`(可被渲染层与主进程同时 import,别名 `@shared`)。
- 测试文件放仓库根 `tests/**/*.test.ts`(Vitest `include` 已如此配置);React 组件目前**无**单测框架,UI 任务以 `npm run typecheck` + `npm run build` + 手动 `npm run dev` 冒烟为验收,不得编造无断言的假测试。
- 每条规则的 `people` 字段在 **config 落盘时存人员 id**;仅在**导出的 `.rules.json`** 里存人员**名**。

---

### Task 1: 共享模型与纯逻辑(types + people.ts)

**Files:**
- Modify: `shared/types.ts`(加 `Person`、`RuleBase.common/people`、`AppConfig.people`、`uiState.packPerson/deployPerson`)
- Create: `shared/people.ts`
- Test: `tests/people.test.ts`

**Interfaces:**
- Produces:
  - `interface Person { id: string; name: string }`
  - `ruleMatchesPerson(rule: Rule, personId: string | null): boolean`
  - `addPerson(people: Person[], id: string, name: string): Person[]`
  - `renamePerson(people: Person[], id: string, name: string): Person[]`
  - `removePerson(people: Person[], rules: Rule[], id: string): { people: Person[]; rules: Rule[] }`
  - `normalizeRule<T extends Rule>(rule: T): T` —— 保证 `common` 为 boolean、`people` 为数组;`common` 未显式给定时按「无 people 即通用」推断
  - `reconcileImportedPeople(roster: Person[], rules: Rule[], makeId: () => string): { people: Person[]; rules: Rule[] }` —— 规则的 `people` 此时是**人员名**,按名精确匹配名单、缺则建人,返回 id 化后的规则与更新后的名单

- [ ] **Step 1: 改 `shared/types.ts` 加字段**

在 `RuleBase` 接口内(现有 `enabled: boolean` 之后)加两个可选字段:

```ts
export interface RuleBase {
  id: string
  type: RuleType
  name: string
  enabled: boolean
  /** 通用:选任意人员都执行。缺省(老数据)加载时规范化为 true */
  common?: boolean
  /** 归属人员 id 列表;仅当 common=false 时生效。缺省规范化为 [] */
  people?: string[]
}
```

在文件中新增 `Person` 接口(放在 `AppConfig` 之前):

```ts
export interface Person {
  id: string
  name: string
}
```

改 `AppConfig`:加 `people` 字段、扩展 `uiState`:

```ts
export interface AppConfig {
  version: number
  people: Person[]
  rules: Rule[]
  settings: Settings
  selectionMemory: {
    pack: Record<string, boolean>
    deploy: Record<string, boolean>
  }
  uiState: { page?: string; packPerson?: string; deployPerson?: string }
}
```

- [ ] **Step 2: 写失败测试 `tests/people.test.ts`**

```ts
import { describe, expect, it } from 'vitest'
import {
  addPerson, normalizeRule, reconcileImportedPeople, removePerson, renamePerson, ruleMatchesPerson,
} from '../shared/people'
import type { Person, Rule } from '../shared/types'

const envRule = (over: Partial<Rule>): Rule =>
  ({ id: 'r1', type: 'env', name: 'r', enabled: true, key: 'K', value: 'V', op: 'set', ...over }) as Rule

describe('ruleMatchesPerson', () => {
  it('personId=null(全部)恒真', () => {
    expect(ruleMatchesPerson(envRule({ common: false, people: ['a'] }), null)).toBe(true)
  })
  it('common=true 恒真', () => {
    expect(ruleMatchesPerson(envRule({ common: true, people: [] }), 'a')).toBe(true)
  })
  it('带标签命中/不命中', () => {
    expect(ruleMatchesPerson(envRule({ common: false, people: ['a'] }), 'a')).toBe(true)
    expect(ruleMatchesPerson(envRule({ common: false, people: ['a'] }), 'b')).toBe(false)
  })
  it('老数据规范化后在任意人员下可见', () => {
    const r = normalizeRule(envRule({ common: undefined, people: undefined }))
    expect(ruleMatchesPerson(r, 'anybody')).toBe(true)
  })
})

describe('normalizeRule', () => {
  it('无 common 无 people → 通用', () => {
    const r = normalizeRule(envRule({ common: undefined, people: undefined }))
    expect(r.common).toBe(true)
    expect(r.people).toEqual([])
  })
  it('无 common 但有 people → 非通用', () => {
    const r = normalizeRule(envRule({ common: undefined, people: ['a'] }))
    expect(r.common).toBe(false)
    expect(r.people).toEqual(['a'])
  })
  it('显式 common=false 且无 people → 保持非通用', () => {
    const r = normalizeRule(envRule({ common: false, people: [] }))
    expect(r.common).toBe(false)
    expect(r.people).toEqual([])
  })
})

describe('roster 增删改', () => {
  const base: Person[] = [{ id: 'a', name: '张三' }]
  it('addPerson 追加,空白名原样返回', () => {
    expect(addPerson(base, 'b', '李四')).toEqual([{ id: 'a', name: '张三' }, { id: 'b', name: '李四' }])
    expect(addPerson(base, 'b', '   ')).toEqual(base)
  })
  it('renamePerson 改中目标,空白名原样返回', () => {
    expect(renamePerson(base, 'a', '张三丰')).toEqual([{ id: 'a', name: '张三丰' }])
    expect(renamePerson(base, 'a', '  ')).toEqual(base)
  })
  it('removePerson 删名单并从规则级联剔除该 id', () => {
    const rules = [
      envRule({ id: 'r1', common: false, people: ['a', 'b'] }),
      envRule({ id: 'r2', common: true, people: [] }),
    ]
    const out = removePerson([{ id: 'a', name: '张三' }, { id: 'b', name: '李四' }], rules, 'a')
    expect(out.people).toEqual([{ id: 'b', name: '李四' }])
    expect(out.rules[0].people).toEqual(['b'])
    expect(out.rules[1].people).toEqual([]) // 不含 a 的规则内容不变
  })
})

describe('reconcileImportedPeople', () => {
  it('按名匹配现有名单,缺失者建人并回填 id', () => {
    let n = 0
    const makeId = (): string => `new-${n++}`
    const roster: Person[] = [{ id: 'a', name: '张三' }]
    const rules = [envRule({ id: 'r1', common: false, people: ['张三', '王五'] })]
    const out = reconcileImportedPeople(roster, rules, makeId)
    expect(out.people).toEqual([{ id: 'a', name: '张三' }, { id: 'new-0', name: '王五' }])
    expect(out.rules[0].people).toEqual(['a', 'new-0'])
  })
  it('通用规则(people 空)原样通过', () => {
    const out = reconcileImportedPeople([], [envRule({ common: true, people: [] })], () => 'x')
    expect(out.people).toEqual([])
    expect(out.rules[0].people).toEqual([])
  })
})
```

- [ ] **Step 3: 运行测试确认失败**

Run: `npm run test -- people`
Expected: FAIL —— `Cannot find module '../shared/people'`

- [ ] **Step 4: 实现 `shared/people.ts`**

```ts
import type { Person, Rule } from './types'

/** 规则是否应在「选中 personId」时出现。personId===null 表示「全部」,不筛选 */
export function ruleMatchesPerson(rule: Rule, personId: string | null): boolean {
  if (personId === null) return true
  if (rule.common) return true
  return (rule.people ?? []).includes(personId)
}

/** 规范化:common 保证为 boolean(未显式给定时按「无 people 即通用」推断),people 保证为数组 */
export function normalizeRule<T extends Rule>(rule: T): T {
  const people = Array.isArray(rule.people) ? rule.people : []
  const common = typeof rule.common === 'boolean' ? rule.common : people.length === 0
  return { ...rule, common, people }
}

/** 追加一个人员(去空白;名称为空则原样返回,不改原数组) */
export function addPerson(people: Person[], id: string, name: string): Person[] {
  const n = name.trim()
  if (!n) return people
  return [...people, { id, name: n }]
}

/** 改名(去空白;名称为空则原样返回) */
export function renamePerson(people: Person[], id: string, name: string): Person[] {
  const n = name.trim()
  if (!n) return people
  return people.map(p => (p.id === id ? { ...p, name: n } : p))
}

/** 删除人员,并从所有规则的 people[] 级联剔除其 id */
export function removePerson(
  people: Person[],
  rules: Rule[],
  id: string,
): { people: Person[]; rules: Rule[] } {
  return {
    people: people.filter(p => p.id !== id),
    rules: rules.map(r =>
      (r.people ?? []).includes(id) ? { ...r, people: (r.people ?? []).filter(x => x !== id) } : r,
    ),
  }
}

/** 导入协调:规则的 people 此时是人员名,按名精确匹配名单、缺则建人,回填成 id */
export function reconcileImportedPeople(
  roster: Person[],
  rules: Rule[],
  makeId: () => string,
): { people: Person[]; rules: Rule[] } {
  const people = [...roster]
  const idOfName = (name: string): string => {
    const hit = people.find(p => p.name === name)
    if (hit) return hit.id
    const id = makeId()
    people.push({ id, name })
    return id
  }
  const outRules = rules.map(r => ({ ...r, people: (r.people ?? []).map(idOfName) }))
  return { people, rules: outRules }
}
```

- [ ] **Step 5: 运行测试确认通过**

Run: `npm run test -- people`
Expected: PASS(全部 people.test 用例)

- [ ] **Step 6: 类型检查**

Run: `npm run typecheck`
Expected: 无错误

- [ ] **Step 7: 提交**

```bash
git add shared/types.ts shared/people.ts tests/people.test.ts
git commit -m "feat: 人员模型与纯逻辑(过滤/名单增删改/规范化/导入协调)"
```

---

### Task 2: config 迁移(顶层名单 + 加载规范化)

**Files:**
- Modify: `electron/core/config.ts`
- Test: `tests/config.test.ts`

**Interfaces:**
- Consumes: `normalizeRule`(Task 1,来自 `@shared/people`)、`Person`/`AppConfig`(Task 1)
- Produces: `defaultConfig()` 返回含 `people: []`、`version: 2`;`loadConfig()` 补全 `people` 并对每条规则跑 `normalizeRule`

- [ ] **Step 1: 改已有 config 测试断言(version → 2),补迁移用例**

改 `tests/config.test.ts` 第 20 行:`expect(cfg.version).toBe(1)` → `expect(cfg.version).toBe(2)`,同一用例末尾追加一行:

```ts
    expect(cfg.people).toEqual([])
```

在 `describe('config', ...)` 内新增用例:

```ts
  it('加载老规则(无 common/people)规范化为通用,补 people 名单', () => {
    fs.writeFileSync(
      configPath(tmp),
      JSON.stringify({
        version: 1,
        rules: [{ id: 'r1', type: 'env', name: 'old', enabled: true, key: 'K', value: 'V', op: 'set' }],
      }),
      'utf8',
    )
    const cfg = loadConfig(tmp)
    expect(cfg.people).toEqual([])
    expect(cfg.rules[0].common).toBe(true)
    expect(cfg.rules[0].people).toEqual([])
  })
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm run test -- config`
Expected: FAIL —— `expected 1 to be 2` 及新用例 `cfg.rules[0].common` 为 undefined

- [ ] **Step 3: 实现 config 变更**

改 `electron/core/config.ts`。顶部 import 追加:

```ts
import { normalizeRule } from '@shared/people'
```

`defaultConfig()` 改为(version 2、加 people):

```ts
export function defaultConfig(): AppConfig {
  return {
    version: 2,
    people: [],
    rules: [],
    settings: { backupBeforeImport: true },
    selectionMemory: { pack: {}, deploy: {} },
    uiState: {},
  }
}
```

`loadConfig()` 的 return 块改为(补 people、规范化 rules):

```ts
  const def = defaultConfig()
  return {
    version: raw.version ?? def.version,
    people: Array.isArray(raw.people) ? raw.people : [],
    rules: (Array.isArray(raw.rules) ? raw.rules : []).map(r => normalizeRule(r as never)),
    settings: { ...def.settings, ...raw.settings },
    selectionMemory: { pack: {}, deploy: {}, ...raw.selectionMemory },
    uiState: raw.uiState ?? {},
  }
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npm run test -- config`
Expected: PASS

- [ ] **Step 5: 类型检查**

Run: `npm run typecheck`
Expected: 无错误

- [ ] **Step 6: 提交**

```bash
git add electron/core/config.ts tests/config.test.ts
git commit -m "feat: config 加人员名单,加载时规范化规则归属(零破坏迁移)"
```

---

### Task 3: 规则集导入导出(id↔名互转,v1/v2 兼容)

**Files:**
- Modify: `electron/core/ruleset.ts`
- Modify: `electron/main.ts:100-131`(export/import handler)
- Test: `tests/ruleset.test.ts`

**Interfaces:**
- Consumes: `normalizeRule`、`reconcileImportedPeople`(Task 1);`Person`(Task 1)
- Produces:
  - `serializeRuleset(rules: Rule[], people?: Person[]): string` —— 输出 `version: 2`,规则 `people` 转为人员名
  - `parseRuleset(text: string): Rule[]` —— 接受 v1(规范化为通用)与 v2(保留 common、people 仍为**名**);重生成 id、跑校验

- [ ] **Step 1: 改 ruleset 测试(version 2 + 人员往返 + v1 兼容)**

把 `tests/ruleset.test.ts` 整体替换为:

```ts
import { beforeAll, describe, expect, it } from 'vitest'
import { serializeRuleset, parseRuleset } from '../electron/core/ruleset'
import { reconcileImportedPeople } from '../shared/people'
import { registerBuiltins } from '../electron/core/engine'
import type { Person, Rule } from '@shared/types'

beforeAll(() => registerBuiltins())

const sample: Rule[] = [
  { id: 'x', type: 'env', name: '示例', enabled: true, key: 'FOO', value: '1', op: 'set', scope: 'user', common: true, people: [] },
]

describe('serializeRuleset', () => {
  it('剥离 id,带 version 2', () => {
    const doc = JSON.parse(serializeRuleset(sample))
    expect(doc.version).toBe(2)
    expect(doc.rules[0].id).toBeUndefined()
    expect(doc.rules[0].name).toBe('示例')
    expect(doc.rules[0].common).toBe(true)
  })
  it('把 people 的 id 解析为人员名', () => {
    const roster: Person[] = [{ id: 'p1', name: '张三' }]
    const rules: Rule[] = [{ ...sample[0], common: false, people: ['p1'] }]
    const doc = JSON.parse(serializeRuleset(rules, roster))
    expect(doc.rules[0].people).toEqual(['张三'])
  })
})

describe('parseRuleset', () => {
  it('重新生成 id 并通过校验', () => {
    const out = parseRuleset(serializeRuleset(sample))
    expect(out).toHaveLength(1)
    expect(out[0].id).toBeTruthy()
    expect(out[0].id).not.toBe('x')
  })
  it('人员名往返:导出→解析→按名协调回 id,归属保留', () => {
    const roster: Person[] = [{ id: 'p1', name: '张三' }]
    const rules: Rule[] = [{ ...sample[0], common: false, people: ['p1'] }]
    const parsed = parseRuleset(serializeRuleset(rules, roster))
    expect(parsed[0].people).toEqual(['张三']) // 解析后仍是名
    const out = reconcileImportedPeople([{ id: 'q1', name: '张三' }], parsed, () => 'z')
    expect(out.rules[0].people).toEqual(['q1']) // 目标名单里同名 → 复用其 id
  })
  it('v1 规则集(无 common/people)导入 → 规范化为通用', () => {
    const v1 = JSON.stringify({ version: 1, rules: [{ type: 'env', name: 'old', enabled: true, key: 'K', value: 'V', op: 'set' }] })
    const out = parseRuleset(v1)
    expect(out[0].common).toBe(true)
    expect(out[0].people).toEqual([])
  })
  it('非法 JSON 报错', () => {
    expect(() => parseRuleset('{bad')).toThrow()
  })
  it('版本不支持报错', () => {
    expect(() => parseRuleset(JSON.stringify({ version: 99, rules: [] }))).toThrow()
  })
  it('未知规则类型报错', () => {
    expect(() => parseRuleset(JSON.stringify({ version: 2, rules: [{ type: 'nope', name: 'n' }] }))).toThrow()
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm run test -- ruleset`
Expected: FAIL —— `expected 1 to be 2`(version)及人员相关断言

- [ ] **Step 3: 实现 `electron/core/ruleset.ts`**

整体替换为:

```ts
import { randomUUID } from 'crypto'
import type { Person, Rule } from '@shared/types'
import { normalizeRule } from '@shared/people'
import { validateRule } from './engine'

const RULESET_VERSION = 2
const SUPPORTED = new Set([1, 2])

export function serializeRuleset(rules: Rule[], people: Person[] = []): string {
  const nameOf = new Map(people.map(p => [p.id, p.name]))
  const stripped = rules.map(rule => {
    const n = normalizeRule(rule)
    const { id: _id, ...rest } = n
    const peopleNames = (n.people ?? []).map(pid => nameOf.get(pid)).filter((x): x is string => !!x)
    return { ...rest, people: peopleNames }
  })
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
  if (typeof d.version !== 'number' || !SUPPORTED.has(d.version)) {
    throw new Error(`不支持的规则集版本: ${String(d.version)}`)
  }
  if (!Array.isArray(d.rules)) throw new Error('规则集缺少 rules 数组')
  // 重生成 id;normalizeRule 保证 common/people 存在(v1 → 通用)。此处 people 仍为人员名,由调用方 reconcile。
  const rules = d.rules.map(r =>
    normalizeRule({ ...(r as Record<string, unknown>), id: randomUUID() } as Rule),
  )
  for (const r of rules) {
    const errs = validateRule(r)
    if (errs.length) throw new Error(`规则「${r.name || '未命名'}」校验失败: ${errs.join('; ')}`)
  }
  return rules
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npm run test -- ruleset`
Expected: PASS

- [ ] **Step 5: 接线 `electron/main.ts` 的导出/导入 handler**

改 import 行(第 9 行)加入 `reconcileImportedPeople`:

```ts
import { parseRuleset, serializeRuleset } from './core/ruleset'
import { reconcileImportedPeople } from '@shared/people'
```

`ruleset:export` handler(第 100-110 行)里,把 `serializeRuleset(rules)` 改为传入名单:

```ts
    fs.writeFileSync(r.filePath, serializeRuleset(rules, cfg.people), 'utf8')
```

`importFrom`(第 112-122 行)整体替换为(reconcile 人员名 → id、合并名单):

```ts
  const importFrom = (file: string): { ok: boolean; config?: AppConfig; added?: number; error?: string } => {
    try {
      const imported = parseRuleset(fs.readFileSync(file, 'utf8'))
      const cfg = loadConfig(appDir())
      const { people, rules } = reconcileImportedPeople(cfg.people, imported, () => randomUUID())
      cfg.people = people
      cfg.rules = [...cfg.rules, ...rules]
      saveConfig(appDir(), cfg)
      return { ok: true, config: cfg, added: rules.length }
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) }
    }
  }
```

在 `electron/main.ts` 顶部 import 补 `randomUUID`(若尚无):

```ts
import { randomUUID } from 'crypto'
```

- [ ] **Step 6: 类型检查 + 全量测试**

Run: `npm run typecheck && npm run test`
Expected: typecheck 无错误;所有测试 PASS

- [ ] **Step 7: 提交**

```bash
git add electron/core/ruleset.ts electron/main.ts tests/ruleset.test.ts
git commit -m "feat: 规则集导入导出按人员名互转,兼容 v1/v2"
```

---

### Task 4: 新建规则默认「通用」

**Files:**
- Modify: `src/utils/rules.ts:3-4`
- Test: `tests/rules-utils.test.ts`

**Interfaces:**
- Produces: `newRule(type)` 生成的规则含 `common: true, people: []`(与当前选中人员无关)

- [ ] **Step 1: 改 newRule 测试**

在 `tests/rules-utils.test.ts` 的 `describe('newRule', ...)` 用例里追加断言:

```ts
    expect(newRule('env')).toMatchObject({ common: true, people: [] })
    expect(newRule('pack')).toMatchObject({ common: true, people: [] })
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm run test -- rules-utils`
Expected: FAIL —— `common`/`people` 为 undefined

- [ ] **Step 3: 实现**

改 `src/utils/rules.ts` 第 4 行的 `base`:

```ts
  const base = { id: crypto.randomUUID(), name: '', enabled: true, common: true, people: [] as string[] }
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npm run test -- rules-utils`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add src/utils/rules.ts tests/rules-utils.test.ts
git commit -m "feat: 新建规则默认通用(common=true)"
```

---

### Task 5: 顶部人员选择器 + 列表/批量按人员过滤

**Files:**
- Modify: `src/components/RuleList.tsx`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `ruleMatchesPerson`(Task 1)、`Person`(Task 1)、`AppConfig.uiState.packPerson/deployPerson`(Task 1)
- Produces: `RuleList` 新增 props `people: Person[]`、`personId: string | null`、`onSelectPerson(id: string | null): void`、`onManagePeople(): void`;App 持久化 `packPerson`/`deployPerson`
- **说明:** 本任务无 React 单测框架,验收 = `npm run typecheck` + `npm run build` + 手动 `npm run dev` 冒烟。

- [ ] **Step 1: 给 `RuleList.tsx` 加人员下拉与过滤**

在 `import` 区加:

```ts
import type { Person, Rule, RuleType, RuleTypeInfo } from '@shared/types'
import { ruleMatchesPerson } from '@shared/people'
```

`Props` 接口加 4 个字段:

```ts
  people: Person[]
  personId: string | null
  onSelectPerson(id: string | null): void
  onManagePeople(): void
```

`filtered` 的 useMemo 里,在类型/搜索过滤之前叠加人员过滤(把回调体首行改为):

```ts
  const filtered = useMemo(() => {
    const kw = search.trim().toLowerCase()
    return props.rules.filter(r => {
      if (!ruleMatchesPerson(r, props.personId)) return false
      if (typeFilter !== 'all' && r.type !== typeFilter) return false
      if (kw && !r.name.toLowerCase().includes(kw) && !ruleSummary(r).toLowerCase().includes(kw)) return false
      return true
    })
  }, [props.rules, props.personId, typeFilter, search])
```

在工具栏 `<div className="toolbar">` 内,`<input className="search" …>` 之前插入人员下拉:

```tsx
        <select
          className="person-select"
          value={props.personId ?? ''}
          onChange={e => {
            if (e.target.value === '__manage__') { props.onManagePeople(); return }
            props.onSelectPerson(e.target.value === '' ? null : e.target.value)
          }}
        >
          <option value="">👥 全部人员</option>
          {props.people.map(p => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
          <option value="__manage__">管理人员…</option>
        </select>
```

- [ ] **Step 2: 在 `App.tsx` 接线人员状态与过滤**

在 `import` 区补:

```ts
import type { AppConfig, Person, ProgressEvent, Rule, RulePlan, RuleResult, RuleTypeInfo } from '@shared/types'
import { ruleMatchesPerson } from '@shared/people'
```

在组件内(`packRules`/`deployRules` 附近)派生「当前有效人员」——存的 id 若已不在名单则回退「全部」:

```ts
  const people = config?.people ?? []
  const packPerson = useMemo(() => {
    const id = config?.uiState.packPerson
    return id && people.some(p => p.id === id) ? id : null
  }, [config?.uiState.packPerson, people])
  const deployPerson = useMemo(() => {
    const id = config?.uiState.deployPerson
    return id && people.some(p => p.id === id) ? id : null
  }, [config?.uiState.deployPerson, people])

  const selectPerson = (key: 'packPerson' | 'deployPerson', id: string | null): void =>
    update(c => ({ ...c, uiState: { ...c.uiState, [key]: id ?? undefined } }))
```

给两处 `<RuleList>` 传新 props。打包页:

```tsx
            <RuleList
              rules={packRules}
              people={people}
              personId={packPerson}
              onSelectPerson={id => selectPerson('packPerson', id)}
              onManagePeople={() => setManagingPeople(true)}
              types={types.filter(t => t.type === 'pack')}
              showTypeFilter={false}
              addTypes={['pack']}
              onImport={() => void doImport()}
              {...listCallbacks}
            />
```

部署页同理,追加:

```tsx
              people={people}
              personId={deployPerson}
              onSelectPerson={id => selectPerson('deployPerson', id)}
              onManagePeople={() => setManagingPeople(true)}
```

(`setManagingPeople` 状态在 Task 6 引入;本任务先加一个占位 state 以便编译:在其它 `useState` 附近加 `const [managingPeople, setManagingPeople] = useState(false)`,并在 JSX 末尾暂不渲染对话框——Task 6 补。)

**SelectionDialog 的 rules 改为按当前页人员过滤**(第 226-229 行附近):

```tsx
          rules={
            selecting === 'export' ? config.rules
              : (selecting === 'pack' ? packRules : deployRules)
                  .filter(r => r.enabled && ruleMatchesPerson(r, selecting === 'pack' ? packPerson : deployPerson))
          }
```

- [ ] **Step 3: 加最简样式**

在 `src/theme.css` 末尾追加(与现有 `.search`/`.seg` 风格一致即可,复用变量):

```css
.person-select {
  height: 32px;
  padding: 0 8px;
  border-radius: 6px;
  background: var(--panel, #1a1d24);
  color: inherit;
  border: 1px solid var(--border, #2a2f3a);
}
```

- [ ] **Step 4: 类型检查 + 构建**

Run: `npm run typecheck && npm run build`
Expected: 均无错误

- [ ] **Step 5: 手动冒烟**

Run: `npm run dev`
手动验证:打包页/部署页顶部出现人员下拉;当前名单为空,只有「全部人员 / 管理人员…」两项;选「全部」列表正常显示所有规则。关闭窗口。

- [ ] **Step 6: 提交**

```bash
git add src/components/RuleList.tsx src/App.tsx src/theme.css
git commit -m "feat: 两页顶部人员选择器,列表与批量执行按人员过滤"
```

---

### Task 6: 人员管理对话框(增删改名 + 级联)

**Files:**
- Create: `src/components/PeopleManager.tsx`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `addPerson`/`renamePerson`/`removePerson`(Task 1);`managingPeople` state 与 `setManagingPeople`(Task 5)
- Produces: `PeopleManager` 组件,props `people: Person[]`、`rules: Rule[]`、`onChange(people: Person[], rules: Rule[]): void`、`onClose(): void`
- **说明:** 无 React 单测;验收 = typecheck + build + 手动冒烟。

- [ ] **Step 1: 创建 `src/components/PeopleManager.tsx`**

```tsx
import { useState } from 'react'
import type { Person, Rule } from '@shared/types'
import { addPerson, removePerson, renamePerson } from '@shared/people'
import Modal from './Modal'

interface Props {
  people: Person[]
  rules: Rule[]
  onChange(people: Person[], rules: Rule[]): void
  onClose(): void
}

export default function PeopleManager({ people, rules, onChange, onClose }: Props) {
  const [name, setName] = useState('')

  const add = (): void => {
    const next = addPerson(people, crypto.randomUUID(), name)
    if (next !== people) { onChange(next, rules); setName('') }
  }
  const rename = (id: string, v: string): void => onChange(renamePerson(people, id, v), rules)
  const remove = (id: string): void => {
    const count = rules.filter(r => (r.people ?? []).includes(id)).length
    if (!confirm(`删除该人员将从 ${count} 条规则移除其标签。确定删除？`)) return
    const out = removePerson(people, rules, id)
    onChange(out.people, out.rules)
  }

  return (
    <Modal
      title="管理人员"
      onClose={onClose}
      footer={<><div className="spacer" /><button className="btn btn-primary" onClick={onClose}>完成</button></>}
    >
      <div className="people-add">
        <input
          value={name}
          placeholder="输入人员名称"
          onChange={e => setName(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') add() }}
        />
        <button className="btn" onClick={add} disabled={!name.trim()}>添加</button>
      </div>
      {people.length === 0 && <div className="empty">尚无人员，先在上方添加</div>}
      <div className="people-list">
        {people.map(p => (
          <div key={p.id} className="people-row">
            <input value={p.name} onChange={e => rename(p.id, e.target.value)} />
            <button className="btn btn-danger" onClick={() => remove(p.id)}>删除</button>
          </div>
        ))}
      </div>
    </Modal>
  )
}
```

- [ ] **Step 2: 在 `App.tsx` 渲染对话框**

在 JSX 里(如 `SettingsDialog` 挂载块附近)加:

```tsx
      {managingPeople && (
        <PeopleManager
          people={config.people}
          rules={config.rules}
          onChange={(people, rules) => update(c => ({ ...c, people, rules }))}
          onClose={() => setManagingPeople(false)}
        />
      )}
```

在文件顶部 import 区加:

```ts
import PeopleManager from './components/PeopleManager'
```

- [ ] **Step 3: 加最简样式**

`src/theme.css` 末尾追加:

```css
.people-add { display: flex; gap: 8px; margin-bottom: 12px; }
.people-add input { flex: 1; }
.people-row { display: flex; gap: 8px; align-items: center; margin-bottom: 6px; }
.people-row input { flex: 1; }
```

- [ ] **Step 4: 类型检查 + 构建**

Run: `npm run typecheck && npm run build`
Expected: 均无错误

- [ ] **Step 5: 手动冒烟**

Run: `npm run dev`
从人员下拉选「管理人员…」→ 添加两个人员 → 改名 → 顶部下拉出现这两人 → 删除一人(确认弹窗提示影响规则数)。关闭窗口。

- [ ] **Step 6: 提交**

```bash
git add src/components/PeopleManager.tsx src/App.tsx src/theme.css
git commit -m "feat: 人员管理对话框(增删改名,删除级联清理规则标签)"
```

---

### Task 7: 规则编辑器加「部署对象」段

**Files:**
- Modify: `src/components/RuleEditor.tsx`
- Modify: `src/App.tsx`(向 `RuleEditor` 传 `people`)

**Interfaces:**
- Consumes: `Person`(Task 1);`draft.common`/`draft.people`(Task 1)
- Produces: `RuleEditor` 新增 prop `people: Person[]`;保存时校验「非通用必须至少选一人」
- **说明:** 无 React 单测;验收 = typecheck + build + 手动冒烟。

- [ ] **Step 1: `RuleEditor.tsx` 加 people prop 与校验**

`Props` 接口加:

```ts
  people: Person[]
```

import 区补类型:

```ts
import type { EnvOp, EnvScope, ImportMode, JsonOp, PathPosition, Person, Rule, RunShell } from '@shared/types'
```

在 `save()` 的 `if (!final.name.trim()) errs.push('名称不能为空')` 之后追加归属校验:

```ts
    if (!final.common && (final.people ?? []).length === 0) {
      errs.push('请勾选「通用」或至少指定一个人员')
    }
```

在 JSX 里「名称」Field 之后、类型分支之前,插入「部署对象」段:

```tsx
      <Field label="部署对象">
        <label className="check-item">
          <input
            type="checkbox"
            checked={draft.common ?? true}
            onChange={e => patch({ common: e.target.checked })}
          />
          <span>通用（所有人员都部署）</span>
        </label>
        {!draft.common && (
          people.length === 0 ? (
            <div className="dim">尚未创建人员，可在列表页「人员 › 管理人员」添加</div>
          ) : (
            <div className="people-pick">
              {people.map(p => {
                const on = (draft.people ?? []).includes(p.id)
                return (
                  <label key={p.id} className="check-item">
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={e =>
                        patch({
                          people: e.target.checked
                            ? [...(draft.people ?? []), p.id]
                            : (draft.people ?? []).filter(x => x !== p.id),
                        })
                      }
                    />
                    <span>{p.name}</span>
                  </label>
                )
              })}
            </div>
          )
        )}
      </Field>
```

改函数签名解构,纳入 `people`:

```tsx
export default function RuleEditor({ rule, isNew, typeLabel, people, onSave, onClose }: Props) {
```

- [ ] **Step 2: `App.tsx` 向 RuleEditor 传 people**

在 `<RuleEditor …>`(约第 210 行)加:

```tsx
          people={config.people}
```

- [ ] **Step 3: 加最简样式**

`src/theme.css` 末尾追加:

```css
.people-pick { display: flex; flex-wrap: wrap; gap: 6px 16px; margin-top: 6px; }
```

- [ ] **Step 4: 类型检查 + 构建**

Run: `npm run typecheck && npm run build`
Expected: 均无错误

- [ ] **Step 5: 手动冒烟**

Run: `npm run dev`
先在「管理人员」建两个人员 → 新建一条规则:默认「通用」勾选 → 取消勾选后出现两个人员复选框 → 只勾一人保存 → 顶部选该人员时该规则出现、选另一人时不出现、选「全部」时出现。再试:取消通用且不选人保存 → 报错「请勾选『通用』或至少指定一个人员」。关闭窗口。

- [ ] **Step 6: 提交**

```bash
git add src/components/RuleEditor.tsx src/App.tsx src/theme.css
git commit -m "feat: 规则编辑器加部署对象(通用开关 + 人员多选 + 校验)"
```

---

### Task 8: 规则卡片显示归属徽标

**Files:**
- Modify: `src/components/RuleCard.tsx`
- Modify: `src/components/RuleList.tsx`(把 `people` 透传给 `RuleCard`)

**Interfaces:**
- Consumes: `Person`(Task 1);`RuleList.props.people`(Task 5 已加)
- Produces: 每张卡片显示「通用」或归属人员名徽标
- **说明:** 无 React 单测;验收 = typecheck + build + 手动冒烟。

- [ ] **Step 1: `RuleCard.tsx` 加 people prop 与徽标**

import 区补类型:

```ts
import type { Person, Rule } from '@shared/types'
```

`Props` 接口加:

```ts
  people: Person[]
```

函数签名解构加 `people`。在 `card-title` 里、`typeLabel` 徽标之后,插入归属徽标:

```tsx
        <div className="card-title">
          <span className={`badge badge-${rule.type}`}>{typeLabel}</span>
          <span className="badge badge-person">
            {rule.common
              ? '通用'
              : (rule.people ?? [])
                  .map(id => people.find(p => p.id === id)?.name)
                  .filter(Boolean)
                  .join('、') || '未指派'}
          </span>
          <span className="name">{rule.name || '(未命名)'}</span>
        </div>
```

- [ ] **Step 2: `RuleList.tsx` 透传 people 给 RuleCard**

在 `<RuleCard …>`(map 内)加:

```tsx
          people={props.people}
```

- [ ] **Step 3: 加最简样式**

`src/theme.css` 末尾追加:

```css
.badge-person { background: var(--border, #2a2f3a); color: var(--muted, #9aa4b2); }
```

- [ ] **Step 4: 类型检查 + 构建**

Run: `npm run typecheck && npm run build`
Expected: 均无错误

- [ ] **Step 5: 手动冒烟**

Run: `npm run dev`
通用规则卡片显示「通用」徽标;归属某人的规则显示其名;归属两人的显示「甲、乙」。关闭窗口。

- [ ] **Step 6: 提交**

```bash
git add src/components/RuleCard.tsx src/components/RuleList.tsx src/theme.css
git commit -m "feat: 规则卡片显示通用/归属人员徽标"
```

---

### Task 9: 文档更新(README)

**Files:**
- Modify: `README.md:20-25`(功能要点区)

**Interfaces:** 无代码接口。

- [ ] **Step 1: 在功能要点列表补一条**

在 `README.md` 的功能无序列表(约第 20-25 行,`- 配置备份/恢复…` 附近)加一条:

```markdown
- 多人员归属:每条规则可标为「通用」(所有人都部署)或归属指定人员;打包页/部署页顶部按人员单选筛选,「一键打包/部署/预览」只作用于「通用 + 所选人员」的规则;人员通过「管理人员」统一增删改名。导出的规则集把人员按名保存,导入时按名并入目标名单
```

- [ ] **Step 2: 全量测试 + 构建兜底**

Run: `npm run test && npm run typecheck && npm run build`
Expected: 全 PASS、无类型错误、构建成功

- [ ] **Step 3: 提交**

```bash
git add README.md
git commit -m "docs: README 补充多人员归属说明"
```

---

## 自审记录(Self-Review)

**Spec 覆盖:**
- 数据结构(Person/common/people/AppConfig.people/uiState)→ Task 1。
- 迁移零破坏 → Task 2(loadConfig normalizeRule)。
- 纯逻辑 ruleMatchesPerson/增删改/级联 → Task 1。
- 顶部单选器 + 两页过滤 + 批量尊重人员 → Task 5。
- PeopleManager 增删改名 + 删除提示 → Task 6。
- RuleEditor 通用开关 + 人员多选 + 名单空提示 + 非通用必选校验 → Task 7。
- RuleCard 徽标 → Task 8。
- 新建默认通用 → Task 4。
- 导入导出 id↔名、v1/v2 兼容、按名建人 → Task 3。
- 文档 → Task 9。

**放置决策(相对 spec 的细化):** spec 写「`electron/core/people.ts`」,实际落在 `shared/people.ts`——因为渲染层(RuleList 过滤、PeopleManager、RuleEditor)与主进程(config/ruleset/main)都要用,`shared/` 正是二者共用层(`@shared` 别名已对渲染/主/测试三处生效)。功能不变。

**类型一致性:** `ruleMatchesPerson(rule, personId|null)`、`normalizeRule`、`addPerson(people,id,name)`、`renamePerson(people,id,name)`、`removePerson(people,rules,id)→{people,rules}`、`reconcileImportedPeople(roster,rules,makeId)→{people,rules}`、`serializeRuleset(rules,people?)`、`parseRuleset(text)→Rule[]` 在各任务间签名一致。

**无占位符:** 每个代码步骤均给出完整代码;UI 任务明确以 typecheck/build/手动冒烟为验收(仓库无 React 测试框架,不编造空断言测试)。
