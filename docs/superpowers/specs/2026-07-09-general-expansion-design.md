# EnvDeploy 通用化扩展设计（v3）

日期：2026-07-09
状态：已确认

## 1. 背景与目标

工具当前（v2）为 Electron + React + TypeScript 实现，定位「一键搭建 AI 编程环境」，内置四种规则（pack / import / json / env）与可插拔规则引擎。本轮将其**转为通用环境部署工具**，并补齐一批地基能力。

本轮一次性完成：

1. **通用化定位与改名**：去掉 AI 专用身份，改产品名与默认配置。
2. **新增 `run` 动作类型**：执行多行脚本，覆盖初始化命令类需求。
3. **新增 `download` 动作类型**：从 URL 下载文件。
4. **`env` 增强**：用户级/机器级作用域、PATH 前置/后置、删除/移除操作。
5. **执行前预览（dry-run）**：真实差异 + 幂等检测。
6. **规则集导入/导出**：分享预设。

不做 `install` 独立类型（用 `run` + winget 顶）。

## 2. 命名与定位

| 项 | 变更 |
|---|---|
| 产品名 / exe 名（electron-builder `productName`） | `EnvDeploy`（产物为 `EnvDeploy.exe`） |
| 窗口标题 / 应用内标题 | 「环境部署工具」（中文显示） |
| GitHub 仓库名 / `package.json` `name` | **不变**（`jz-aicoding-env-tool` / 内部包名保持） |
| 默认配置 | **去掉 AI 预设**，首次运行为**空规则集** + 空状态引导 |
| 原 AI 预设（导出/部署 `.claude`、PYTHONUTF8） | 改造为随包附带的**示例规则集 `.json`**（`examples/ai-coding-env.rules.json`），用户经「导入规则集」按需载入，同时作为导入功能的示范 |

定位说明：核心引擎（六种规则）是通用环境搭建/部署机制，不与任何特定场景绑定。AI 编程环境降级为「一份可选示例规则集」。

## 3. 引擎层改动

引擎层（`electron/core/**`）保持**不依赖 Electron 窗口对象**的纪律（CLI 就绪）。

### 3.1 `RuleExecutor` 接口新增 `plan()`

```ts
interface PlanChange {
  kind: 'create' | 'modify' | 'delete' | 'run' | 'download' | 'noop';
  detail: string;            // 人类可读的一行变更描述
}

interface PlanResult {
  noop: boolean;             // 整条规则已是目标状态（无副作用）
  changes: PlanChange[];     // 将发生的变更列表；noop 时可为单条 noop 描述
}

interface RuleExecutor<T extends Rule> {
  type: string;
  validate(rule: T): string[];
  plan(rule: T, ctx: ExecContext): Promise<PlanResult>;   // 新增：预演，不产生副作用
  execute(rule: T, ctx: ExecContext): Promise<string>;
}
```

- `plan()` **只读**：不写文件、不改注册表、不跑命令。用于 dry-run 预览与幂等提示。
- 六个 executor（pack / import / json / env / run / download）各实现 `plan()`。
- 引擎新增 `planRules(rules, ctx)` 批量预演，与既有 `runRules` 对称。

### 3.2 executor 变更清单

- 新增 `electron/core/executors/run.ts`
- 新增 `electron/core/executors/download.ts`
- 改造 `electron/core/executors/env.ts`（作用域 / PATH 位置 / remove）
- 为 `pack.ts` / `import.ts` / `json.ts` 补 `plan()` 实现
- 在引擎注册表注册 `run`、`download`

### 3.3 `${VAR}` 展开范围

`vars.ts` 逻辑不变，但展开应用到新字段：`run.command`、`run.cwd`、`download.url`、`download.target`。

## 4. 规则类型（新增/变更）

### 4.1 `run`（新）

```json
{ "id": "uuid", "type": "run", "name": "安装 CLI", "enabled": true,
  "command": "npm i -g @anthropic-ai/claude-code\nclaude --version",
  "shell": "powershell",         // "powershell" | "cmd"，默认 powershell
  "cwd": "",                     // 可选，支持 ${VAR}，空则用应用工作目录
  "elevated": false }            // 是否以管理员运行
```

行为：
- 多行 `command` 作为脚本执行（powershell：写临时 `.ps1` 或 `-Command`；cmd：写临时 `.bat`）。
- **成功判定**：进程退出码 0；非 0 抛错，规则失败。
- stdout/stderr **实时**通过 `ctx.onProgress` 逐行写入操作日志面板。
- `elevated: true`：
  - 当前进程已是管理员 → 直接内联执行并捕获输出。
  - 当前非管理员 → 经 `Start-Process -Verb RunAs -Wait -PassThru`（触发 UAC）；stdout/stderr 重定向到临时文件，进程结束后回读进日志（无法逐行流式，改为结束后一次性写入）。
- `plan()`：`run` 无法安全预演副作用，`plan()` 返回单条 `kind:'run'` 描述「将执行：<命令首行…>（shell / cwd / 提权）」，`noop:false`。
- 归属：**部署流程**动作（与 import/json/env/download 并列），不进打包流程。

### 4.2 `download`（新）

```json
{ "id": "uuid", "type": "download", "name": "下载安装包", "enabled": true,
  "url": "https://example.com/tool.zip",
  "target": "${USERPROFILE}/Downloads/tool.zip",
  "overwrite": false }
```

行为：
- 下载 `url` 到 `target`（支持 `${VAR}`）；父目录不存在则创建。
- 目标已存在：`overwrite:false` → 跳过（记日志）；`overwrite:true` → 重下覆盖。
- 下载进度经 `ctx.onProgress(received, total, ...)` 实时上报进度条。
- 仅支持 `http`/`https`；其它协议校验报错。
- `plan()`：目标已存在且 `overwrite:false` → `noop:true`（「已存在，跳过」）；否则 `kind:'download'`「将下载 <url> → <target>」。
- 本轮**不做** SHA256 校验。

### 4.3 `env`（增强）

```json
{ "id": "uuid", "type": "env", "name": "设置变量", "enabled": true,
  "key": "PATH", "value": "C:/tools/bin",
  "op": "set",                   // "set" | "path-append" | "remove"
  "scope": "user",              // "user"(HKCU) | "machine"(HKLM)，默认 user
  "pathPosition": "append" }    // 仅 op=path-append 时有效："append" | "prepend"
```

行为：
- `scope: user` → 写 HKCU，**不需要管理员**；`scope: machine` → 写 HKLM，**需要管理员**（缺权限时明确报错并提示以管理员身份重启）。
- `op: set`：设置/覆盖变量值（含 `%` 时用 REG_EXPAND_SZ 语义，与 v2 一致）。
- `op: path-append`：向 PATH 追加 `value`，大小写不敏感去重；`pathPosition: prepend` 插到最前（优先生效），`append` 追加到末尾。
- `op: remove`：填了 `value` → 从列表中移除该项（适用于任意变量，大小写不敏感，**不删整个变量**）；`value` 留空 → 删除整个变量，但 `PATH`/`TEMP`/`USERPROFILE` 等重要系统变量**受保护、禁止整体删除**（报错提示改用「填值移除条目」）。
- 写入/删除后广播 `WM_SETTINGCHANGE`，效果对齐 Windows「环境变量」对话框（新开的程序即时生效、无需重启）。用异步非阻塞的 `SendNotifyMessage`，避免同步的 `SendMessageTimeout` 逐个顶层窗口等待、遇到不响应窗口时阻塞数十秒。含 `%` 的值写 REG_EXPAND_SZ 保留展开语义。
- `plan()`：读取当前值 → 若目标状态已满足（变量已是该值 / PATH 已含该项 / 变量本就不存在待删）→ `noop:true`「无变化」；否则 `kind:'modify'|'create'|'delete'`「<key>：<旧值> → <新值>」。

## 5. dry-run 预览

数据流：

```
用户点「预览」（或「一键部署」前置步骤）
  → 渲染层 IPC 调 planRules(选中的 enabled 规则)
  → 引擎逐条 plan()（只读，隔离 try/catch，单条失败标记为该条错误）
  → 返回 PlanResult[]
  → 预览面板逐条渲染：规则名 / 类型徽章 / 变更列表 / noop 徽章
  → 用户确认 → 走既有 runRules 执行；取消 → 关闭
```

预览面板每条展示：
- env：`旧值 → 新值`，相同标「无变化」。
- json：将新增 / 覆盖的 key 列表。
- import：将删除 / 备份 / 解压 N 个文件、保留 M 项。
- pack：将打包 N 个文件（含 exclude 命中摘要）。
- run：将执行的命令首行 + shell/cwd/提权。
- download：将下载目标，或「已存在，跳过」。

## 6. 规则集导入/导出

格式（`.rules.json`）：

```json
{ "version": 1, "rules": [ { "type": "...", "name": "...", ... } ] }
```

- **导出**：多选规则（或全部）→ 系统保存对话框 → 写 `.rules.json`（导出时**剥离 id**，仅保留规则内容）。
- **导入**：系统打开对话框选 `.rules.json` → 校验 `version` 与每条规则的 `validate()` → **追加**到当前 `config.rules`，为每条**重新生成 id**（避免与现有冲突）→ 持久化。
- 导入非法文件（JSON 语法错 / version 不支持 / 规则校验失败）→ 报错，不改动现有配置。

## 7. UI 改动

- **顶栏**：新增「预览」「导入规则集」「导出规则集」入口。
- **类型筛选条**：自动多出 `run` / `download` 徽章（选项由注册表动态生成，无需手改 UI）。
- **规则编辑器**：新增三种表单分支——
  - `run`：多行脚本 `textarea` + shell 下拉 + cwd 路径框 + 提权勾选。
  - `download`：url 输入 + target 路径框（带文件选择器）+ 覆盖开关。
  - `env`：scope 下拉（用户级/机器级）+ op 下拉（set/path-append/remove）+ PATH 位置下拉（前置/后置，仅 path-append 显示）。
- **空状态**：首次运行空规则集时展示引导（新建规则 / 导入规则集 / 导入示例）。
- **产品名/标题**：窗口标题与应用内标题改「环境部署工具」。

## 8. 测试（Vitest，引擎层）

- `run`：mock `child_process` —— 成功（退出 0）、失败（非 0 抛错）、cwd 生效、shell 选择、多行脚本组装。
- `download`：mock http + fs —— 新下载、目标已存在跳过、overwrite 覆盖、非 http 协议报错。
- `env`：mock powershell —— HKCU/HKLM 分流、path-append 去重、prepend 位置、remove 移除 PATH 项 / 删除变量。
- `plan()`：每个 executor 的幂等判定（已是目标状态 → noop；否则列出变更）。
- 规则集导入：id 重分配、version 校验、非法文件不改动配置。
- UI 手动验证。

## 9. 项目结构增量

```
electron/core/
  executors/
    run.ts        # 新增
    download.ts   # 新增
    env.ts        # 改造（scope / pathPosition / remove）
    pack.ts       # 补 plan()
    import.ts     # 补 plan()
    json.ts       # 补 plan()
  engine.ts       # 注册 run/download；新增 planRules
shared/types.ts   # RunRule / DownloadRule / EnvRule 扩展 / PlanResult
src/components/    # RuleEditor 新增三种表单分支；新增预览面板组件
src/…             # 顶栏预览/导入/导出入口；空状态
examples/ai-coding-env.rules.json   # 原 AI 预设导出为示例规则集
electron-builder.yml                # productName → EnvDeploy
```

## 10. 明确不做（本轮）

- `install` 独立动作类型（用 `run` + winget）。
- `download` 的 SHA256 校验。
- 远程 zip 源、CLI 无头模式、跨平台。
- GitHub 仓库改名、`package.json` 包名改名、旧配置迁移。
