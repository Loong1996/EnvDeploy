import os
import shutil
import sys
from datetime import datetime


def _app_dir():
    if getattr(sys, "frozen", False):
        return os.path.dirname(sys.executable)
    return os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


BACKUP_DIR = os.path.join(_app_dir(), "packages", "import_backups")
_BACKUP_MAX = 20


def backup_target_dir(target_dir):
    """若 target_dir 存在则移动到备份目录并返回备份路径；不存在返回 None。

    使用 shutil.move（同卷 rename，跨卷自动 copy+delete），移走后原位不存在，
    调用方可直接 makedirs 重建，无需再 rmtree。
    """
    if not os.path.exists(target_dir):
        return None
    os.makedirs(BACKUP_DIR, exist_ok=True)
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    name = f"{os.path.basename(os.path.normpath(target_dir))}_{ts}"
    dest = os.path.join(BACKUP_DIR, name)
    shutil.move(target_dir, dest)
    _trim_backups()
    return dest


def _trim_backups():
    if not os.path.isdir(BACKUP_DIR):
        return
    entries = sorted(
        [e for e in os.scandir(BACKUP_DIR) if e.is_dir()],
        key=lambda e: e.stat().st_mtime,
    )
    while len(entries) > _BACKUP_MAX:
        shutil.rmtree(entries.pop(0).path)
