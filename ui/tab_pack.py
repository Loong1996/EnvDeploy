import os
import tkinter as tk
from tkinter import ttk, filedialog, messagebox
import threading
from ui.widgets import ScrollableFrame, ProgressDialog
from core.folder_pack import export_folder, get_packages_dir, PACKAGES_DIR


class TabPack(ttk.Frame):
    def __init__(self, parent, config, save_callback):
        super().__init__(parent)
        self.config = config
        self.save_callback = save_callback
        self.export_widgets = []

        btn_bar = ttk.Frame(self)
        btn_bar.pack(fill="x", padx=5, pady=5)
        ttk.Button(btn_bar, text="+ 添加打包规则", command=self._add_rule).pack(side="left")
        ttk.Button(btn_bar, text="全部打包", command=self._execute_all).pack(side="right")

        self.scroll = ScrollableFrame(self)
        self.scroll.pack(fill="both", expand=True, padx=5)

        self.status_var = tk.StringVar(value="就绪")
        ttk.Label(self, textvariable=self.status_var, relief="sunken", anchor="w").pack(fill="x", padx=5, pady=(0, 5))

        self._loading = True
        for rule in self.config.get("export_rules", []):
            self._add_rule(rule.get("source", ""), rule.get("output", ""))
        self._loading = False

    def _add_rule(self, source="", output=""):
        idx = len(self.export_widgets)
        frame = ttk.LabelFrame(self.scroll.inner, text=f"打包规则 {idx + 1}", padding=5)
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
                   command=lambda: self._execute_rule(source_var, output_var)).pack(side="left")
        ttk.Button(row3, text="删除", width=6,
                   command=lambda: self._remove_rule(frame, widget_data)).pack(side="right")

        widget_data = {"frame": frame, "source": source_var, "output": output_var}
        self.export_widgets.append(widget_data)

        source_var.trace_add("write", lambda *_: self._save())
        output_var.trace_add("write", lambda *_: self._save())
        self._save()

    def _remove_rule(self, frame, widget_data):
        if not messagebox.askyesno("确认", "确定删除此打包规则？"):
            return
        frame.destroy()
        self.export_widgets.remove(widget_data)
        for i, w in enumerate(self.export_widgets):
            w["frame"].configure(text=f"打包规则 {i + 1}")
        self._save()

    def _browse_dir(self, var):
        path = filedialog.askdirectory()
        if path:
            var.set(path)

    def _browse_file(self, var):
        path = filedialog.askopenfilename(filetypes=[("所有文件", "*.*")])
        if path:
            var.set(path)

    def _to_relative(self, path):
        normed = os.path.normpath(path)
        pkg = os.path.normpath(PACKAGES_DIR)
        try:
            rel = os.path.relpath(normed, pkg)
            if not rel.startswith(".."):
                return rel
        except ValueError:
            pass
        return normed

    def _browse_save_zip(self, var):
        path = filedialog.asksaveasfilename(
            initialdir=get_packages_dir(),
            defaultextension=".zip", filetypes=[("ZIP文件", "*.zip")]
        )
        if path:
            var.set(self._to_relative(path))

    def _execute_rule(self, source_var, output_var):
        source = source_var.get().strip()
        output = output_var.get().strip()
        if not source or not output:
            messagebox.showerror("错误", "请填写源路径和输出zip路径")
            return
        self._run_with_progress("打包中...", export_folder, source, output)

    def _execute_all(self):
        if not self.export_widgets:
            messagebox.showinfo("提示", "没有打包规则")
            return
        if not messagebox.askokcancel("确认", f"执行全部 {len(self.export_widgets)} 条打包规则？"):
            return

        dlg = ProgressDialog(self.winfo_toplevel(), "批量打包中...")
        total_rules = len(self.export_widgets)
        self.status_var.set("执行中...")

        def worker():
            results = []
            for rule_idx, w in enumerate(self.export_widgets):
                def on_progress(current, total, detail, ri=rule_idx):
                    label = f"规则 {ri+1}/{total_rules} - {current}/{total}"
                    self.after(0, lambda l=label, c=current, t=total, d=detail:
                               dlg.update_progress(c, t, f"{l}  {d}"))
                try:
                    msg = export_folder(w["source"].get(), w["output"].get(),
                                        progress_callback=on_progress)
                    results.append(f"规则{rule_idx+1}: {msg}")
                except Exception as e:
                    results.append(f"规则{rule_idx+1}: 失败 - {e}")

            summary = "\n".join(results)
            self.after(0, lambda: dlg.done())
            self.after(0, lambda: self.status_var.set("完成"))
            self.after(0, lambda: messagebox.showinfo("执行结果", summary))

        threading.Thread(target=worker, daemon=True).start()

    def _run_with_progress(self, title, func, *args):
        dlg = ProgressDialog(self.winfo_toplevel(), title)
        self.status_var.set("执行中...")

        def on_progress(current, total, detail):
            self.after(0, lambda: dlg.update_progress(current, total, detail))

        def worker():
            try:
                result = func(*args, progress_callback=on_progress)
                self.after(0, lambda: dlg.done())
                self.after(0, lambda: self.status_var.set(result))
                self.after(0, lambda: messagebox.showinfo("成功", result))
            except Exception as e:
                self.after(0, lambda: dlg.done())
                self.after(0, lambda: self.status_var.set(f"失败: {e}"))
                self.after(0, lambda: messagebox.showerror("错误", str(e)))

        threading.Thread(target=worker, daemon=True).start()

    def _save(self):
        if getattr(self, '_loading', False):
            return
        self.config["export_rules"] = [
            {"source": w["source"].get(), "output": w["output"].get()}
            for w in self.export_widgets
        ]
        self.save_callback()
