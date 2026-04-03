# DeployConfigTool

面向开发者的桌面运维小工具，基于 Python + tkinter 构建，支持打包为单文件 `.exe` 免安装使用。

## 功能模块

通过菜单栏「模块」可控制各模块的显示/隐藏。

### 机器开发环境部署

左侧纵列导航，包含四个子功能：

| 子页面 | 功能 |
|--------|------|
| 打包文件 | 将指定目录打包为 `.zip`，支持多规则批量执行 |
| 导入文件 | 将 `.zip` 解压到目标目录，支持多规则批量执行 |
| JSON操作 | 对 JSON 文件执行插入/更新/删除等操作 |
| 环境变量 | 设置系统环境变量或追加 PATH |

顶部「一键打包」「一键导入」支持多选规则、记忆上次选择。

### 项目配置同步

管理多个同步方案，每个方案包含：

- **目标工程目录**：可配置多个目标路径
- **同步项**：文件/目录的源→目标映射列表

顶部「一键同步」支持选择目标工程后批量同步。

### 时间戳转换

- Unix 时间戳 → 日期时间（自动识别秒/毫秒）
- 日期时间 → Unix 时间戳（同时输出秒和毫秒）
- 结果支持鼠标直接选中复制
- 一键获取当前时间
- **设置系统时间**（需管理员权限）

## 其他功能

- **操作日志**：菜单「查看 → 操作日志」开启，记录所有批量操作结果
- **配置备份/恢复**：菜单「配置管理」，自动保留最近 10 份备份
- **界面状态记忆**：下次启动自动恢复上次所在模块和子页面

## 运行

```bash
# 安装依赖（无第三方依赖，仅需标准库）
python main.py
```

## 打包为 exe

```bash
pip install pyinstaller

# 使用已有 spec 文件（推荐）
pyinstaller DeployConfigTool.spec

# 或重新全量打包
pyinstaller --onefile --windowed --name "DeployConfigTool" main.py
```

打包产物在 `dist/DeployConfigTool.exe`，约 13 MB，无需安装 Python。

### 分发目录结构

```
发布目录/
├── DeployConfigTool.exe   ← 主程序
├── config.json             ← 首次运行后自动生成（用户配置）
├── config_backups/         ← 配置备份目录（自动创建）
└── packages/               ← 打包输出目录（首次使用后自动创建）
```

## 项目结构

```
├── main.py              # 入口
├── config.py            # 配置读写 / 备份恢复
├── core/
│   ├── folder_pack.py   # 打包/解压逻辑
│   ├── file_sync.py     # 文件同步逻辑
│   ├── json_manip.py    # JSON 操作逻辑
│   └── env_vars.py      # 环境变量操作
└── ui/
    ├── app.py           # 主窗口 / 模块注册
    ├── theme.py         # 统一样式常量
    ├── widgets.py       # 通用组件（日志面板、对话框等）
    ├── tab_pack.py      # 打包文件页
    ├── tab_import.py    # 导入文件页
    ├── tab_json.py      # JSON操作页
    ├── tab_envvar.py    # 环境变量页
    ├── tab_sync.py      # 项目配置同步页
    └── tab_timestamp.py # 时间戳转换页
```
