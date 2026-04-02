import ctypes
import ctypes.wintypes


def check_admin():
    try:
        return ctypes.windll.shell32.IsUserAnAdmin() != 0
    except Exception:
        return False


def _read_env_value(name):
    """读取当前系统环境变量的值"""
    import winreg
    env_key_path = r"SYSTEM\CurrentControlSet\Control\Session Manager\Environment"
    try:
        key = winreg.OpenKey(
            winreg.HKEY_LOCAL_MACHINE, env_key_path, 0, winreg.KEY_QUERY_VALUE
        )
        try:
            val, _ = winreg.QueryValueEx(key, name)
            return val
        finally:
            winreg.CloseKey(key)
    except FileNotFoundError:
        return ""


def execute_env_rule(name, value, operation="set"):
    """
    operation: "set" 直接设置, "append_path" 追加到PATH（去重）
    """
    import winreg

    if not name or not name.strip():
        raise ValueError("变量名不能为空")

    if not check_admin():
        raise PermissionError("需要以管理员身份运行才能修改系统环境变量")

    env_key_path = r"SYSTEM\CurrentControlSet\Control\Session Manager\Environment"

    if operation == "append_path":
        current = _read_env_value(name)
        paths = [p.strip() for p in current.split(";") if p.strip()] if current else []
        new_path = value.strip().rstrip("\\")
        # 去重（不区分大小写）
        if any(p.rstrip("\\").lower() == new_path.lower() for p in paths):
            _broadcast_change()
            return f"路径已存在于 {name} 中，无需重复添加: {new_path}"
        paths.append(new_path)
        final_value = ";".join(paths)
    else:
        final_value = value

    reg_type = winreg.REG_EXPAND_SZ if "%" in final_value else winreg.REG_SZ

    key = winreg.OpenKey(
        winreg.HKEY_LOCAL_MACHINE, env_key_path, 0, winreg.KEY_SET_VALUE
    )
    try:
        winreg.SetValueEx(key, name, 0, reg_type, final_value)
    finally:
        winreg.CloseKey(key)

    _broadcast_change()
    if operation == "append_path":
        return f"已追加路径到 {name}: {value}"
    return f"已设置环境变量 {name} = {value}"


def _broadcast_change():
    HWND_BROADCAST = 0xFFFF
    WM_SETTINGCHANGE = 0x001A
    SMTO_ABORTIFHUNG = 0x0002
    result = ctypes.c_long()
    ctypes.windll.user32.SendMessageTimeoutW(
        HWND_BROADCAST,
        WM_SETTINGCHANGE,
        0,
        "Environment",
        SMTO_ABORTIFHUNG,
        5000,
        ctypes.byref(result),
    )
