#!/usr/bin/env python3
"""Rajshahi Tours & Travels - Booking & Receipt Manager.

Run from source with::

    python app.py

Or build a double-clickable program with PyInstaller (see build_windows.bat).
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))


def main() -> int:
    try:
        import tkinter  # noqa: F401
    except ImportError:
        sys.stderr.write(
            "This program needs Tkinter, which is part of the standard Python\n"
            "installation on Windows and macOS. On Linux install it with:\n"
            "    sudo apt install python3-tk\n"
        )
        return 1

    from rtt.ui import main as ui_main

    return ui_main()


if __name__ == "__main__":
    sys.exit(main())
