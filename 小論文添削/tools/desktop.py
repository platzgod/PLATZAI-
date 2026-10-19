"""作ったファイルをデスクトップの「AI自動添削_納品物」フォルダにもコピーする。

使い方:
    python tools/desktop.py <ファイル> [<ファイル> ...]

make_docx.py は Word を作るたびに自動でこれを呼ぶ。ワークシートなど、ほかに作ったものは Claude がこれで保存する。
デスクトップの場所は Windows に問い合わせて決める（OneDrive でデスクトップを同期している場合も正しい場所になる）。
デスクトップが見つからない環境（クラウドなど）では何もしない。
"""

import os
import shutil
import sys
from pathlib import Path

FOLDER_NAME = "AI自動添削_納品物"


def desktop_dir():
    if os.name == "nt":
        try:
            import ctypes
            from ctypes import wintypes

            class GUID(ctypes.Structure):
                _fields_ = [("Data1", wintypes.DWORD), ("Data2", wintypes.WORD),
                            ("Data3", wintypes.WORD), ("Data4", ctypes.c_ubyte * 8)]

            # FOLDERID_Desktop {B4BFCC3A-DB2C-424C-B029-7FE99A87C641}
            fid = GUID(0xB4BFCC3A, 0xDB2C, 0x424C,
                       (ctypes.c_ubyte * 8)(0xB0, 0x29, 0x7F, 0xE9, 0x9A, 0x87, 0xC6, 0x41))
            buf = ctypes.c_wchar_p()
            if ctypes.windll.shell32.SHGetKnownFolderPath(ctypes.byref(fid), 0, None, ctypes.byref(buf)) == 0:
                path = Path(buf.value)
                ctypes.windll.ole32.CoTaskMemFree(buf)
                return path
        except Exception:
            pass
    path = Path.home() / "Desktop"
    return path if path.is_dir() else None


def save(*files):
    """ファイルをデスクトップの納品物フォルダにコピーし、コピー先を返す。デスクトップが無ければ空リスト。"""
    base = desktop_dir()
    if base is None:
        return []
    dst = base / FOLDER_NAME
    dst.mkdir(parents=True, exist_ok=True)
    out = []
    for f in files:
        f = Path(f)
        target = dst / f.name
        shutil.copy2(f, target)
        out.append(target)
    return out


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    saved = save(*sys.argv[1:])
    if not saved:
        print("デスクトップが見つからないため、コピーしませんでした。")
    for s in saved:
        print(f"デスクトップに保存しました: {s}")
