import tkinter as tk
from tkinter import ttk, filedialog, messagebox
import threading
from ui.widgets import ScrollableFrame
from core.folder_pack import export_folder, import_folder


class TabFolder(ttk.Frame):
    def __init__(self, parent, config, save_callback):
        super().__init__(parent)
        self.config = config
        self.save_callback = save_callback
        self.export_widgets = []
        self.import_widgets = []

        # 上半部分：打包
        export_frame = ttk.LabelFrame(self, text="打包", padding=5)
        export_frame.pack(fill="both", expand=True, padx=5, pady=(5, 2))

        export_btn_bar = ttk.Frame(export_frame)
        export_btn_bar.pack(fill="x")
        ttk.Button(export_btn_bar, text="+ 添加打包规则", command=self._add_export_rule).pack(side="left")
        ttk.Button(export_btn_bar, text="全部打包", command=self._execute_all_exports).pack(side="right")

        self.export_scroll = ScrollableFrame(export_frame)
        self.export_scroll.pack(fill="both", expand=True, pady=5)

        # 下半部分：导入
        import_frame = ttk.LabelFrame(self, text="导入（解压覆盖）", padding=5)
        import_frame.pack(fill="both", expand=True, padx=5, pady=(2, 5))

        import_btn_bar = ttk.Frame(import_frame)
        import_btn_bar.pack(fill="x")
        ttk.Button(import_btn_bar, text="+ 添加导入规则", command=self._add_import_rule).pack(side="left")
        ttk.Button(import_btn_bar, text="全部导入", command=self._execute_all_imports).pack(side="right")

        self.import_scroll = ScrollableFrame(import_frame)
        self.import_scroll.pack(fill="both", expand=True, pady=5)

        # 状态栏
        self.status_var = tk.StringVar(value="就绪")
        ttk.Label(self, textvariable=self.status_var, relief="sunken", anchor="w").pack(fill="x", padx=5, pady=(0, 5))

        # 加载已有配置
        for rule in self.config.get("export_rules", []):
            self._add_export_rule(rule.get("source", ""), rule.get("output", ""))
        for rule in self.config.get("import_rules", []):
            self._add_import_rule(rule.get("zip_path", ""), rule.get("target", ""))

    def _add_export_rule(self, source="", output=""):
        idx = len(self.export_widgets)
        frame = ttk.LabelFrame(self.export_scroll.inner, text=f"打包规则 {idx + 1}", padding=5)
        frame.pack(fill="x", padx=5, pady=2)

        row1 = ttk.Frame(frame)
        row1.pack(fill="x", pady=1)
        ttk.Label(row1, text="源路径:", width=10).pack(side="left")
        source_var = tk.StringVar(value=source)
        ttk.Entry(row1, textvariable=source_var).pack(side="left", fill="x", expand=True, padx=2)
        ttk.Button(row1, text="选文件夹", width=8,
                   command=lambda: self._browse_dir(source_var)).pack(side="left", padx=(0, 2))
        ttk.Button(row1, text="选文件", width=7,
                   command=lambda: self._browse_file(source_var)).pack(side="left")

        row2 = ttk.Frame(frame)
        row2.pack(fill="x", pady=1)
        ttk.Label(row2, text="输出zip:", width=10).pack(side="left")
        output_var = tk.StringVar(value=output)
        ttk.Entry(row2, textvariable=output_var).pack(side="left", fill="x", expand=True, padx=2)
        ttk.Button(row2, text="浏览", width=6,
                   command=lambda: self._browse_save_zip(output_var)).pack(side="left")

        row3 = ttk.Frame(frame)
        row3.pack(fill="x", pady=1)
        ttk.Button(row3, text="执行打包",
                   command=lambda: self._execute_export(source_var, output_var)).pack(side="left")
        ttk.Button(row3, text="删除", width=6,
                   command=lambda: self._remove_export_rule(frame, widget_data)).pack(side="right")

        widget_data = {"frame": frame, "source": source_var, "output": output_var}
        self.export_widgets.append(widget_data)

        source_var.trace_add("write", lambda *_: self._save())
        output_var.trace_add("write", lambda *_: self._save())
        self._save()

    def _add_import_rule(self, zip_path="", target=""):
        idx = len(self.import_widgets)
        frame = ttk.LabelFrame(self.import_scroll.inner, text=f"导入规则 {idx + 1}", padding=5)
        frame.pack(fill="x", padx=5, pady=2)

        row1 = ttk.Frame(frame)
        row1.pack(fill="x", pady=1)
        ttk.Label(row1, text="zip文件:", width=10).pack(side="left")
        zip_var = tk.StringVar(value=zip_path)
        ttk.Entry(row1, textvariable=zip_var).pack(side="left", fill="x", expand=True, padx=2)
        ttk.Button(row1, text="浏览", width=6,
                   command=lambda: self._browse_open_zip(zip_var)).pack(side="left")

        row2 = ttk.Frame(frame)
        row2.pack(fill="x", pady=1)
        ttk.Label(row2, text="目标路径:", width=10).pack(side="left")
        target_var = tk.StringVar(value=target)
        ttk.Entry(row2, textvariable=target_var).pack(side="left", fill="x", expand=True, padx=2)
        ttk.Button(row2, text="浏览", width=6,
                   command=lambda: self._browse_dir(target_var)).pack(side="left")

        row3 = ttk.Frame(frame)
        row3.pack(fill="x", pady=1)
        ttk.Button(row3, text="执行导入",
                   command=lambda: self._execute_import(zip_var, target_var)).pack(side="left")
        ttk.Button(row3, text="删除", width=6,
                   command=lambda: self._remove_import_rule(frame, widget_data)).pack(side="right")

        widget_data = {"frame": frame, "zip_path": zip_var, "target": target_var}
        self.import_widgets.append(widget_data)

        zip_var.trace_add("write", lambda *_: self._save())
        target_var.trace_add("write", lambda *_: self._save())
        self._save()

    def _remove_export_rule(self, frame, widget_data):
        if not messagebox.askyesno("确认", "确定删除此打包规则？"):
            return
        frame.destroy()
        self.export_widgets.remove(widget_data)
        self._renumber_exports()
        self._save()

    def _remove_import_rule(self, frame, widget_data):
        if not messagebox.askyesno("确认", "确定删除此导入规则？"):
            return
        frame.destroy()
        self.import_widgets.remove(widget_data)
        self._renumber_imports()
        self._save()

    def _renumber_exports(self):
        for i, w in enumerate(self.export_widgets):
            w["frame"].configure(text=f"打包规则 {i + 1}")

    def _renumber_imports(self):
        for i, w in enumerate(self.import_widgets):
            w["frame"].configure(text=f"导入规则 {i + 1}")

    def _browse_dir(self, var):
        path = filedialog.askdirectory()
        if path:
            var.set(path)

    def _browse_file(self, var):
        path = filedialog.askopenfilename(filetypes=[("所有文件", "*.*")])
        if path:
            var.set(path)

    def _browse_save_zip(self, var):
        path = filedialog.asksaveasfilename(
            defaultextension=".zip", filetypes=[("ZIP文件", "*.zip")]
        )
        if path:
            var.set(path)

    def _browse_open_zip(self, var):
        path = filedialog.askopenfilename(filetypes=[("ZIP文件", "*.zip")])
        if path:
            var.set(path)

    def _execute_export(self, source_var, output_var):
        source = source_var.get().strip()
        output = output_var.get().strip()
        if not source or not output:
            messagebox.showerror("错误", "请填写源路径和输出zip路径")
            return
        self._run_in_thread(export_folder, source, output)

    def _execute_import(self, zip_var, target_var):
        zip_path = zip_var.get().strip()
        target = target_var.get().strip()
        if not zip_path or not target:
            messagebox.showerror("错误", "请填写zip文件和目标路径")
            return
        if not messagebox.askokcancel("确认", f"将覆盖目标路径:\n{target}\n是否继续？"):
            return
        self._run_in_thread(import_folder, zip_path, target)

    def _execute_all_exports(self):
        if not self.export_widgets:
            messagebox.showinfo("提示", "没有打包规则")
            return
        if not messagebox.askokcancel("确认", f"执行全部 {len(self.export_widgets)} 条打包规则？"):
            return
        self._run_batch("export")

    def _execute_all_imports(self):
        if not self.import_widgets:
            messagebox.showinfo("提示", "没有导入规则")
            return
        if not messagebox.askokcancel("确认", f"执行全部 {len(self.import_widgets)} 条导入规则？"):
            return
        self._run_batch("import")

    def _run_batch(self, batch_type):
        def worker():
            results = []
            if batch_type == "export":
                for i, w in enumerate(self.export_widgets):
                    try:
                        msg = export_folder(w["source"].get(), w["output"].get())
                        results.append(f"规则{i+1}: {msg}")
                    except Exception as e:
                        results.append(f"规则{i+1}: 失败 - {e}")
            else:
                for i, w in enumerate(self.import_widgets):
                    try:
                        msg = import_folder(w["zip_path"].get(), w["target"].get())
                        results.append(f"规则{i+1}: {msg}")
                    except Exception as e:
                        results.append(f"规则{i+1}: 失败 - {e}")
            summary = "\n".join(results)
            self.after(0, lambda: self._show_batch_result(summary))

        self.status_var.set("执行中...")
        threading.Thread(target=worker, daemon=True).start()

    def _show_batch_result(self, summary):
        self.status_var.set("完成")
        messagebox.showinfo("执行结果", summary)

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
        self.config["export_rules"] = [
            {"source": w["source"].get(), "output": w["output"].get()}
            for w in self.export_widgets
        ]
        self.config["import_rules"] = [
            {"zip_path": w["zip_path"].get(), "target": w["target"].get()}
            for w in self.import_widgets
        ]
        self.save_callback()
