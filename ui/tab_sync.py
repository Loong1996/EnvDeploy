import copy
import threading
import tkinter as tk
from tkinter import ttk, filedialog, messagebox, simpledialog

from core.file_sync import sync_files
from ui.widgets import ScrollableFrame, ProgressDialog, ResultDialog


class TabSync(ttk.Frame):
    def __init__(self, parent, config, save_callback):
        super().__init__(parent)
        self.config = config
        self.save_callback = save_callback

        self._loading = False
        self._item_widgets = []   # list of {"frame", "source", "dest_rel"}
        self._target_widgets = [] # list of {"frame", "path"}

        self._build_ui()
        self._reload_profiles()

    # ── UI 构建 ──────────────────────────────────────────────────────────────

    def _build_ui(self):
        # 顶部：方案选择栏（放大醒目）
        profile_bar = ttk.Frame(self)
        profile_bar.pack(fill="x", padx=8, pady=(8, 4))

        ttk.Label(profile_bar, text="同步方案:", font=("", 12, "bold")).pack(side="left")
        self._profile_var = tk.StringVar()
        self._profile_combo = ttk.Combobox(profile_bar, textvariable=self._profile_var,
                                           state="readonly", width=28,
                                           font=("", 12))
        self._profile_combo.pack(side="left", padx=(6, 12), ipady=3)
        self._profile_combo.bind("<<ComboboxSelected>>", self._on_profile_select)

        ttk.Button(profile_bar, text="+新建", command=self._new_profile).pack(side="left", padx=2)
        ttk.Button(profile_bar, text="复制", command=self._copy_profile).pack(side="left", padx=2)
        ttk.Button(profile_bar, text="重命名", command=self._rename_profile).pack(side="left", padx=2)
        ttk.Button(profile_bar, text="删除", command=self._delete_profile).pack(side="left", padx=2)

        # 执行同步 + 状态栏（紧跟方案栏下方）
        action_bar = ttk.Frame(self)
        action_bar.pack(fill="x", padx=8, pady=(0, 6))
        tk.Button(action_bar, text="  执行同步  ", bg="#4CAF50", fg="white",
                  font=("", 10, "bold"), command=self._execute).pack(side="left", ipady=3)

        self._status_var = tk.StringVar(value="就绪")
        ttk.Label(action_bar, textvariable=self._status_var, relief="sunken",
                  anchor="w").pack(side="left", fill="x", expand=True, padx=(8, 0))

        ttk.Separator(self, orient="horizontal").pack(fill="x", padx=5, pady=(0, 4))

        # 主体：可滚动区域，分同步项和目标工程两段
        self._scroll = ScrollableFrame(self)
        self._scroll.pack(fill="both", expand=True, padx=5)

        # 同步项区域
        self._items_frame = ttk.LabelFrame(self._scroll.inner, text="同步项", padding=5)
        self._items_frame.pack(fill="x", padx=3, pady=(3, 0))

        item_bar = ttk.Frame(self._items_frame)
        item_bar.pack(fill="x")
        ttk.Button(item_bar, text="+ 添加同步项", command=self._add_item).pack(side="left")

        self._items_list = ttk.Frame(self._items_frame)
        self._items_list.pack(fill="x")

        # 目标工程区域
        self._targets_frame = ttk.LabelFrame(self._scroll.inner, text="目标工程目录", padding=5)
        self._targets_frame.pack(fill="x", padx=3, pady=(6, 3))

        target_bar = ttk.Frame(self._targets_frame)
        target_bar.pack(fill="x")
        ttk.Button(target_bar, text="+ 添加目标", command=self._add_target).pack(side="left")

        self._targets_list = ttk.Frame(self._targets_frame)
        self._targets_list.pack(fill="x")

    # ── 方案管理 ─────────────────────────────────────────────────────────────

    def _profiles(self):
        return self.config.setdefault("sync_profiles", [])

    def _current_index(self):
        name = self._profile_var.get()
        for i, p in enumerate(self._profiles()):
            if p.get("name") == name:
                return i
        return -1

    def _current_profile(self):
        idx = self._current_index()
        if idx >= 0:
            return self._profiles()[idx]
        return None

    def _reload_profiles(self):
        names = [p.get("name", f"方案{i+1}") for i, p in enumerate(self._profiles())]
        self._profile_combo["values"] = names
        if names:
            prev = self._profile_var.get()
            saved = self.config.get("ui_state", {}).get("sync_profile", "")
            if prev in names:
                self._profile_combo.set(prev)
            elif saved in names:
                self._profile_combo.set(saved)
            else:
                self._profile_combo.set(names[0])
            self._load_current_profile()
        else:
            self._profile_var.set("")
            self._clear_ui()

    def _load_current_profile(self):
        profile = self._current_profile()
        if profile is None:
            self._clear_ui()
            return

        self._loading = True
        self._clear_ui()
        for item in profile.get("items", []):
            self._add_item(item.get("source", ""), item.get("dest_rel", ""))
        for tgt in profile.get("targets", []):
            self._add_target(tgt.get("path", ""))
        self._loading = False

    def _clear_ui(self):
        for w in self._item_widgets:
            w["frame"].destroy()
        self._item_widgets.clear()
        for w in self._target_widgets:
            w["frame"].destroy()
        self._target_widgets.clear()

    def _on_profile_select(self, _event=None):
        self._load_current_profile()
        self.config.setdefault("ui_state", {})["sync_profile"] = self._profile_var.get()
        self.save_callback()

    def _new_profile(self):
        name = simpledialog.askstring("新建方案", "请输入方案名称：", parent=self.winfo_toplevel())
        if not name:
            return
        name = name.strip()
        if not name:
            return
        if any(p.get("name") == name for p in self._profiles()):
            messagebox.showerror("错误", f"方案 '{name}' 已存在", parent=self.winfo_toplevel())
            return
        self._profiles().append({"name": name, "items": [], "targets": []})
        self.save_callback()
        self._profile_var.set(name)
        self._reload_profiles()

    def _copy_profile(self):
        profile = self._current_profile()
        if profile is None:
            messagebox.showinfo("提示", "没有可复制的方案", parent=self.winfo_toplevel())
            return
        base_name = profile.get("name", "方案") + " (副本)"
        new_name = base_name
        count = 2
        existing = {p.get("name") for p in self._profiles()}
        while new_name in existing:
            new_name = f"{base_name} {count}"
            count += 1
        new_profile = copy.deepcopy(profile)
        new_profile["name"] = new_name
        self._profiles().append(new_profile)
        self.save_callback()
        self._profile_var.set(new_name)
        self._reload_profiles()

    def _rename_profile(self):
        profile = self._current_profile()
        if profile is None:
            return
        old_name = profile.get("name", "")
        name = simpledialog.askstring("重命名方案", "请输入新名称：",
                                      initialvalue=old_name, parent=self.winfo_toplevel())
        if not name:
            return
        name = name.strip()
        if not name or name == old_name:
            return
        if any(p.get("name") == name for p in self._profiles()):
            messagebox.showerror("错误", f"方案 '{name}' 已存在", parent=self.winfo_toplevel())
            return
        profile["name"] = name
        self.save_callback()
        self._profile_var.set(name)
        self._reload_profiles()

    def _delete_profile(self):
        profile = self._current_profile()
        if profile is None:
            return
        name = profile.get("name", "此方案")
        if not messagebox.askyesno("确认", f"确定删除方案 '{name}'？", parent=self.winfo_toplevel()):
            return
        idx = self._current_index()
        self._profiles().pop(idx)
        self.save_callback()
        self._reload_profiles()

    # ── 同步项管理 ───────────────────────────────────────────────────────────

    def _add_item(self, source="", dest_rel=""):
        frame = ttk.Frame(self._items_list, relief="groove", borderwidth=1)
        frame.pack(fill="x", padx=2, pady=2)

        row1 = ttk.Frame(frame)
        row1.pack(fill="x", padx=4, pady=(4, 1))
        ttk.Label(row1, text="源路径:", width=12).pack(side="left")
        source_var = tk.StringVar(value=source)
        ttk.Entry(row1, textvariable=source_var).pack(side="left", fill="x", expand=True, padx=2)
        ttk.Button(row1, text="选文件夹", width=7,
                   command=lambda: self._browse_dir(source_var)).pack(side="left", padx=(0, 2))
        ttk.Button(row1, text="选文件", width=6,
                   command=lambda: self._browse_file(source_var)).pack(side="left")

        row2 = ttk.Frame(frame)
        row2.pack(fill="x", padx=4, pady=(1, 4))
        ttk.Label(row2, text="目标相对路径:", width=12).pack(side="left")
        dest_var = tk.StringVar(value=dest_rel)
        ttk.Entry(row2, textvariable=dest_var).pack(side="left", fill="x", expand=True, padx=2)
        widget_data = {"frame": frame, "source": source_var, "dest_rel": dest_var}
        ttk.Button(row2, text="删除", width=6,
                   command=lambda: self._remove_item(widget_data)).pack(side="left")

        self._item_widgets.append(widget_data)
        source_var.trace_add("write", lambda *_: self._save())
        dest_var.trace_add("write", lambda *_: self._save())
        self._save()

    def _remove_item(self, widget_data):
        widget_data["frame"].destroy()
        self._item_widgets.remove(widget_data)
        self._save()

    # ── 目标工程管理 ─────────────────────────────────────────────────────────

    def _add_target(self, path=""):
        frame = ttk.Frame(self._targets_list)
        frame.pack(fill="x", padx=2, pady=1)

        path_var = tk.StringVar(value=path)
        ttk.Entry(frame, textvariable=path_var).pack(side="left", fill="x", expand=True, padx=(4, 2))
        widget_data = {"frame": frame, "path": path_var}
        ttk.Button(frame, text="浏览", width=6,
                   command=lambda: self._browse_dir(path_var)).pack(side="left", padx=(0, 2))
        ttk.Button(frame, text="删除", width=6,
                   command=lambda: self._remove_target(widget_data)).pack(side="left", padx=(0, 4))

        self._target_widgets.append(widget_data)
        path_var.trace_add("write", lambda *_: self._save())
        self._save()

    def _remove_target(self, widget_data):
        widget_data["frame"].destroy()
        self._target_widgets.remove(widget_data)
        self._save()

    # ── 浏览辅助 ─────────────────────────────────────────────────────────────

    def _browse_dir(self, var):
        path = filedialog.askdirectory(parent=self.winfo_toplevel())
        if path:
            var.set(path)

    def _browse_file(self, var):
        path = filedialog.askopenfilename(
            filetypes=[("所有文件", "*.*")], parent=self.winfo_toplevel()
        )
        if path:
            var.set(path)

    # ── 执行同步 ─────────────────────────────────────────────────────────────

    def _execute(self):
        profile = self._current_profile()
        if profile is None:
            messagebox.showinfo("提示", "请先创建一个同步方案", parent=self.winfo_toplevel())
            return

        items = [{"source": w["source"].get().strip(),
                  "dest_rel": w["dest_rel"].get().strip()}
                 for w in self._item_widgets]
        targets = [w["path"].get().strip() for w in self._target_widgets]

        items = [it for it in items if it["source"]]
        targets = [t for t in targets if t]

        if not items:
            messagebox.showinfo("提示", "请添加至少一个同步项", parent=self.winfo_toplevel())
            return
        if not targets:
            messagebox.showinfo("提示", "请添加至少一个目标工程目录", parent=self.winfo_toplevel())
            return

        if not messagebox.askokcancel(
            "确认",
            f"将 {len(items)} 个同步项同步到 {len(targets)} 个工程目录，是否继续？",
            parent=self.winfo_toplevel()
        ):
            return

        dlg = ProgressDialog(self.winfo_toplevel(), "同步中...")
        self._status_var.set("执行中...")

        def worker():
            def on_progress(current, total, detail):
                self.after(0, lambda: dlg.update_progress(current, total, detail))

            results = sync_files(items, targets, progress_callback=on_progress)
            self.after(0, lambda: dlg.done())
            self.after(0, lambda: self._status_var.set(
                f"完成: {sum(1 for r in results if r.startswith('✓'))} 成功 / "
                f"{sum(1 for r in results if r.startswith('✗'))} 失败"
            ))
            self.after(0, lambda r=results: ResultDialog(
                self.winfo_toplevel(), "同步结果", r).show())

        threading.Thread(target=worker, daemon=True).start()

    # ── 持久化 ───────────────────────────────────────────────────────────────

    def _save(self):
        if self._loading:
            return
        profile = self._current_profile()
        if profile is None:
            return
        profile["items"] = [
            {"source": w["source"].get(), "dest_rel": w["dest_rel"].get()}
            for w in self._item_widgets
        ]
        profile["targets"] = [
            {"path": w["path"].get()}
            for w in self._target_widgets
        ]
        self.save_callback()
