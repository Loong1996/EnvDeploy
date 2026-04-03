import time
import tkinter as tk
from datetime import datetime
from tkinter import ttk

from ui.theme import (
    BG_CONTENT, BTN_ACTION, BTN_DIALOG_OK,
    COLOR_FG_ERROR, COLOR_FG_MUTED, FG_LABEL,
    FONT_BODY, FONT_BODY_BOLD, FONT_MONO_MD,
    PAD_CARD, PAD_INNER, PAD_OUTER, PAD_ROW,
)

_DT_FORMATS = [
    "%Y-%m-%d %H:%M:%S",
    "%Y/%m/%d %H:%M:%S",
    "%Y-%m-%d %H:%M",
    "%Y/%m/%d %H:%M",
    "%Y-%m-%d",
    "%Y/%m/%d",
]


def _ts_to_dt(ts_str: str):
    """时间戳字符串 → (datetime, is_ms)，自动识别秒/毫秒。"""
    val = float(ts_str.strip())
    is_ms = val > 1e10
    secs = val / 1000 if is_ms else val
    return datetime.fromtimestamp(secs), is_ms


def _dt_to_ts(dt_str: str):
    """日期时间字符串 → (秒时间戳, 毫秒时间戳)。"""
    dt_str = dt_str.strip()
    for fmt in _DT_FORMATS:
        try:
            dt = datetime.strptime(dt_str, fmt)
            secs = int(dt.timestamp())
            return secs, secs * 1000
        except ValueError:
            continue
    raise ValueError(f"无法识别的日期格式: {dt_str}")


class TabTimestamp(ttk.Frame):
    def __init__(self, parent):
        super().__init__(parent)
        self._build_ui()

    def _build_ui(self):
        # 顶部：当前时间
        top_bar = ttk.Frame(self)
        top_bar.pack(fill="x", padx=PAD_INNER, pady=(PAD_INNER, PAD_CARD))

        tk.Button(top_bar, text="  获取当前时间  ", **BTN_ACTION,
                  command=self._fill_now).pack(side="left")
        self._now_label = ttk.Label(top_bar, text="", foreground=COLOR_FG_MUTED)
        self._now_label.pack(side="left", padx=(PAD_INNER, 0))

        ttk.Separator(self, orient="horizontal").pack(fill="x", padx=PAD_OUTER)

        body = ttk.Frame(self)
        body.pack(fill="both", expand=True, padx=PAD_INNER, pady=PAD_INNER)

        # ── 时间戳 → 日期时间 ──────────────────────────────────
        f1 = ttk.LabelFrame(body, text="时间戳  →  日期时间", padding=PAD_INNER)
        f1.pack(fill="x", pady=(0, PAD_CARD))

        row1 = ttk.Frame(f1)
        row1.pack(fill="x", pady=(0, PAD_ROW))
        ttk.Label(row1, text="时间戳:", width=10).pack(side="left")
        self._ts_input = ttk.Entry(row1, font=FONT_MONO_MD)
        self._ts_input.pack(side="left", fill="x", expand=True, padx=PAD_ROW)
        tk.Button(row1, text="转换", width=6, **BTN_DIALOG_OK,
                  command=self._convert_ts).pack(side="left", padx=(0, PAD_ROW))
        tk.Button(row1, text="复制", width=6, **BTN_DIALOG_OK,
                  command=lambda: self._copy(self._ts_result_var.get())).pack(side="left")

        row2 = ttk.Frame(f1)
        row2.pack(fill="x")
        ttk.Label(row2, text="结果:", width=10).pack(side="left")
        self._ts_result_var = tk.StringVar()
        ttk.Label(row2, textvariable=self._ts_result_var,
                  font=FONT_MONO_MD, foreground=FG_LABEL).pack(side="left")

        # ── 日期时间 → 时间戳 ──────────────────────────────────
        f2 = ttk.LabelFrame(body, text="日期时间  →  时间戳", padding=PAD_INNER)
        f2.pack(fill="x", pady=(0, PAD_CARD))

        row3 = ttk.Frame(f2)
        row3.pack(fill="x", pady=(0, PAD_ROW))
        ttk.Label(row3, text="日期时间:", width=10).pack(side="left")
        self._dt_input = ttk.Entry(row3, font=FONT_MONO_MD)
        self._dt_input.pack(side="left", fill="x", expand=True, padx=PAD_ROW)
        ttk.Label(row3, text="格式：2026-04-03 15:30:00",
                  foreground=COLOR_FG_MUTED, font=FONT_BODY).pack(side="left", padx=(PAD_ROW, 0))

        row4 = ttk.Frame(f2)
        row4.pack(fill="x", pady=(0, PAD_ROW))
        ttk.Label(row4, text="", width=10).pack(side="left")
        tk.Button(row4, text="转换", width=6, **BTN_DIALOG_OK,
                  command=self._convert_dt).pack(side="left", padx=(0, PAD_ROW))
        tk.Button(row4, text="复制秒", width=7, **BTN_DIALOG_OK,
                  command=lambda: self._copy(self._dt_sec_var.get())).pack(side="left", padx=(0, PAD_ROW))
        tk.Button(row4, text="复制毫秒", width=8, **BTN_DIALOG_OK,
                  command=lambda: self._copy(self._dt_ms_var.get())).pack(side="left")

        row5 = ttk.Frame(f2)
        row5.pack(fill="x", pady=(0, PAD_ROW))
        ttk.Label(row5, text="秒:", width=10).pack(side="left")
        self._dt_sec_var = tk.StringVar()
        ttk.Label(row5, textvariable=self._dt_sec_var,
                  font=FONT_MONO_MD, foreground=FG_LABEL).pack(side="left")

        row6 = ttk.Frame(f2)
        row6.pack(fill="x")
        ttk.Label(row6, text="毫秒:", width=10).pack(side="left")
        self._dt_ms_var = tk.StringVar()
        ttk.Label(row6, textvariable=self._dt_ms_var,
                  font=FONT_MONO_MD, foreground=FG_LABEL).pack(side="left")

        # 错误提示
        self._err_var = tk.StringVar()
        ttk.Label(body, textvariable=self._err_var,
                  foreground=COLOR_FG_ERROR, font=FONT_BODY).pack(anchor="w", pady=(PAD_ROW, 0))

        # 绑定 Enter 键
        self._ts_input.bind("<Return>", lambda _: self._convert_ts())
        self._dt_input.bind("<Return>", lambda _: self._convert_dt())

    # ── 转换逻辑 ────────────────────────────────────────────────

    def _convert_ts(self):
        self._err_var.set("")
        raw = self._ts_input.get().strip()
        if not raw:
            return
        try:
            dt, is_ms = _ts_to_dt(raw)
            label = "（毫秒输入）" if is_ms else "（秒输入）"
            self._ts_result_var.set(dt.strftime("%Y-%m-%d  %H:%M:%S") + f"  {label}")
        except Exception as e:
            self._err_var.set(f"错误：{e}")
            self._ts_result_var.set("")

    def _convert_dt(self):
        self._err_var.set("")
        raw = self._dt_input.get().strip()
        if not raw:
            return
        try:
            secs, ms = _dt_to_ts(raw)
            self._dt_sec_var.set(str(secs))
            self._dt_ms_var.set(str(ms))
        except Exception as e:
            self._err_var.set(f"错误：{e}")
            self._dt_sec_var.set("")
            self._dt_ms_var.set("")

    def _fill_now(self):
        self._err_var.set("")
        now = datetime.now()
        ts_sec = int(now.timestamp())
        ts_ms  = ts_sec * 1000

        self._ts_input.delete(0, "end")
        self._ts_input.insert(0, str(ts_sec))
        self._convert_ts()

        self._dt_input.delete(0, "end")
        self._dt_input.insert(0, now.strftime("%Y-%m-%d %H:%M:%S"))
        self._dt_sec_var.set(str(ts_sec))
        self._dt_ms_var.set(str(ts_ms))

        self._now_label.configure(
            text=f"当前：{now.strftime('%Y-%m-%d %H:%M:%S')}  |  {ts_sec} 秒  /  {ts_ms} 毫秒"
        )

    def _copy(self, text: str):
        if not text:
            return
        self.clipboard_clear()
        self.clipboard_append(text)
