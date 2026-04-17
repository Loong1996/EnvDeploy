import tkinter as tk
from tkinter import ttk
from ui.theme import (
    FONT_MONO_SM, FONT_MONO_MD,
    COLOR_FG_SUCCESS, COLOR_FG_ERROR, COLOR_FG_MUTED, COLOR_FG_BODY,
    BTN_DIALOG_OK, BTN_DIALOG_CANCEL, BTN_DIALOG_DANGER,
    RELIEF_LIST, RELIEF_LIST_BD,
    BG_WINDOW, BG_CONTENT, BORDER_COLOR, FG_LABEL,
)


def guard_combobox(combo, var):
    """防止 ttk.Combobox 在点击别处不选择时显示变空白。

    Why: tkinter readonly Combobox 在某些场景下显示会变空白，
    通过 trace 拦截 textvariable 清空，并在多个事件点强制刷新显示。
    """
    last = [var.get()]
    pending = [False]

    def _on_change(*_):
        v = var.get()
        if v:
            last[0] = v
            pending[0] = False
        elif last[0] and not pending[0]:
            pending[0] = True
            def _restore():
                pending[0] = False
                if not var.get():
                    var.set(last[0])
            combo.after_idle(_restore)

    var.trace_add("write", _on_change)

    def _force_refresh(_event=None):
        def _do():
            val = var.get() or last[0]
            if not val:
                return
            state = combo.cget("state")
            combo.configure(state="normal")
            combo.delete(0, "end")
            combo.insert(0, val)
            combo.configure(state=state)
            try:
                combo.selection_clear()
            except Exception:
                pass
        combo.after_idle(_do)

    combo.bind("<FocusOut>", _force_refresh, add="+")


def center_window(win, parent=None):
    """将 Toplevel 窗口居中到 parent（或屏幕）。"""
    win.update_idletasks()
    w, h = win.winfo_width(), win.winfo_height()
    if parent:
        px = parent.winfo_rootx()
        py = parent.winfo_rooty()
        pw = parent.winfo_width()
        ph = parent.winfo_height()
        x = px + (pw - w) // 2
        y = py + (ph - h) // 2
    else:
        x = (win.winfo_screenwidth() - w) // 2
        y = (win.winfo_screenheight() - h) // 2
    win.geometry(f"+{x}+{y}")


class ScrollableFrame(ttk.Frame):
    def __init__(self, parent, *args, **kwargs):
        super().__init__(parent, *args, **kwargs)

        self.canvas = tk.Canvas(self, highlightthickness=0, bg=BG_CONTENT, bd=0)
        self.scrollbar = ttk.Scrollbar(self, orient="vertical", command=self.canvas.yview)
        self.inner = ttk.Frame(self.canvas)

        self.inner.bind("<Configure>", self._on_inner_configure)
        self.canvas.bind("<Configure>", self._on_canvas_configure)

        self.canvas_window = self.canvas.create_window((0, 0), window=self.inner, anchor="nw")

        self.canvas.configure(yscrollcommand=self.scrollbar.set)

        self.canvas.pack(side="left", fill="both", expand=True)
        self.scrollbar.pack(side="right", fill="y")

        self.canvas.bind("<Enter>", self._bind_mousewheel)
        self.canvas.bind("<Leave>", self._unbind_mousewheel)

    def _on_inner_configure(self, event):
        self.canvas.configure(scrollregion=self.canvas.bbox("all"))

    def _on_canvas_configure(self, event):
        self.canvas.itemconfig(self.canvas_window, width=event.width)

    def _bind_mousewheel(self, event):
        self.canvas.bind_all("<MouseWheel>", self._on_mousewheel)

    def _unbind_mousewheel(self, event):
        self.canvas.unbind_all("<MouseWheel>")

    def _on_mousewheel(self, event):
        first, last = self.canvas.yview()
        if first <= 0.0 and last >= 1.0:
            return
        self.canvas.yview_scroll(int(-1 * (event.delta / 120)), "units")


class ProgressDialog(tk.Toplevel):
    def __init__(self, parent, title="执行中..."):
        super().__init__(parent)
        self.title(title)
        self.geometry("480x120")
        self.resizable(False, False)
        self.transient(parent)
        self.grab_set()
        self.configure(bg=BG_WINDOW)

        self.protocol("WM_DELETE_WINDOW", lambda: None)

        frame = ttk.Frame(self, padding=15)
        frame.pack(fill="both", expand=True)

        self.label_var = tk.StringVar(value="准备中...")
        ttk.Label(frame, textvariable=self.label_var, wraplength=440).pack(fill="x")

        self.progress = ttk.Progressbar(frame, orient="horizontal", length=440, mode="determinate")
        self.progress.pack(fill="x", pady=(8, 4))

        self.detail_var = tk.StringVar(value="")
        ttk.Label(frame, textvariable=self.detail_var, foreground=COLOR_FG_MUTED).pack(fill="x")

        center_window(self, parent)
        self.focus_force()

    def update_progress(self, current, total, detail=""):
        pct = int(current / total * 100) if total > 0 else 0
        self.progress["maximum"] = total
        self.progress["value"] = current
        self.label_var.set(f"进度: {current}/{total} ({pct}%)")
        if detail:
            text = detail if len(detail) <= 60 else "..." + detail[-57:]
            self.detail_var.set(text)
        self.update_idletasks()

    def done(self):
        self.grab_release()
        self.destroy()


class SelectionDialog(tk.Toplevel):
    """显示可勾选的规则列表，返回用户选中的索引列表。"""

    def __init__(self, parent, title, items, memory=None):
        """
        items: list of str
        memory: dict — {item_text: bool}，记忆上次的勾选状态
        """
        super().__init__(parent)
        self.title(title)
        self.resizable(True, True)
        self.transient(parent)
        self.grab_set()
        self.configure(bg=BG_WINDOW)
        self.result = None
        self.memory_result = None
        self._vars = []
        self._items = items
        self._memory = memory or {}

        # 标题 + 全选按钮
        top = tk.Frame(self, bg=BG_WINDOW)
        top.pack(fill="x", padx=10, pady=(10, 5))
        tk.Label(top, text="请选择要执行的规则：", bg=BG_WINDOW, fg=FG_LABEL).pack(side="left")
        tk.Button(top, text="全不选", width=7, command=self._deselect_all,
                  bg=BG_WINDOW, fg=FG_LABEL, relief="flat", bd=1).pack(side="right", padx=(4, 0))
        tk.Button(top, text="全选", width=6, command=self._select_all,
                  bg=BG_WINDOW, fg=FG_LABEL, relief="flat", bd=1).pack(side="right")

        # Checkbutton 列表区域
        list_frame = tk.Frame(self, relief=RELIEF_LIST, bd=RELIEF_LIST_BD, bg=BG_CONTENT)
        list_frame.pack(fill="both", expand=True, padx=10, pady=5)

        for i, text in enumerate(items):
            checked = self._memory.get(text, True)
            var = tk.BooleanVar(value=checked)
            cb = tk.Checkbutton(list_frame, text=f" {i+1}. {text}", variable=var,
                                anchor="w", padx=8, pady=3,
                                bg=BG_CONTENT, fg=FG_LABEL,
                                activebackground=BG_CONTENT, selectcolor=BG_CONTENT)
            cb.pack(fill="x")
            self._vars.append(var)

        # 确定/取消
        btn_row = tk.Frame(self, bg=BG_WINDOW)
        btn_row.pack(fill="x", padx=10, pady=(0, 10))
        tk.Button(btn_row, text="确定", width=8, command=self._ok,
                  **BTN_DIALOG_OK).pack(side="right", padx=(4, 0))
        tk.Button(btn_row, text="取消", width=8, command=self._cancel,
                  **BTN_DIALOG_CANCEL).pack(side="right")

        row_h = 30
        list_h = min(len(items), 12) * row_h
        self.geometry(f"520x{list_h + 110}")
        self.minsize(400, 180)
        self.protocol("WM_DELETE_WINDOW", self._cancel)
        self.bind("<Escape>", lambda e: self._cancel())
        center_window(self, parent)
        self.focus_force()

    def _select_all(self):
        for v in self._vars:
            v.set(True)

    def _deselect_all(self):
        for v in self._vars:
            v.set(False)

    def _ok(self):
        self.result = [i for i, v in enumerate(self._vars) if v.get()]
        self.memory_result = {text: self._vars[i].get() for i, text in enumerate(self._items)}
        self.grab_release()
        self.destroy()

    def _cancel(self):
        self.result = None
        self.grab_release()
        self.destroy()

    def show(self):
        self.wait_window()
        return self.result


class LogPanel(ttk.Frame):
    """可收起的操作日志面板，放在窗口底部。默认收起。"""

    def __init__(self, parent):
        super().__init__(parent)
        from datetime import datetime
        self._datetime = datetime

        header = ttk.Frame(self)
        header.pack(fill="x")
        ttk.Label(header, text="操作日志").pack(side="left", padx=4)
        ttk.Button(header, text="清空", width=6, command=self.clear).pack(side="right")

        self._body = ttk.Frame(self)
        self._text = tk.Text(self._body, height=7, state="disabled",
                             font=FONT_MONO_SM, wrap="word",
                             bg=BG_CONTENT, fg=FG_LABEL, relief="flat",
                             insertbackground=FG_LABEL)
        sb = ttk.Scrollbar(self._body, orient="vertical", command=self._text.yview)
        self._text.configure(yscrollcommand=sb.set)
        self._text.pack(side="left", fill="both", expand=True)
        sb.pack(side="right", fill="y")
        self._text.tag_configure("ok",  foreground=COLOR_FG_SUCCESS)
        self._text.tag_configure("err", foreground=COLOR_FG_ERROR)
        self._text.tag_configure("ts",  foreground=COLOR_FG_MUTED)

        self._visible = False

    def set_visible(self, visible: bool):
        if visible == self._visible:
            return
        if visible:
            self._body.pack(fill="both", expand=True)
        else:
            self._body.pack_forget()
        self._visible = visible

    def log(self, message, tag=""):
        ts = self._datetime.now().strftime("%H:%M:%S")
        self._text.configure(state="normal")
        self._text.insert("end", f"[{ts}] ", "ts")
        self._text.insert("end", message + "\n", tag)
        self._text.see("end")
        self._text.configure(state="disabled")

    def clear(self):
        self._text.configure(state="normal")
        self._text.delete("1.0", "end")
        self._text.configure(state="disabled")


class ResultDialog(tk.Toplevel):
    """显示批量操作结果，成功行绿色，失败行红色。"""

    def __init__(self, parent, title, lines):
        """lines: list of str，以 ✓ 开头为成功，以 ✗ 开头为失败"""
        super().__init__(parent)
        self.title(title)
        self.resizable(True, True)
        self.transient(parent)
        self.grab_set()
        self.configure(bg=BG_WINDOW)

        frame = ttk.Frame(self, padding=10)
        frame.pack(fill="both", expand=True)

        text = tk.Text(frame, wrap="word", state="normal",
                       font=FONT_MONO_MD, relief="flat",
                       bg=BG_CONTENT, fg=FG_LABEL)
        text.tag_configure("ok",     foreground=COLOR_FG_SUCCESS)
        text.tag_configure("err",    foreground=COLOR_FG_ERROR)
        text.tag_configure("normal", foreground=COLOR_FG_BODY)

        for line in lines:
            if line.startswith("✓"):
                text.insert("end", line + "\n", "ok")
            elif line.startswith("✗"):
                text.insert("end", line + "\n", "err")
            else:
                text.insert("end", line + "\n", "normal")

        text.configure(state="disabled")
        text.pack(fill="both", expand=True)

        btn_row = tk.Frame(self, bg=BG_WINDOW)
        btn_row.pack(fill="x", padx=10, pady=(0, 10))
        tk.Button(btn_row, text="关闭", width=8, command=self._close,
                  **BTN_DIALOG_OK).pack(side="right")

        h = min(len(lines), 15) * 22 + 80
        self.geometry(f"500x{h}")
        self.minsize(400, 150)
        self.protocol("WM_DELETE_WINDOW", self._close)
        self.bind("<Escape>", lambda e: self._close())
        center_window(self, parent)
        self.focus_force()

    def _close(self):
        self.grab_release()
        self.destroy()

    def show(self):
        self.wait_window()


class _RestoreDialog(tk.Toplevel):
    """选择一个备份文件进行恢复。"""

    def __init__(self, parent, backups, on_confirm):
        """
        backups: list of (label, path)
        on_confirm: callable(path)
        """
        super().__init__(parent)
        self.title("恢复配置")
        self.resizable(False, False)
        self.transient(parent)
        self.grab_set()
        self.configure(bg=BG_WINDOW)
        self._backups = backups
        self._on_confirm = on_confirm

        ttk.Label(self, text="选择要恢复的备份（最新在前）：",
                  padding=(10, 8, 10, 4)).pack(anchor="w")

        frame = tk.Frame(self, relief=RELIEF_LIST, bd=RELIEF_LIST_BD, bg=BG_CONTENT)
        frame.pack(fill="both", expand=True, padx=10, pady=4)

        sb = ttk.Scrollbar(frame, orient="vertical")
        self._listbox = tk.Listbox(frame, yscrollcommand=sb.set,
                                   font=FONT_MONO_MD, selectmode="browse",
                                   activestyle="dotbox", height=min(len(backups), 12),
                                   bg=BG_CONTENT, fg=FG_LABEL,
                                   selectbackground="#BFDBFE", selectforeground=FG_LABEL,
                                   borderwidth=0, highlightthickness=0)
        sb.configure(command=self._listbox.yview)
        self._listbox.pack(side="left", fill="both", expand=True)
        sb.pack(side="right", fill="y")

        for label, _ in backups:
            self._listbox.insert("end", f"  {label}")
        self._listbox.selection_set(0)

        btn_row = tk.Frame(self, bg=BG_WINDOW)
        btn_row.pack(fill="x", padx=10, pady=(4, 10))
        tk.Button(btn_row, text="恢复", width=8, command=self._ok,
                  **BTN_DIALOG_DANGER).pack(side="right", padx=(4, 0))
        tk.Button(btn_row, text="取消", width=8, command=self.destroy,
                  **BTN_DIALOG_CANCEL).pack(side="right")

        self.geometry(f"360x{min(len(backups), 12) * 22 + 100}")
        self.protocol("WM_DELETE_WINDOW", self.destroy)
        self.bind("<Escape>", lambda e: self.destroy())
        center_window(self, parent)
        self.focus_force()

    def _ok(self):
        sel = self._listbox.curselection()
        if not sel:
            return
        _, path = self._backups[sel[0]]
        self.grab_release()
        self.destroy()
        self._on_confirm(path)
