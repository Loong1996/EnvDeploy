import os
import shutil
import sys
import zipfile

from core.import_backup import backup_target_dir, backup_target_file


def _app_dir():
    if getattr(sys, "frozen", False):
        return os.path.dirname(sys.executable)
    return os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


APP_DIR = _app_dir()
PACKAGES_DIR = os.path.join(APP_DIR, "packages")


def get_packages_dir():
    os.makedirs(PACKAGES_DIR, exist_ok=True)
    return PACKAGES_DIR


def resolve_output_path(output_zip_path):
    if not os.path.isabs(output_zip_path):
        return os.path.normpath(os.path.join(PACKAGES_DIR, output_zip_path))
    return os.path.normpath(output_zip_path)


def _collect_files(source):
    if os.path.isfile(source):
        return [(source, os.path.basename(source))]
    files = []
    for root, dirs, filenames in os.walk(source):
        for f in filenames:
            abs_path = os.path.join(root, f)
            arc_name = os.path.relpath(abs_path, source)
            files.append((abs_path, arc_name))
    return files


def export_folder(source, output_zip_path, progress_callback=None):
    source = os.path.normpath(source)
    output_path = resolve_output_path(output_zip_path)

    if not os.path.exists(source):
        raise ValueError(f"源路径不存在: {source}")

    output_dir = os.path.dirname(output_path)
    if output_dir and not os.path.exists(output_dir):
        os.makedirs(output_dir, exist_ok=True)

    if not output_path.lower().endswith(".zip"):
        if not os.path.isfile(source):
            raise ValueError(f"非 zip 输出仅支持单文件源: {source}")
        shutil.copy2(source, output_path)
        if progress_callback:
            progress_callback(1, 1, os.path.basename(output_path))
        return f"已复制文件到 {output_path}"

    file_list = _collect_files(source)
    total = len(file_list)

    with zipfile.ZipFile(output_path, "w", zipfile.ZIP_DEFLATED) as zf:
        for i, (abs_path, arc_name) in enumerate(file_list):
            zf.write(abs_path, arc_name)
            if progress_callback:
                progress_callback(i + 1, total, arc_name)

    return f"已打包 {total} 个文件到 {output_path}"


def import_folder(zip_path, target_dir, progress_callback=None, backup=False, rename=""):
    src = resolve_output_path(zip_path)
    target_dir = os.path.normpath(target_dir)

    if not os.path.isfile(src):
        raise ValueError(f"源文件不存在: {src}")

    if not zipfile.is_zipfile(src):
        filename = rename.strip() if rename and rename.strip() else os.path.basename(src)
        os.makedirs(target_dir, exist_ok=True)
        dest = os.path.join(target_dir, filename)
        if os.path.exists(dest):
            if backup:
                backup_target_file(dest)
            elif os.path.isfile(dest):
                os.remove(dest)
            else:
                shutil.rmtree(dest)
        shutil.copy2(src, dest)
        if progress_callback:
            progress_callback(1, 1, filename)
        return f"已复制文件到 {dest}"

    if os.path.exists(target_dir):
        if backup:
            backup_target_dir(target_dir)
        else:
            shutil.rmtree(target_dir)

    os.makedirs(target_dir, exist_ok=True)

    with zipfile.ZipFile(src, "r") as zf:
        members = zf.namelist()
        total = len(members)
        for i, member in enumerate(members):
            zf.extract(member, target_dir)
            if progress_callback:
                progress_callback(i + 1, total, member)

    return f"已解压 {total} 个文件到 {target_dir}"
