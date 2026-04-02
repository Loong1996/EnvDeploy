import json
import tkinter as tk
from tkinter import ttk, filedialog, messagebox
import threading
from ui.widgets import ScrollableFrame
from core.json_manip import execute_json_rule


class TabJson(ttk.Frame):
    def __init__(self, parent, config, save_callback):
        super().__init__(parent)
        self.config = config
        self.save_callback = save_callback
        self.rule_widgets = []

        btn_bar = ttk.Frame(self)
        btn_bar.pack(fill="x", padx=5, pady=5)
        ttk.Button(btn_bar, text="+ 添加规则", command=self._add_rule).pack(side="left")
        ttk.Button(btn_bar, text="全部执行", command=self._execute_all).pack(side="right")

        self.scroll = ScrollableFrame(self)
        self.scroll.pack(fill="both", expand=True, padx=5)

        self.status_var = tk.StringVar(value="就绪")
        ttk.Label(self, textvariable=self.status_var, relief="sunken", anchor="w").pack(fill="x", padx=5, pady=(0, 5))

        for rule in self.config.get("json_rules", []):
            data_str = rule.get("data", "")
            if not isinstance(data_str, str):
                data_str = json.dumps(data_str, indent=2, ensure_ascii=False)
            self._add_rule(
                rule.get("filepath", ""),
                rule.get("operation", "append"),
                data_str,
            )

    def _add_rule(self, filepath="", operation="append", data=""):
        idx = len(self.rule_widgets)
        frame = ttk.LabelFrame(self.scroll.inner, text=f"规则 {idx + 1}", padding=5)
        frame.pack(fill="x", padx=5, pady=2)

        row1 = ttk.Frame(frame)
        row1.pack(fill="x", pady=1)
        ttk.Label(row1, text="JSON文件:", width=10).pack(side="left")
        filepath_var = tk.StringVar(value=filepath)
        ttk.Entry(row1, textvariable=filepath_var).pack(side="left", fill="x", expand=True, padx=2)
        ttk.Button(row1, text="浏览", width=6,
                   command=lambda: self._browse_json(filepath_var)).pack(side="left")

        row2 = ttk.Frame(frame)
        row2.pack(fill="x", pady=1)
        ttk.Label(row2, text="操作类型:", width=10).pack(side="left")
        op_var = tk.StringVar(value=operation)
        op_combo = ttk.Combobox(row2, textvariable=op_var,
                                values=["append", "modify", "upsert", "overwrite"],
                                state="readonly", width=15)
        op_combo.pack(side="left")

        row3 = ttk.Frame(frame)
        row3.pack(fill="x", pady=1)
        ttk.Label(row3, text="数据(JSON):", width=10).pack(side="left", anchor="n")
        data_text = tk.Text(row3, height=4, width=50)
        data_text.pack(side="left", fill="x", expand=True, padx=2)
        if data:
            data_text.insert("1.0", data)

        row4 = ttk.Frame(frame)
        row4.pack(fill="x", pady=1)
        ttk.Button(row4, text="执行此规则",
                   command=lambda: self._execute_rule(filepath_var, op_var, data_text)).pack(side="left")
        ttk.Button(row4, text="删除", width=6,
                   command=lambda: self._remove_rule(frame, widget_data)).pack(side="right")

        widget_data = {"frame": frame, "filepath": filepath_var, "operation": op_var, "data_text": data_text}
        self.rule_widgets.append(widget_data)

        filepath_var.trace_add("write", lambda *_: self._save())
        op_var.trace_add("write", lambda *_: self._save())
        data_text.bind("<KeyRelease>", lambda e: self._save())
        self._save()

    def _remove_rule(self, frame, widget_data):
        if not messagebox.askyesno("确认", "确定删除此规则？"):
            return
        frame.destroy()
        self.rule_widgets.remove(widget_data)
        for i, w in enumerate(self.rule_widgets):
            w["frame"].configure(text=f"规则 {i + 1}")
        self._save()

    def _browse_json(self, var):
        path = filedialog.askopenfilename(filetypes=[("JSON文件", "*.json"), ("所有文件", "*.*")])
        if path:
            var.set(path)

    def _execute_rule(self, filepath_var, op_var, data_text):
        filepath = filepath_var.get().strip()
        operation = op_var.get()
        data_str = data_text.get("1.0", "end").strip()

        if not filepath:
            messagebox.showerror("错误", "请填写JSON文件路径")
            return
        if not data_str:
            messagebox.showerror("错误", "请填写JSON数据")
            return
        try:
            data = json.loads(data_str)
        except json.JSONDecodeError as e:
            messagebox.showerror("错误", f"JSON数据格式错误:\n{e}")
            return

        self._run_in_thread(execute_json_rule, filepath, operation, data)

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
                    data_str = w["data_text"].get("1.0", "end").strip()
                    data = json.loads(data_str)
                    msg = execute_json_rule(w["filepath"].get(), w["operation"].get(), data)
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
        rules = []
        for w in self.rule_widgets:
            data_str = w["data_text"].get("1.0", "end").strip()
            try:
                data = json.loads(data_str) if data_str else {}
            except json.JSONDecodeError:
                data = data_str
            rules.append({
                "filepath": w["filepath"].get(),
                "operation": w["operation"].get(),
                "data": data,
            })
        self.config["json_rules"] = rules
        self.save_callback()
