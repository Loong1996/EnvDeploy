import tkinter as tk
from tkinter import ttk, messagebox
import threading
from ui.widgets import ScrollableFrame
from ui.theme import COLOR_FG_INVALID, COLOR_FG_ERROR, PAD_OUTER, PAD_CARD, RELIEF_STATUS, empty_label
from core.env_vars import execute_env_rule, check_admin


class TabEnvVar(ttk.Frame):
    def __init__(self, parent, config, save_callback):
        super().__init__(parent)
        self.config = config
        self.save_callback = save_callback
        self.rule_widgets = []

        btn_bar = ttk.Frame(self)
        btn_bar.pack(fill="x", padx=PAD_OUTER, pady=PAD_OUTER)
        ttk.Button(btn_bar, text="+ 添加规则", command=self._add_rule).pack(side="left")
        ttk.Button(btn_bar, text="全部执行", command=self._execute_all).pack(side="right")

        if not check_admin():
            warn = ttk.Label(self, text="(!) 未以管理员身份运行，环境变量写入将失败",
                             foreground=COLOR_FG_ERROR)
            warn.pack(fill="x", padx=PAD_OUTER)

        self.scroll = ScrollableFrame(self)
        self.scroll.pack(fill="both", expand=True, padx=PAD_OUTER)

        self._empty_label = empty_label(self.scroll.inner, "暂无环境变量规则，点击上方「+ 添加规则」添加")
        self._empty_label.pack(pady=30)

        self.status_var = tk.StringVar(value="就绪")
        ttk.Label(self, textvariable=self.status_var, relief=RELIEF_STATUS, anchor="w").pack(fill="x", padx=PAD_OUTER, pady=(0, PAD_OUTER))

        self._loading = True
        for rule in self.config.get("env_rules", []):
            self._add_rule(rule.get("name", ""), rule.get("value", ""), rule.get("operation", "set"))
        self._loading = False

    OPERATIONS = [("set", "设置变量"), ("append_path", "追加到PATH")]

    def _add_rule(self, name="", value="", operation="set"):
        self._empty_label.pack_forget()
        idx = len(self.rule_widgets)
        frame = ttk.LabelFrame(self.scroll.inner, text=f"规则 {idx + 1}", padding=8)
        frame.pack(fill="x", padx=PAD_OUTER, pady=PAD_CARD)

        row1 = ttk.Frame(frame)
        row1.pack(fill="x", pady=3)
        ttk.Label(row1, text="操作:", width=10).pack(side="left")
        op_var = tk.StringVar(value=operation)
        op_combo = ttk.Combobox(row1, textvariable=op_var, state="readonly", width=15,
                                values=[k for k, _ in self.OPERATIONS])
        op_combo.pack(side="left", padx=2)
        op_label_var = tk.StringVar()
        op_label = ttk.Label(row1, textvariable=op_label_var, foreground="gray")
        op_label.pack(side="left", padx=4)

        def _update_op_label(*_):
            op_map = dict(self.OPERATIONS)
            op_label_var.set(op_map.get(op_var.get(), ""))
        _update_op_label()
        op_var.trace_add("write", _update_op_label)

        row2 = ttk.Frame(frame)
        row2.pack(fill="x", pady=3)
        ttk.Label(row2, text="变量名:", width=10).pack(side="left")
        name_var = tk.StringVar(value=name)
        ttk.Entry(row2, textvariable=name_var).pack(side="left", fill="x", expand=True, padx=2)

        row3 = ttk.Frame(frame)
        row3.pack(fill="x", pady=3)
        ttk.Label(row3, text="变量值:", width=10).pack(side="left")
        value_var = tk.StringVar(value=value)
        ttk.Entry(row3, textvariable=value_var).pack(side="left", fill="x", expand=True, padx=2)

        row4 = ttk.Frame(frame)
        row4.pack(fill="x", pady=3)
        ttk.Button(row4, text="执行此规则",
                   command=lambda: self._execute_rule(name_var, value_var, op_var)).pack(side="left")
        ttk.Button(row4, text="删除", width=6,
                   command=lambda: self._remove_rule(frame, widget_data)).pack(side="right")
        ttk.Button(row4, text="↓", width=3,
                   command=lambda: self._move_rule(widget_data, 1)).pack(side="right", padx=2)
        ttk.Button(row4, text="↑", width=3,
                   command=lambda: self._move_rule(widget_data, -1)).pack(side="right", padx=2)

        widget_data = {"frame": frame, "name": name_var, "value": value_var, "operation": op_var}
        self.rule_widgets.append(widget_data)

        name_var.trace_add("write", lambda *_: self._save())
        value_var.trace_add("write", lambda *_: self._save())
        op_var.trace_add("write", lambda *_: self._save())
        self._save()

    def _remove_rule(self, frame, widget_data):
        if not messagebox.askyesno("确认", "确定删除此规则？"):
            return
        frame.destroy()
        self.rule_widgets.remove(widget_data)
        for i, w in enumerate(self.rule_widgets):
            w["frame"].configure(text=f"规则 {i + 1}")
        if not self.rule_widgets:
            self._empty_label.pack(pady=30)
        self._save()

    def _move_rule(self, widget_data, direction):
        idx = self.rule_widgets.index(widget_data)
        new_idx = idx + direction
        if new_idx < 0 or new_idx >= len(self.rule_widgets):
            return
        self.rule_widgets[idx], self.rule_widgets[new_idx] = \
            self.rule_widgets[new_idx], self.rule_widgets[idx]
        self._rebuild_order()
        self._save()

    def _rebuild_order(self):
        for w in self.rule_widgets:
            w["frame"].pack_forget()
        for i, w in enumerate(self.rule_widgets):
            w["frame"].pack(fill="x", padx=5, pady=4)
            w["frame"].configure(text=f"规则 {i + 1}")

    def _execute_rule(self, name_var, value_var, op_var):
        name = name_var.get().strip()
        value = value_var.get().strip()
        operation = op_var.get()
        if not name:
            messagebox.showerror("错误", "请填写变量名")
            return
        self._run_in_thread(execute_env_rule, name, value, operation)

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
                    msg = execute_env_rule(w["name"].get(), w["value"].get(), w["operation"].get())
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
        if getattr(self, '_loading', False):
            return
        self.config["env_rules"] = [
            {"name": w["name"].get(), "value": w["value"].get(), "operation": w["operation"].get()}
            for w in self.rule_widgets
        ]
        self.save_callback()
