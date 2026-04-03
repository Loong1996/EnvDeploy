import glob
import json
import os
import shutil
import sys
import tempfile
from datetime import datetime


def _app_dir():
    if getattr(sys, "frozen", False):
        return os.path.dirname(sys.executable)
    return os.path.dirname(os.path.abspath(__file__))


CONFIG_PATH = os.path.join(_app_dir(), "config.json")

DEFAULT_CONFIG = {
    "export_rules": [],
    "import_rules": [],
    "json_rules": [],
    "env_rules": [],
    "sync_profiles": [],
    "ui_state": {},
}


def load_config(path=None):
    path = path or CONFIG_PATH
    if not os.path.exists(path):
        return json.loads(json.dumps(DEFAULT_CONFIG))
    try:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
        for key, default in DEFAULT_CONFIG.items():
            if key not in data:
                data[key] = default if not isinstance(default, (list, dict)) else type(default)()
        return data
    except (json.JSONDecodeError, OSError):
        return json.loads(json.dumps(DEFAULT_CONFIG))


def save_config(data, path=None):
    path = path or CONFIG_PATH
    dir_name = os.path.dirname(path) or "."
    fd, tmp_path = tempfile.mkstemp(dir=dir_name, suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
        os.replace(tmp_path, path)
    except Exception:
        if os.path.exists(tmp_path):
            os.remove(tmp_path)
        raise


BACKUP_DIR = os.path.join(_app_dir(), "config_backups")
_BACKUP_MAX = 20


def backup_config(src_path=None):
    """将当前 config.json 备份到 config_backups/ 目录，保留最近 _BACKUP_MAX 份。
    返回备份文件路径。"""
    src_path = src_path or CONFIG_PATH
    if not os.path.exists(src_path):
        raise FileNotFoundError(f"config.json 不存在: {src_path}")
    os.makedirs(BACKUP_DIR, exist_ok=True)
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    dest = os.path.join(BACKUP_DIR, f"config_{ts}.json")
    shutil.copy2(src_path, dest)
    _trim_backups()
    return dest


def list_backups():
    """返回备份文件列表，按时间倒序（最新在前）。每项为 (显示名, 文件路径)。"""
    if not os.path.isdir(BACKUP_DIR):
        return []
    files = sorted(
        glob.glob(os.path.join(BACKUP_DIR, "config_*.json")),
        reverse=True,
    )
    result = []
    for f in files:
        name = os.path.basename(f)
        try:
            ts_str = name[len("config_"):-len(".json")]
            dt = datetime.strptime(ts_str, "%Y%m%d_%H%M%S")
            label = dt.strftime("%Y-%m-%d  %H:%M:%S")
        except ValueError:
            label = name
        result.append((label, f))
    return result


def restore_config(backup_path, dest_path=None):
    """将指定备份文件覆盖到 config.json，返回被替换前的旧配置内容（dict）。"""
    dest_path = dest_path or CONFIG_PATH
    old_data = load_config(dest_path)
    shutil.copy2(backup_path, dest_path)
    return old_data


def _trim_backups():
    """删除超出 _BACKUP_MAX 的旧备份。"""
    files = sorted(glob.glob(os.path.join(BACKUP_DIR, "config_*.json")))
    while len(files) > _BACKUP_MAX:
        os.remove(files.pop(0))
