import os
import tkinter as tk
from tkinter import ttk, filedialog, messagebox
import threading
from ui.widgets import ScrollableFrame, ProgressDialog
from ui.theme import COLOR_FG_INVALID, PAD_OUTER, PAD_CARD, RELIEF_STATUS, empty_label
from core.folder_pack import export_folder, get_packages_dir, PACKAGES_DIR


class TabPack(ttk.Frame):
    def __init__(self, parent, config, save_callback):
        super().__init__(parent)
        self.config = config
        self.save_callback = save_callback
        self.export_widgets = []

        btn_bar = ttk.Frame(self)
        btn_bar.pack(fill="x", padx=PAD_OUTER, pady=PAD_OUTER)
        ttk.Button(btn_bar, text="+ 添加打包规则", command=self._add_rule).pack(side="left")
        ttk.Button(btn_bar, text="全部打包", command=self._execute_all).pack(side="right")

        self.scroll = ScrollableFrame(self)
        self.scroll.pack(fill="both", expand=True, padx=PAD_OUTER)

        self._empty_label = empty_label(self.scroll.inner, "暂无打包规则，点击上方「+ 添加打包规则」添加")
        self._empty_label.pack(pady=30)

        self.status_var = tk.StringVar(value="就绪")
        ttk.Label(self, textvariable=self.status_var, relief=RELIEF_STATUS, anchor="w").pack(fill="x", padx=PAD_OUTER, pady=(0, PAD_OUTER))

        self._loading = True
        for rule in self.config.get("export_rules", []):
            self._add_rule(rule.get("source", ""), rule.get("output", ""),
                           rule.get("excludes", []))
        self._loading = False

    def _add_rule(self, source="", output="", excludes=None):
        self._empty_label.pack_forget()
        idx = len(self.export_widgets)
        frame = ttk.LabelFrame(self.scroll.inner, text=f"打包规则 {idx + 1}", padding=8)
        frame.pack(fill="x", padx=PAD_OUTER, pady=PAD_CARD)

        row1 = ttk.Frame(frame)
        row1.pack(fill="x", pady=3)
        ttk.Label(row1, text="源路径:", width=10).pack(side="left")
        source_var = tk.StringVar(value=source)
        source_entry = ttk.Entry(row1, textvariable=source_var)
        source_entry.pack(side="left", fill="x", expand=True, padx=2)
        ttk.Button(row1, text="选文件夹", width=8,
                   command=lambda: self._browse_dir(source_var)).pack(side="left", padx=(0, 2))
        ttk.Button(row1, text="选文件", width=7,
                   command=lambda: self._browse_file(source_var)).pack(side="left")

        row2 = ttk.Frame(frame)
        row2.pack(fill="x", pady=3)
        ttk.Label(row2, text="输出文件:", width=10).pack(side="left")
        output_var = tk.StringVar(value=output)
        output_entry = ttk.Entry(row2, textvariable=output_var)
        output_entry.pack(side="left", fill="x", expand=True, padx=2)
        ttk.Button(row2, text="浏览", width=6,
                   command=lambda: self._browse_save_zip(output_var)).pack(side="left")

        row3 = ttk.Frame(frame)
        row3.pack(fill="x", pady=3)
        ttk.Label(row3, text="排除:", width=10).pack(side="left")
        excludes_var = tk.StringVar(value=", ".join(excludes or []))
        ttk.Entry(row3, textvariable=excludes_var).pack(side="left", fill="x", expand=True, padx=2)

        row4 = ttk.Frame(frame)
        row4.pack(fill="x", pady=3)
        ttk.Button(row4, text="执行打包",
                   command=lambda: self._execute_rule(source_var, output_var, excludes_var)).pack(side="left")
        ttk.Button(row4, text="删除", width=6,
                   command=lambda: self._remove_rule(frame, widget_data)).pack(side="right")
        ttk.Button(row4, text="↓", width=3,
                   command=lambda: self._move_rule(widget_data, 1)).pack(side="right", padx=2)
        ttk.Button(row4, text="↑", width=3,
                   command=lambda: self._move_rule(widget_data, -1)).pack(side="right", padx=2)

        widget_data = {"frame": frame, "source": source_var, "output": output_var,
                       "excludes": excludes_var,
                       "source_entry": source_entry, "output_entry": output_entry}
        self.export_widgets.append(widget_data)

        pkg = get_packages_dir()
        source_var.trace_add("write", lambda *_: self._check_path(source_var, source_entry))
        source_var.trace_add("write", lambda *_: self._save())
        output_var.trace_add("write", lambda *_: self._check_path(output_var, output_entry, pkg))
        output_var.trace_add("write", lambda *_: self._save())
        excludes_var.trace_add("write", lambda *_: self._save())
        self._check_path(source_var, source_entry)
        self._check_path(output_var, output_entry, pkg)
        self._save()

    def _check_path(self, var, entry, base_dir=None):
        p = var.get().strip()
        if not p:
            entry.configure(foreground="")
            return
        if base_dir and not os.path.isabs(p):
            p = os.path.join(base_dir, p)
        entry.configure(foreground=COLOR_FG_INVALID if not os.path.exists(p) else "")

    def _remove_rule(self, frame, widget_data):
        if not messagebox.askyesno("确认", "确定删除此打包规则？"):
            return
        frame.destroy()
        self.export_widgets.remove(widget_data)
        for i, w in enumerate(self.export_widgets):
            w["frame"].configure(text=f"打包规则 {i + 1}")
        if not self.export_widgets:
            self._empty_label.pack(pady=30)
        self._save()

    def _move_rule(self, widget_data, direction):
        idx = self.export_widgets.index(widget_data)
        new_idx = idx + direction
        if new_idx < 0 or new_idx >= len(self.export_widgets):
            return
        self.export_widgets[idx], self.export_widgets[new_idx] = \
            self.export_widgets[new_idx], self.export_widgets[idx]
        self._rebuild_order()
        self._save()

    def _rebuild_order(self):
        for w in self.export_widgets:
            w["frame"].pack_forget()
        for i, w in enumerate(self.export_widgets):
            w["frame"].pack(fill="x", padx=5, pady=4)
            w["frame"].configure(text=f"打包规则 {i + 1}")

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
            defaultextension="",
            filetypes=[("ZIP文件", "*.zip"), ("所有文件", "*.*")],
        )
        if path:
            var.set(self._to_relative(path))

    def _execute_rule(self, source_var, output_var, excludes_var=None):
        source = source_var.get().strip()
        output = output_var.get().strip()
        if not source or not output:
            messagebox.showerror("错误", "请填写源路径和输出zip路径")
            return
        excludes = self._parse_excludes(excludes_var.get() if excludes_var else "")
        self._run_with_progress("打包中...", export_folder, source, output,
                                excludes=excludes)

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
                    excludes = self._parse_excludes(w["excludes"].get())
                    msg = export_folder(w["source"].get(), w["output"].get(),
                                        progress_callback=on_progress, excludes=excludes)
                    results.append(f"规则{rule_idx+1}: {msg}")
                except Exception as e:
                    results.append(f"规则{rule_idx+1}: 失败 - {e}")

            summary = "\n".join(results)
            self.after(0, lambda: dlg.done())
            self.after(0, lambda: self.status_var.set("完成"))
            self.after(0, lambda: messagebox.showinfo("执行结果", summary))

        threading.Thread(target=worker, daemon=True).start()

    @staticmethod
    def _parse_excludes(text):
        return [p.strip() for p in text.split(",") if p.strip()]

    def _run_with_progress(self, title, func, *args, **kwargs):
        dlg = ProgressDialog(self.winfo_toplevel(), title)
        self.status_var.set("执行中...")

        def on_progress(current, total, detail):
            self.after(0, lambda: dlg.update_progress(current, total, detail))

        def worker():
            try:
                result = func(*args, progress_callback=on_progress, **kwargs)
                self.after(0, lambda: dlg.done())
                self.after(0, lambda: self.status_var.set(result))
                self.after(0, lambda: messagebox.showinfo("成功", result))
            except Exception as e:
                err = str(e)
                self.after(0, lambda: dlg.done())
                self.after(0, lambda: self.status_var.set(f"失败: {err}"))
                self.after(0, lambda: messagebox.showerror("错误", err))

        threading.Thread(target=worker, daemon=True).start()

    def _save(self):
        if getattr(self, '_loading', False):
            return
        self.config["export_rules"] = [
            {"source": w["source"].get(), "output": w["output"].get(),
             "excludes": self._parse_excludes(w["excludes"].get())}
            for w in self.export_widgets
        ]
        self.save_callback()
