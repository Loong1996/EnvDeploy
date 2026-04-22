import tkinter as tk
from tkinter import ttk, messagebox
import threading
from config import load_config, save_config, backup_config, list_backups, restore_config
from ui.tab_pack import TabPack
from ui.tab_import import TabImport
from ui.tab_json import TabJson
from ui.tab_envvar import TabEnvVar
from ui.tab_sync import TabSync
from ui.tab_timestamp import TabTimestamp
from ui.widgets import ProgressDialog, SelectionDialog, ResultDialog, LogPanel, _RestoreDialog
from ui.theme import (
    apply_ttk_styles,
    FONT_BODY, FONT_BODY_BOLD,
    BTN_PRIMARY, BTN_SECONDARY, BTN_ACCENT,
    BG_WINDOW, BG_CONTENT,
    COLOR_SIDEBAR_BG, COLOR_SIDEBAR_ACTIVE, COLOR_SIDEBAR_HOVER,
    FG_SIDEBAR, FG_SIDEBAR_SEL,
    PAD_OUTER, PAD_HERO_BTN, IPADY_HERO_BTN, IPADY_SIDEBAR,
)
import os
from core.folder_pack import export_folder, import_folder
from core.json_manip import execute_json_rule
from core.env_vars import execute_env_rule
from core.file_sync import sync_files


class App:
    def __init__(self, root):
        self.root = root
        self.root.title("DeployConfigTool")
        self.root.geometry("900x620")
        self.root.minsize(700, 500)

        apply_ttk_styles(ttk.Style())
        self.root.unbind_class("TCombobox", "<MouseWheel>")
        self.root.configure(bg=BG_WINDOW)

        self.config = load_config()
        self._ui_ready = False

        # 日志面板（默认隐藏，由菜单「查看→操作日志」控制）
        self.log_panel = LogPanel(self.root)

        # 顶层 Notebook
        self._top_notebook = ttk.Notebook(self.root)
        self._top_notebook.pack(fill="both", expand=True, padx=PAD_OUTER, pady=PAD_OUTER)

        # 模块注册表：[{"key", "label", "frame", "var"}]
        self._modules = []

        # ── 菜单栏 ──────────────────────────────────────────
        menubar = tk.Menu(self.root)

        app_menu = tk.Menu(menubar, tearoff=0)
        app_menu.add_command(label="退出", command=self.root.destroy)
        menubar.add_cascade(label="应用", menu=app_menu)

        config_menu = tk.Menu(menubar, tearoff=0)
        config_menu.add_command(label="备份配置", command=self._backup_config)
        config_menu.add_command(label="恢复配置...", command=self._restore_config)
        menubar.add_cascade(label="配置管理", menu=config_menu)

        # 「模块」菜单 — 注册时自动填充
        self._modules_menu = tk.Menu(menubar, tearoff=0)
        menubar.add_cascade(label="模块", menu=self._modules_menu)

        self._log_visible = tk.BooleanVar(value=False)
        view_menu = tk.Menu(menubar, tearoff=0)
        view_menu.add_checkbutton(label="操作日志", variable=self._log_visible,
                                  command=self._toggle_log)
        menubar.add_cascade(label="查看", menu=view_menu)

        self._backup_before_import = tk.BooleanVar(
            value=self.config.get("settings", {}).get("backup_before_import", True)
        )
        self._backup_before_import.trace_add("write", lambda *_: self._on_setting_changed())
        settings_menu = tk.Menu(menubar, tearoff=0)
        settings_menu.add_checkbutton(label="导入前备份目标文件夹",
                                      variable=self._backup_before_import)
        menubar.add_cascade(label="设置", menu=settings_menu)

        self.root.config(menu=menubar)

        # ── 注册模块（新增工具在此加一行）────────────────────
        self._register_module("deploy",    "机器开发环境部署", self._build_deploy_page)
        self._register_module("sync",      "项目配置同步",     self._build_sync_page)
        self._register_module("timestamp", "时间戳转换",       self._build_timestamp_page)

        # 绑定 top tab 切换事件
        self._top_notebook.bind("<<NotebookTabChanged>>", lambda _: self._save_ui_state())

        # 启动后恢复上次界面状态
        self.root.after(0, self._restore_ui_state)

    # ── 模块注册 ─────────────────────────────────────────────

    def _register_module(self, key, label, build_fn):
        """注册一个顶层模块：创建 frame、加入 Notebook、加入菜单。"""
        frame = ttk.Frame(self._top_notebook)
        self._top_notebook.add(frame, text=f"  {label}  ")
        var = tk.BooleanVar(value=True)
        self._modules_menu.add_checkbutton(
            label=label, variable=var,
            command=lambda k=key: self._toggle_module(k),
        )
        build_fn(frame)
        self._modules.append({"key": key, "label": label, "frame": frame, "var": var})

    def _toggle_module(self, key):
        mod = next(m for m in self._modules if m["key"] == key)
        if mod["var"].get():
            self._top_notebook.tab(mod["frame"], state="normal")
        else:
            # 若正在显示该 tab，先切换到其他可见模块
            try:
                if str(mod["frame"]) == self._top_notebook.select():
                    for m in self._modules:
                        if m["key"] != key and m["var"].get():
                            self._top_notebook.select(m["frame"])
                            break
            except Exception:
                pass
            self._top_notebook.tab(mod["frame"], state="hidden")
        self._save_ui_state()

    # ── 模块构建 ─────────────────────────────────────────────

    def _build_deploy_page(self, page):
        deploy_bar = ttk.Frame(page)
        deploy_bar.pack(fill="x", padx=PAD_OUTER, pady=PAD_OUTER)
        tk.Button(deploy_bar, text="  一键打包  ", **BTN_PRIMARY,
                  command=self._one_key_pack).pack(side="left", padx=PAD_HERO_BTN, ipady=IPADY_HERO_BTN)
        tk.Button(deploy_bar, text="  一键导入  ", **BTN_SECONDARY,
                  command=self._one_key_import).pack(side="left", padx=PAD_HERO_BTN, ipady=IPADY_HERO_BTN)
        ttk.Separator(page, orient="horizontal").pack(fill="x", padx=PAD_OUTER)

        deploy_body = tk.Frame(page, bg=BG_CONTENT)
        deploy_body.pack(fill="both", expand=True)

        sidebar = tk.Frame(deploy_body, bg=COLOR_SIDEBAR_BG, width=90)
        sidebar.pack(side="left", fill="y")
        sidebar.pack_propagate(False)
        ttk.Separator(deploy_body, orient="vertical").pack(side="left", fill="y")

        content = tk.Frame(deploy_body, bg=BG_CONTENT)
        content.pack(side="left", fill="both", expand=True)

        self.tab_pack   = TabPack(content,   self.config, self._save)
        self.tab_import = TabImport(content, self.config, self._save, self._backup_before_import)
        self.tab_json   = TabJson(content,   self.config, self._save)
        self.tab_envvar = TabEnvVar(content, self.config, self._save)

        self._deploy_tabs = [
            ("打包文件", self.tab_pack),
            ("导入文件", self.tab_import),
            ("JSON操作", self.tab_json),
            ("环境变量", self.tab_envvar),
        ]
        self._deploy_tab_index = 0
        self._sidebar_btns = []

        for i, (label, _) in enumerate(self._deploy_tabs):
            btn = tk.Button(sidebar, text=label, bd=0, relief="flat", cursor="hand2",
                            font=FONT_BODY, anchor="w", padx=12,
                            fg=FG_SIDEBAR, activeforeground=FG_SIDEBAR_SEL,
                            bg=COLOR_SIDEBAR_BG, activebackground=COLOR_SIDEBAR_HOVER,
                            command=lambda idx=i: self._select_deploy_tab(idx))
            btn.pack(fill="x", ipady=IPADY_SIDEBAR)
            self._sidebar_btns.append(btn)

        self._deploy_tabs[0][1].pack(fill="both", expand=True)
        self._sidebar_btns[0].configure(bg=COLOR_SIDEBAR_ACTIVE, font=FONT_BODY_BOLD,
                                        fg=FG_SIDEBAR_SEL)

    def _build_timestamp_page(self, page):
        tab = TabTimestamp(page)
        tab.pack(fill="both", expand=True, padx=PAD_OUTER, pady=PAD_OUTER)

    def _build_sync_page(self, page):
        sync_bar = ttk.Frame(page)
        sync_bar.pack(fill="x", padx=PAD_OUTER, pady=PAD_OUTER)
        tk.Button(sync_bar, text="  一键同步  ", **BTN_ACCENT,
                  command=self._one_key_sync).pack(side="left", padx=PAD_HERO_BTN, ipady=IPADY_HERO_BTN)
        ttk.Separator(page, orient="horizontal").pack(fill="x", padx=PAD_OUTER)

        self.tab_sync = TabSync(page, self.config, self._save)
        self.tab_sync.pack(fill="both", expand=True, padx=PAD_OUTER, pady=PAD_OUTER)

    # ── UI 状态 ───────────────────────────────────────────────

    def _select_deploy_tab(self, idx):
        _, prev = self._deploy_tabs[self._deploy_tab_index]
        prev.pack_forget()
        self._sidebar_btns[self._deploy_tab_index].configure(
            bg=COLOR_SIDEBAR_BG, font=FONT_BODY, fg=FG_SIDEBAR)
        self._deploy_tab_index = idx
        _, cur = self._deploy_tabs[idx]
        cur.pack(fill="both", expand=True)
        self._sidebar_btns[idx].configure(
            bg=COLOR_SIDEBAR_ACTIVE, font=FONT_BODY_BOLD, fg=FG_SIDEBAR_SEL)
        self._save_ui_state()

    def _toggle_log(self):
        if self._log_visible.get():
            self.log_panel.pack(side="bottom", fill="x", padx=5, pady=(0, 5))
        else:
            self.log_panel.pack_forget()

    def _save(self):
        save_config(self.config)

    def _save_ui_state(self):
        if not self._ui_ready:
            return
        ui = self.config.setdefault("ui_state", {})
        # 当前模块 key
        try:
            cur = self._top_notebook.select()
            for m in self._modules:
                if str(m["frame"]) == cur:
                    ui["top_module"] = m["key"]
                    break
        except Exception:
            pass
        # 各模块显隐状态
        ui["modules_visible"] = {m["key"]: m["var"].get() for m in self._modules}
        ui["deploy_tab"] = self._deploy_tab_index
        save_config(self.config)

    def _restore_ui_state(self):
        ui = self.config.get("ui_state", {})

        # 恢复模块显隐
        modules_visible = ui.get("modules_visible", {})
        for m in self._modules:
            visible = modules_visible.get(m["key"], True)
            m["var"].set(visible)
            self._top_notebook.tab(m["frame"], state="normal" if visible else "hidden")

        # 恢复当前模块
        top_key = ui.get("top_module", self._modules[0]["key"] if self._modules else None)
        for m in self._modules:
            if m["key"] == top_key and m["var"].get():
                try:
                    self._top_notebook.select(m["frame"])
                except Exception:
                    pass
                break

        # 恢复左侧导航
        try:
            self._select_deploy_tab(ui.get("deploy_tab", 0))
        except Exception:
            pass

        self._ui_ready = True

    # ── 业务操作 ──────────────────────────────────────────────

    def _on_setting_changed(self):
        self.config.setdefault("settings", {})["backup_before_import"] = \
            self._backup_before_import.get()
        self._save()

    def _backup_config(self):
        try:
            dest = backup_config()
            self.log_panel.log(f"配置已备份: {os.path.basename(dest)}", "ok")
        except Exception as e:
            messagebox.showerror("备份失败", str(e))

    def _restore_config(self):
        backups = list_backups()
        if not backups:
            messagebox.showinfo("恢复配置", "暂无备份文件")
            return
        _RestoreDialog(self.root, backups, self._do_restore)

    def _do_restore(self, backup_path):
        try:
            restore_config(backup_path)
            self.config = load_config()
            for tab in (self.tab_pack, self.tab_import, self.tab_json, self.tab_envvar):
                if hasattr(tab, "reload"):
                    tab.reload(self.config)
            if hasattr(self.tab_sync, "reload"):
                self.tab_sync.reload(self.config)
            self.log_panel.log(f"配置已恢复: {os.path.basename(backup_path)}", "ok")
            messagebox.showinfo("恢复成功",
                                f"已恢复配置:\n{os.path.basename(backup_path)}\n\n部分设置需重启程序生效。")
        except Exception as e:
            messagebox.showerror("恢复失败", str(e))

    def _one_key_pack(self):
        all_rules = self.config.get("export_rules", [])
        if not all_rules:
            messagebox.showinfo("提示", "没有打包规则")
            return

        items = [f"{r.get('source', '(空)')}  ->  {r.get('output', '(空)')}" for r in all_rules]
        memory = self.config.get("selection_memory", {}).get("pack", {})
        sel_dlg = SelectionDialog(self.root, "选择要打包的规则", items, memory=memory)
        selected = sel_dlg.show()
        if sel_dlg.memory_result is not None:
            self.config.setdefault("selection_memory", {})["pack"] = sel_dlg.memory_result
            self._save()
        if not selected:
            return

        export_rules = [all_rules[i] for i in selected]
        total_rules = len(export_rules)
        dlg = ProgressDialog(self.root, "一键打包中...")

        def worker():
            results = []
            for i, rule in enumerate(export_rules):
                def on_progress(current, total, detail, i=i):
                    label = f"打包规则 {i+1}/{total_rules} - {current}/{total}"
                    self.root.after(0, lambda c=current, t=total, l=label, d=detail:
                                    dlg.update_progress(c, t, f"{l}  {d}"))
                try:
                    msg = export_folder(rule.get("source", ""), rule.get("output", ""),
                                        progress_callback=on_progress,
                                        excludes=rule.get("excludes", []))
                    results.append(f"✓ 打包规则{i+1}: {msg}")
                except Exception as e:
                    results.append(f"✗ 打包规则{i+1}: 失败 - {e}")
            ok   = sum(1 for r in results if r.startswith("✓"))
            fail = sum(1 for r in results if r.startswith("✗"))
            summary = f"一键打包完成: {ok} 成功 / {fail} 失败"
            tag = "ok" if fail == 0 else "err"
            self.root.after(0, lambda: dlg.done())
            self.root.after(0, lambda r=results: ResultDialog(self.root, "一键打包结果", r).show())
            self.root.after(0, lambda s=summary, t=tag: self.log_panel.log(s, t))

        threading.Thread(target=worker, daemon=True).start()

    def _one_key_import(self):
        import_items, import_meta = self._build_import_entries()
        all_json = self.config.get("json_rules", [])
        all_env  = self.config.get("env_rules", [])

        items     = list(import_items)
        item_meta = list(import_meta)

        for r in all_json:
            items.append(f"[JSON] {r.get('filepath','(空)')}  ({r.get('operation','')})")
            item_meta.append(("json", r))
        for r in all_env:
            op_label = "追加PATH" if r.get("operation") == "append_path" else "设置"
            items.append(f"[环境变量/{op_label}] {r.get('name','(空)')} = {r.get('value','')}")
            item_meta.append(("env", r))

        if not items:
            messagebox.showinfo("提示", "没有任何导入/JSON/环境变量规则")
            return

        memory = self.config.get("selection_memory", {}).get("import", {})
        sel_dlg = SelectionDialog(self.root, "选择要导入的规则", items, memory=memory)
        selected = sel_dlg.show()
        if sel_dlg.memory_result is not None:
            self.config.setdefault("selection_memory", {})["import"] = sel_dlg.memory_result
            self._save()
        if not selected:
            return

        chosen     = [item_meta[i] for i in selected]
        total_steps = len(chosen)
        dlg = ProgressDialog(self.root, "一键导入中...")
        do_backup = self._backup_before_import.get()

        def worker():
            results = []
            for step, (rtype, rule) in enumerate(chosen):
                def on_file_progress(current, total, detail, s=step):
                    label = f"[{s+1}/{total_steps}] {current}/{total}"
                    self.root.after(0, lambda c=current, t=total, l=label, d=detail:
                                    dlg.update_progress(c, t, f"{l}  {d}"))

                self.root.after(0, lambda s=step, r=rule, t=rtype:
                                dlg.update_progress(s, total_steps,
                                    r.get("zip_path" if t == "import" else
                                          "filepath" if t == "json" else "name", "")))
                try:
                    if rtype == "import":
                        msg = import_folder(rule.get("zip_path", ""), rule.get("target", ""),
                                            progress_callback=on_file_progress,
                                            backup=do_backup,
                                            rename=rule.get("rename", ""),
                                            preserve=rule.get("preserve", []))
                    elif rtype == "json":
                        msg = execute_json_rule(rule.get("filepath", ""),
                                                rule.get("operation", ""), rule.get("data", {}))
                    else:
                        msg = execute_env_rule(rule.get("name", ""), rule.get("value", ""),
                                               rule.get("operation", "set"))
                    results.append(f"✓ {msg}")
                except Exception as e:
                    results.append(f"✗ 失败 - {e}")

            ok   = sum(1 for r in results if r.startswith("✓"))
            fail = sum(1 for r in results if r.startswith("✗"))
            summary = f"一键导入完成: {ok} 成功 / {fail} 失败"
            tag = "ok" if fail == 0 else "err"
            self.root.after(0, lambda: dlg.done())
            self.root.after(0, lambda r=results: ResultDialog(self.root, "一键导入结果", r).show())
            self.root.after(0, lambda s=summary, t=tag: self.log_panel.log(s, t))

        threading.Thread(target=worker, daemon=True).start()

    def _build_import_entries(self):
        items, item_meta = [], []
        for r in self.config.get("import_rules", []):
            items.append(f"[导入] {r.get('zip_path','(空)')}  ->  {r.get('target','(空)')}")
            item_meta.append(("import", r))
        return items, item_meta

    def _one_key_sync(self):
        profile = self.tab_sync._current_profile()
        if profile is None:
            messagebox.showinfo("提示", "请先在「批量同步」Tab 中创建并配置同步方案")
            return

        items        = [it for it in profile.get("items", []) if it.get("source", "").strip()]
        target_paths = [t.get("path", "") for t in profile.get("targets", [])
                        if t.get("path", "").strip()]

        if not items:
            messagebox.showinfo("提示", "当前方案没有同步项")
            return
        if not target_paths:
            messagebox.showinfo("提示", "当前方案没有目标工程目录")
            return

        memory = self.config.get("selection_memory", {}).get("sync", {})
        sel_dlg = SelectionDialog(self.root, "选择要同步的目标工程", target_paths, memory=memory)
        selected = sel_dlg.show()
        if sel_dlg.memory_result is not None:
            self.config.setdefault("selection_memory", {})["sync"] = sel_dlg.memory_result
            self._save()
        if not selected:
            return

        chosen_targets = [target_paths[i] for i in selected]
        dlg = ProgressDialog(self.root, "一键同步中...")

        def worker():
            def on_progress(current, total, detail):
                self.root.after(0, lambda: dlg.update_progress(current, total, detail))

            results = sync_files(items, chosen_targets, progress_callback=on_progress)
            ok   = sum(1 for r in results if r.startswith("✓"))
            fail = sum(1 for r in results if r.startswith("✗"))
            summary = f"一键同步完成: {ok} 成功 / {fail} 失败"
            tag = "ok" if fail == 0 else "err"
            self.root.after(0, lambda: dlg.done())
            self.root.after(0, lambda r=results: ResultDialog(self.root, "一键同步结果", r).show())
            self.root.after(0, lambda s=summary, t=tag: self.log_panel.log(s, t))

        threading.Thread(target=worker, daemon=True).start()
