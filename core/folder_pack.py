import os
import shutil
import zipfile

APP_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PACKAGES_DIR = os.path.join(APP_DIR, "packages")


def get_packages_dir():
    os.makedirs(PACKAGES_DIR, exist_ok=True)
    return PACKAGES_DIR


def export_folder(source, output_zip_path):
    source = os.path.normpath(source)
    output_zip_path = os.path.normpath(output_zip_path)

    if not os.path.exists(source):
        raise ValueError(f"源路径不存在: {source}")

    output_dir = os.path.dirname(output_zip_path)
    if output_dir and not os.path.exists(output_dir):
        os.makedirs(output_dir, exist_ok=True)

    file_count = 0
    with zipfile.ZipFile(output_zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
        if os.path.isfile(source):
            zf.write(source, os.path.basename(source))
            file_count = 1
        else:
            for root, dirs, files in os.walk(source):
                for file in files:
                    abs_path = os.path.join(root, file)
                    arc_name = os.path.relpath(abs_path, source)
                    zf.write(abs_path, arc_name)
                    file_count += 1

    return f"已打包 {file_count} 个文件到 {output_zip_path}"


def import_folder(zip_path, target_dir):
    zip_path = os.path.normpath(zip_path)
    target_dir = os.path.normpath(target_dir)

    if not os.path.isfile(zip_path):
        raise ValueError(f"zip文件不存在: {zip_path}")

    if not zipfile.is_zipfile(zip_path):
        raise ValueError(f"不是有效的zip文件: {zip_path}")

    if os.path.exists(target_dir):
        shutil.rmtree(target_dir)

    os.makedirs(target_dir, exist_ok=True)

    with zipfile.ZipFile(zip_path, "r") as zf:
        zf.extractall(target_dir)
        file_count = len(zf.namelist())

    return f"已解压 {file_count} 个文件到 {target_dir}"
