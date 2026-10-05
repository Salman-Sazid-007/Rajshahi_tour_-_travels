# -*- mode: python ; coding: utf-8 -*-
"""PyInstaller build: one folder with RajshahiTours.exe inside."""

import os
import sys

from PyInstaller.utils.hooks import collect_data_files

datas = [("assets", "assets")]
app_icon = (
    os.path.join(SPECPATH, "assets", "agency-app.ico")
    if sys.platform == "win32" else None
)

block_cipher = None

a = Analysis(
    ["app.py"],
    pathex=[],
    binaries=[],
    datas=datas,
    hiddenimports=["rtt.ui", "rtt.db", "rtt.documents", "rtt.pdf", "rtt.text", "rtt.ttf",
                   "rtt.config"],
    hookspath=[],
    runtime_hooks=[],
    excludes=["tkinter.test", "pytest", "PIL", "numpy"],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name="RajshahiTours",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=False,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    icon=app_icon,
)

coll = COLLECT(
    exe,
    a.binaries,
    a.zipfiles,
    a.datas,
    strip=False,
    upx=True,
    upx_exclude=[],
    name="RajshahiTours",
)
