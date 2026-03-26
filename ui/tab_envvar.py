import tkinter as tk
from tkinter import ttk, messagebox
import threading
from ui.widgets import ScrollableFrame
from core.env_vars import execute_env_rule, check_admin


class TabEnvVar(ttk.Frame):
    def __init__(self, parent, config, save_callback):
        super().__init__(parent)
        self.config = config
        self.save_callback = save_callback
        self.rule_widgets = []

        btn_bar = ttk.Frame(self)
        btn_bar.pack(fill="x", padx=5, pady=5)
        ttk.Button(btn_bar, text="+ 添加规则", command=self._add_rule).pack(side="left")
        ttk.Button(btn_bar, text="全部执行", command=self._execute_all).pack(side="right")

        if not check_admin():
            warn = ttk.Label(self, text="(!) 未以管理员身份运行，环境变量写入将失败",
                             foreground="red")
            warn.pack(fill="x", padx=5)

        self.scroll = ScrollableFrame(self)
        self.scroll.pack(fill="both", expand=True, padx=5)

        self.status_var = tk.StringVar(value="就绪")
        ttk.Label(self, textvariable=self.status_var, relief="sunken", anchor="w").pack(fill="x", padx=5, pady=(0, 5))

        for rule in self.config.get("env_rules", []):
            self._add_rule(rule.get("name", ""), rule.get("value", ""))

    def _add_rule(self, name="", value=""):
        idx = len(self.rule_widgets)
        frame = ttk.LabelFrame(self.scroll.inner, text=f"规则 {idx + 1}", padding=5)
        frame.pack(fill="x", padx=5, pady=2)

        row1 = ttk.Frame(frame)
        row1.pack(fill="x", pady=1)
        ttk.Label(row1, text="变量名:", width=10).pack(side="left")
        name_var = tk.StringVar(value=name)
        ttk.Entry(row1, textvariable=name_var).pack(side="left", fill="x", expand=True, padx=2)

        row2 = ttk.Frame(frame)
        row2.pack(fill="x", pady=1)
        ttk.Label(row2, text="变量值:", width=10).pack(side="left")
        value_var = tk.StringVar(value=value)
        ttk.Entry(row2, textvariable=value_var).pack(side="left", fill="x", expand=True, padx=2)

        row3 = ttk.Frame(frame)
        row3.pack(fill="x", pady=1)
        ttk.Button(row3, text="执行此规则",
                   command=lambda: self._execute_rule(name_var, value_var)).pack(side="left")
        ttk.Button(row3, text="删除", width=6,
                   command=lambda: self._remove_rule(frame, widget_data)).pack(side="right")

        widget_data = {"frame": frame, "name": name_var, "value": value_var}
        self.rule_widgets.append(widget_data)

        name_var.trace_add("write", lambda *_: self._save())
        value_var.trace_add("write", lambda *_: self._save())
        self._save()

    def _remove_rule(self, frame, widget_data):
        if not messagebox.askyesno("确认", "确定删除此规则？"):
            return
        frame.destroy()
        self.rule_widgets.remove(widget_data)
        for i, w in enumerate(self.rule_widgets):
            w["frame"].configure(text=f"规则 {i + 1}")
        self._save()

    def _execute_rule(self, name_var, value_var):
        name = name_var.get().strip()
        value = value_var.get().strip()
        if not name:
            messagebox.showerror("错误", "请填写变量名")
            return
        self._run_in_thread(execute_env_rule, name, value)

    def _execute_all(self):
        if not self.rule_widgets:
            messagebox.showinfo("提示", "没有规则")
            return
        if not messagebox.askokcancel("确认", f"执行全部 {len(self.rule_widgets)} 条规则？"):
            return

        def worker():
            results = []
            for i, w in enumerate(self.rule_widgets):
                try:
                    msg = execute_env_rule(w["name"].get(), w["value"].get())
                    results.append(f"规则{i+1}: {msg}")
                except Exception as e:
                    results.append(f"规则{i+1}: 失败 - {e}")
            summary = "\n".join(results)
            self.after(0, lambda: self.status_var.set("完成"))
            self.after(0, lambda: messagebox.showinfo("执行结果", summary))

        self.status_var.set("执行中...")
        threading.Thread(target=worker, daemon=True).start()

    def _run_in_thread(self, func, *args):
        self.status_var.set("执行中...")

        def worker():
            try:
                result = func(*args)
                self.after(0, lambda: self.status_var.set(result))
                self.after(0, lambda: messagebox.showinfo("成功", result))
            except Exception as e:
                self.after(0, lambda: self.status_var.set(f"失败: {e}"))
                self.after(0, lambda: messagebox.showerror("错误", str(e)))

        threading.Thread(target=worker, daemon=True).start()

    def _save(self):
        self.config["env_rules"] = [
            {"name": w["name"].get(), "value": w["value"].get()}
            for w in self.rule_widgets
        ]
        self.save_callback()
