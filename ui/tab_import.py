import os
import tkinter as tk
from tkinter import ttk, filedialog, messagebox
import threading
from ui.widgets import ScrollableFrame, ProgressDialog
from ui.theme import COLOR_FG_INVALID, PAD_OUTER, PAD_CARD, RELIEF_STATUS, empty_label
from core.folder_pack import import_folder, get_packages_dir, PACKAGES_DIR


class TabImport(ttk.Frame):
    def __init__(self, parent, config, save_callback, backup_var=None):
        super().__init__(parent)
        self.config = config
        self.save_callback = save_callback
        self.import_widgets = []
        self._backup_var = backup_var

        btn_bar = ttk.Frame(self)
        btn_bar.pack(fill="x", padx=PAD_OUTER, pady=PAD_OUTER)
        ttk.Button(btn_bar, text="+ 添加导入规则", command=self._add_rule).pack(side="left")
        ttk.Button(btn_bar, text="全部导入", command=self._execute_all).pack(side="right")
        if backup_var is not None:
            ttk.Checkbutton(btn_bar, text="导入前备份目标",
                            variable=backup_var).pack(side="right", padx=(0, 8))

        self.scroll = ScrollableFrame(self)
        self.scroll.pack(fill="both", expand=True, padx=PAD_OUTER)

        self._empty_label = empty_label(self.scroll.inner, "暂无导入规则，点击上方「+ 添加导入规则」添加")
        self._empty_label.pack(pady=30)

        self.status_var = tk.StringVar(value="就绪")
        ttk.Label(self, textvariable=self.status_var, relief=RELIEF_STATUS, anchor="w").pack(fill="x", padx=PAD_OUTER, pady=(0, PAD_OUTER))

        self._loading = True
        for rule in self.config.get("import_rules", []):
            self._add_rule(rule.get("zip_path", ""), rule.get("target", ""))
        self._loading = False

    def _add_rule(self, zip_path="", target=""):
        self._empty_label.pack_forget()
        idx = len(self.import_widgets)
        frame = ttk.LabelFrame(self.scroll.inner, text=f"导入规则 {idx + 1}", padding=8)
        frame.pack(fill="x", padx=PAD_OUTER, pady=PAD_CARD)

        row1 = ttk.Frame(frame)
        row1.pack(fill="x", pady=3)
        ttk.Label(row1, text="zip文件:", width=10).pack(side="left")
        zip_var = tk.StringVar(value=zip_path)
        zip_entry = ttk.Entry(row1, textvariable=zip_var)
        zip_entry.pack(side="left", fill="x", expand=True, padx=2)
        ttk.Button(row1, text="浏览", width=6,
                   command=lambda: self._browse_open_zip(zip_var)).pack(side="left")

        row2 = ttk.Frame(frame)
        row2.pack(fill="x", pady=3)
        ttk.Label(row2, text="目标路径:", width=10).pack(side="left")
        target_var = tk.StringVar(value=target)
        target_entry = ttk.Entry(row2, textvariable=target_var)
        target_entry.pack(side="left", fill="x", expand=True, padx=2)
        ttk.Button(row2, text="浏览", width=6,
                   command=lambda: self._browse_dir(target_var)).pack(side="left")

        row3 = ttk.Frame(frame)
        row3.pack(fill="x", pady=3)
        ttk.Button(row3, text="执行导入",
                   command=lambda: self._execute_rule(zip_var, target_var)).pack(side="left")
        ttk.Button(row3, text="删除", width=6,
                   command=lambda: self._remove_rule(frame, widget_data)).pack(side="right")
        ttk.Button(row3, text="↓", width=3,
                   command=lambda: self._move_rule(widget_data, 1)).pack(side="right", padx=2)
        ttk.Button(row3, text="↑", width=3,
                   command=lambda: self._move_rule(widget_data, -1)).pack(side="right", padx=2)

        widget_data = {"frame": frame, "zip_path": zip_var, "target": target_var,
                       "zip_entry": zip_entry, "target_entry": target_entry}
        self.import_widgets.append(widget_data)

        pkg = get_packages_dir()
        zip_var.trace_add("write", lambda *_: self._check_path(zip_var, zip_entry, pkg))
        zip_var.trace_add("write", lambda *_: self._save())
        target_var.trace_add("write", lambda *_: self._check_path(target_var, target_entry))
        target_var.trace_add("write", lambda *_: self._save())
        self._check_path(zip_var, zip_entry, pkg)
        self._check_path(target_var, target_entry)
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
        if not messagebox.askyesno("确认", "确定删除此导入规则？"):
            return
        frame.destroy()
        self.import_widgets.remove(widget_data)
        for i, w in enumerate(self.import_widgets):
            w["frame"].configure(text=f"导入规则 {i + 1}")
        if not self.import_widgets:
            self._empty_label.pack(pady=30)
        self._save()

    def _move_rule(self, widget_data, direction):
        idx = self.import_widgets.index(widget_data)
        new_idx = idx + direction
        if new_idx < 0 or new_idx >= len(self.import_widgets):
            return
        self.import_widgets[idx], self.import_widgets[new_idx] = \
            self.import_widgets[new_idx], self.import_widgets[idx]
        self._rebuild_order()
        self._save()

    def _rebuild_order(self):
        for w in self.import_widgets:
            w["frame"].pack_forget()
        for i, w in enumerate(self.import_widgets):
            w["frame"].pack(fill="x", padx=5, pady=4)
            w["frame"].configure(text=f"导入规则 {i + 1}")

    def _browse_dir(self, var):
        path = filedialog.askdirectory()
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

    def _browse_open_zip(self, var):
        path = filedialog.askopenfilename(
            initialdir=get_packages_dir(),
            filetypes=[("ZIP文件", "*.zip")]
        )
        if path:
            var.set(self._to_relative(path))

    def _execute_rule(self, zip_var, target_var):
        zip_path = zip_var.get().strip()
        target = target_var.get().strip()
        if not zip_path or not target:
            messagebox.showerror("错误", "请填写zip文件和目标路径")
            return
        do_backup = self._backup_var.get() if self._backup_var is not None else False
        if do_backup:
            msg = f"目标路径已存在将被备份后覆盖:\n{target}\n是否继续？"
        else:
            msg = f"将覆盖目标路径:\n{target}\n是否继续？"
        if not messagebox.askokcancel("确认", msg):
            return
        self._run_with_progress("导入中...", import_folder, zip_path, target,
                                backup=do_backup)

    def _execute_all(self):
        if not self.import_widgets:
            messagebox.showinfo("提示", "没有导入规则")
            return
        if not messagebox.askokcancel("确认", f"执行全部 {len(self.import_widgets)} 条导入规则？"):
            return

        dlg = ProgressDialog(self.winfo_toplevel(), "批量导入中...")
        total_rules = len(self.import_widgets)
        self.status_var.set("执行中...")
        do_backup = self._backup_var.get() if self._backup_var is not None else False

        def worker():
            results = []
            for rule_idx, w in enumerate(self.import_widgets):
                def on_progress(current, total, detail, ri=rule_idx):
                    label = f"规则 {ri+1}/{total_rules} - {current}/{total}"
                    self.after(0, lambda l=label, c=current, t=total, d=detail:
                               dlg.update_progress(c, t, f"{l}  {d}"))
                try:
                    msg = import_folder(w["zip_path"].get(), w["target"].get(),
                                        progress_callback=on_progress, backup=do_backup)
                    results.append(f"规则{rule_idx+1}: {msg}")
                except Exception as e:
                    results.append(f"规则{rule_idx+1}: 失败 - {e}")

            summary = "\n".join(results)
            self.after(0, lambda: dlg.done())
            self.after(0, lambda: self.status_var.set("完成"))
            self.after(0, lambda: messagebox.showinfo("执行结果", summary))

        threading.Thread(target=worker, daemon=True).start()

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
                self.after(0, lambda: dlg.done())
                self.after(0, lambda: self.status_var.set(f"失败: {e}"))
                self.after(0, lambda: messagebox.showerror("错误", str(e)))

        threading.Thread(target=worker, daemon=True).start()

    def _save(self):
        if getattr(self, '_loading', False):
            return
        self.config["import_rules"] = [
            {"zip_path": w["zip_path"].get(), "target": w["target"].get()}
            for w in self.import_widgets
        ]
        self.save_callback()
