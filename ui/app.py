import tkinter as tk
from tkinter import ttk, messagebox
import threading
from config import load_config, save_config
from ui.tab_pack import TabPack
from ui.tab_import import TabImport
from ui.tab_json import TabJson
from ui.tab_envvar import TabEnvVar
from ui.widgets import ProgressDialog, SelectionDialog, ResultDialog
import os
import glob
from core.folder_pack import export_folder, import_folder, PACKAGES_DIR, get_packages_dir
from core.json_manip import execute_json_rule
from core.env_vars import execute_env_rule


class App:
    def __init__(self, root):
        self.root = root
        self.root.title("Deploy & Config Tool")
        self.root.geometry("900x620")
        self.root.minsize(700, 500)

        style = ttk.Style()
        style.theme_use("clam")

        self.config = load_config()

        # 顶部全局操作栏
        global_bar = ttk.Frame(self.root)
        global_bar.pack(fill="x", padx=5, pady=5)
        btn_pack = tk.Button(global_bar, text="  一键打包  ", bg="#4CAF50", fg="white",
                             font=("", 11, "bold"), command=self._one_key_pack)
        btn_pack.pack(side="left", padx=10, ipady=4)
        btn_import = tk.Button(global_bar, text="  一键导入  ", bg="#2196F3", fg="white",
                               font=("", 11, "bold"), command=self._one_key_import)
        btn_import.pack(side="left", padx=10, ipady=4)
        ttk.Separator(self.root, orient="horizontal").pack(fill="x", padx=5)

        notebook = ttk.Notebook(self.root)
        notebook.pack(fill="both", expand=True, padx=5, pady=5)

        self.tab_pack = TabPack(notebook, self.config, self._save)
        self.tab_import = TabImport(notebook, self.config, self._save)
        self.tab_json = TabJson(notebook, self.config, self._save)
        self.tab_envvar = TabEnvVar(notebook, self.config, self._save)

        notebook.add(self.tab_pack, text="  打包文件  ")
        notebook.add(self.tab_import, text="  导入文件  ")
        notebook.add(self.tab_json, text="  JSON操作  ")
        notebook.add(self.tab_envvar, text="  环境变量  ")

    def _save(self):
        save_config(self.config)

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
                def on_progress(current, total, detail):
                    label = f"打包规则 {i+1}/{total_rules} - {current}/{total}"
                    self.root.after(0, lambda l=label, c=current, t=total, d=detail:
                                    dlg.update_progress(c, t, f"{l}  {d}"))
                try:
                    msg = export_folder(rule.get("source", ""), rule.get("output", ""),
                                        progress_callback=on_progress)
                    results.append(f"✓ 打包规则{i+1}: {msg}")
                except Exception as e:
                    results.append(f"✗ 打包规则{i+1}: 失败 - {e}")
            self.root.after(0, lambda: dlg.done())
            self.root.after(0, lambda r=results: ResultDialog(self.root, "一键打包结果", r).show())

        threading.Thread(target=worker, daemon=True).start()

    def _build_import_entries(self):
        """构建导入条目：仅已配置的导入规则"""
        items = []
        item_meta = []  # (type, rule)

        for r in self.config.get("import_rules", []):
            items.append(f"[导入] {r.get('zip_path','(空)')}  ->  {r.get('target','(空)')}")
            item_meta.append(("import", r))

        return items, item_meta

    def _one_key_import(self):
        import_items, import_meta = self._build_import_entries()
        all_json = self.config.get("json_rules", [])
        all_env = self.config.get("env_rules", [])

        items = list(import_items)
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

        chosen = [item_meta[i] for i in selected]
        total_steps = len(chosen)
        dlg = ProgressDialog(self.root, "一键导入中...")

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
                                            progress_callback=on_file_progress)
                    elif rtype == "json":
                        msg = execute_json_rule(rule.get("filepath", ""),
                                                rule.get("operation", ""), rule.get("data", {}))
                    else:
                        msg = execute_env_rule(rule.get("name", ""), rule.get("value", ""),
                                                rule.get("operation", "set"))
                    results.append(f"✓ {msg}")
                except Exception as e:
                    results.append(f"✗ 失败 - {e}")

            self.root.after(0, lambda: dlg.done())
            self.root.after(0, lambda r=results: ResultDialog(self.root, "一键导入结果", r).show())

        threading.Thread(target=worker, daemon=True).start()
