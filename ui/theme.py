"""
ui/theme.py — 全局 UI 样式常量与工具函数

所有样式值统一在此定义，其他模块只引用 token，不写硬编码值。
新增模块时直接 from ui.theme import ... 即可保持风格一致。
"""
import tkinter as tk

# ── 字体 ──────────────────────────────────────────────────────
_FAMILY = "Microsoft YaHei UI"
_MONO   = "Consolas"

FONT_BODY          = (_FAMILY, 9)            # 全局默认正文
FONT_BODY_BOLD     = (_FAMILY, 9,  "bold")   # 侧边栏选中、LabelFrame 标题
FONT_HEADING       = (_FAMILY, 12, "bold")   # 区块标题（方案栏标签等）
FONT_HEADING_INPUT = (_FAMILY, 12)           # 大号 Combobox
FONT_HERO          = (_FAMILY, 11, "bold")   # 一键打包/导入/同步等主操作按钮
FONT_ACTION        = (_FAMILY, 10, "bold")   # 次级操作按钮
FONT_MONO_SM       = (_MONO,   9)            # 日志面板
FONT_MONO_MD       = (_MONO,   10)           # 列表框、结果对话框

# ── 颜色 ──────────────────────────────────────────────────────
# 操作按钮
COLOR_PRIMARY      = "#4CAF50"   # 绿 — 打包、确定、关闭
COLOR_PRIMARY_ACT  = "#388E3C"
COLOR_SECONDARY    = "#2196F3"   # 蓝 — 导入
COLOR_SECONDARY_ACT= "#1565C0"
COLOR_ACCENT       = "#9C27B0"   # 紫 — 同步
COLOR_ACCENT_ACT   = "#6A1B9A"
COLOR_DANGER       = "#FF7043"   # 橙 — 恢复/危险操作
COLOR_DANGER_ACT   = "#BF360C"
COLOR_CANCEL       = "#9E9E9E"   # 灰 — 取消
COLOR_CANCEL_ACT   = "#757575"

# 文本前景色
COLOR_FG_WHITE   = "white"
COLOR_FG_SUCCESS = "#2E7D32"    # 成功文本（日志 ok tag）
COLOR_FG_ERROR   = "#C62828"    # 错误文本（日志 err tag）
COLOR_FG_MUTED   = "#9E9E9E"    # 次要文本（时间戳、提示、空状态）
COLOR_FG_BODY    = "#333333"    # 普通结果文本
COLOR_FG_INVALID = "red"        # 非法路径 Entry 前景

# 侧边栏
COLOR_SIDEBAR_BG     = "#ECEFF1"
COLOR_SIDEBAR_ACTIVE = "#B0BEC5"
COLOR_SIDEBAR_HOVER  = "#CFD8DC"

# ── 间距 ──────────────────────────────────────────────────────
PAD_OUTER      = 5    # 外层容器 padx/pady
PAD_INNER      = 8    # LabelFrame 内边距
PAD_ROW        = 3    # 规则行垂直间距
PAD_CARD       = 4    # 卡片间垂直间距
PAD_SECTION    = 6    # 区块间垂直间距
PAD_HERO_BTN   = 10   # 主按钮水平间距
IPADY_HERO_BTN = 6    # 主按钮内部垂直填充
IPADY_SIDEBAR  = 8    # 侧边栏按钮内部垂直填充

# ── 浮雕 ──────────────────────────────────────────────────────
RELIEF_STATUS  = "sunken"    # 状态栏 Label
RELIEF_LIST    = "sunken"    # 对话框列表区域
RELIEF_LIST_BD = 1
RELIEF_CARD    = "groove"    # 同步条目卡片
RELIEF_CARD_BD = 1

# ── 按钮预设字典（使用方式：tk.Button(parent, text="…", **BTN_PRIMARY, command=fn)）
_BTN_BASE = dict(
    relief="flat", bd=0, cursor="hand2",
    fg=COLOR_FG_WHITE, activeforeground=COLOR_FG_WHITE,
)

# 主操作按钮（较大字体，用于页面顶部 hero 区域）
BTN_PRIMARY   = {**_BTN_BASE, "bg": COLOR_PRIMARY,   "activebackground": COLOR_PRIMARY_ACT,   "font": FONT_HERO}
BTN_SECONDARY = {**_BTN_BASE, "bg": COLOR_SECONDARY, "activebackground": COLOR_SECONDARY_ACT, "font": FONT_HERO}
BTN_ACCENT    = {**_BTN_BASE, "bg": COLOR_ACCENT,    "activebackground": COLOR_ACCENT_ACT,    "font": FONT_HERO}
BTN_ACTION    = {**_BTN_BASE, "bg": COLOR_PRIMARY,   "activebackground": COLOR_PRIMARY_ACT,   "font": FONT_ACTION}

# 对话框按钮（正文字体，用于弹窗内）
BTN_DIALOG_OK     = {**_BTN_BASE, "bg": COLOR_PRIMARY,  "activebackground": COLOR_PRIMARY_ACT,  "font": FONT_BODY}
BTN_DIALOG_DANGER = {**_BTN_BASE, "bg": COLOR_DANGER,   "activebackground": COLOR_DANGER_ACT,   "font": FONT_BODY}
BTN_DIALOG_CANCEL = {**_BTN_BASE, "bg": COLOR_CANCEL,   "activebackground": COLOR_CANCEL_ACT,   "font": FONT_BODY}


# ── 工具函数 ──────────────────────────────────────────────────

def apply_ttk_styles(style) -> None:
    """统一配置 ttk.Style，在 App.__init__ 调用一次即可。"""
    style.theme_use("clam")
    style.configure(".",                  font=FONT_BODY)
    style.configure("TLabelframe.Label",  font=FONT_BODY_BOLD)
    style.configure("TButton",            padding=[8, 3])
    style.configure("TNotebook.Tab",      padding=[12, 4])


def empty_label(parent, text: str) -> tk.Label:
    """创建标准空状态提示标签（灰色正文字体）。"""
    return tk.Label(parent, text=text, fg=COLOR_FG_MUTED, font=FONT_BODY)
