# 多人员定制规则 + 基础通用配置 设计

**日期:** 2026-07-13
**状态:** 已确认设计,待写实现计划

## 目标

在现有单一扁平规则列表上,增加「按人员归属」的组织维度:每条规则可标为**通用**(所有人员都部署)或归属于**一个或多个人员**;打包页与部署页顶部各有一个人员单选器,选中某人后只显示/执行「通用 + 该人员」的规则。人员通过一份统一名单集中管理(先建人、再指派)。

## 用户已确认的决策

1. **数据模型 = 标签制**:人员是打在规则上的标签,一条规则可属于多个人员;人员之间共享同一条规则。(否决了「每人一套独立 config」的分层 Profile 方案。)
2. **「通用」= 显式标记**:规则上有一个显式的 `common` 开关,而非「无标签即通用」的隐式约定。
3. **人员名单 = 统一管理**:有一份集中的人员名单,可增/删/改名;编辑规则时从名单勾选归属,部署时从名单下拉选人。(否决了「从规则聚合、无独立名单」。)
4. **作用范围 = 打包页 + 部署页都用**。
5. **选择器 = 单选**(含「全部」选项,表示不按人员筛选)。
6. **新建规则默认 = 全部/通用**:新建的规则一律默认 `common=true, people=[]`,**不随**当前选中的人员变化。
7. **实现方式 = 方案 A**:扩展现有规则字段 + config 顶层人员名单,最大化复用现有列表/勾选记忆/拖拽排序/预览/日志。

## 架构

在 `RuleBase` 上加两个可选字段(`common`、`people`),在 `AppConfig` 顶层加一份 `people` 名单。人员过滤是纯 UI 关注点,但过滤谓词与名单增删改抽成一个纯逻辑模块 `electron/core/people.ts` 以便单测。引擎(engine)按显式 rule id 执行,不感知人员概念,无需改动。导入/导出在序列化边界把「人员 id ↔ 人员名」互转,保证跨机器可移植。

**技术栈:** 沿用现有 Electron 43 + React 19 + Vite 7 + TypeScript(strict);Vitest 单测。

## Global Constraints(项目级约束,每个任务都隐含遵守)

- **仅 Windows**;分发为免安装绿色文件夹。
- **零破坏迁移**:任何现有 `config.json` 加载后行为不变——缺少 `common`/`people` 的老规则一律视为通用(所有人可见)。
- **TypeScript strict**;新增字段为可选,渲染层与核心层不得出现 `undefined` 越界。
- 所有面向用户的文案用**中文**,与现有 UI 一致。
- 纯逻辑放 `electron/core/`(不依赖 Electron),配套 Vitest 单测。
- 数据落盘沿用 `appDir()` 基准目录(开发时 `dev-data/`,打包后 exe 同级),不改。

## 数据结构

### `shared/types.ts`

```ts
export interface Person {
  id: string
  name: string
}

export interface RuleBase {
  id: string
  type: RuleType
  name: string
  enabled: boolean
  /** 通用:选任意人员都会执行。缺省(老数据)在加载时规范化为 true */
  common?: boolean
  /** 归属人员 id 列表;仅当 common=false 时生效。缺省规范化为 [] */
  people?: string[]
}

export interface AppConfig {
  version: number
  people: Person[]        // 新增:统一人员名单
  rules: Rule[]
  settings: Settings
  selectionMemory: {
    pack: Record<string, boolean>
    deploy: Record<string, boolean>
  }
  uiState: {
    page?: string
    packPerson?: string   // 新增:打包页选中的人员 id;缺省=全部
    deployPerson?: string // 新增:部署页选中的人员 id;缺省=全部
  }
}
```

### `electron/core/config.ts` 迁移

- `defaultConfig()`:`version` 提到 `2`,加 `people: []`。
- `loadConfig()`:
  - `people: Array.isArray(raw.people) ? raw.people : []`
  - 规范化每条规则:若 `common === undefined && !Array.isArray(r.people)` → 置 `common = true`;`people` 一律确保为数组(`Array.isArray(r.people) ? r.people : []`)。
  - `uiState` 原样保留(新增的 `packPerson/deployPerson` 为可选,读到就用,读不到即「全部」)。
- 规范化是幂等的:已经带字段的规则不受影响。

## 纯逻辑模块 `electron/core/people.ts`

```ts
import type { Person, Rule } from '@shared/types'

/** 规则是否应在「选中 personId」时出现。personId===null 表示「全部」不筛选 */
export function ruleMatchesPerson(rule: Rule, personId: string | null): boolean {
  if (personId === null) return true
  if (rule.common) return true
  return (rule.people ?? []).includes(personId)
}

/** 追加一个人员(去空白;返回新数组,不改原数组)。名称为空则原样返回 */
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
```

> 说明:`id` 由调用方(渲染层)用 `crypto.randomUUID()`/现有 id 生成方式传入,保持 `people.ts` 为纯函数、无副作用、易测。

## 界面接线

### 顶部人员选择器(`src/components/RuleList.tsx`)

- 工具栏新增一个下拉:`人员:[全部 ▾]`,选项 = `全部` + 名单各人 + 分隔后的 `管理人员…`。
- 单选。选中 `全部` → `personId=null`;选中某人 → 其 id。选「管理人员…」→ 打开 PeopleManager,不改变当前选中。
- 过滤在现有 `filtered` useMemo 内叠加:先按 `ruleMatchesPerson(rule, personId)`,再按现有类型筛选/关键字搜索。
- 新增 props:`people: Person[]`、`personId: string | null`、`onSelectPerson(id: string | null)`、`onManagePeople()`。

### App.tsx 状态与过滤

- `packPerson`/`deployPerson` 从 `config.uiState` 读取,选择时经 `update()` 持久化到 `uiState`。
- `packRules`/`deployRules` 保持现有类型过滤;人员过滤在传入 `RuleList` 前或 `RuleList` 内完成(统一放 `RuleList` 内,App 只传 `personId`)。
- **一键打包/部署/预览**:`SelectionDialog` 的 `rules` 由「当前页规则 && enabled」改为「当前页规则 && enabled && `ruleMatchesPerson(r, 当前页 personId)`」,使批量操作尊重选中人员。
- **导出**:维持现状(`config.rules` 全量),不按人员裁剪(YAGNI)。

### PeopleManager 对话框(新组件 `src/components/PeopleManager.tsx`)

- 列出名单;每行:名称(可行内改名)+ 删除按钮。
- 底部:输入框 + 「添加」按钮。
- 删除需确认,提示「将从 N 条规则移除该人员标签」(N = 含该 id 的规则数)。
- 通过 `people.ts` 的 `addPerson/renamePerson/removePerson` 计算新状态,回调 App 的 `update()` 持久化。

### RuleEditor(`src/components/RuleEditor.tsx`)

- 「名称」字段下方新增一段「部署对象」:
  - `☑ 通用(所有人员都部署)` → `draft.common`。
  - 未勾选时,展开从名单勾选人员的多选(复选框列表)→ `draft.people`。
  - 名单为空时,显示提示「尚未创建人员,可在列表页『人员 › 管理人员』添加」,此时仅能保持通用。
- 校验:若 `common=false` 且 `people` 为空 → 报错「请勾选『通用』或至少指定一个人员」。

### RuleCard(`src/components/RuleCard.tsx`)

- 加一个小徽标:`common` 显示「通用」;否则显示归属人员名(用 id→名映射,多个用顿号连接;找不到名则跳过)。
- 需要从 App 透传 `people: Person[]` 以解析 id→名。

### 新建规则默认值(`src/utils/rules.ts` 的 `newRule`)

- 一律 `common: true, people: []`,**与当前选中人员无关**(用户明确要求)。

## 导入 / 导出

### 导出(`electron/core/ruleset.ts`)

- `serializeRuleset(rules, people)`:除现有「剥离 id」外,把每条规则的 `people`(id 数组)解析成**人员名数组**(用传入的 `people` 名单;找不到的 id 跳过)。`common` 原样带出。版本 `RULESET_VERSION` 提到 `2`。
- 产物结构:`{ version: 2, rules: [{ ...ruleWithoutId, common, people: string[<名>] }] }`。

### 导入(`electron/core/ruleset.ts` + main 进程 handler)

- `parseRuleset(text)`:返回规则数组,规则的 `people` 此时仍是**人员名**(字符串)。
  - v2:原样读取 `common`/`people(名)`。
  - v1(旧版规则集,无 `common`/`people`):规范化为 `common=true, people=[]`。
  - 继续跑 `validateRule`(需确保 validateRule 不因 `common`/`people` 报错)。
- main 进程 `importRules` handler(持有 config 名单):
  - 对每条规则的 `people(名)`:在当前 `config.people` 里**按名匹配**(区分大小写,精确匹配);缺失的名字用 `randomUUID()` 建人并加入名单;再把名字回填成 id。
  - 追加规则、保存 config、返回新 config(与现有返回结构一致,`added` 仍为新增规则数)。

## 错误处理

- 规则集版本非 1/2 → 沿用现有「不支持的规则集版本」报错。
- 导入含未知人员名 → 静默自动建人(符合「先建人再指派」的宽松侧,不打断导入);新增人员数不额外提示(日志沿用现有「已导入 N 条规则」)。
- 删除人员 → 级联从规则剔除,不删除规则本身(规则若因此变成「非通用且无归属」,仍存在但任何具体人员下都不显示,只在「全部」下可见,可再次编辑指派)。

## 测试(TDD,Vitest)

### `electron/core/people.test.ts`
- `ruleMatchesPerson`:`personId=null` 恒真;`common=true` 恒真;带标签命中/不命中;老数据(规范化后 common=true)在任意人员下可见。
- `addPerson`:正常追加;空白名返回原数组。
- `renamePerson`:改中目标;空白名返回原数组。
- `removePerson`:名单移除该人;所有规则 `people[]` 剔除该 id;不含该 id 的规则对象不变。

### `electron/core/ruleset.test.ts`(扩展)
- 往返:含 `common`/`people(id)` 的规则 → `serializeRuleset` 输出人员名 → `parseRuleset` 得到人员名 → (模拟 handler 的名→id 解析)归属保留。
- v1 规则集(无字段)导入 → 规则规范化为 `common=true`。

### `electron/core/config.test.ts`(若无则新增)
- 加载缺 `common`/`people` 的老 config → 规则规范化为 `common=true, people=[]`;`people` 名单默认 `[]`;`version` 为 2。

## 明确不做(YAGNI)

- 不做「每人一套独立配置/Profile 分层」。
- 不做多选人员筛选(仅单选 + 全部)。
- 不做按人员裁剪的导出。
- 不做人员排序/分组/头像等额外元数据(仅 id + name)。
