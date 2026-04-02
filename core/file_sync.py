import os
import shutil


def sync_files(items, targets, progress_callback=None):
    """
    将 items 中的每个文件/文件夹同步到每个 target 目录下（合并覆盖）。

    items: list[dict] — [{"source": "/abs/path", "dest_rel": ".claude"}, ...]
    targets: list[str] — 目标工程根目录列表
    progress_callback: (current, total, detail) -> None
    返回: list[str] — 每个操作结果（✓/✗ 前缀）
    """
    results = []
    total = len(items) * len(targets)
    current = 0

    for item in items:
        source = item.get("source", "").strip()
        dest_rel = item.get("dest_rel", "").strip().lstrip("/\\")
        if not dest_rel:
            dest_rel = os.path.basename(source)

        for target in targets:
            current += 1
            detail = f"{os.path.basename(source)} -> {os.path.basename(target)}"
            if progress_callback:
                progress_callback(current, total, detail)

            if not source:
                results.append(f"✗ {detail}: 源路径为空")
                continue
            if not os.path.exists(source):
                results.append(f"✗ {detail}: 源路径不存在 ({source})")
                continue
            if not target:
                results.append(f"✗ {detail}: 目标工程路径为空")
                continue
            if not os.path.isdir(target):
                results.append(f"✗ {detail}: 目标工程目录不存在 ({target})")
                continue

            dest = os.path.join(target, dest_rel)

            try:
                if os.path.isdir(source):
                    os.makedirs(dest, exist_ok=True)
                    src_abs = os.path.normcase(os.path.abspath(source))
                    dest_abs = os.path.normcase(os.path.abspath(dest))
                    # 防止 dest 在 source 内部导致无限递归
                    if dest_abs.startswith(src_abs + os.sep) or dest_abs == src_abs:
                        results.append(f"✗ {detail}: 目标路径在源目录内部，跳过")
                        continue

                    def _ignore_dest(d, names, _dest=dest_abs):
                        skip = []
                        for n in names:
                            if os.path.normcase(os.path.abspath(os.path.join(d, n))) == _dest:
                                skip.append(n)
                        return skip

                    shutil.copytree(source, dest, dirs_exist_ok=True, ignore=_ignore_dest)
                    results.append(f"✓ {detail}: 文件夹同步完成")
                else:
                    parent = os.path.dirname(dest)
                    if parent:
                        os.makedirs(parent, exist_ok=True)
                    shutil.copy2(source, dest)
                    results.append(f"✓ {detail}: 文件同步完成")
            except Exception as e:
                results.append(f"✗ {detail}: 失败 - {e}")

    return results
