import ctypes
import ctypes.wintypes


def check_admin():
    try:
        return ctypes.windll.shell32.IsUserAnAdmin() != 0
    except Exception:
        return False


def execute_env_rule(name, value):
    import winreg

    if not name or not name.strip():
        raise ValueError("变量名不能为空")

    if not check_admin():
        raise PermissionError("需要以管理员身份运行才能修改系统环境变量")

    env_key_path = r"SYSTEM\CurrentControlSet\Control\Session Manager\Environment"
    reg_type = winreg.REG_EXPAND_SZ if "%" in value else winreg.REG_SZ

    key = winreg.OpenKey(
        winreg.HKEY_LOCAL_MACHINE, env_key_path, 0, winreg.KEY_SET_VALUE
    )
    try:
        winreg.SetValueEx(key, name, 0, reg_type, value)
    finally:
        winreg.CloseKey(key)

    _broadcast_change()
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
