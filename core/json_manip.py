import json
import os
import shutil


def _deep_merge(base, overlay):
    """递归合并 overlay 到 base，对嵌套 dict 逐层合并而非整体替换。"""
    result = dict(base)
    for k, v in overlay.items():
        if k in result and isinstance(result[k], dict) and isinstance(v, dict):
            result[k] = _deep_merge(result[k], v)
        else:
            result[k] = v
    return result


def execute_json_rule(filepath, operation, data):
    filepath = os.path.normpath(filepath)

    if isinstance(data, str):
        try:
            data = json.loads(data)
        except json.JSONDecodeError as e:
            raise ValueError(f"JSON数据格式错误: {e}")

    if operation == "overwrite":
        dir_name = os.path.dirname(filepath)
        if dir_name and not os.path.exists(dir_name):
            os.makedirs(dir_name, exist_ok=True)
        if os.path.exists(filepath):
            shutil.copy2(filepath, filepath + ".bak")
        with open(filepath, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
        return f"已全量覆盖 {filepath}"

    if not os.path.isfile(filepath):
        raise FileNotFoundError(f"文件不存在: {filepath}")

    with open(filepath, "r", encoding="utf-8") as f:
        existing = json.load(f)

    if not isinstance(existing, dict):
        raise ValueError(f"JSON文件顶层不是对象: {filepath}")

    if not isinstance(data, dict):
        raise ValueError("append/modify 操作的数据必须是JSON对象")

    shutil.copy2(filepath, filepath + ".bak")

    if operation == "append":
        conflicts = [k for k in data if k in existing]
        if conflicts:
            raise ValueError(f"以下key已存在，无法追加: {', '.join(conflicts)}")
        existing = _deep_merge(existing, data)
        msg = f"已追加 {len(data)} 个key到 {filepath}"

    elif operation == "modify":
        missing = [k for k in data if k not in existing]
        if missing:
            raise ValueError(f"以下key不存在，无法修改: {', '.join(missing)}")
        existing = _deep_merge(existing, data)
        msg = f"已修改 {len(data)} 个key在 {filepath}"

    elif operation == "upsert":
        added = [k for k in data if k not in existing]
        modified = [k for k in data if k in existing]
        existing = _deep_merge(existing, data)
        parts = []
        if added:
            parts.append(f"新增 {len(added)} 个key")
        if modified:
            parts.append(f"修改 {len(modified)} 个key")
        msg = f"已{'、'.join(parts)}在 {filepath}"

    else:
        raise ValueError(f"未知操作: {operation}")

    with open(filepath, "w", encoding="utf-8") as f:
        json.dump(existing, f, indent=2, ensure_ascii=False)

    return msg
