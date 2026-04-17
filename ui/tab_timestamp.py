import ctypes
import platform
import tkinter as tk
from datetime import datetime
from tkinter import ttk, messagebox

from ui.theme import (
    BG_CONTENT, BTN_ACTION, BTN_DIALOG_OK, BTN_DIALOG_DANGER,
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


def _parse_yymmddhhmm(s: str) -> datetime:
    """YYMMDDhhmm（10 位数字）→ datetime，年按 20YY 解析。"""
    s = s.strip()
    if len(s) != 10 or not s.isdigit():
        raise ValueError(f"需要 10 位数字 YYMMDDhhmm，收到: {s!r}")
    return datetime.strptime(s, "%y%m%d%H%M")


def _set_system_time(dt: datetime):
    """设置本地系统时间（仅 Windows，需管理员权限）。"""
    if platform.system() != "Windows":
        raise OSError("设置系统时间仅支持 Windows")

    class SYSTEMTIME(ctypes.Structure):
        _fields_ = [
            ("wYear",         ctypes.c_uint16),
            ("wMonth",        ctypes.c_uint16),
            ("wDayOfWeek",    ctypes.c_uint16),
            ("wDay",          ctypes.c_uint16),
            ("wHour",         ctypes.c_uint16),
            ("wMinute",       ctypes.c_uint16),
            ("wSecond",       ctypes.c_uint16),
            ("wMilliseconds", ctypes.c_uint16),
        ]

    st = SYSTEMTIME(dt.year, dt.month, 0, dt.day,
                    dt.hour, dt.minute, dt.second, 0)
    ok = ctypes.windll.kernel32.SetLocalTime(ctypes.byref(st))
    if not ok:
        raise PermissionError("设置失败，请以管理员身份运行程序")


def _make_result_entry(parent, var, font=FONT_MONO_MD):
    """创建可选中文本的只读 Entry。"""
    e = ttk.Entry(parent, textvariable=var, font=font,
                  state="readonly", cursor="xterm")
    return e


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
        _make_result_entry(row2, self._ts_result_var).pack(
            side="left", fill="x", expand=True)

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
        _make_result_entry(row5, self._dt_sec_var).pack(
            side="left", fill="x", expand=True)

        row6 = ttk.Frame(f2)
        row6.pack(fill="x")
        ttk.Label(row6, text="毫秒:", width=10).pack(side="left")
        self._dt_ms_var = tk.StringVar()
        _make_result_entry(row6, self._dt_ms_var).pack(
            side="left", fill="x", expand=True)

        # ── 设置系统时间 ────────────────────────────────────────
        f3 = ttk.LabelFrame(body, text="设置系统时间", padding=PAD_INNER)
        f3.pack(fill="x", pady=(0, PAD_CARD))

        row7 = ttk.Frame(f3)
        row7.pack(fill="x", pady=(0, PAD_ROW))
        ttk.Label(row7, text="目标时间:", width=10).pack(side="left")
        self._set_dt_input = ttk.Entry(row7, font=FONT_MONO_MD)
        self._set_dt_input.pack(side="left", fill="x", expand=True, padx=PAD_ROW)
        ttk.Label(row7, text="格式：2026-04-03 15:30:00",
                  foreground=COLOR_FG_MUTED, font=FONT_BODY).pack(side="left", padx=(PAD_ROW, 0))

        row8 = ttk.Frame(f3)
        row8.pack(fill="x")
        ttk.Label(row8, text="", width=10).pack(side="left")
        tk.Button(row8, text="填入当前时间", width=12, **BTN_DIALOG_OK,
                  command=self._fill_set_now).pack(side="left", padx=(0, PAD_ROW))
        tk.Button(row8, text="设置系统时间", width=12, **BTN_DIALOG_DANGER,
                  command=self._apply_system_time).pack(side="left")
        self._set_status_var = tk.StringVar()
        ttk.Label(row8, textvariable=self._set_status_var,
                  font=FONT_BODY, foreground=COLOR_FG_MUTED).pack(side="left", padx=(PAD_ROW, 0))

        # ── YYMMDDhhmm 时间差 ──────────────────────────────────
        f4 = ttk.LabelFrame(body, text="时间差（YYMMDDhhmm，单位：分钟）", padding=PAD_INNER)
        f4.pack(fill="x", pady=(0, PAD_CARD))

        row9 = ttk.Frame(f4)
        row9.pack(fill="x", pady=(0, PAD_ROW))
        ttk.Label(row9, text="时间 A:", width=10).pack(side="left")
        self._diff_a_input = ttk.Entry(row9, font=FONT_MONO_MD)
        self._diff_a_input.pack(side="left", fill="x", expand=True, padx=PAD_ROW)
        ttk.Label(row9, text="格式：2504171530",
                  foreground=COLOR_FG_MUTED, font=FONT_BODY).pack(side="left", padx=(PAD_ROW, 0))

        row10 = ttk.Frame(f4)
        row10.pack(fill="x", pady=(0, PAD_ROW))
        ttk.Label(row10, text="时间 B:", width=10).pack(side="left")
        self._diff_b_input = ttk.Entry(row10, font=FONT_MONO_MD)
        self._diff_b_input.pack(side="left", fill="x", expand=True, padx=PAD_ROW)
        ttk.Label(row10, text="结果 = B - A",
                  foreground=COLOR_FG_MUTED, font=FONT_BODY).pack(side="left", padx=(PAD_ROW, 0))

        row11 = ttk.Frame(f4)
        row11.pack(fill="x", pady=(0, PAD_ROW))
        ttk.Label(row11, text="", width=10).pack(side="left")
        tk.Button(row11, text="计算", width=6, **BTN_DIALOG_OK,
                  command=self._calc_diff).pack(side="left", padx=(0, PAD_ROW))
        tk.Button(row11, text="复制", width=6, **BTN_DIALOG_OK,
                  command=lambda: self._copy(self._diff_result_var.get())).pack(side="left")

        row12 = ttk.Frame(f4)
        row12.pack(fill="x")
        ttk.Label(row12, text="结果:", width=10).pack(side="left")
        self._diff_result_var = tk.StringVar()
        _make_result_entry(row12, self._diff_result_var).pack(
            side="left", fill="x", expand=True)

        # 错误提示
        self._err_var = tk.StringVar()
        ttk.Label(body, textvariable=self._err_var,
                  foreground=COLOR_FG_ERROR, font=FONT_BODY).pack(anchor="w", pady=(PAD_ROW, 0))

        # 绑定 Enter 键
        self._ts_input.bind("<Return>", lambda _: self._convert_ts())
        self._dt_input.bind("<Return>", lambda _: self._convert_dt())
        self._set_dt_input.bind("<Return>", lambda _: self._apply_system_time())
        self._diff_a_input.bind("<Return>", lambda _: self._calc_diff())
        self._diff_b_input.bind("<Return>", lambda _: self._calc_diff())

    # ── 转换逻辑 ────────────────────────────────────────────────

    def _convert_ts(self):
        self._err_var.set("")
        raw = self._ts_input.get().strip()
        if not raw:
            return
        try:
            dt, is_ms = _ts_to_dt(raw)
            label = "（毫秒输入）" if is_ms else "（秒输入）"
            self._ts_result_var.set(dt.strftime("%Y-%m-%d %H:%M:%S"))
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

    def _fill_set_now(self):
        now = datetime.now()
        self._set_dt_input.delete(0, "end")
        self._set_dt_input.insert(0, now.strftime("%Y-%m-%d %H:%M:%S"))
        self._set_status_var.set("")

    def _apply_system_time(self):
        self._err_var.set("")
        self._set_status_var.set("")
        raw = self._set_dt_input.get().strip()
        if not raw:
            return
        try:
            dt_str = raw
            dt = None
            for fmt in _DT_FORMATS:
                try:
                    dt = datetime.strptime(dt_str, fmt)
                    break
                except ValueError:
                    continue
            if dt is None:
                raise ValueError(f"无法识别的日期格式: {raw}")

            if not messagebox.askokcancel(
                "确认", f"确定将系统时间设置为：\n{dt.strftime('%Y-%m-%d %H:%M:%S')}？",
                parent=self.winfo_toplevel()
            ):
                return

            _set_system_time(dt)
            self._set_status_var.set(f"已设置为 {dt.strftime('%Y-%m-%d %H:%M:%S')}")
        except Exception as e:
            self._err_var.set(f"错误：{e}")

    def _calc_diff(self):
        self._err_var.set("")
        a_raw = self._diff_a_input.get().strip()
        b_raw = self._diff_b_input.get().strip()
        if not a_raw or not b_raw:
            return
        try:
            dt_a = _parse_yymmddhhmm(a_raw)
            dt_b = _parse_yymmddhhmm(b_raw)
            minutes = int((dt_b - dt_a).total_seconds() // 60)
            sign = "+" if minutes >= 0 else "-"
            mins_abs = abs(minutes)
            hours, mins = divmod(mins_abs, 60)
            days, hours = divmod(hours, 24)
            parts = []
            if days:
                parts.append(f"{days}天")
            if hours:
                parts.append(f"{hours}小时")
            parts.append(f"{mins}分钟")
            self._diff_result_var.set(f"{sign}{mins_abs} 分钟  ({sign}{''.join(parts)})")
        except Exception as e:
            self._err_var.set(f"错误：{e}")
            self._diff_result_var.set("")

    def _copy(self, text: str):
        if not text:
            return
        self.clipboard_clear()
        self.clipboard_append(text)
