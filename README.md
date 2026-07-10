# EnvDeploy / 通用环境部署工具

把一台机器上的环境配置（AI 编程配置只是其中一种用法）打包成规则集，在任意 Windows 机器上一键部署：解压文件、改 JSON、写环境变量、跑脚本、下载文件。

基于 Electron + React + TypeScript，分发为免安装的 portable 单 exe。**仅支持 Windows。**

## 功能

界面分三页：**打包规则**（源机器用）、**部署规则**（新机器用）、**操作日志**。

| 规则类型 | 作用 |
|----------|------|
| 打包 | 目录 → zip（支持排除通配符）；单文件直拷 |
| 导入 | zip → 目标目录（支持保留指定文件、导入前备份、单文件重命名） |
| JSON | 对 JSON 文件 append / modify / upsert / overwrite（嵌套深度合并，写前自动 .bak） |
| 环境变量 | set / append_path（追加或前置，自动去重）/ remove（填「值」= 只移除列表中该项；留空 = 删除整个变量，PATH 等重要系统变量受保护、禁止整体删除）；用户级（HKCU，免管理员）或机器级（HKLM，需管理员）；写入后非阻塞广播即时生效 |
| 运行脚本 | 多行 PowerShell / CMD 脚本，可指定工作目录，可选以管理员身份运行（非管理员时弹 UAC） |
| 下载文件 | 从 http/https 地址下载到指定路径，带进度，可选择已存在时是否覆盖 |

- 顶部「一键打包」「一键部署」：多选规则批量执行，记忆上次勾选
- 「预览」：部署前先 dry-run，逐条列出每条规则的真实变更（创建/修改/删除/运行/下载），已经是目标状态的规则会标为「无变化」，预检失败的规则会标红并给出原因，确认后再真正执行
- 规则卡片：启用开关、单条执行、拖拽排序（部署顺序）、类型筛选、关键字搜索
- 规则集导入 / 导出：把一组规则打包成 `.rules.json` 文件分享或备份，导入时追加到当前规则列表；工具内置了一份 AI 编程环境的示例规则集（打包/部署 `~/.claude` 配置 + 设置 `PYTHONUTF8`），部署规则页为空时可一键导入体验，它只是一个可参考的示例，不是本工具的固定用途
- 所有路径支持 `${VAR}` 环境变量占位符（如 `${USERPROFILE}/.claude`），同一份规则跨机器通用
- 配置备份/恢复（保留最近 10 份）

## 使用

分发为 `EnvDeploy-2.0.0.zip`：解压一次到任意目录，直接运行里面的 `EnvDeploy.exe`（免安装、启动即时、整个文件夹可拷走）。首次运行会在 exe 同级目录生成运行数据：

```
解压后的目录/
├── EnvDeploy.exe          ← 主程序（旁边是 Electron 运行时文件）
├── resources/ locales/ …  ← Electron 运行时（勿删）
├── config.json            ← 首次运行自动生成（空规则集）
├── packages/              ← 打包输出 / 导入来源
└── config_backups/        ← 配置备份
```

典型流程：
1. **源机器**：配好打包规则（或从示例规则集起步）→ 一键打包 → 把整个文件夹（含 config.json + packages/）一起拷走
2. **新机器**：以管理员身份运行 `EnvDeploy.exe` → 先「预览」确认变更 → 一键部署

## 开发

```bash
npm install
npm run dev        # 开发窗口
npm run test       # 核心引擎单测（Vitest）
npm run typecheck  # tsc --noEmit
npm run build       # electron-vite build
npm run dist        # 打包成 release/EnvDeploy-2.0.0.zip（解压即用的文件夹）
```

## 架构

```
electron/core/          # 纯 Node 规则引擎（不依赖 Electron，可单测/未来可 CLI 化）
├── engine.ts           # 执行器注册表 + 批量执行 + 只读 plan() 预演
├── executors/          # pack / import / json / env / run / download（新增动作类型在此扩展）
├── config.ts           # 配置读写/备份
├── ruleset.ts          # 规则集导入/导出
└── ...
electron/main.ts        # 窗口 + IPC
electron/preload.ts     # 类型安全 window.api
shared/                 # 主进程/渲染层共享类型
src/                    # React 界面
examples/                # 内置示例规则集（如 ai-coding-env.rules.json）
```

新增规则类型 = 新写一个 executor + 注册一行 + 一个编辑表单分支，执行/预览/进度/日志/多选记忆全部复用。
