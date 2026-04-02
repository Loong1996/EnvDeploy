import tkinter as tk
from tkinter import ttk


class ScrollableFrame(ttk.Frame):
    def __init__(self, parent, *args, **kwargs):
        super().__init__(parent, *args, **kwargs)

        self.canvas = tk.Canvas(self, highlightthickness=0)
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
        self.canvas.yview_scroll(int(-1 * (event.delta / 120)), "units")


class ProgressDialog(tk.Toplevel):
    def __init__(self, parent, title="执行中..."):
        super().__init__(parent)
        self.title(title)
        self.geometry("480x120")
        self.resizable(False, False)
        self.transient(parent)
        self.grab_set()

        self.protocol("WM_DELETE_WINDOW", lambda: None)

        frame = ttk.Frame(self, padding=15)
        frame.pack(fill="both", expand=True)

        self.label_var = tk.StringVar(value="准备中...")
        ttk.Label(frame, textvariable=self.label_var, wraplength=440).pack(fill="x")

        self.progress = ttk.Progressbar(frame, orient="horizontal", length=440, mode="determinate")
        self.progress.pack(fill="x", pady=(8, 4))

        self.detail_var = tk.StringVar(value="")
        ttk.Label(frame, textvariable=self.detail_var, foreground="gray").pack(fill="x")

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
        self.result = None
        self.memory_result = None
        self._vars = []
        self._items = items
        self._memory = memory or {}

        # 标题 + 全选按钮
        top = tk.Frame(self)
        top.pack(fill="x", padx=10, pady=(10, 5))
        tk.Label(top, text="请选择要执行的规则：").pack(side="left")
        tk.Button(top, text="全不选", width=7, command=self._deselect_all).pack(side="right", padx=(4, 0))
        tk.Button(top, text="全选", width=6, command=self._select_all).pack(side="right")

        # Checkbutton 列表区域
        list_frame = tk.Frame(self, relief="sunken", bd=1)
        list_frame.pack(fill="both", expand=True, padx=10, pady=5)

        for i, text in enumerate(items):
            checked = self._memory.get(text, True)
            var = tk.BooleanVar(value=checked)
            cb = tk.Checkbutton(list_frame, text=f" {i+1}. {text}", variable=var,
                                anchor="w", padx=8, pady=3)
            cb.pack(fill="x")
            self._vars.append(var)

        # 确定/取消
        btn_row = tk.Frame(self)
        btn_row.pack(fill="x", padx=10, pady=(0, 10))
        tk.Button(btn_row, text="确定", width=8, command=self._ok).pack(side="right", padx=(4, 0))
        tk.Button(btn_row, text="取消", width=8, command=self._cancel).pack(side="right")

        row_h = 30
        list_h = min(len(items), 12) * row_h
        self.geometry(f"520x{list_h + 110}")
        self.minsize(400, 180)
        self.protocol("WM_DELETE_WINDOW", self._cancel)

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
