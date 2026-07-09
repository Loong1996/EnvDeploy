# jz-aicoding-env-tool v2 重构设计

日期:2026-07-09
状态:已确认

## 1. 背景与目标

现有工具为 Python + tkinter 实现,包含三个模块(机器开发环境部署 / 项目配置同步 / 时间戳转换)。本次重构:

1. **换技术栈**:Python tkinter 界面自由度太低,改为 Node + Electron。
2. **收敛功能**:只保留「机器开发环境部署」,删除项目配置同步与时间戳转换。工具定位单一——一键搭建 AI 编程环境。
3. **零历史包袱**:旧 Python 代码全部删除,配置格式重新设计,不做迁移。

定位说明:核心引擎(四种规则)是通用的环境搭建机制,不与 AI 硬绑定;「AI 编程环境」是它的主打使用场景。架构为未来扩展新动作类型预留插拔口(方向 C)。

## 2. 技术栈

| 层 | 选型 |
|---|---|
| 桌面框架 | Electron |
| 前端 | React 18 + Vite + TypeScript |
| 主进程 | Node.js + TypeScript |
| zip 打包/解压 | `archiver`(写)+ `node-stream-zip`(读,带进度) |
| 系统环境变量 | PowerShell `[Environment]::SetEnvironmentVariable(..., 'Machine')`(自动广播 WM_SETTINGCHANGE) |
| 分发 | electron-builder portable 单 exe |
| 测试 | Vitest(核心引擎单测) |

## 3. 架构:可插拔规则引擎

主进程内核是规则执行器注册表:

```ts
interface RuleExecutor<T extends Rule> {
  type: string;                      // "pack" | "import" | "json" | "env" | 未来扩展
  validate(rule: T): string[];       // 校验错误列表(空数组 = 通过)
  execute(rule: T, ctx: ExecContext): Promise<string>;  // 返回结果消息,失败抛异常
}

interface ExecContext {
  onProgress(current: number, total: number, detail: string): void;
  settings: Settings;                // 如 backupBeforeImport
}
```

- 新增动作类型 = 新 executor 文件 + 注册一行 + 一个编辑表单组件;执行、进度、日志、多选记忆全部复用。
- 引擎层(engine + executors)**不依赖 Electron 窗口对象**,为未来 CLI 无头模式预留(架构纪律)。
- UI 的类型筛选选项从注册表动态生成,新增 type 自动出现。

### 3.1 四种内置规则(行为与旧版对齐)

| type | 行为 |
|------|------|
| `pack` | 目录 → zip(支持 `excludes` fnmatch 通配符,含路径模式与文件名模式);单文件源 + 非 .zip 输出时直接复制 |
| `import` | zip → 目标目录:先收集 `preserve` 匹配项暂存 → 备份或删除目标目录 → 解压 → 还原保留项(覆盖 zip 同名内容);非 zip 源按单文件复制,支持 `rename` |
| `json` | 对 JSON 文件执行 append(key 已存在则报错)/ modify(key 不存在则报错)/ upsert / overwrite,嵌套对象深度合并,写前自动生成 `.bak` |
| `env` | 设置系统环境变量(HKLM)或追加 PATH(大小写不敏感去重);检测管理员权限,缺权限时明确报错;含 `%` 的值用 REG_EXPAND_SZ 语义 |

### 3.2 路径变量(本次实现)

规则中所有路径字段支持 `${VAR}` 占位符(如 `${USERPROFILE}`、`${APPDATA}`),执行前统一展开为环境变量值。同一份规则可在不同机器直接使用。

## 4. 配置文件

`config.json` 位于 exe 同目录(portable 习惯)。统一规则表,不迁移旧格式:

```json
{
  "version": 1,
  "rules": [
    { "id": "uuid", "type": "pack",   "name": "导出Claude配置", "enabled": true,
      "source": "${USERPROFILE}/.claude", "output": "claude.zip", "excludes": ["plugins"] },
    { "id": "uuid", "type": "import", "name": "部署Claude配置", "enabled": true,
      "zip": "claude.zip", "target": "${USERPROFILE}/.claude", "preserve": [], "rename": "" },
    { "id": "uuid", "type": "json",   "name": "改settings", "enabled": true,
      "file": "...", "op": "upsert", "data": {} },
    { "id": "uuid", "type": "env",    "name": "UTF8", "enabled": true,
      "key": "PYTHONUTF8", "value": "1", "op": "set" }
  ],
  "settings": { "backupBeforeImport": true },
  "selectionMemory": { "pack": {}, "deploy": {} },
  "uiState": {}
}
```

- 规则分两个工作流:**打包**(type=pack)与**部署**(import/json/env)。
- `rules` 数组顺序即部署执行顺序(UI 拖拽排序)。
- `enabled: false` 的规则在一键执行中跳过(不出现在多选弹窗),卡片置灰。
- `version` + 规则 `id` 为未来规则集导入/导出预留。
- 首次运行生成的默认配置内置一套 AI 编程环境示例规则(导出/部署 `.claude` 等)。

## 5. UI 设计

单窗口,现代化视觉(全新设计,不参考旧版),深色主题为主:

```
┌────────────────────────────────────────────┐
│  ⚡ 一键打包    🚀 一键部署        ⚙ 设置   │  ← 顶栏 hero 按钮
├─────────┬──────────────────────────────────┤
│ 打包规则 │  [全部|导入|JSON|环境变量] [搜索…] │  ← 类型筛选条(部署页)
│ 部署规则 │  规则卡片列表                     │
│ 操作日志 │  ┌ 名称 / 类型徽章 / 路径摘要     │
│         │  │ enabled开关 [编辑][删除][执行]  │
│         │  └ + 新建规则                     │
└─────────┴──────────────────────────────────┘
```

- **规则卡片**:类型徽章配色区分,单条可独立执行。
- **类型筛选条**:分段按钮(选项由注册表动态生成)+ 关键字搜索(匹配名称/路径),实时过滤。
- **编辑表单**:抽屉/模态,路径带系统文件选择器,excludes/preserve 用 tag 输入,json data 用带校验的编辑器。
- **执行反馈**:进度条 + 逐文件明细;完成后结果面板逐条 ✓/✗。
- **一键打包/一键部署**:多选弹窗(仅列 enabled 规则)+ 记忆上次勾选。
- **保留辅助功能**:导入前备份目标目录开关、配置备份/恢复(保留最近 10 份)、操作日志面板。

## 6. 项目结构

```
├── electron/
│   ├── main.ts              # 窗口 + IPC 注册
│   ├── preload.ts           # 类型安全 IPC 桥
│   └── core/
│       ├── config.ts        # 配置读写 / 备份恢复
│       ├── engine.ts        # 执行器注册表 + 批量执行
│       ├── vars.ts          # ${VAR} 路径变量展开
│       └── executors/
│           ├── pack.ts
│           ├── import.ts
│           ├── json.ts
│           └── env.ts
├── src/                     # React 渲染层
│   ├── pages/               # 打包规则 / 部署规则 / 日志
│   ├── components/          # 卡片、表单、进度、多选弹窗等
│   └── theme/
├── tests/                   # Vitest 单测
└── electron-builder.yml
```

## 7. 错误处理与测试

- 每条规则独立 try/catch,单条失败不中断批量,结果面板汇总 ✓/✗。
- `validate()` 前置校验(路径为空、JSON 语法错等),编辑表单实时标红。
- env 规则缺管理员权限时报错并提示以管理员身份重启。
- 核心引擎全部 Vitest 覆盖:四个 executor、深度合并、exclude/preserve 匹配、路径变量展开;UI 手动验证。

## 8. 扩展预留(只留口子,本次不实现)

| 扩展 | 预留方式 |
|------|----------|
| 规则集导入/导出 | `version` 字段 + 规则 `id` 已具备,后续加两个按钮 |
| CLI 无头模式 | 引擎层不依赖窗口;主进程按命令行参数分流 |
| 远程 zip 源 | `zip` 字段语义为「本地路径或 URL」,http 前缀暂报不支持 |
| 新动作类型(脚本/装软件等) | 执行器注册表天然支持 |
| macOS/Linux 支持 | 极远期,不为其付出任何当前成本;代码可直接假定 Windows(PowerShell、HKLM、路径习惯等) |

## 9. 明确不做

- 项目配置同步、时间戳转换(整体删除)。
- 旧 config.json 迁移。
- 跨平台兼容:**仅支持 Windows**,实现时不做任何跨平台抽象或兼容分支(见 §8 扩展预留)。
- 不复用、不参考旧 Python 代码的任何实现与界面,完全重写。
