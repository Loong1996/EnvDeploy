# `${VAR}` 快查面板 + JSON 保留指定 key 设计

日期：2026-07-10
状态：已确认

## 1. 背景与目标

两个独立的规则编写体验增强，互不依赖：

1. **`${VAR}` 快查面板**：`${VAR}` 可展开任意环境变量，但界面没有任何提示，用户得凭记忆写变量名。加一个可查阅面板，列出变量名 + 本机实时值，可鼠标选中复制。
2. **JSON「保留指定 key」**：现有 `overwrite` 整体覆盖文件、合并类操作又删不掉 key；缺「整体覆盖/合并，但保留原文件某几个 key 原值」的能力。给 `overwrite` 和 `upsert` 增加 `preserve`（点路径）。

引擎层（`electron/core/**`）继续保持不依赖 Electron 窗口对象。

## 2. 功能一：`${VAR}` 快查面板

### 2.1 数据来源

`${VAR}` 的展开在**主进程** `expandVars` 里用主进程 `process.env` 完成——那是展开时真正读到的值。渲染进程自身 env 与主进程不同且沙箱下受限，故必须从主进程取。

- 新增 IPC `sys:env-vars`，主进程返回 `Record<string, string>`：遍历 `process.env`，过滤掉 `undefined` 值。
- `preload.ts` 暴露 `envVars(): Promise<Record<string, string>>`；`shared/api.ts` 加类型。

### 2.2 组件 `VarReference.tsx`

复用现有 `Modal` 外壳，标题「可用环境变量（${VAR}）」。

- 顶部搜索框，按变量名或值大小写不敏感过滤。
- **常用**分组置顶：从固定候选名单里筛出「本机确实存在」的，按名单顺序展示。候选：
  `USERPROFILE`、`HOMEDRIVE`、`HOMEPATH`、`APPDATA`、`LOCALAPPDATA`、`PROGRAMDATA`、`PROGRAMFILES`、`PROGRAMFILES(X86)`、`PUBLIC`、`TEMP`、`TMP`、`SYSTEMROOT`、`WINDIR`、`SYSTEMDRIVE`、`USERNAME`、`COMPUTERNAME`、`USERDOMAIN`。
- **全部**分组：其余变量按名字母排序。搜索时两组一起过滤；有搜索词时可合并为一个结果列表。
- 每行三部分：`${NAME}` 记号（等宽）、解析后的值（等宽、`word-break` 换行以便看长路径）、右侧「复制」按钮（复制 `${NAME}` 到剪贴板，用 `navigator.clipboard.writeText`）。
- **可选中复制**：全局 `body { user-select: none }`，本面板容器必须显式 `user-select: text`，否则鼠标选不中。名字与值都要可选中。

### 2.3 入口

规则编辑弹窗（`RuleEditor`）表单顶部加一个小按钮「查看可用变量」，点击打开 `VarReference`。它作为叠在编辑器之上的第二层 `Modal` 渲染（后渲染者在上层，z-index 同为 100，DOM 顺序保证遮挡正确）。`VarReference` 关闭只关自己，不影响编辑器。

### 2.4 不做

- 不做「点一下把 `${NAME}` 插入到当前字段」——只做复制。
- 不做变量值编辑/新增（这是查阅面板，不是环境变量编辑器；改环境变量用 env 规则）。

## 3. 功能二：JSON「保留指定 key」

### 3.1 语义（统一）

> **preserve = 这些点路径永远保持原文件的值，不被本次操作覆盖/合并改动。**

仅对 `overwrite` 与 `upsert` 生效：

- **overwrite + preserve**：结果基底 = `data`（整体覆盖）；对每个「在原文件里存在」的 preserve 路径，把原值写回结果对应位置。
- **upsert + preserve**：结果基底 = `deepMerge(existing, data)`；同样把 preserve 路径改回原文件原值——即便 `data` 里写了该路径，原值优先。

实现为**统一收尾步骤** `applyPreserve(result, existing, preserve)`：对每个路径，若 `getByPath(existing, path) !== undefined` 则 `setByPath(result, path, 原值)`。

### 3.2 类型与默认值

- `shared/types.ts` `JsonRule` 增 `preserve?: string[]`（点路径列表，缺省视为 `[]`）。
- `src/utils/rules.ts` `newRule('json')` 增 `preserve: []`。

### 3.3 点路径工具（`json.ts` 内）

```ts
// 读：a.b.c 不存在或中途非对象 → undefined
function getByPath(obj: Record<string, unknown>, path: string): unknown

// 写：逐层创建对象；命中危险 key（__proto__/constructor/prototype）整条路径跳过
function setByPath(obj: Record<string, unknown>, path: string, value: unknown): void
```

- 路径按 `.` 拆分，空段（如 `a..b`、首尾 `.`）视为非法 → 该路径跳过。
- `setByPath` 中若某层现有值不是对象则以新对象替换（因为要写入子路径）。
- 危险 key 防护复用现有 `DANGEROUS_KEYS`。

### 3.4 执行流程改动

`overwrite` 分支：写入前若文件存在则读入 `existing`（对象），`applyPreserve(data 的克隆, existing, preserve)` 后再写；文件不存在则无原值可保留，等同普通覆盖。`upsert` 分支：`deepMerge` 后 `applyPreserve(merged, existing, preserve)`。两者仍先备份 `.bak`。

`append`/`modify` 分支不动，忽略 `preserve`。

### 3.5 预览 `plan()`

- `overwrite`：`全量写入 <file>`；若 preserve 非空，追加一条 `保留 N 项：a.b.c, …`（只统计在原文件里实际存在的路径）。
- `upsert`：现有变更列表后，若有实际保留项，追加一条 `保留 N 项：…`。
- 预览是只读的，`getByPath` 读原文件判断路径是否存在。

### 3.6 界面：逐行路径编辑器

新组件 `KeyPathList.tsx`（point-path 专用，区别于 chips 式 `TagInput`）：

- 每条路径独占一行：一个 `<input>`（占满宽度）+ 行尾「删除」按钮。
- 列表底部「＋ 添加」按钮，追加一个空行。
- `onChange` 回传去掉空串后的数组；空行允许临时存在，保存时过滤。
- 仅在 JSON 表单里 `op === 'overwrite' || op === 'upsert'` 时显示，标签：`保留（覆盖/合并时保持原文件的这些 key，点路径如 a.b.c）`。

### 3.7 规则摘要

`ruleSummary` 的 json 分支：`preserve` 非空时附加 `· 保留 N 项`（可选，纯展示）。

### 3.8 不做

- `preserve` 不支持数组下标路径（仅对象点路径）。
- 非 `overwrite`/`upsert` 操作忽略 `preserve`（界面也不显示）。

## 4. 测试（Vitest，引擎层）

- `getByPath`：命中、路径不存在、中途非对象、空段非法。
- `setByPath`：新建嵌套、覆盖非对象层、危险 key 跳过。
- `applyPreserve` 经 executor：
  - overwrite：保留路径存在 → 原值回写；不存在 → 跳过；文件不存在 → 普通覆盖。
  - upsert：`data` 写了该路径但原值优先。
- `plan()`：overwrite/upsert 的「保留 N 项」计数只算原文件实际存在的路径。
- 环境变量 IPC 属渲染/主进程集成，`VarReference` UI 手动验证（列表、搜索、选中复制、常用分组）。

## 5. 结构增量

```
electron/main.ts            # + ipcMain.handle('sys:env-vars')
electron/preload.ts         # + envVars()
shared/api.ts               # + envVars 类型
shared/types.ts             # JsonRule + preserve?
electron/core/executors/json.ts  # getByPath/setByPath/applyPreserve；overwrite/upsert 应用；plan 预览
src/utils/rules.ts          # newRule('json') + preserve:[]；ruleSummary 附加
src/components/VarReference.tsx   # 新增：${VAR} 快查面板
src/components/KeyPathList.tsx     # 新增：逐行点路径编辑器
src/components/RuleEditor.tsx      # + 「查看可用变量」按钮；json 分支接入 KeyPathList
src/theme.css               # VarReference / KeyPathList 样式；user-select:text 覆盖
```

## 6. 明确不做（本轮）

- `${VAR}` 面板的插入到字段、值编辑。
- JSON preserve 的数组下标路径、通配符。
- 其它规则类型的点路径 UI（仅 JSON preserve 用 KeyPathList）。
