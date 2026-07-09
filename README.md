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
