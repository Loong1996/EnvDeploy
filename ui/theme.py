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

# ── 背景色 ────────────────────────────────────────────────────
BG_WINDOW   = "#F1F4F8"   # 窗口/面板底色（浅蓝灰）
BG_CONTENT  = "#FFFFFF"   # 内容区、卡片、输入框
BORDER_COLOR = "#E2E8F0"  # 边框、分隔线

# ── 前景色 ────────────────────────────────────────────────────
FG_LABEL       = "#2D3748"   # 主文字
COLOR_FG_WHITE   = "white"
COLOR_FG_SUCCESS = "#2E7D32"
COLOR_FG_ERROR   = "#C62828"
COLOR_FG_MUTED   = "#94A3B8"   # 次要文字、时间戳、空状态
COLOR_FG_BODY    = "#334155"   # 普通结果文本
COLOR_FG_INVALID = "#E53E3E"   # 非法路径 Entry 前景

# ── 操作按钮色 ────────────────────────────────────────────────
COLOR_PRIMARY       = "#4CAF50"
COLOR_PRIMARY_ACT   = "#388E3C"
COLOR_SECONDARY     = "#2196F3"
COLOR_SECONDARY_ACT = "#1565C0"
COLOR_ACCENT        = "#9C27B0"
COLOR_ACCENT_ACT    = "#6A1B9A"
COLOR_DANGER        = "#FF7043"
COLOR_DANGER_ACT    = "#BF360C"
COLOR_CANCEL        = "#64748B"
COLOR_CANCEL_ACT    = "#475569"

# ── 侧边栏（深色） ────────────────────────────────────────────
COLOR_SIDEBAR_BG     = "#1E2A3A"   # 深蓝灰
COLOR_SIDEBAR_ACTIVE = "#2D4A6E"   # 选中背景（蓝调）
COLOR_SIDEBAR_HOVER  = "#263548"   # 悬停背景
FG_SIDEBAR           = "#94A3B8"   # 未选中文字
FG_SIDEBAR_SEL       = "#FFFFFF"   # 选中文字

# ── 间距 ──────────────────────────────────────────────────────
PAD_OUTER      = 5
PAD_INNER      = 8
PAD_ROW        = 3
PAD_CARD       = 4
PAD_SECTION    = 6
PAD_HERO_BTN   = 10
IPADY_HERO_BTN = 6
IPADY_SIDEBAR  = 8

# ── 浮雕 ──────────────────────────────────────────────────────
RELIEF_STATUS  = "flat"      # 状态栏（flat + border_color 边框感）
RELIEF_LIST    = "solid"     # 对话框列表区域
RELIEF_LIST_BD = 1
RELIEF_CARD    = "solid"     # 同步条目卡片
RELIEF_CARD_BD = 1

# ── 按钮预设字典 ──────────────────────────────────────────────
_BTN_BASE = dict(
    relief="flat", bd=0, cursor="hand2",
    fg=COLOR_FG_WHITE, activeforeground=COLOR_FG_WHITE,
)

BTN_PRIMARY   = {**_BTN_BASE, "bg": COLOR_PRIMARY,   "activebackground": COLOR_PRIMARY_ACT,   "font": FONT_HERO}
BTN_SECONDARY = {**_BTN_BASE, "bg": COLOR_SECONDARY, "activebackground": COLOR_SECONDARY_ACT, "font": FONT_HERO}
BTN_ACCENT    = {**_BTN_BASE, "bg": COLOR_ACCENT,    "activebackground": COLOR_ACCENT_ACT,    "font": FONT_HERO}
BTN_ACTION    = {**_BTN_BASE, "bg": COLOR_PRIMARY,   "activebackground": COLOR_PRIMARY_ACT,   "font": FONT_ACTION}

BTN_DIALOG_OK     = {**_BTN_BASE, "bg": COLOR_PRIMARY,  "activebackground": COLOR_PRIMARY_ACT,  "font": FONT_BODY}
BTN_DIALOG_DANGER = {**_BTN_BASE, "bg": COLOR_DANGER,   "activebackground": COLOR_DANGER_ACT,   "font": FONT_BODY}
BTN_DIALOG_CANCEL = {**_BTN_BASE, "bg": COLOR_CANCEL,   "activebackground": COLOR_CANCEL_ACT,   "font": FONT_BODY}


# ── ttk 样式配置 ──────────────────────────────────────────────

def apply_ttk_styles(style) -> None:
    """统一配置 ttk.Style，在 App.__init__ 调用一次即可。"""
    style.theme_use("clam")

    # 全局基础
    style.configure(".",
        font=FONT_BODY,
        background=BG_WINDOW,
        foreground=FG_LABEL,
        bordercolor=BORDER_COLOR,
        troughcolor=BG_WINDOW,
        selectbackground="#BFDBFE",
        selectforeground=FG_LABEL,
    )

    # Frame / LabelFrame
    style.configure("TFrame",     background=BG_CONTENT)
    style.configure("TLabelframe",
        background=BG_CONTENT,
        bordercolor=BORDER_COLOR,
        relief="solid", borderwidth=1,
    )
    style.configure("TLabelframe.Label",
        background=BG_CONTENT,
        foreground=FG_LABEL,
        font=FONT_BODY_BOLD,
        padding=[4, 0],
    )

    # Label
    style.configure("TLabel", background=BG_CONTENT, foreground=FG_LABEL)

    # Entry
    style.configure("TEntry",
        fieldbackground=BG_CONTENT,
        bordercolor=BORDER_COLOR,
        lightcolor=BORDER_COLOR,
        darkcolor=BORDER_COLOR,
        relief="solid",
    )
    style.map("TEntry",
        bordercolor=[("focus", "#93C5FD")],
        lightcolor=[("focus", "#93C5FD")],
    )

    # 小型 ttk.Button
    style.configure("TButton",
        background="#EDF2F7",
        foreground=FG_LABEL,
        bordercolor=BORDER_COLOR,
        lightcolor=BORDER_COLOR,
        darkcolor=BORDER_COLOR,
        relief="solid",
        borderwidth=1,
        padding=[8, 3],
    )
    style.map("TButton",
        background=[("active", BORDER_COLOR), ("pressed", "#CBD5E0")],
        relief=[("pressed", "solid")],
    )

    # Notebook
    style.configure("TNotebook",
        background=BG_WINDOW,
        bordercolor=BORDER_COLOR,
        tabmargins=[0, 0, 0, 0],
    )
    style.configure("TNotebook.Tab",
        background="#E2E8F0",
        foreground="#64748B",
        padding=[14, 6],
        font=FONT_BODY,
        bordercolor=BORDER_COLOR,
    )
    style.map("TNotebook.Tab",
        background=[("selected", BG_CONTENT)],
        foreground=[("selected", FG_LABEL)],
        expand=[("selected", [1, 1, 1, 0])],
    )

    # Scrollbar
    style.configure("TScrollbar",
        background=BORDER_COLOR,
        troughcolor=BG_WINDOW,
        borderwidth=0,
        arrowsize=12,
        relief="flat",
    )
    style.map("TScrollbar",
        background=[("active", "#CBD5E0")],
    )

    # Progressbar
    style.configure("TProgressbar",
        background=COLOR_PRIMARY,
        troughcolor=BORDER_COLOR,
        borderwidth=0,
    )

    # Combobox
    style.configure("TCombobox",
        fieldbackground=BG_CONTENT,
        bordercolor=BORDER_COLOR,
        selectbackground=BG_CONTENT,
        selectforeground=FG_LABEL,
        arrowcolor=FG_LABEL,
    )
    style.map("TCombobox",
        bordercolor=[("focus", "#93C5FD")],
        fieldbackground=[("readonly", BG_CONTENT)],
        selectbackground=[("readonly", BG_CONTENT)],
        selectforeground=[("readonly", FG_LABEL)],
    )

    # Separator
    style.configure("TSeparator", background=BORDER_COLOR)

    # Checkbutton（用于 SelectionDialog）
    style.configure("TCheckbutton",
        background=BG_CONTENT,
        foreground=FG_LABEL,
    )


def empty_label(parent, text: str) -> tk.Label:
    """创建标准空状态提示标签。"""
    return tk.Label(parent, text=text, fg=COLOR_FG_MUTED, font=FONT_BODY, bg=BG_CONTENT)
