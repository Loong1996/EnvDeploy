import tkinter as tk
from tkinter import ttk
from config import load_config, save_config
from ui.tab_folder import TabFolder
from ui.tab_json import TabJson
from ui.tab_envvar import TabEnvVar


class App:
    def __init__(self, root):
        self.root = root
        self.root.title("Deploy & Config Tool")
        self.root.geometry("900x620")
        self.root.minsize(700, 500)

        style = ttk.Style()
        style.theme_use("clam")

        self.config = load_config()

        notebook = ttk.Notebook(self.root)
        notebook.pack(fill="both", expand=True, padx=5, pady=5)

        self.tab_folder = TabFolder(notebook, self.config, self._save)
        self.tab_json = TabJson(notebook, self.config, self._save)
        self.tab_envvar = TabEnvVar(notebook, self.config, self._save)

        notebook.add(self.tab_folder, text="  文件夹打包/导入  ")
        notebook.add(self.tab_json, text="  JSON操作  ")
        notebook.add(self.tab_envvar, text="  环境变量  ")

    def _save(self):
        save_config(self.config)
