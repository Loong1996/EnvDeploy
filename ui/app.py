import tkinter as tk
from tkinter import ttk, messagebox
import threading
from config import load_config, save_config
from ui.tab_folder import TabFolder
from ui.tab_json import TabJson
from ui.tab_envvar import TabEnvVar
from ui.widgets import ProgressDialog
from core.folder_pack import export_folder, import_folder
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

        self.tab_folder = TabFolder(notebook, self.config, self._save)
        self.tab_json = TabJson(notebook, self.config, self._save)
        self.tab_envvar = TabEnvVar(notebook, self.config, self._save)

        notebook.add(self.tab_folder, text="  打包/导入  ")
        notebook.add(self.tab_json, text="  JSON操作  ")
        notebook.add(self.tab_envvar, text="  环境变量  ")

    def _save(self):
        save_config(self.config)

    def _one_key_pack(self):
        export_rules = self.config.get("export_rules", [])
        if not export_rules:
            messagebox.showinfo("提示", "没有打包规则")
            return
        if not messagebox.askokcancel("一键打包", f"将执行 {len(export_rules)} 条打包规则，是否继续？"):
            return

        dlg = ProgressDialog(self.root, "一键打包中...")
        total_rules = len(export_rules)

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
                    results.append(f"打包规则{i+1}: {msg}")
                except Exception as e:
                    results.append(f"打包规则{i+1}: 失败 - {e}")
            summary = "\n".join(results)
            self.root.after(0, lambda: dlg.done())
            self.root.after(0, lambda: messagebox.showinfo("一键打包结果", summary))

        threading.Thread(target=worker, daemon=True).start()

    def _one_key_import(self):
        import_rules = self.config.get("import_rules", [])
        json_rules = self.config.get("json_rules", [])
        env_rules = self.config.get("env_rules", [])
        total_steps = len(import_rules) + len(json_rules) + len(env_rules)
        if total_steps == 0:
            messagebox.showinfo("提示", "没有任何导入/JSON/环境变量规则")
            return

        detail = []
        if import_rules:
            detail.append(f"  - 导入规则: {len(import_rules)} 条")
        if json_rules:
            detail.append(f"  - JSON规则: {len(json_rules)} 条")
        if env_rules:
            detail.append(f"  - 环境变量规则: {len(env_rules)} 条")
        msg = f"将执行以下规则:\n" + "\n".join(detail) + "\n\n是否继续？"
        if not messagebox.askokcancel("一键导入", msg):
            return

        dlg = ProgressDialog(self.root, "一键导入中...")

        def worker():
            results = []
            step = 0

            for i, rule in enumerate(import_rules):
                def on_progress(current, total, detail):
                    label = f"[{step+1}/{total_steps}] 导入规则{i+1} - {current}/{total}"
                    self.root.after(0, lambda l=label, c=current, t=total, d=detail:
                                    dlg.update_progress(c, t, f"{l}  {d}"))
                try:
                    msg = import_folder(rule.get("zip_path", ""), rule.get("target", ""),
                                        progress_callback=on_progress)
                    results.append(f"导入规则{i+1}: {msg}")
                except Exception as e:
                    results.append(f"导入规则{i+1}: 失败 - {e}")
                step += 1

            for i, rule in enumerate(json_rules):
                self.root.after(0, lambda s=step: dlg.update_progress(
                    s + 1, total_steps, f"JSON规则{i+1}: {rule.get('filepath', '')}"))
                try:
                    data = rule.get("data", {})
                    msg = execute_json_rule(rule.get("filepath", ""), rule.get("operation", ""), data)
                    results.append(f"JSON规则{i+1}: {msg}")
                except Exception as e:
                    results.append(f"JSON规则{i+1}: 失败 - {e}")
                step += 1

            for i, rule in enumerate(env_rules):
                self.root.after(0, lambda s=step: dlg.update_progress(
                    s + 1, total_steps, f"环境变量规则{i+1}: {rule.get('name', '')}"))
                try:
                    msg = execute_env_rule(rule.get("name", ""), rule.get("value", ""))
                    results.append(f"环境变量规则{i+1}: {msg}")
                except Exception as e:
                    results.append(f"环境变量规则{i+1}: 失败 - {e}")
                step += 1

            summary = "\n".join(results)
            self.root.after(0, lambda: dlg.done())
            self.root.after(0, lambda: messagebox.showinfo("一键导入结果", summary))

        threading.Thread(target=worker, daemon=True).start()
