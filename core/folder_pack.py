import os
import shutil
import zipfile
import tempfile


def export_folder(source_dir, output_zip_path):
    source_dir = os.path.normpath(source_dir)
    output_zip_path = os.path.normpath(output_zip_path)

    if not os.path.isdir(source_dir):
        raise ValueError(f"源文件夹不存在: {source_dir}")

    output_dir = os.path.dirname(output_zip_path)
    if output_dir and not os.path.exists(output_dir):
        os.makedirs(output_dir, exist_ok=True)

    file_count = 0
    with zipfile.ZipFile(output_zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
        for root, dirs, files in os.walk(source_dir):
            for file in files:
                abs_path = os.path.join(root, file)
                arc_name = os.path.relpath(abs_path, source_dir)
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
