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
