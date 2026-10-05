"""Desktop UI for the Rajshahi Tours & Travels booking manager.

Plain Tkinter/ttk: everything ships with CPython on Windows and macOS, so the
program runs from a double click after a PyInstaller build (or ``python app.py``
from source) without installing anything else.
"""

from __future__ import annotations

import calendar
import datetime as _dt
import os
import subprocess
import sys
import tkinter as tk
from tkinter import filedialog, messagebox, ttk
from typing import Any, Dict, List, Optional

from . import config, db, documents
from .config import money, parse_date

SIDEBAR_BG = "#073e4d"
SIDEBAR_DEEP = "#085366"
ACCENT = "#22b4b3"  # supplied brand teal
ACCENT_DARK = "#073e4d"
ACCENT_SOFT = "#d9f3f5"
PAGE_BG = "#f0fafb"
WHITE = "#ffffff"
INK = "#000000"  # supplied brand black
MUTED = "#647b84"
ORANGE = "#f97000"  # supplied primary orange
ORANGE_LIGHT = "#ee8625"  # supplied secondary orange
DANGER = "#b3261e"
OK = "#0f7b52"


def _pick_font(*candidates: str) -> str:
    try:
        import tkinter.font as tkfont

        available = set(tkfont.families())
    except Exception:
        return candidates[0]
    for name in candidates:
        if name in available:
            return name
    return candidates[-1]


class ScrollableFormPanel(ttk.Frame):
    """A fixed-width form card with its own vertical scrolling viewport."""

    def __init__(self, master, width: int = 430, card_width: int = 410) -> None:
        super().__init__(master, width=width, style="Page.TFrame")
        self.grid_propagate(False)
        self.rowconfigure(0, weight=1)
        self.columnconfigure(0, weight=1)
        self.canvas = tk.Canvas(self, background=PAGE_BG, highlightthickness=0, borderwidth=0)
        self.canvas.grid(row=0, column=0, sticky="nsew")
        self.scrollbar = ttk.Scrollbar(self, orient="vertical", command=self.canvas.yview)
        self.scrollbar.grid(row=0, column=1, sticky="ns")
        self.canvas.configure(yscrollcommand=self.scrollbar.set)
        self.content = ttk.Frame(self.canvas, style="Page.TFrame")
        self.content.columnconfigure(0, weight=1)
        self.window_id = self.canvas.create_window((0, 0), window=self.content, anchor="nw")
        self.content.bind("<Configure>", self._update_scrollregion)
        self.canvas.bind("<Configure>", self._fit_content)
        self.canvas.bind("<MouseWheel>", self._on_mousewheel)
        self.card = ttk.Frame(self.content, width=card_width, style="Card.TFrame", padding=14)
        self.card.grid(row=0, column=0, sticky="ew")

    def _update_scrollregion(self, _event=None) -> None:
        self.canvas.configure(scrollregion=self.canvas.bbox("all"))

    def _fit_content(self, event) -> None:
        self.canvas.itemconfigure(self.window_id, width=event.width)

    def _on_mousewheel(self, event):
        delta = int(getattr(event, "delta", 0) or 0)
        if delta:
            self.canvas.yview_scroll(-int(delta / 120), "units")
            return "break"
        return None


class PageStack(ttk.Frame):
    """Stacked pages with a Notebook-like API, navigated by the app sidebar."""

    def __init__(self, master, **options) -> None:
        super().__init__(master, **options)
        self.rowconfigure(0, weight=1)
        self.columnconfigure(0, weight=1)
        self._pages: List[tuple] = []
        self._selected_index: Optional[int] = None
        self._callbacks: Dict[str, List[Any]] = {}

    def add(self, child, text: str = "") -> None:
        child.grid(row=0, column=0, sticky="nsew")
        self._pages.append((child, {"text": text}))
        if self._selected_index is None:
            self._selected_index = 0
            child.tkraise()

    def bind(self, sequence: str, callback, add=None):
        self._callbacks.setdefault(sequence, []).append(callback)
        return f"pagestack{len(self._callbacks[sequence])}"

    def select(self, item=None) -> str:
        if item is None:
            return str(self._selected_index) if self._selected_index is not None else ""
        index = None
        for position, (child, options) in enumerate(self._pages):
            if item is child or str(item) == str(position) or item == options.get("text"):
                index = position
                break
        if index is None:
            return self.select()
        changed = index != self._selected_index
        self._selected_index = index
        self._pages[index][0].tkraise()
        if changed:
            for callback in tuple(self._callbacks.get("<<NotebookTabChanged>>", ())):
                callback(None)
        return str(index)

    def tab(self, item, option: str = ""):
        try:
            index = int(item)
            value = self._pages[index][1]
        except (ValueError, TypeError, IndexError):
            value = next((options for child, options in self._pages if child is item), {})
        return value.get(option) if option else value


class DatePicker(tk.Toplevel):
    """Small month calendar used by the date fields."""

    def __init__(self, master, initial: Optional[_dt.date] = None, on_pick=None) -> None:
        super().__init__(master)
        self.on_pick = on_pick
        self.date = initial or _dt.date.today()
        self.title("Pick a date")
        self.transient(master)
        self.resizable(False, False)
        self.configure(padx=8, pady=8)
        self.grab_set()

        header = ttk.Frame(self)
        header.grid(row=0, column=0, columnspan=7, sticky="ew", pady=(0, 6))
        ttk.Button(header, text="<", width=3, command=self.prev_month).pack(side="left")
        self.title_var = tk.StringVar()
        ttk.Label(header, textvariable=self.title_var, anchor="center", width=16).pack(
            side="left", expand=True
        )
        ttk.Button(header, text=">", width=3, command=self.next_month).pack(side="right")

        self.cells: List[ttk.Button] = []
        for index, label in enumerate(["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"]):
            ttk.Label(self, text=label, width=4, anchor="center").grid(row=1, column=index)
        for row in range(6):
            for column in range(7):
                button = ttk.Button(self, width=4, command=lambda r=row, c=column: self.pick(r, c))
                button.grid(row=row + 2, column=column)
                self.cells.append(button)

        footer = ttk.Frame(self)
        footer.grid(row=8, column=0, columnspan=7, pady=(8, 0), sticky="ew")
        ttk.Button(footer, text="Today", command=self.pick_today).pack(side="left")
        ttk.Button(footer, text="Clear", command=self.pick_clear).pack(side="right")
        self.render()

    def render(self) -> None:
        self.title_var.set(self.date.strftime("%B %Y"))
        month = calendar.monthcalendar(self.date.year, self.date.month)
        today = _dt.date.today()
        for index, button in enumerate(self.cells):
            row, column = divmod(index, 7)
            day = month[row][column] if row < len(month) else 0
            if day:
                button.configure(text=str(day), state="normal")
            else:
                button.configure(text="", state="disabled")

    def prev_month(self) -> None:
        self.date = (self.date.replace(day=1) - _dt.timedelta(days=1)).replace(day=1)
        self.render()

    def next_month(self) -> None:
        next_month = (self.date.replace(day=28) + _dt.timedelta(days=7)).replace(day=1)
        self.date = next_month
        self.render()

    def pick(self, row: int, column: int) -> None:
        month = calendar.monthcalendar(self.date.year, self.date.month)
        day = month[row][column]
        if not day:
            return
        self.finish(_dt.date(self.date.year, self.date.month, day))

    def pick_today(self) -> None:
        self.finish(_dt.date.today())

    def pick_clear(self) -> None:
        self.finish(None)

    def finish(self, value: Optional[_dt.date]) -> None:
        self.grab_release()
        self.destroy()
        if self.on_pick:
            self.on_pick(value)


class BookingApp:
    def __init__(self, root: tk.Tk, database: "db.Database", settings: Dict[str, Any]) -> None:
        self.root = root
        self._set_window_icon()
        self.db = database
        self.settings = settings
        self.selected_id: Optional[int] = None
        self.selected_tour_catalog_id: Optional[int] = None
        self.bus_selected_id: Optional[int] = None
        self._auto_booking_number = ""
        self.sort_column = "booking_date"
        self.sort_desc = True
        self.rows: List[Dict[str, Any]] = []
        self.bus_rows: List[Dict[str, Any]] = []
        self.month_rows: List[Dict[str, Any]] = []
        self.currency = str(settings.get("currency", "Tk."))
        self.search_entry: Optional[ttk.Entry] = None
        self.tour_combo: Optional[ttk.Combobox] = None
        # Carry forward custom tour names saved by older versions' Settings
        # dialog, without silently reactivating tours the owner has archived.
        known = {str(tour["name"]).casefold() for tour in self.db.tour_catalog(include_inactive=True)}
        for tour_name in settings.get("tour_suggestions") or ():
            name = str(tour_name).strip()
            if name and name.casefold() not in known:
                try:
                    self.db.add_tour(name, 40)
                    known.add(name.casefold())
                except ValueError:
                    pass

        self.ui_font = _pick_font("Segoe UI", "Helvetica Neue", "DejaVu Sans", "TkDefaultFont")
        self.ui_font_bold = (self.ui_font, 11, "bold")

        self._build_style()
        self._build_layout()
        self._bind_keys()
        self.refresh()

    # ---------------------------------------------------------------- setup

    def _set_window_icon(self) -> None:
        """Apply the supplied company mark to the app window and task switcher."""
        icon_png = config.asset_path("agency-app-icon.png")
        try:
            self.window_icon_photo = tk.PhotoImage(master=self.root, file=icon_png)
            self.root.iconphoto(True, self.window_icon_photo)
        except (AttributeError, OSError, tk.TclError):
            self.window_icon_photo = None
            try:
                self.root.iconbitmap(default=config.asset_path("agency-app.ico"))
            except (AttributeError, OSError, tk.TclError):
                pass

    def _build_style(self) -> None:
        style = ttk.Style()
        for theme in ("clam", "vista", "default"):
            try:
                style.theme_use(theme)
                break
            except tk.TclError:
                continue
        style.configure(".", font=(self.ui_font, 11), foreground=INK)
        style.configure("Input.TEntry", font=(self.ui_font, 12), padding=(10, 8))
        style.configure("Input.TCombobox", font=(self.ui_font, 12), padding=(10, 8))
        style.configure("TFrame", background=PAGE_BG)
        style.configure("Page.TFrame", background=PAGE_BG)
        style.configure("Topbar.TFrame", background=WHITE)
        style.configure("Footer.TFrame", background=WHITE)
        style.configure("Sidebar.TFrame", background=SIDEBAR_BG)
        style.configure("SidebarBrand.TFrame", background=SIDEBAR_BG)
        style.configure("SidebarCard.TFrame", background=SIDEBAR_DEEP)
        style.configure("Card.TFrame", background=WHITE, relief="flat")
        style.configure("Title.TLabel", font=(self.ui_font, 20, "bold"), foreground=INK,
                        background=WHITE)
        style.configure("PageTitle.TLabel", font=(self.ui_font, 19, "bold"), foreground=INK,
                        background=PAGE_BG)
        style.configure("Sub.TLabel", font=(self.ui_font, 10), foreground=MUTED,
                        background=PAGE_BG)
        style.configure("Topbar.Sub.TLabel", font=(self.ui_font, 10, "bold"), foreground=ACCENT,
                        background=WHITE)
        style.configure("Topbar.PageTitle.TLabel", font=(self.ui_font, 18, "bold"),
                        foreground=INK, background=WHITE)
        style.configure("Topbar.Description.TLabel", font=(self.ui_font, 10),
                        foreground=MUTED, background=WHITE)
        style.configure("Sidebar.Brand.TLabel", font=(self.ui_font, 11, "bold"),
                        foreground=WHITE, background=SIDEBAR_BG)
        style.configure("Sidebar.Sub.TLabel", font=(self.ui_font, 10, "bold"),
                        foreground="#80dce2", background=SIDEBAR_BG)
        style.configure("Sidebar.Eyebrow.TLabel", font=(self.ui_font, 10, "bold"),
                        foreground="#ffcc83", background=SIDEBAR_BG)
        style.configure("Sidebar.Muted.TLabel", font=(self.ui_font, 10),
                        foreground="#b3e9ed", background=SIDEBAR_BG)
        style.configure("Sidebar.Section.TLabel", font=(self.ui_font, 10, "bold"),
                        foreground="#80dce2", background=SIDEBAR_BG)
        style.configure("SidebarNav.TButton", font=(self.ui_font, 10, "bold"),
                        padding=(12, 11), anchor="w", foreground="#d9f3f5",
                        background=SIDEBAR_BG, relief="flat", borderwidth=0)
        style.map("SidebarNav.TButton", background=[("active", "#086a7d")],
                  foreground=[("active", WHITE)])
        style.configure("SidebarSelected.TButton", font=(self.ui_font, 10, "bold"),
                        padding=(12, 11), anchor="w", foreground=INK,
                        background=ORANGE_LIGHT, relief="flat", borderwidth=0)
        style.map("SidebarSelected.TButton", background=[("active", "#ffcc83")])
        style.configure("Offline.TLabel", font=(self.ui_font, 10, "bold"),
                        foreground="#24745e", background="#e6f4ec", padding=(9, 5))
        style.configure("Field.TLabel", font=(self.ui_font, 11, "bold"), foreground="#385158",
                        background=WHITE)
        style.configure("Card.TLabel", font=(self.ui_font, 11, "bold"), foreground=ACCENT_DARK,
                        background=WHITE)
        style.configure("Header.TLabel", font=(self.ui_font, 13, "bold"), foreground=ACCENT_DARK,
                        background=WHITE)
        style.configure("Muted.TLabel", font=(self.ui_font, 10), foreground=MUTED,
                        background=WHITE)
        style.configure("Accent.TButton", font=(self.ui_font, 10, "bold"), padding=(13, 8),
                        foreground=WHITE, background=ACCENT)
        style.map("Accent.TButton", background=[("active", ACCENT_DARK), ("disabled", "#9bbfc0")],
                  foreground=[("disabled", "#f5f7f8")])
        style.configure("Secondary.TButton", font=(self.ui_font, 10, "bold"), padding=(11, 7),
                        foreground=ACCENT_DARK, background=ACCENT_SOFT)
        style.map("Secondary.TButton", background=[("active", ACCENT_SOFT)])
        style.configure("Danger.TButton", font=(self.ui_font, 10, "bold"), padding=(11, 7),
                        foreground=WHITE, background=DANGER)
        style.configure("Treeview", font=(self.ui_font, 10), rowheight=36,
                        background=WHITE, fieldbackground=WHITE, foreground=INK, borderwidth=0)
        style.configure("Treeview.Heading", font=(self.ui_font, 10, "bold"),
                        background=PAGE_BG, foreground=ACCENT_DARK, relief="flat", padding=(10, 9))
        style.map("Treeview", background=[("selected", ACCENT_SOFT)],
                  foreground=[("selected", ACCENT_DARK)])
        style.configure("Seat.TButton", font=(self.ui_font, 10, "bold"), padding=(6, 6),
                        foreground=ACCENT_DARK, background=WHITE)
        style.configure("SelectedSeat.TButton", font=(self.ui_font, 10, "bold"), padding=(6, 6),
                        foreground=WHITE, background=ACCENT)
        style.configure("BookedSeat.TButton", font=(self.ui_font, 10, "bold"), padding=(6, 6),
                        foreground="#6a777a", background="#e4e9e9")
        self.root.configure(background=PAGE_BG)

    def _build_layout(self) -> None:
        self.root.title(f"{config.APP_TITLE} - {config.APP_SUBTITLE}")
        geometry = str(self.settings.get("window_geometry") or "1340x860")
        self.root.geometry(geometry)
        self.root.minsize(1120, 720)
        self.root.protocol("WM_DELETE_WINDOW", self.on_close)

        shell = ttk.Frame(self.root, style="Page.TFrame")
        shell.pack(fill="both", expand=True)
        shell.columnconfigure(1, weight=1)
        shell.rowconfigure(0, weight=1)
        self.sidebar = ttk.Frame(shell, width=244, style="Sidebar.TFrame")
        self.sidebar.grid(row=0, column=0, sticky="ns")
        self.sidebar.grid_propagate(False)
        self.main_container = ttk.Frame(shell, style="Page.TFrame")
        self.main_container.grid(row=0, column=1, sticky="nsew")
        self.main_container.columnconfigure(0, weight=1)
        self.main_container.rowconfigure(2, weight=1)

        topbar = ttk.Frame(self.main_container, style="Topbar.TFrame", padding=(20, 13, 20, 12))
        topbar.grid(row=0, column=0, sticky="ew")
        topbar.columnconfigure(0, weight=1)
        page_heading = ttk.Frame(topbar, style="Topbar.TFrame")
        page_heading.grid(row=0, column=0, sticky="w")
        self.page_title_var = tk.StringVar(value="Overview")
        self.page_subtitle_var = tk.StringVar(value="Tour departures, seats and payments — stored locally.")
        ttk.Label(page_heading, textvariable=self.page_title_var,
                  style="Topbar.PageTitle.TLabel").pack(anchor="w")
        ttk.Label(page_heading, textvariable=self.page_subtitle_var,
                  style="Topbar.Description.TLabel").pack(anchor="w", pady=(2, 0))

        actions = ttk.Frame(topbar, style="Topbar.TFrame")
        actions.grid(row=0, column=1, sticky="e", padx=(16, 0))
        ttk.Label(actions, text="●  OFFLINE", style="Offline.TLabel").pack(side="left", padx=(0, 9))
        ttk.Button(actions, text="＋ Tour booking", style="Accent.TButton",
                   command=self.start_tour_booking).pack(side="left", padx=(0, 7))
        ttk.Button(actions, text="＋ Bus ticket", style="Secondary.TButton",
                   command=self.start_bus_ticket).pack(side="left")

        ttk.Separator(self.main_container, orient="horizontal").grid(row=1, column=0, sticky="ew")
        content = ttk.Frame(self.main_container, padding=(12, 12, 12, 8), style="Page.TFrame")
        content.grid(row=2, column=0, sticky="nsew")
        self.notebook = PageStack(content, style="Page.TFrame")
        self.notebook.pack(fill="both", expand=True)

        self.dashboard_page = ttk.Frame(self.notebook, padding=14, style="Page.TFrame")
        self.tour_page = ttk.Frame(self.notebook, padding=12, style="Page.TFrame")
        self.bus_page = ttk.Frame(self.notebook, padding=12, style="Page.TFrame")
        self.reports_page = ttk.Frame(self.notebook, padding=12, style="Page.TFrame")
        self.notebook.add(self.dashboard_page, text="Overview")
        self.notebook.add(self.tour_page, text="Tour bookings")
        self.notebook.add(self.bus_page, text="Bus tickets")
        self.notebook.add(self.reports_page, text="Tours & monthly reports")
        self.page_by_title = {
            "Overview": self.dashboard_page,
            "Tour bookings": self.tour_page,
            "Bus tickets": self.bus_page,
            "Tours & monthly reports": self.reports_page,
        }

        self.tour_page.columnconfigure(0, weight=1)
        self.tour_page.rowconfigure(0, weight=1)
        self.tour_body = ttk.Frame(self.tour_page, style="Page.TFrame")
        self.tour_body.grid(row=0, column=0, sticky="nsew")
        self.tour_body.columnconfigure(1, weight=1)
        self.tour_body.rowconfigure(0, weight=1)
        self._build_dashboard_page(self.dashboard_page)
        self._build_form(self.tour_body)
        self._build_table(self.tour_body)
        self._build_bus_page(self.bus_page)
        self._build_tours_reports_page(self.reports_page)
        self._build_sidebar(self.sidebar)
        self.notebook.bind("<<NotebookTabChanged>>", self.on_page_changed)

        self._build_status(self.main_container)
        self._build_menu()
        self.on_page_changed()

    def _build_sidebar(self, parent: ttk.Frame) -> None:
        brand = ttk.Frame(parent, style="SidebarBrand.TFrame", padding=(12, 13, 12, 13))
        brand.pack(fill="x")
        brand.columnconfigure(0, weight=1)
        self._draw_brand_mark(brand)
        self.header_company_label = ttk.Label(
            brand, text=str(self.settings.get("company_name") or config.APP_TITLE),
            style="Sidebar.Brand.TLabel", wraplength=214, justify="center", anchor="center")
        self.header_company_label.pack(fill="x", pady=(8, 0))
        ttk.Label(brand, text="OFFLINE COUNTER DESK", style="Sidebar.Eyebrow.TLabel").pack(
            anchor="center", pady=(5, 0))
        ttk.Separator(parent, orient="horizontal").pack(fill="x", padx=14)

        nav_section = ttk.Frame(parent, style="Sidebar.TFrame", padding=(12, 15, 12, 0))
        nav_section.pack(fill="x")
        ttk.Label(nav_section, text="WORKSPACE", style="Sidebar.Section.TLabel").pack(
            anchor="w", padx=(8, 0), pady=(0, 7))
        self.nav_buttons: Dict[str, ttk.Button] = {}
        nav_items = (
            ("Overview", "▦   Overview"),
            ("Tour bookings", "▣   Tour bookings"),
            ("Bus tickets", "⇄   Bus tickets"),
            ("Tours & monthly reports", "▤   Tours & reports"),
        )
        for title, label in nav_items:
            button = ttk.Button(
                nav_section, text=label, style="SidebarNav.TButton",
                command=lambda selected=title: self.navigate_to(selected),
            )
            button.pack(fill="x", pady=2)
            self.nav_buttons[title] = button

        footer = ttk.Frame(parent, style="Sidebar.TFrame", padding=(13, 12, 13, 16))
        footer.pack(side="bottom", fill="x")
        ttk.Separator(footer, orient="horizontal").pack(fill="x", pady=(0, 12))
        owner_card = ttk.Frame(footer, style="SidebarCard.TFrame", padding=(12, 10))
        owner_card.pack(fill="x")
        ttk.Label(owner_card, text="OWNER / PROPRIETOR", style="Sidebar.Eyebrow.TLabel").pack(
            anchor="w")
        self.header_owner_label = ttk.Label(
            owner_card, text=str(self.settings.get("owner_name") or "Safayet Hossain"),
            font=(self.ui_font, 10, "bold"), foreground=WHITE, background=SIDEBAR_DEEP)
        self.header_owner_label.pack(anchor="w", pady=(4, 1))
        self.header_owner_phone_label = ttk.Label(
            owner_card, text=str(self.settings.get("owner_phone") or self.settings.get("phone", "")),
            font=(self.ui_font, 10), foreground="#b3e9ed", background=SIDEBAR_DEEP)
        self.header_owner_phone_label.pack(anchor="w")
        ttk.Label(footer, text="●  LOCAL DATABASE  ·  NO SYNC", style="Sidebar.Muted.TLabel").pack(
            anchor="center", pady=(12, 4))
        ttk.Label(footer, text=f"Version {config.APP_VERSION}", style="Sidebar.Muted.TLabel").pack(
            anchor="center")

    def _draw_brand_mark(self, parent: ttk.Frame) -> None:
        """Show the supplied full company logo, with a vector fallback."""
        try:
            self.brand_logo_photo = tk.PhotoImage(
                master=self.root, file=config.asset_path("agency-logo-sidebar.png"))
            self.brand_logo_label = ttk.Label(
                parent, image=self.brand_logo_photo, background=SIDEBAR_BG)
            self.brand_logo_label.pack(anchor="center")
            return
        except (AttributeError, OSError, tk.TclError):
            pass

        try:
            mark = tk.Canvas(parent, width=62, height=62, background=SIDEBAR_BG,
                             highlightthickness=0, borderwidth=0)
            mark.pack(anchor="center")
            mark.create_polygon(5, 49, 1, 37, 6, 23, 18, 12, 37, 8, 51, 10,
                                35, 14, 20, 21, 11, 34, 8, 47, smooth=True,
                                splinesteps=18, fill="#22b4b3", outline="")
            mark.create_polygon(11, 55, 7, 46, 11, 35, 21, 25, 36, 20, 45, 21,
                                31, 27, 21, 36, 15, 47, smooth=True,
                                splinesteps=18, fill="#22b4b3", outline="")
            mark.create_polygon(16, 58, 11, 51, 13, 43, 19, 37, 26, 34, 22, 44,
                                24, 51, 31, 55, smooth=True, splinesteps=18,
                                fill="#ee8625", outline="")
            mark.create_polygon(26, 13, 45, 14, 45, 7, 50, 11, 52, 22, 60, 27,
                                59, 31, 47, 28, 43, 42, 39, 40, 40, 26, 25, 22,
                                fill="#22b4b3", outline="")
            mark.create_polygon(39, 47, 59, 35, 53, 53, 49, 48, 44, 53, 44, 46,
                                fill="#f97000", outline="")
        except (AttributeError, tk.TclError):
            ttk.Label(parent, text="RTT", font=(self.ui_font, 12, "bold"),
                      foreground=ORANGE, background=SIDEBAR_BG).pack(anchor="center")

    def navigate_to(self, title: str) -> None:
        page = self.page_by_title.get(title)
        if page is not None:
            self.notebook.select(page)

    def on_page_changed(self, event=None) -> None:
        try:
            page = self.notebook.tab(self.notebook.select(), "text")
        except Exception:
            page = ""
        descriptions = {
            "Overview": "Tour departures, seats and payments — stored locally on this computer.",
            "Tour bookings": "Assign open seats by tour and travel date; keep customer payments current.",
            "Bus tickets": "Issue offline counter tickets for any route and travel date.",
            "Tours & monthly reports": "Manage tours and capacity, then export a clean monthly travel sheet.",
        }
        if page:
            self.page_title_var.set(page)
            self.page_subtitle_var.set(descriptions.get(page, "Local counter management"))
        for title, button in self.nav_buttons.items():
            button.configure(style="SidebarSelected.TButton" if title == page else "SidebarNav.TButton")
        if page == "Overview":
            self.refresh_dashboard()
        elif page == "Tour bookings":
            self.refresh()
        elif page == "Bus tickets":
            self.refresh_bus_tickets()
        elif page == "Tours & monthly reports":
            self.refresh_tour_catalog()
            self.refresh_month_report()

    def _build_dashboard_page(self, parent: ttk.Frame) -> None:
        parent.columnconfigure(0, weight=1)
        parent.rowconfigure(1, weight=1)
        metrics = ttk.Frame(parent, style="Page.TFrame")
        metrics.grid(row=0, column=0, sticky="ew", pady=(0, 14))
        for column in range(4):
            metrics.columnconfigure(column, weight=1, uniform="metric")
        self.dashboard_values = {
            "month_bookings": tk.StringVar(value="0"),
            "seats_sold": tk.StringVar(value="0"),
            "due": tk.StringVar(value="0.00"),
            "bus_tickets": tk.StringVar(value="0"),
        }
        cards = [
            ("Tour bookings this month", "month_bookings", ACCENT, "Customer reservations"),
            ("Tour seats assigned", "seats_sold", "#27845e", "Across this month's trips"),
            ("Outstanding tour due", "due", DANGER, "Amount to collect"),
            ("Bus tickets this month", "bus_tickets", ORANGE, "Offline counter sales"),
        ]
        for column, (title, key, color, caption) in enumerate(cards):
            card = ttk.Frame(metrics, style="Card.TFrame", padding=(16, 12))
            card.grid(row=0, column=column, sticky="nsew", padx=(0 if column == 0 else 7, 0))
            ttk.Label(card, text=title.upper(), font=(self.ui_font, 10, "bold"),
                      foreground=MUTED, background=WHITE).pack(anchor="w")
            ttk.Label(card, textvariable=self.dashboard_values[key],
                      font=(self.ui_font, 22, "bold"), foreground=color,
                      background=WHITE).pack(anchor="w", pady=(6, 1))
            ttk.Label(card, text=caption, style="Muted.TLabel").pack(anchor="w")

        content = ttk.Frame(parent, style="Page.TFrame")
        content.grid(row=1, column=0, sticky="nsew")
        content.columnconfigure(0, weight=3)
        content.columnconfigure(1, weight=2)
        content.rowconfigure(0, weight=1)
        upcoming_card = ttk.Frame(content, style="Card.TFrame", padding=14)
        upcoming_card.grid(row=0, column=0, sticky="nsew", padx=(0, 8))
        upcoming_card.columnconfigure(0, weight=1)
        upcoming_card.rowconfigure(1, weight=1)
        ttk.Label(upcoming_card, text="Upcoming tour departures", style="Header.TLabel").grid(
            row=0, column=0, sticky="w", pady=(0, 10))
        self.upcoming_tree = ttk.Treeview(
            upcoming_card, columns=("date", "tour", "seats", "left", "due"), show="headings", height=10
        )
        for key, heading, width, anchor in (
            ("date", "Travel date", 105, "w"), ("tour", "Tour", 220, "w"),
            ("seats", "Booked seats", 105, "center"), ("left", "Available", 95, "center"),
            ("due", "Due", 115, "e"),
        ):
            self.upcoming_tree.heading(key, text=heading)
            self.upcoming_tree.column(key, width=width, anchor=anchor, stretch=True)
        self.upcoming_tree.tag_configure("odd", background="#f7fafb")
        scroll = ttk.Scrollbar(upcoming_card, orient="vertical", command=self.upcoming_tree.yview)
        self.upcoming_tree.configure(yscrollcommand=scroll.set)
        self.upcoming_tree.grid(row=1, column=0, sticky="nsew")
        scroll.grid(row=1, column=1, sticky="ns")

        note_card = ttk.Frame(content, style="Card.TFrame", padding=16)
        note_card.grid(row=0, column=1, sticky="nsew", padx=(8, 0))
        note_card.columnconfigure(0, weight=1)
        ttk.Label(note_card, text="Counter shortcuts", style="Header.TLabel").grid(
            row=0, column=0, sticky="w", pady=(0, 12))
        shortcuts = [
            ("Tour bookings", "Choose a tour and date, pick open seats from the seat map, then save the passenger and payment.", self.open_tour_page),
            ("Bus ticketing", "Select the route and day to see sold seats. Issue or reprint a paper ticket offline.", self.open_bus_page),
            ("Monthly report", "Review every trip, passenger, seat and due for a calendar month; export PDF or CSV.", self.open_reports_page),
        ]
        for row, (title, detail, command) in enumerate(shortcuts, start=1):
            item = ttk.Frame(note_card, style="Card.TFrame")
            item.grid(row=row, column=0, sticky="ew", pady=(0, 10))
            item.columnconfigure(0, weight=1)
            ttk.Label(item, text=title, font=(self.ui_font, 11, "bold"), foreground=ACCENT_DARK,
                      background=WHITE).grid(row=0, column=0, sticky="w")
            ttk.Label(item, text=detail, style="Muted.TLabel", wraplength=360,
                      justify="left").grid(row=1, column=0, sticky="w", pady=(3, 5))
            ttk.Button(item, text="Open section  →", style="Secondary.TButton",
                       command=command).grid(row=2, column=0, sticky="w")

    def _build_tours_reports_page(self, parent: ttk.Frame) -> None:
        parent.columnconfigure(0, weight=1)
        parent.rowconfigure(0, weight=1)
        content = ttk.Frame(parent, style="Page.TFrame")
        content.grid(row=0, column=0, sticky="nsew")
        content.columnconfigure(0, weight=1, uniform="reportpanels")
        content.columnconfigure(1, weight=1, uniform="reportpanels")
        content.rowconfigure(0, weight=1)

        catalogue = ttk.Frame(content, style="Card.TFrame", padding=14)
        catalogue.grid(row=0, column=0, sticky="nsew", padx=(0, 8))
        catalogue.columnconfigure(0, weight=1)
        catalogue.rowconfigure(1, weight=1)
        ttk.Label(catalogue, text="Manage tours", style="Header.TLabel").grid(
            row=0, column=0, sticky="w", pady=(0, 8))
        tour_table = ttk.Frame(catalogue, style="Card.TFrame")
        tour_table.grid(row=1, column=0, sticky="nsew")
        tour_table.rowconfigure(0, weight=1)
        tour_table.columnconfigure(0, weight=1)
        self.tour_catalog_tree = ttk.Treeview(
            tour_table, columns=("name", "code", "capacity", "bookings", "state"),
            show="headings", height=11
        )
        for key, heading, width, anchor in (
            ("name", "Tour name", 155, "w"), ("code", "Tour code", 78, "center"),
            ("capacity", "Seats", 58, "center"), ("bookings", "Bookings", 72, "center"),
            ("state", "State", 75, "center"),
        ):
            self.tour_catalog_tree.heading(key, text=heading)
            self.tour_catalog_tree.column(key, width=width, anchor=anchor, stretch=True)
        self.tour_catalog_tree.tag_configure("archived", foreground=MUTED)
        self.tour_catalog_tree.bind("<<TreeviewSelect>>", self.on_tour_catalog_select)
        tour_scroll = ttk.Scrollbar(tour_table, orient="vertical", command=self.tour_catalog_tree.yview)
        tour_scroll_x = ttk.Scrollbar(tour_table, orient="horizontal", command=self.tour_catalog_tree.xview)
        self.tour_catalog_tree.configure(yscrollcommand=tour_scroll.set, xscrollcommand=tour_scroll_x.set)
        self.tour_catalog_tree.grid(row=0, column=0, sticky="nsew")
        tour_scroll.grid(row=0, column=1, sticky="ns")
        tour_scroll_x.grid(row=1, column=0, sticky="ew")

        tour_form = ttk.Frame(catalogue, style="Card.TFrame")
        tour_form.grid(row=2, column=0, sticky="ew", pady=(12, 0))
        tour_form.columnconfigure(0, weight=3)
        tour_form.columnconfigure(1, weight=2)
        tour_form.columnconfigure(2, weight=1)
        ttk.Label(tour_form, text="Tour name", style="Field.TLabel").grid(row=0, column=0, sticky="w")
        self.tour_name_var = tk.StringVar()
        self.tour_name_entry = ttk.Entry(
            tour_form, textvariable=self.tour_name_var, width=18, style="Input.TEntry"
        )
        self.tour_name_entry.grid(row=1, column=0, sticky="ew", padx=(0, 8))
        ttk.Label(tour_form, text="Tour code", style="Field.TLabel").grid(row=0, column=1, sticky="w")
        self.tour_code_var = tk.StringVar()
        self.tour_code_entry = ttk.Entry(
            tour_form, textvariable=self.tour_code_var, width=12, style="Input.TEntry"
        )
        self.tour_code_entry.grid(row=1, column=1, sticky="ew", padx=(0, 8))
        ttk.Label(tour_form, text="Seats (1–46)", style="Field.TLabel").grid(
            row=0, column=2, sticky="w")
        self.tour_capacity_var = tk.StringVar(value="40")
        self.tour_capacity_entry = ttk.Entry(
            tour_form, textvariable=self.tour_capacity_var, width=8, style="Input.TEntry"
        )
        self.tour_capacity_entry.grid(row=1, column=2, sticky="ew")
        ttk.Label(
            tour_form,
            text="Code appears before the booking serial (example: CBT-RTT-2026-0001). Leave blank for initials.",
            style="Muted.TLabel", wraplength=390,
        ).grid(row=2, column=0, columnspan=3, sticky="w", pady=(5, 0))
        buttons = ttk.Frame(tour_form, style="Card.TFrame")
        buttons.grid(row=3, column=0, columnspan=3, sticky="ew", pady=(9, 0))
        ttk.Button(buttons, text="＋ Add tour", style="Accent.TButton",
                   command=lambda: self.save_tour(add_only=True)).pack(
            side="left", padx=(0, 6))
        ttk.Button(buttons, text="Save changes", style="Secondary.TButton", command=self.save_tour).pack(
            side="left", padx=6)
        ttk.Button(buttons, text="Clear", command=self.clear_tour_editor).pack(side="right")

        tour_actions = ttk.Frame(tour_form, style="Card.TFrame")
        tour_actions.grid(row=4, column=0, columnspan=3, sticky="ew", pady=(7, 0))
        ttk.Button(tour_actions, text="Archive (keep history)", style="Secondary.TButton",
                   command=self.archive_tour).pack(side="left", padx=(0, 6))
        ttk.Button(tour_actions, text="Delete tour + bookings", style="Danger.TButton",
                   command=self.delete_tour_permanently).pack(side="right")

        reports = ttk.Frame(content, style="Card.TFrame", padding=14)
        reports.grid(row=0, column=1, sticky="nsew", padx=(8, 0))
        reports.columnconfigure(0, weight=1)
        reports.rowconfigure(4, weight=1)
        ttk.Label(reports, text="Monthly tour sheet", style="Header.TLabel").grid(
            row=0, column=0, sticky="w")
        ttk.Label(reports, text="A clean, printable passenger and payment register for any month.",
                  style="Muted.TLabel").grid(row=1, column=0, sticky="w", pady=(3, 10))
        month_tools = ttk.Frame(reports, style="Card.TFrame")
        month_tools.grid(row=2, column=0, sticky="new")
        ttk.Label(month_tools, text="Travel month (YYYY-MM)", style="Field.TLabel").pack(side="left")
        self.month_var = tk.StringVar(value=_dt.date.today().strftime("%Y-%m"))
        months = self._month_choices()
        self.month_combo = ttk.Combobox(month_tools, textvariable=self.month_var, values=months, width=12)
        self.month_combo.pack(side="left", padx=(8, 8))
        self.month_combo.bind("<<ComboboxSelected>>", lambda event: self.refresh_month_report())
        self.month_combo.bind("<Return>", lambda event: self.refresh_month_report())
        ttk.Button(month_tools, text="Show month", style="Secondary.TButton",
                   command=self.refresh_month_report).pack(side="left")

        self.month_summary_var = tk.StringVar(value="Choose a month to preview the trips.")
        ttk.Label(reports, textvariable=self.month_summary_var, style="Card.TLabel").grid(
            row=3, column=0, sticky="w", pady=(12, 7))
        month_table = ttk.Frame(reports, style="Card.TFrame")
        month_table.grid(row=4, column=0, sticky="nsew")
        month_table.rowconfigure(0, weight=1)
        month_table.columnconfigure(0, weight=1)
        self.month_tree = ttk.Treeview(
            month_table, columns=("date", "tour", "bookings", "seats", "available", "due"),
            show="headings", height=10
        )
        for key, heading, width, anchor in (
            ("date", "Travel date", 98, "w"), ("tour", "Tour", 155, "w"),
            ("bookings", "Bookings", 72, "center"), ("seats", "Seats", 58, "center"),
            ("available", "Open", 56, "center"), ("due", "Due", 95, "e"),
        ):
            self.month_tree.heading(key, text=heading)
            self.month_tree.column(key, width=width, anchor=anchor, stretch=True)
        month_scroll = ttk.Scrollbar(month_table, orient="vertical", command=self.month_tree.yview)
        month_scroll_x = ttk.Scrollbar(month_table, orient="horizontal", command=self.month_tree.xview)
        self.month_tree.configure(yscrollcommand=month_scroll.set, xscrollcommand=month_scroll_x.set)
        self.month_tree.grid(row=0, column=0, sticky="nsew")
        month_scroll.grid(row=0, column=1, sticky="ns")
        month_scroll_x.grid(row=1, column=0, sticky="ew")
        report_buttons = ttk.Frame(reports, style="Card.TFrame")
        report_buttons.grid(row=5, column=0, sticky="ew", pady=(11, 0))
        ttk.Button(report_buttons, text="Monthly PDF", style="Accent.TButton",
                   command=self.monthly_pdf).pack(side="left", padx=(0, 6))
        ttk.Button(report_buttons, text="Export CSV", style="Secondary.TButton",
                   command=self.monthly_csv).pack(side="left")

    def _month_choices(self, count: int = 24) -> List[str]:
        today = _dt.date.today().replace(day=1)
        values = []
        current = today
        for _ in range(count):
            values.append(current.strftime("%Y-%m"))
            current = (current - _dt.timedelta(days=1)).replace(day=1)
        return values

    def _build_bus_page(self, parent: ttk.Frame) -> None:
        parent.columnconfigure(1, weight=1)
        parent.rowconfigure(0, weight=1)
        self._build_bus_form(parent)
        self._build_bus_table(parent)

    def _build_bus_form(self, parent: ttk.Frame) -> None:
        self.bus_form_panel = ScrollableFormPanel(parent)
        self.bus_form_panel.grid(row=0, column=0, sticky="nsw", padx=(0, 12))
        card = self.bus_form_panel.card
        card.columnconfigure(0, weight=1)
        ttk.Label(card, text="Issue / edit ticket", style="Header.TLabel").grid(
            row=0, column=0, columnspan=3, sticky="w", pady=(0, 4))
        ttk.Label(card, text="One passenger per seat. Cancelled tickets release their seat.",
                  style="Muted.TLabel", wraplength=320).grid(row=1, column=0, columnspan=3, sticky="w", pady=(0, 6))
        self.bus_vars: Dict[str, tk.Variable] = {
            "ticket_no": tk.StringVar(), "name": tk.StringVar(), "phone": tk.StringVar(),
            "route": tk.StringVar(value="Rajshahi → Dhaka"), "travel_date": tk.StringVar(),
            "departure_time": tk.StringVar(value="09:00 AM"), "seat": tk.StringVar(),
            "fare": tk.StringVar(value="0"), "advance": tk.StringVar(value="0"),
            "status": tk.StringVar(value="Booked"),
        }
        self.bus_due_var = tk.StringVar(value="0.00")
        row = 2
        row = self._bus_form_row(card, row, "Ticket number", "ticket_no", extra="auto")
        row = self._bus_form_row(card, row, "Passenger name *", "name")
        row = self._bus_form_row(card, row, "Phone / WhatsApp", "phone")
        row = self._bus_form_row(card, row, "Route *", "route", combo=True, values=self.db.bus_routes())
        row = self._bus_form_row(card, row, "Travel date *", "travel_date", date=True)
        row = self._bus_form_row(card, row, "Departure time", "departure_time")
        row = self._bus_form_row(card, row, "Seat *", "seat", extra="seatmap")
        self.bus_seat_summary_var = tk.StringVar(value="Pick a route and date to see the seat count")
        ttk.Label(card, textvariable=self.bus_seat_summary_var, style="Muted.TLabel").grid(
            row=row, column=0, columnspan=3, sticky="w", pady=(1, 0))
        row += 1
        row = self._bus_form_row(card, row, "Fare", "fare")
        row = self._bus_form_row(card, row, "Paid now", "advance")
        ttk.Label(card, text="Balance due", style="Field.TLabel").grid(row=row, column=0, sticky="w", pady=(8, 0))
        ttk.Label(card, textvariable=self.bus_due_var, style="Due.TLabel").grid(
            row=row + 1, column=0, sticky="w", pady=(1, 0))
        row += 2
        ttk.Label(card, text="Ticket status", style="Field.TLabel").grid(row=row, column=0, sticky="w", pady=(7, 0))
        self.bus_status_combo = ttk.Combobox(
            card, textvariable=self.bus_vars["status"],
            values=("Booked", "Paid", "Cancelled"), state="readonly", style="Input.TCombobox"
        )
        self.bus_status_combo.grid(row=row + 1, column=0, columnspan=3, sticky="ew")
        row += 2
        ttk.Label(card, text="Notes", style="Field.TLabel").grid(row=row, column=0, sticky="w", pady=(7, 0))
        self.bus_notes_text = tk.Text(card, height=5, width=30, font=(self.ui_font, 12),
                                      relief="solid", borderwidth=1, wrap="word")
        self.bus_notes_text.grid(row=row + 1, column=0, columnspan=3, sticky="ew")
        row += 2
        actions = ttk.Frame(card, style="Card.TFrame")
        actions.grid(row=row, column=0, columnspan=3, sticky="ew", pady=(10, 0))
        ttk.Button(actions, text="New", command=self.new_bus_ticket).pack(side="left", expand=True, fill="x", padx=(0, 4))
        ttk.Button(actions, text="Save ticket", style="Accent.TButton",
                   command=self.save_bus_ticket).pack(side="left", expand=True, fill="x", padx=4)
        ttk.Button(actions, text="Delete", style="Danger.TButton",
                   command=self.delete_bus_ticket).pack(side="left", expand=True, fill="x", padx=(4, 0))
        actions2 = ttk.Frame(card, style="Card.TFrame")
        actions2.grid(row=row + 1, column=0, columnspan=3, sticky="ew", pady=(6, 0))
        ttk.Button(actions2, text="Print ticket", style="Secondary.TButton",
                   command=self.print_bus_ticket).pack(side="left", expand=True, fill="x", padx=(0, 4))
        ttk.Button(actions2, text="Export bus list", command=self.export_bus_csv).pack(
            side="left", expand=True, fill="x", padx=(4, 0))
        for key in ("fare", "advance"):
            self.bus_vars[key].trace_add("write", lambda *_: self.update_bus_due())
        self.bus_vars["route"].trace_add("write", lambda *_: self.update_bus_seat_summary())
        self.bus_vars["travel_date"].trace_add("write", lambda *_: self.update_bus_seat_summary())

    def _bus_form_row(self, card: ttk.Frame, row: int, label: str, key: str,
                      combo: bool = False, values: Optional[List[str]] = None,
                      date: bool = False, extra: str = "") -> int:
        ttk.Label(card, text=label, style="Field.TLabel").grid(row=row, column=0, sticky="w", pady=(6, 0))
        if combo:
            widget = ttk.Combobox(
                card, textvariable=self.bus_vars[key], values=values or (), style="Input.TCombobox"
            )
        else:
            widget = ttk.Entry(card, textvariable=self.bus_vars[key], style="Input.TEntry")
        widget.grid(row=row + 1, column=0, columnspan=2 if date or extra else 3, sticky="ew")
        if date:
            ttk.Button(card, text="…", width=4, command=lambda: self.pick_bus_date()).grid(
                row=row + 1, column=2, sticky="e")
        elif extra == "auto":
            ttk.Button(card, text="Auto", width=6, command=self.assign_bus_number).grid(
                row=row + 1, column=2, sticky="e")
        elif extra == "seatmap":
            ttk.Button(card, text="Map", width=6, command=self.pick_bus_seat).grid(
                row=row + 1, column=2, sticky="e")
        return row + 2

    def _build_bus_table(self, parent: ttk.Frame) -> None:
        panel = ttk.Frame(parent, style="Page.TFrame")
        panel.grid(row=0, column=1, sticky="nsew")
        panel.rowconfigure(1, weight=1)
        panel.columnconfigure(0, weight=1)
        filters = ttk.Frame(panel, style="Card.TFrame", padding=(10, 8))
        filters.grid(row=0, column=0, sticky="ew", pady=(0, 8))
        self.bus_search_var = tk.StringVar()
        self.bus_search_entry = ttk.Entry(filters, textvariable=self.bus_search_var, width=20)
        self.bus_search_entry.pack(side="left")
        self.bus_search_entry.bind("<Return>", lambda event: self.refresh_bus_tickets())
        self.bus_route_filter_var = tk.StringVar(value="All routes")
        self.bus_route_filter = ttk.Combobox(filters, textvariable=self.bus_route_filter_var,
                                             values=["All routes"] + self.db.bus_routes(),
                                             state="readonly", width=20)
        self.bus_route_filter.pack(side="left", padx=(7, 0))
        self.bus_route_filter.bind("<<ComboboxSelected>>", lambda event: self.refresh_bus_tickets())
        self.bus_filter_date_var = tk.StringVar()
        date_filter = ttk.Entry(filters, textvariable=self.bus_filter_date_var, width=12)
        date_filter.pack(side="left", padx=(7, 0))
        date_filter.bind("<Return>", lambda event: self.refresh_bus_tickets())
        ttk.Button(filters, text="Date…", command=self.pick_bus_filter_date).pack(side="left", padx=(4, 7))
        ttk.Button(filters, text="Filter", style="Secondary.TButton",
                   command=self.refresh_bus_tickets).pack(side="left")
        ttk.Button(filters, text="Clear", command=self.clear_bus_filters).pack(side="right")

        columns = (
            ("ticket_no", "Ticket", 112), ("name", "Passenger", 135), ("phone", "Phone", 105),
            ("route", "Route", 148), ("travel_date", "Travel date", 95),
            ("departure_time", "Time", 78), ("seat", "Seat", 54),
            ("fare", "Fare", 82), ("advance", "Paid", 82), ("due", "Due", 82), ("status", "Status", 78),
        )
        table = ttk.Frame(panel, style="Card.TFrame")
        table.grid(row=1, column=0, sticky="nsew")
        table.rowconfigure(0, weight=1)
        table.columnconfigure(0, weight=1)
        self.bus_tree = ttk.Treeview(table, columns=[c[0] for c in columns], show="headings", selectmode="browse")
        for key, heading, width in columns:
            self.bus_tree.heading(key, text=heading)
            self.bus_tree.column(key, width=width, anchor="e" if key in ("fare", "advance", "due") else "w",
                                 stretch=True)
        self.bus_tree.tag_configure("cancelled", foreground=MUTED)
        self.bus_tree.tag_configure("due", foreground=DANGER)
        self.bus_tree.bind("<<TreeviewSelect>>", self.on_bus_select)
        self.bus_tree.bind("<Double-1>", lambda event: self.load_bus_selected())
        bus_scroll_y = ttk.Scrollbar(table, orient="vertical", command=self.bus_tree.yview)
        bus_scroll_x = ttk.Scrollbar(table, orient="horizontal", command=self.bus_tree.xview)
        self.bus_tree.configure(yscrollcommand=bus_scroll_y.set, xscrollcommand=bus_scroll_x.set)
        self.bus_tree.grid(row=0, column=0, sticky="nsew")
        bus_scroll_y.grid(row=0, column=1, sticky="ns")
        bus_scroll_x.grid(row=1, column=0, sticky="ew")
        self.bus_totals_var = tk.StringVar(value="0 tickets")
        ttk.Label(panel, textvariable=self.bus_totals_var, style="Card.TLabel").grid(
            row=2, column=0, sticky="e", pady=(7, 0))


    def start_tour_booking(self) -> None:
        self.notebook.select(self.tour_page)
        self.new_booking()

    def start_bus_ticket(self) -> None:
        self.notebook.select(self.bus_page)
        self.new_bus_ticket()

    def open_tour_page(self) -> None:
        self.notebook.select(self.tour_page)

    def open_bus_page(self) -> None:
        self.notebook.select(self.bus_page)

    def open_reports_page(self) -> None:
        self.notebook.select(self.reports_page)
        self.refresh_month_report()

    def refresh_dashboard(self) -> None:
        if not hasattr(self, "dashboard_values"):
            return
        month = _dt.date.today().strftime("%Y-%m")
        try:
            month_rows = self.db.month_bookings(month)
        except ValueError:
            month_rows = []
        seat_count = sum(len(db.seat_tokens(row.get("seat"))) or 1 for row in month_rows
                         if str(row.get("status") or "").lower() != "cancelled")
        due = sum(float(row.get("due") or 0) for row in month_rows
                  if str(row.get("status") or "").lower() != "cancelled")
        bus_rows = [row for row in self.db.list_bus_tickets()
                    if str(row.get("travel_date") or "").startswith(month)
                    and str(row.get("status") or "").lower() != "cancelled"]
        self.dashboard_values["month_bookings"].set(str(len(month_rows)))
        self.dashboard_values["seats_sold"].set(str(seat_count))
        self.dashboard_values["due"].set(money(due, self.currency))
        self.dashboard_values["bus_tickets"].set(str(len(bus_rows)))
        for item in self.upcoming_tree.get_children():
            self.upcoming_tree.delete(item)
        for index, trip in enumerate(self.db.upcoming_tours(12)):
            capacity = self.db.tour_capacity(trip["tour_name"])
            available = max(0, capacity - int(trip["seats"]))
            self.upcoming_tree.insert(
                "", "end", iid=f"{index}-{trip['tour_date']}-{trip['tour_name']}",
                values=(trip["tour_date"], trip["tour_name"],
                        f"{trip['seats']} / {capacity}", available,
                        money(trip["due"], self.currency)),
                tags=("odd",) if index % 2 else (),
            )

    # ------------------------------------------------------- tour catalogue

    def on_tour_catalog_select(self, event=None) -> None:
        selection = self.tour_catalog_tree.selection()
        if not selection:
            return
        try:
            self.selected_tour_catalog_id = int(selection[0])
        except (ValueError, TypeError):
            self.selected_tour_catalog_id = None
            return
        row = next((item for item in self.db.tour_catalog(include_inactive=True)
                    if int(item["id"]) == self.selected_tour_catalog_id), None)
        if row:
            self.tour_name_var.set(row["name"])
            self.tour_code_var.set(str(row.get("tour_code") or ""))
            self.tour_capacity_var.set(str(row["seat_capacity"]))

    def clear_tour_editor(self) -> None:
        self.selected_tour_catalog_id = None
        self.tour_name_var.set("")
        self.tour_code_var.set("")
        self.tour_capacity_var.set("40")
        if hasattr(self, "tour_catalog_tree"):
            self.tour_catalog_tree.selection_remove(*self.tour_catalog_tree.selection())

    def save_tour(self, add_only: bool = False) -> None:
        name = self.tour_name_var.get().strip()
        tour_code = self.tour_code_var.get().strip() or None
        editing_id = self.selected_tour_catalog_id if not add_only else None
        previous = next((tour for tour in self.db.tour_catalog(include_inactive=True)
                         if int(tour["id"]) == editing_id), None) if editing_id is not None else None
        old_name = str(previous["name"]) if previous else ""
        try:
            if editing_id is None:
                self.db.add_tour(name, self.tour_capacity_var.get(), tour_code)
                saved_code = self.db.tour_code(name)
                message = f"Tour '{name}' ({saved_code}) added. It is ready for bookings."
            else:
                self.db.update_tour(editing_id, name, self.tour_capacity_var.get(), tour_code)
                saved_code = self.db.tour_code(name)
                message = f"Tour '{name}' ({saved_code}) updated."
                if old_name != name:
                    suggestions = []
                    seen = set()
                    for item in self.settings.get("tour_suggestions") or []:
                        value = name if str(item).strip().casefold() == old_name.casefold() else str(item).strip()
                        if value and value.casefold() not in seen:
                            suggestions.append(value)
                            seen.add(value.casefold())
                    self.settings["tour_suggestions"] = suggestions
                    config.save_settings(self.settings)
        except Exception as exc:
            messagebox.showerror("Tour not saved", str(exc), parent=self.root)
            return
        self.clear_tour_editor()
        self.refresh_tour_catalog()
        self.apply_tour_choices()
        if (self.selected_id is None and str(self.vars["tour_name"].get() or "").casefold()
                == name.casefold()):
            self.assign_number()
        self.refresh()
        self.set_status(message)

    def _selected_catalog_tour(self, action: str) -> Optional[Dict[str, Any]]:
        if self.selected_tour_catalog_id is None:
            messagebox.showinfo(action, "Select a tour in the catalogue first.", parent=self.root)
            return None
        tour = next((item for item in self.db.tour_catalog(include_inactive=True)
                     if int(item["id"]) == self.selected_tour_catalog_id), None)
        if not tour:
            messagebox.showinfo(action, "This tour no longer exists.", parent=self.root)
            self.clear_tour_editor()
            self.refresh_tour_catalog()
            return None
        return tour

    def _finish_tour_action(self, name: str) -> None:
        self.settings["tour_suggestions"] = [
            item for item in (self.settings.get("tour_suggestions") or [])
            if str(item).strip().casefold() != name.casefold()
        ]
        config.save_settings(self.settings)
        self.clear_tour_editor()
        self.refresh_tour_catalog()
        self.apply_tour_choices()
        self.refresh()

    def archive_tour(self) -> None:
        tour = self._selected_catalog_tour("Archive tour")
        if not tour:
            return
        name = str(tour["name"])
        booking_count = int(tour.get("booking_count") or 0)
        if not messagebox.askyesno(
            "Archive tour",
            f"Archive '{name}' and remove it from new booking choices? Its {booking_count} saved "
            "booking(s) and payment history will remain in the database and reports. You can reactivate "
            "it later by adding the same name again.",
            parent=self.root,
        ):
            return
        if not self.db.archive_tour(self.selected_tour_catalog_id):
            messagebox.showinfo("Archive tour", "This tour no longer exists.", parent=self.root)
            self.clear_tour_editor()
            self.refresh_tour_catalog()
            return
        self._finish_tour_action(name)
        self.set_status(f"'{name}' archived; its {booking_count} booking(s) remain in history.")

    def delete_tour_permanently(self) -> None:
        tour = self._selected_catalog_tour("Delete tour")
        if not tour:
            return
        name = str(tour["name"])
        booking_count = int(tour.get("booking_count") or 0)
        saved_data = (
            f"This will permanently delete all {booking_count} associated booking/payment record(s) "
            "from the local database."
            if booking_count else "There are no saved bookings for this tour."
        )
        if not messagebox.askyesno(
            "Permanently delete tour and bookings",
            f"Delete '{name}'?\n\n{saved_data}\n\nThis cannot be undone. Back up the database first "
            "if you may need these records later.",
            parent=self.root,
        ):
            return
        if not self.db.delete_tour(self.selected_tour_catalog_id):
            messagebox.showinfo("Delete tour", "This tour no longer exists.", parent=self.root)
            self.clear_tour_editor()
            self.refresh_tour_catalog()
            return
        selected_booking_was_deleted = (
            self.selected_id is not None and self.db.get(self.selected_id) is None
        )
        if selected_booking_was_deleted:
            self.clear_form()
        elif hasattr(self, "vars") and str(self.vars["tour_name"].get()).strip().casefold() == name.casefold():
            remaining = next((item for item in self.db.active_tours()
                              if item.casefold() != name.casefold()), "")
            self.vars["tour_name"].set(remaining)
            self.vars["seat"].set("")
            self.update_tour_seat_summary()
        self._finish_tour_action(name)
        self.set_status(f"'{name}' and its {booking_count} associated booking(s) were permanently deleted.")

    def remove_tour(self) -> None:
        """Compatibility action for older shortcuts; removal is permanent."""
        self.delete_tour_permanently()

    def refresh_tour_catalog(self) -> None:
        if not hasattr(self, "tour_catalog_tree"):
            return
        for item in self.tour_catalog_tree.get_children():
            self.tour_catalog_tree.delete(item)
        for tour in self.db.tour_catalog(include_inactive=True):
            active = bool(tour["active"])
            self.tour_catalog_tree.insert(
                "", "end", iid=str(tour["id"]),
                values=(tour["name"], tour["tour_code"], tour["seat_capacity"],
                        tour["booking_count"], "Active" if active else "Archived"),
                tags=() if active else ("archived",),
            )

    def apply_tour_choices(self) -> None:
        values = self.db.active_tours()
        if self.tour_combo is not None:
            self.tour_combo.configure(values=values)
        if hasattr(self, "bus_route_filter"):
            routes = ["All routes"] + self.db.bus_routes()
            self.bus_route_filter.configure(values=routes)

    def _month_departures(self, rows: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        groups: Dict[tuple, Dict[str, Any]] = {}
        for row in rows:
            if str(row.get("status") or "").lower() == "cancelled":
                continue
            key = (str(row.get("tour_name") or ""), str(row.get("tour_date") or ""))
            group = groups.setdefault(key, {
                "tour_name": key[0], "tour_date": key[1], "bookings": 0,
                "seats": 0, "due": 0.0,
            })
            group["bookings"] += 1
            group["seats"] += len(db.seat_tokens(row.get("seat"))) or 1
            group["due"] += float(row.get("due") or 0)
        result = []
        for group in groups.values():
            group["capacity"] = self.db.tour_capacity(group["tour_name"])
            group["available"] = max(0, group["capacity"] - group["seats"])
            result.append(group)
        return sorted(result, key=lambda item: (item["tour_date"], item["tour_name"].casefold()))

    def refresh_month_report(self) -> None:
        if not hasattr(self, "month_tree"):
            return
        month = self.month_var.get().strip()
        try:
            self.month_rows = self.db.month_bookings(month)
        except ValueError as exc:
            self.month_rows = []
            self.month_summary_var.set(str(exc))
            return
        for item in self.month_tree.get_children():
            self.month_tree.delete(item)
        departures = self._month_departures(self.month_rows)
        for index, trip in enumerate(departures):
            self.month_tree.insert(
                "", "end", iid=f"{index}-{trip['tour_date']}-{trip['tour_name']}",
                values=(trip["tour_date"], trip["tour_name"], trip["bookings"], trip["seats"],
                        trip["available"], money(trip["due"], self.currency)),
                tags=("odd",) if index % 2 else (),
            )
        totals = self.db.totals(self.month_rows)
        seats = sum(trip["seats"] for trip in departures)
        self.month_summary_var.set(
            f"{len(departures)} departures  ·  {totals['count']} bookings  ·  {seats} seats  ·  "
            f"Total {money(totals['total'], self.currency)}  ·  Due {money(totals['due'], self.currency)}"
        )

    def monthly_pdf(self) -> None:
        month = self.month_var.get().strip()
        try:
            rows = self.db.month_bookings(month)
            data = documents.monthly_tour_report(rows, self.settings, month)
        except Exception as exc:
            messagebox.showerror("Monthly report", str(exc), parent=self.root)
            return
        path = self._save_pdf(data, f"tour-month-{month}.pdf", "Save monthly tour sheet")
        if path:
            self._after_pdf(path)

    def monthly_csv(self) -> None:
        month = self.month_var.get().strip()
        try:
            rows = self.db.month_bookings(month)
        except ValueError as exc:
            messagebox.showerror("Monthly report", str(exc), parent=self.root)
            return
        path = filedialog.asksaveasfilename(
            parent=self.root, title="Export monthly tour sheet", defaultextension=".csv",
            initialdir=str(self.settings.get("last_export_dir") or config.export_dir()),
            initialfile=f"tour-month-{month}.csv",
            filetypes=[("CSV file", "*.csv"), ("All files", "*.*")],
        )
        if not path:
            return
        self.db.export_csv(path, rows)
        self.settings["last_export_dir"] = os.path.dirname(path)
        config.save_settings(self.settings)
        self.set_status(f"Monthly tour sheet exported: {path}")
        if messagebox.askyesno("CSV exported", "Open the monthly sheet now?", parent=self.root):
            open_file(path)

    # --------------------------------------------------------- tour seat map

    def pick_tour_seats(self) -> None:
        tour = str(self.vars["tour_name"].get() or "").strip()
        date_text = str(self.vars["tour_date"].get() or "").strip()
        parsed = parse_date(date_text)
        if not tour:
            messagebox.showinfo("Choose seats", "Select a tour first.", parent=self.root)
            return
        if not parsed:
            messagebox.showinfo("Choose seats", "Enter a valid travel date before choosing seats.", parent=self.root)
            return
        date_text = parsed.isoformat()
        capacity = self.db.tour_capacity(tour)
        occupied = self.db.tour_seat_occupancy(tour, date_text, exclude_id=self.selected_id)
        selected = db.seat_tokens(self.vars["seat"].get())
        SeatMapDialog(
            self.root, f"{tour} · {parsed.strftime('%d %b %Y')}", capacity, occupied, selected,
            max_select=capacity,
            on_save=lambda seats: self.set_tour_seats(seats),
        )

    def set_tour_seats(self, seats: List[str]) -> None:
        self.vars["seat"].set(", ".join(seats))
        self.update_tour_seat_summary()

    def update_tour_seat_summary(self) -> None:
        if not hasattr(self, "seat_summary_var"):
            return
        tour = str(self.vars["tour_name"].get() or "").strip()
        parsed = parse_date(str(self.vars["tour_date"].get() or ""))
        if not tour or not parsed:
            self.seat_summary_var.set("Choose a tour and date to see availability")
            return
        capacity = self.db.tour_capacity(tour)
        occupied = self.db.tour_seat_occupancy(tour, parsed.isoformat(), exclude_id=self.selected_id)
        selected = db.seat_tokens(self.vars["seat"].get())
        self.seat_summary_var.set(
            f"{len(occupied)} booked  ·  {max(0, capacity - len(occupied))} open  ·  {len(selected)} selected"
        )

    # -------------------------------------------------------------- bus desk

    def assign_bus_number(self) -> None:
        self.bus_vars["ticket_no"].set(self.db.next_bus_number())

    def update_bus_due(self) -> None:
        def amount(key: str) -> float:
            raw = str(self.bus_vars[key].get() or "")
            cleaned = "".join(char for char in raw if char.isdigit() or char in ".-")
            try:
                return float(cleaned or 0)
            except ValueError:
                return 0.0
        self.bus_due_var.set(money(amount("fare") - amount("advance"), self.currency))

    def update_bus_seat_summary(self) -> None:
        if not hasattr(self, "bus_seat_summary_var"):
            return
        route = str(self.bus_vars["route"].get() or "").strip()
        travel_date = parse_date(str(self.bus_vars["travel_date"].get() or ""))
        if not route or not travel_date:
            self.bus_seat_summary_var.set("Pick a route and date to see the seat count")
            return
        occupied = self.db.bus_seat_occupancy(
            route, travel_date.isoformat(), exclude_id=self.bus_selected_id
        )
        self.bus_seat_summary_var.set(
            f"{len(occupied)} / 40 seats filled  ·  {max(0, 40 - len(occupied))} open"
        )

    def new_bus_ticket(self) -> None:
        for key, variable in self.bus_vars.items():
            defaults = {"fare": "0", "advance": "0", "status": "Booked",
                        "route": "Rajshahi → Dhaka", "departure_time": "09:00 AM"}
            variable.set(defaults.get(key, ""))
        self.bus_notes_text.delete("1.0", "end")
        self.bus_selected_id = None
        self.bus_vars["travel_date"].set(_dt.date.today().isoformat())
        self.assign_bus_number()
        self.update_bus_due()
        self.set_status("New bus ticket — choose the route, date and available seat.")

    def pick_bus_date(self) -> None:
        current = parse_date(self.bus_vars["travel_date"].get())
        DatePicker(self.root, current, lambda value: self.bus_vars["travel_date"].set(
            value.isoformat() if value else ""))

    def pick_bus_filter_date(self) -> None:
        current = parse_date(self.bus_filter_date_var.get())
        DatePicker(self.root, current, lambda value: self.bus_filter_date_var.set(
            value.isoformat() if value else ""))

    def pick_bus_seat(self) -> None:
        route = str(self.bus_vars["route"].get() or "").strip()
        date_value = parse_date(str(self.bus_vars["travel_date"].get() or ""))
        if not route or not date_value:
            messagebox.showinfo("Choose a seat", "Enter the bus route and a valid travel date first.",
                                parent=self.root)
            return
        occupied = self.db.bus_seat_occupancy(
            route, date_value.isoformat(), exclude_id=self.bus_selected_id
        )
        current = db.seat_tokens(self.bus_vars["seat"].get())
        SeatMapDialog(
            self.root, f"{route} · {date_value.strftime('%d %b %Y')}", 40, occupied, current,
            max_select=1, on_save=lambda seats: self.bus_vars["seat"].set(seats[0] if seats else ""),
        )

    def collect_bus_ticket(self) -> Dict[str, Any]:
        def amount(key: str) -> float:
            raw = str(self.bus_vars[key].get() or "")
            cleaned = "".join(char for char in raw if char.isdigit() or char in ".-")
            try:
                return float(cleaned or 0)
            except ValueError:
                return 0.0
        data = {key: variable.get() for key, variable in self.bus_vars.items()}
        parsed_date = parse_date(str(data.get("travel_date") or ""))
        if parsed_date:
            data["travel_date"] = parsed_date.isoformat()
        data["fare"] = amount("fare")
        data["advance"] = amount("advance")
        data["due"] = round(data["fare"] - data["advance"], 2)
        data["notes"] = self.bus_notes_text.get("1.0", "end").strip()
        return data

    def validate_bus_ticket(self, data: Dict[str, Any]) -> Optional[str]:
        if not str(data.get("name") or "").strip():
            return "Passenger name is required."
        if not str(data.get("route") or "").strip():
            return "Route is required."
        if not parse_date(str(data.get("travel_date") or "")):
            return "Travel date must be a valid date, for example 2026-11-15."
        seat = db.normalise_seat(data.get("seat"))
        if seat not in seat_ids(40):
            return "Choose a valid seat from the bus seat map."
        if data["fare"] < 0 or data["advance"] < 0:
            return "Fare and paid amount cannot be negative."
        if data["advance"] > data["fare"]:
            return "Paid amount cannot be larger than the fare."
        return None

    def save_bus_ticket(self) -> None:
        data = self.collect_bus_ticket()
        error = self.validate_bus_ticket(data)
        if error:
            messagebox.showerror("Ticket not saved", error, parent=self.root)
            return
        if not data["ticket_no"]:
            data["ticket_no"] = self.db.next_bus_number()
        try:
            if self.bus_selected_id is None:
                self.bus_selected_id = self.db.add_bus_ticket(data)
                message = f"Bus ticket {data['ticket_no']} saved."
            else:
                self.db.update_bus_ticket(self.bus_selected_id, data)
                message = f"Bus ticket {data['ticket_no']} updated."
        except Exception as exc:
            messagebox.showerror("Ticket not saved", str(exc), parent=self.root)
            return
        self.refresh_bus_tickets(keep_selection=True)
        self.refresh_dashboard()
        self.set_status(message)

    def on_bus_select(self, event=None) -> None:
        selection = self.bus_tree.selection()
        if not selection:
            return
        try:
            self.bus_selected_id = int(selection[0])
        except (ValueError, TypeError):
            self.bus_selected_id = None
            return
        self.load_bus_selected()

    def load_bus_selected(self) -> None:
        if self.bus_selected_id is None:
            return
        row = self.db.bus_ticket_get(self.bus_selected_id)
        if not row:
            return
        for key, variable in self.bus_vars.items():
            value = row.get(key, "")
            if key in ("fare", "advance"):
                value = f"{float(value or 0):g}"
            variable.set(value if value is not None else "")
        self.bus_notes_text.delete("1.0", "end")
        self.bus_notes_text.insert("1.0", str(row.get("notes") or ""))
        self.update_bus_due()
        self.set_status(f"Editing bus ticket {row.get('ticket_no')} · seat {row.get('seat')}")

    def delete_bus_ticket(self) -> None:
        if self.bus_selected_id is None:
            messagebox.showinfo("Delete ticket", "Select a ticket from the bus list first.", parent=self.root)
            return
        row = self.db.bus_ticket_get(self.bus_selected_id) or {}
        if not messagebox.askyesno(
            "Delete bus ticket", f"Delete ticket {row.get('ticket_no')} for {row.get('name')}?",
            parent=self.root,
        ):
            return
        self.db.delete_bus_ticket(self.bus_selected_id)
        self.new_bus_ticket()
        self.refresh_bus_tickets()
        self.refresh_dashboard()
        self.set_status("Bus ticket deleted; its seat is available again.")

    def clear_bus_filters(self) -> None:
        self.bus_search_var.set("")
        self.bus_route_filter_var.set("All routes")
        self.bus_filter_date_var.set("")
        self.refresh_bus_tickets()

    def refresh_bus_tickets(self, keep_selection: bool = False) -> None:
        if not hasattr(self, "bus_tree"):
            return
        rows = self.db.list_bus_tickets(
            search=self.bus_search_var.get(), route=self.bus_route_filter_var.get(),
            travel_date=self.bus_filter_date_var.get().strip(),
        )
        self.bus_rows = rows
        for item in self.bus_tree.get_children():
            self.bus_tree.delete(item)
        for row in rows:
            status = str(row.get("status") or "Booked")
            tags = ("cancelled",) if status.lower() == "cancelled" else (
                ("due",) if float(row.get("due") or 0) > 0 else ()
            )
            self.bus_tree.insert(
                "", "end", iid=str(row["id"]),
                values=(row.get("ticket_no", ""), row.get("name", ""), row.get("phone", ""),
                        row.get("route", ""), row.get("travel_date", ""), row.get("departure_time", ""),
                        row.get("seat", ""), money(row.get("fare"), self.currency),
                        money(row.get("advance"), self.currency), money(row.get("due"), self.currency), status),
                tags=tags,
            )
        route_values = ["All routes"] + self.db.bus_routes()
        self.bus_route_filter.configure(values=route_values)
        if self.bus_route_filter_var.get() not in route_values:
            self.bus_route_filter_var.set("All routes")
        totals = self.db.bus_totals(rows)
        self.bus_totals_var.set(
            f"{totals['count']} active tickets  ·  Fare {money(totals['fare'], self.currency)}  ·  "
            f"Paid {money(totals['advance'], self.currency)}  ·  Due {money(totals['due'], self.currency)}"
        )
        if keep_selection and self.bus_selected_id is not None:
            key = str(self.bus_selected_id)
            if key in self.bus_tree.get_children():
                self.bus_tree.selection_set(key)
                self.bus_tree.focus(key)

    def print_bus_ticket(self) -> None:
        if self.bus_selected_id is None:
            messagebox.showinfo("Print bus ticket", "Save or select a ticket first.", parent=self.root)
            return
        ticket = self.db.bus_ticket_get(self.bus_selected_id)
        if not ticket:
            return
        try:
            data = documents.bus_ticket_receipt(ticket, self.settings)
        except Exception as exc:
            messagebox.showerror("Ticket PDF error", str(exc), parent=self.root)
            return
        path = os.path.join(config.export_dir(), f"bus-ticket-{ticket['ticket_no']}.pdf")
        with open(path, "wb") as handle:
            handle.write(data)
        printed = print_file(path)
        self.set_status(f"Sent {os.path.basename(path)} to the printer." if printed
                        else f"Saved {path} (opened in your PDF viewer).")

    def export_bus_csv(self) -> None:
        rows = getattr(self, "bus_rows", [])
        if not rows:
            messagebox.showinfo("Export bus tickets", "There are no tickets in this view.", parent=self.root)
            return
        path = filedialog.asksaveasfilename(
            parent=self.root, title="Export bus tickets", defaultextension=".csv",
            initialdir=str(self.settings.get("last_export_dir") or config.export_dir()),
            initialfile=f"bus-tickets-{_dt.date.today().isoformat()}.csv",
            filetypes=[("CSV file", "*.csv"), ("All files", "*.*")],
        )
        if not path:
            return
        self.db.export_bus_csv(path, rows)
        self.settings["last_export_dir"] = os.path.dirname(path)
        config.save_settings(self.settings)
        self.set_status(f"Exported {len(rows)} bus tickets to {path}")


    def _build_menu(self) -> None:
        menubar = tk.Menu(self.root)
        file_menu = tk.Menu(menubar, tearoff=0)
        file_menu.add_command(label="New booking", command=self.start_tour_booking, accelerator="Ctrl+N")
        file_menu.add_command(label="Save current entry", command=self.save_current_entry, accelerator="Ctrl+S")
        file_menu.add_command(label="New bus ticket", command=self.start_bus_ticket)
        file_menu.add_separator()
        file_menu.add_command(label="Export list to CSV...", command=self.export_csv)
        file_menu.add_command(label="Backup database...", command=self.backup_database)
        file_menu.add_command(label="Restore from backup...", command=self.restore_database)
        file_menu.add_separator()
        file_menu.add_command(label="Open data folder", command=self.open_data_folder)
        file_menu.add_command(label="Exit", command=self.on_close)
        menubar.add_cascade(label="File", menu=file_menu)

        report_menu = tk.Menu(menubar, tearoff=0)
        report_menu.add_command(label="Booking receipt (PDF)...", command=self.receipt_pdf)
        report_menu.add_command(label="Booking list report (PDF)...", command=self.list_pdf)
        report_menu.add_command(label="Due list report (PDF)...", command=self.due_pdf)
        report_menu.add_command(label="Monthly tour sheet...", command=self.open_reports_page)
        menubar.add_cascade(label="Reports", menu=report_menu)

        tools_menu = tk.Menu(menubar, tearoff=0)
        tools_menu.add_command(label="Settings...", command=self.open_settings)
        tools_menu.add_command(label="Load sample bookings", command=self.load_samples)
        menubar.add_cascade(label="Tools", menu=tools_menu)

        help_menu = tk.Menu(menubar, tearoff=0)
        help_menu.add_command(label="How to use", command=self.show_help)
        help_menu.add_command(label="About", command=self.show_about)
        menubar.add_cascade(label="Help", menu=help_menu)
        self.root.config(menu=menubar)

    def _build_form(self, parent: ttk.Frame) -> None:
        self.tour_form_panel = ScrollableFormPanel(parent)
        self.tour_form_panel.grid(row=0, column=0, sticky="nsw", padx=(0, 12))
        card = self.tour_form_panel.card
        card.columnconfigure(0, weight=1)
        card.columnconfigure(1, weight=1)

        ttk.Label(card, text="Passenger & payment", style="Header.TLabel").grid(
            row=0, column=0, columnspan=3, sticky="w", pady=(0, 3))
        ttk.Label(card, text="Enter passenger details, then choose the trip and open seats.", style="Muted.TLabel").grid(
            row=1, column=0, columnspan=3, sticky="w", pady=(0, 6))

        self.vars: Dict[str, tk.Variable] = {
            "booking_no": tk.StringVar(),
            "name": tk.StringVar(),
            "phone": tk.StringVar(),
            "seat": tk.StringVar(),
            "tour_name": tk.StringVar(),
            "total": tk.StringVar(value="0"),
            "advance": tk.StringVar(value="0"),
            "booking_date": tk.StringVar(),
            "tour_date": tk.StringVar(),
            "status": tk.StringVar(value="Confirmed"),
        }
        self.due_var = tk.StringVar(value="0.00")
        self.seat_summary_var = tk.StringVar(value="Choose a tour and date to see availability")

        self.booking_form_widgets: Dict[str, Any] = {}
        row = 2
        row = self._form_row(card, row, "Booking No", "booking_no", extra="auto")
        row = self._form_row(card, row, "Name *", "name")
        row = self._form_row(card, row, "Phone Number", "phone")
        row = self._form_row(card, row, "Tour Date *", "tour_date", date=True)
        row = self._form_row(card, row, "Tour Name *", "tour_name", combobox=True)
        row = self._form_row(card, row, "Seats · use the seat map", "seat", extra="seatmap")
        ttk.Label(card, textvariable=self.seat_summary_var, style="Muted.TLabel").grid(
            row=row, column=0, columnspan=3, sticky="w", pady=(1, 0))
        row += 1

        # Money fields with live due calculation.
        ttk.Label(card, text="Total Amount", style="Field.TLabel").grid(row=row, column=0,
                                                                        sticky="w", pady=(8, 0))
        self.total_entry = ttk.Entry(
            card, textvariable=self.vars["total"], width=18, style="Input.TEntry"
        )
        self.total_entry.grid(row=row + 1, column=0, columnspan=3, sticky="ew")
        row += 2
        ttk.Label(card, text="Advance", style="Field.TLabel").grid(row=row, column=0, sticky="w",
                                                                   pady=(8, 0))
        self.advance_entry = ttk.Entry(
            card, textvariable=self.vars["advance"], width=18, style="Input.TEntry"
        )
        self.advance_entry.grid(row=row + 1, column=0, columnspan=3, sticky="ew")
        row += 2

        ttk.Label(card, text="Due", style="Field.TLabel").grid(row=row, column=0, sticky="w",
                                                               pady=(8, 0))
        self.due_label = ttk.Label(card, textvariable=self.due_var, style="Due.TLabel")
        self.due_label.grid(row=row + 1, column=0, columnspan=3, sticky="w")
        row += 2

        row = self._form_row(card, row, "Booking Date", "booking_date", date=True)
        ttk.Label(card, text="Booking status", style="Field.TLabel").grid(
            row=row, column=0, sticky="w", pady=(7, 0))
        self.status_combo = ttk.Combobox(
            card, textvariable=self.vars["status"],
            values=("Confirmed", "Pending", "Cancelled"), state="readonly",
            style="Input.TCombobox"
        )
        self.status_combo.grid(row=row + 1, column=0, columnspan=3, sticky="ew")
        row += 2

        ttk.Label(card, text="Notes", style="Field.TLabel").grid(row=row, column=0, sticky="w",
                                                                 pady=(8, 0))
        row += 1
        self.notes_text = tk.Text(card, height=5, width=30, font=(self.ui_font, 12),
                                  relief="solid", borderwidth=1, wrap="word")
        self.notes_text.grid(row=row, column=0, columnspan=3, sticky="ew")
        row += 1

        buttons = ttk.Frame(card, style="Card.TFrame")
        buttons.grid(row=row, column=0, columnspan=3, sticky="ew", pady=(14, 0))
        ttk.Button(buttons, text="New", command=self.new_booking).pack(side="left", expand=True,
                                                                       fill="x", padx=(0, 4))
        ttk.Button(buttons, text="Save", command=self.save_booking,
                   style="Accent.TButton").pack(side="left", expand=True, fill="x", padx=4)
        ttk.Button(buttons, text="Delete", command=self.delete_booking).pack(side="left",
                                                                             expand=True, fill="x",
                                                                             padx=(4, 0))
        row += 1
        pdf_frame = ttk.Frame(card, style="Card.TFrame")
        pdf_frame.grid(row=row, column=0, columnspan=3, sticky="ew", pady=(8, 0))
        ttk.Button(pdf_frame, text="Receipt PDF", command=self.receipt_pdf).pack(
            side="left", expand=True, fill="x", padx=(0, 4))
        ttk.Button(pdf_frame, text="Print", command=self.print_receipt).pack(
            side="left", expand=True, fill="x", padx=4)
        ttk.Button(pdf_frame, text="List PDF", command=self.list_pdf).pack(
            side="left", expand=True, fill="x", padx=(4, 0))

        for name in ("total", "advance"):
            self.vars[name].trace_add("write", lambda *_: self.update_due())
        for name in ("tour_name", "tour_date", "seat"):
            self.vars[name].trace_add("write", lambda *_: self.update_tour_seat_summary())
        self.vars["tour_name"].trace_add(
            "write", lambda *_: self._update_new_booking_number_for_tour()
        )

    def _form_row(self, card: ttk.Frame, row: int, label: str, key: str,
                  combobox: bool = False, date: bool = False, extra: str = "") -> int:
        ttk.Label(card, text=label, style="Field.TLabel").grid(row=row, column=0, sticky="w",
                                                               pady=(8, 0))
        if combobox:
            values = self.db.active_tours()
            widget = ttk.Combobox(
                card, textvariable=self.vars[key], values=values, width=28,
                style="Input.TCombobox"
            )
            self.tour_combo = widget
        else:
            widget = ttk.Entry(card, textvariable=self.vars[key], width=30, style="Input.TEntry")
        self.booking_form_widgets[key] = widget
        widget.grid(row=row + 1, column=0, columnspan=3 if not (date or extra) else 2, sticky="ew")
        if date:
            ttk.Button(card, text="...", width=4,
                       command=lambda k=key: self.pick_date(k)).grid(row=row + 1, column=2,
                                                                     sticky="e")
        if extra == "auto":
            ttk.Button(card, text="Auto", width=6,
                       command=self.assign_number).grid(row=row + 1, column=2, sticky="e")
        elif extra == "seatmap":
            ttk.Button(card, text="Map", width=6, style="Secondary.TButton",
                       command=self.pick_tour_seats).grid(row=row + 1, column=2, sticky="e")
        return row + 2

    def _build_table(self, parent: ttk.Frame) -> None:
        panel = ttk.Frame(parent, style="Page.TFrame")
        panel.grid(row=0, column=1, sticky="nsew")
        panel.rowconfigure(1, weight=1)
        panel.columnconfigure(0, weight=1)

        filters = ttk.Frame(panel, style="Card.TFrame", padding=(10, 8))
        filters.grid(row=0, column=0, sticky="ew", pady=(0, 8))
        self.search_var = tk.StringVar()
        self.search_entry = ttk.Entry(filters, textvariable=self.search_var, width=26)
        self.search_entry.pack(side="left")
        self.search_entry.bind("<Return>", lambda event: self.refresh())
        ttk.Button(filters, text="Search", command=self.refresh).pack(side="left", padx=(6, 12))
        ttk.Button(filters, text="Clear", command=self.clear_filters).pack(side="left")

        self.due_only_var = tk.BooleanVar(value=False)
        ttk.Checkbutton(filters, text="Only with due", variable=self.due_only_var,
                        command=self.refresh).pack(side="left", padx=(16, 4))

        ttk.Label(filters, text="Tour:").pack(side="left", padx=(16, 4))
        self.tour_filter_var = tk.StringVar(value="All tours")
        self.tour_filter = ttk.Combobox(filters, textvariable=self.tour_filter_var, width=22,
                                        state="readonly")
        self.tour_filter.pack(side="left")
        self.tour_filter.bind("<<ComboboxSelected>>", lambda event: self.refresh())

        ttk.Button(filters, text="Refresh", command=self.refresh).pack(side="right")

        columns = (
            ("booking_no", "Booking No", 175),
            ("name", "Name", 150),
            ("phone", "Phone", 92),
            ("seat", "Seat", 74),
            ("tour_name", "Tour Name", 130),
            ("tour_date", "Tour Date", 88),
            ("booking_date", "Booked On", 88),
            ("status", "Status", 82),
            ("total", "Total", 82),
            ("advance", "Advance", 82),
            ("due", "Due", 82),
        )
        self.columns = columns
        frame = ttk.Frame(panel, style="Card.TFrame")
        frame.grid(row=1, column=0, sticky="nsew")
        frame.rowconfigure(0, weight=1)
        frame.columnconfigure(0, weight=1)
        self.tree = ttk.Treeview(frame, columns=[c[0] for c in columns], show="headings",
                                 selectmode="browse")
        for key, heading, width in columns:
            self.tree.heading(key, text=heading,
                              command=lambda k=key: self.sort_by(k))
            anchor = "e" if key in ("total", "advance", "due") else "w"
            self.tree.column(key, width=width, anchor=anchor, stretch=True)
        self.tree.tag_configure("due", foreground=DANGER)
        self.tree.tag_configure("clear", foreground=OK)
        self.tree.tag_configure("odd", background="#fafbfb")
        self.tree.tag_configure("cancelled", foreground=MUTED)
        scrollbar = ttk.Scrollbar(frame, orient="vertical", command=self.tree.yview)
        scrollbar_x = ttk.Scrollbar(frame, orient="horizontal", command=self.tree.xview)
        self.tree.configure(yscrollcommand=scrollbar.set, xscrollcommand=scrollbar_x.set)
        self.tree.grid(row=0, column=0, sticky="nsew")
        scrollbar.grid(row=0, column=1, sticky="ns")
        scrollbar_x.grid(row=1, column=0, sticky="ew")
        self.tree.bind("<<TreeviewSelect>>", self.on_select)
        self.tree.bind("<Double-1>", lambda event: self.load_selected())

    def _build_status(self, parent=None) -> None:
        host = parent or self.root
        bar = ttk.Frame(host, padding=(16, 7, 16, 8), style="Footer.TFrame")
        if parent is None:
            bar.pack(fill="x")
        else:
            bar.grid(row=3, column=0, sticky="ew")
        self.status_var = tk.StringVar(value="Ready · Local offline mode")
        ttk.Label(bar, textvariable=self.status_var, foreground=MUTED,
                  background=WHITE).pack(side="left")
        self.totals_var = tk.StringVar()
        ttk.Label(bar, textvariable=self.totals_var,
                  font=(self.ui_font, 10, "bold"), foreground=ACCENT_DARK,
                  background=WHITE).pack(side="right")

    def _bind_keys(self) -> None:
        self.root.bind("<Control-n>", lambda event: self.start_tour_booking())
        self.root.bind("<Control-N>", lambda event: self.start_tour_booking())
        self.root.bind("<Control-s>", lambda event: self.save_current_entry())
        self.root.bind("<Control-S>", lambda event: self.save_current_entry())
        self.root.bind("<Control-f>", lambda event: self.focus_search())
        self.root.bind("<Control-b>", lambda event: self.start_bus_ticket())

    # ------------------------------------------------------------- form data

    def focus_search(self) -> None:
        if self.search_entry is not None:
            self.search_entry.focus_set()
            self.search_entry.select_range(0, "end")

    def pick_date(self, key: str) -> None:
        current = parse_date(self.vars[key].get())

        def apply(value: Optional[_dt.date]) -> None:
            self.vars[key].set(value.isoformat() if value else "")

        DatePicker(self.root, current, apply)

    def assign_number(self) -> None:
        prefix = str(self.settings.get("receipt_prefix") or "RTT")
        tour_name = str(self.vars["tour_name"].get() or "").strip()
        tour_code = self.db.tour_code(tour_name)
        number = self.db.next_number(prefix, tour_code=tour_code)
        self._auto_booking_number = number
        self.vars["booking_no"].set(number)

    def _update_new_booking_number_for_tour(self) -> None:
        if self.selected_id is not None:
            return
        current = str(self.vars["booking_no"].get() or "").strip()
        if not current or current == self._auto_booking_number:
            self.assign_number()

    def update_due(self) -> None:
        total = self._amount("total")
        advance = self._amount("advance")
        due = round(total - advance, 2)
        self.due_var.set(money(due, self.currency))
        try:
            self.due_label.configure(foreground=DANGER if due > 0 else OK)
        except Exception:
            pass

    def _amount(self, key: str) -> float:
        raw = self.vars[key].get()
        cleaned = "".join(ch for ch in str(raw) if ch.isdigit() or ch in ".-")
        try:
            return float(cleaned or 0)
        except ValueError:
            return 0.0

    def collect_form(self) -> Dict[str, Any]:
        data = {key: var.get() for key, var in self.vars.items()}
        for key in ("booking_date", "tour_date"):
            parsed = parse_date(str(data.get(key) or ""))
            if parsed:
                data[key] = parsed.isoformat()
        data["total"] = self._amount("total")
        data["advance"] = self._amount("advance")
        data["due"] = round(data["total"] - data["advance"], 2)
        data["notes"] = self.notes_text.get("1.0", "end").strip()
        return data

    def validate_form(self, data: Dict[str, Any]) -> Optional[str]:
        if not str(data.get("name") or "").strip():
            return "Customer name is required."
        tour_name = str(data.get("tour_name") or "").strip()
        if not tour_name:
            return "Select a tour. Add one from Tours & monthly reports if it is not listed."
        archived = next((tour for tour in self.db.tour_catalog(include_inactive=True)
                         if str(tour["name"]).casefold() == tour_name.casefold()
                         and not bool(tour["active"])), None)
        if archived:
            existing = self.db.get(self.selected_id) if self.selected_id is not None else None
            if not existing or str(existing.get("tour_name") or "").casefold() != tour_name.casefold():
                return "This tour is archived. Reactivate it in Tours & monthly reports before taking new bookings."
        seats = db.seat_tokens(data.get("seat"))
        if not seats:
            return "Choose at least one seat from the tour seat map."
        allowed = set(seat_ids(self.db.tour_capacity(str(data.get("tour_name") or ""))))
        if any(seat not in allowed for seat in seats):
            return "One or more seats are not part of this tour's seat layout. Open the seat map and choose again."
        tour_date = parse_date(str(data.get("tour_date") or ""))
        if not tour_date:
            return "Tour date must be valid before a seat can be reserved."
        if str(data.get("status") or "").casefold() != "cancelled":
            conflicts = self.db.tour_seat_conflicts(
                tour_name, tour_date.isoformat(), ", ".join(seats), exclude_id=self.selected_id
            )
            if conflicts:
                return (
                    f"Seat(s) {', '.join(conflicts)} are already booked for {tour_name} "
                    f"on {tour_date.isoformat()}. Choose different seats for this trip."
                )
        if data["total"] < 0 or data["advance"] < 0:
            return "Amounts cannot be negative."
        if data["advance"] > data["total"] and data["total"] > 0:
            return "Advance cannot be larger than the total amount."
        for key in ("booking_date", "tour_date"):
            value = str(data.get(key) or "").strip()
            if value and parse_date(value) is None:
                return f"{key.replace('_', ' ').title()} must be a date like 2026-11-15."
        return None

    def clear_form(self) -> None:
        for key, var in self.vars.items():
            if key == "total":
                var.set("0")
            elif key == "advance":
                var.set("0")
            elif key == "status":
                var.set("Confirmed")
            elif key == "tour_name":
                var.set("")
            else:
                var.set("")
        self.notes_text.delete("1.0", "end")
        self.selected_id = None
        self.update_due()
        self.assign_number()

    def new_booking(self) -> None:
        # Reset every passenger/trip input after a save so the next customer
        # cannot inherit details. The booking date remains today's date; a tour
        # and departure date must be chosen for each new booking.
        self.clear_form()
        self.vars["booking_date"].set(_dt.date.today().isoformat())
        self.assign_number()
        self.update_tour_seat_summary()
        self.set_status("New tour booking — enter passenger and trip details, choose seats, and save.")

    # ---------------------------------------------------------------- actions

    def save_current_entry(self) -> None:
        try:
            page = self.notebook.tab(self.notebook.select(), "text")
        except Exception:
            page = ""
        if page == "Bus tickets":
            self.save_bus_ticket()
        else:
            self.save_booking()

    def save_booking(self) -> None:
        data = self.collect_form()
        error = self.validate_form(data)
        if error:
            messagebox.showerror("Cannot save", error, parent=self.root)
            return
        if not data["booking_no"]:
            self.assign_number()
            data["booking_no"] = self.vars["booking_no"].get().strip()
        if self.db.number_taken(data["booking_no"], self.selected_id):
            messagebox.showerror(
                "Duplicate booking number",
                f"Booking number {data['booking_no']} is already used. Press 'Auto' for a new one.",
                parent=self.root,
            )
            return
        creating_new = self.selected_id is None
        try:
            if creating_new:
                self.selected_id = self.db.add(data)
                message = f"Booking {data['booking_no']} saved."
            else:
                self.db.update(self.selected_id, data)
                message = f"Booking {data['booking_no']} updated."
        except Exception as exc:  # pragma: no cover - defensive
            messagebox.showerror("Database error", str(exc), parent=self.root)
            return

        # A successful create or update is complete. Reset the inputs and show
        # a fresh number before another passenger is entered.
        self.selected_id = None
        self.refresh()
        self.new_booking()
        self.set_status(f"{message} Ready for next booking: {self.vars['booking_no'].get()}.")

    def delete_booking(self) -> None:
        if self.selected_id is None:
            messagebox.showinfo("Delete", "Select a booking from the list first.", parent=self.root)
            return
        row = self.db.get(self.selected_id) or {}
        if not messagebox.askyesno(
            "Delete booking",
            f"Delete booking {row.get('booking_no', '')} for {row.get('name', '')}?",
            parent=self.root,
        ):
            return
        self.db.delete(self.selected_id)
        self.clear_form()
        self.refresh()
        self.set_status("Booking deleted.")

    def on_select(self, event=None) -> None:
        selection = self.tree.selection()
        if not selection:
            return
        try:
            self.selected_id = int(selection[0])
        except (ValueError, TypeError):
            self.selected_id = None
            return
        self.load_selected()

    def load_selected(self) -> None:
        if self.selected_id is None:
            return
        row = self.db.get(self.selected_id)
        if not row:
            return
        for key, var in self.vars.items():
            value = row.get(key, "")
            if key in ("total", "advance"):
                var.set(f"{float(value or 0):g}")
            else:
                var.set(value if value is not None else "")
        self.notes_text.delete("1.0", "end")
        self.notes_text.insert("1.0", str(row.get("notes") or ""))
        self.update_due()
        self.set_status(f"Editing {row.get('booking_no', '')} - {row.get('name', '')}")

    # ----------------------------------------------------------------- table

    def sort_by(self, key: str) -> None:
        if self.sort_column == key:
            self.sort_desc = not self.sort_desc
        else:
            self.sort_column = key
            self.sort_desc = key in ("booking_date", "tour_date", "total", "advance", "due")
        self.refresh()

    def clear_filters(self) -> None:
        self.search_var.set("")
        self.due_only_var.set(False)
        self.tour_filter_var.set("All tours")
        self.refresh()

    def refresh(self, keep_selection: bool = False) -> None:
        search = self.search_var.get().strip()
        tour = self.tour_filter_var.get()
        rows = self.db.list(
            search=search,
            only_due=bool(self.due_only_var.get()),
            tour=tour,
            sort_by=self.sort_column,
            sort_desc=self.sort_desc,
        )
        self.rows = rows
        for item in self.tree.get_children():
            self.tree.delete(item)
        for index, row in enumerate(rows):
            tags = ["odd"] if index % 2 else []
            if str(row.get("status") or "").lower() == "cancelled":
                tags.append("cancelled")
            else:
                tags.append("due" if float(row.get("due") or 0) > 0 else "clear")
            self.tree.insert(
                "", "end", iid=str(row["id"]),
                values=(
                    row.get("booking_no", ""),
                    row.get("name", ""),
                    row.get("phone", ""),
                    row.get("seat", ""),
                    row.get("tour_name", ""),
                    row.get("tour_date", ""),
                    row.get("booking_date", ""),
                    row.get("status", "Confirmed"),
                    money(row.get("total"), self.currency),
                    money(row.get("advance"), self.currency),
                    money(row.get("due"), self.currency),
                ),
                tags=tuple(tags),
            )
        tours = ["All tours"] + self.db.tours()
        current = self.tour_filter_var.get()
        self.tour_filter.configure(values=tours)
        if current not in tours:
            self.tour_filter_var.set("All tours")

        totals = self.db.totals(rows)
        self.totals_var.set(
            f"{totals['count']} bookings   |   Total {money(totals['total'], self.currency)}"
            f"   |   Advance {money(totals['advance'], self.currency)}"
            f"   |   Due {money(totals['due'], self.currency)}"
        )
        self.update_due()
        self.update_tour_seat_summary()
        if keep_selection and self.selected_id is not None:
            key = str(self.selected_id)
            if key in self.tree.get_children():
                self.tree.selection_set(key)
                self.tree.focus(key)
        self.refresh_dashboard()
        self.refresh_bus_tickets()
        self.refresh_tour_catalog()
        self.refresh_month_report()

    def set_status(self, message: str) -> None:
        self.status_var.set(message)

    # ------------------------------------------------------------------- PDF

    def _save_pdf(self, data: bytes, filename: str, title: str) -> Optional[str]:
        initial = str(self.settings.get("last_export_dir") or config.export_dir())
        path = filedialog.asksaveasfilename(
            parent=self.root,
            title=title,
            defaultextension=".pdf",
            initialdir=initial,
            initialfile=filename,
            filetypes=[("PDF document", "*.pdf"), ("All files", "*.*")],
        )
        if not path:
            return None
        with open(path, "wb") as handle:
            handle.write(data)
        self.settings["last_export_dir"] = os.path.dirname(path)
        config.save_settings(self.settings)
        return path

    def _after_pdf(self, path: str) -> None:
        if messagebox.askyesno(
            "PDF saved", f"Saved to:\n{path}\n\nOpen it now?", parent=self.root
        ):
            open_file(path)

    def current_booking(self) -> Optional[Dict[str, Any]]:
        if self.selected_id is None:
            return None
        return self.db.get(self.selected_id)

    def receipt_pdf(self) -> None:
        booking = self.current_booking()
        if booking is None:
            messagebox.showinfo("Receipt", "Select a booking from the list first.",
                                parent=self.root)
            return
        try:
            data = documents.booking_receipt(booking, self.settings)
        except Exception as exc:  # pragma: no cover - defensive
            messagebox.showerror("PDF error", str(exc), parent=self.root)
            return
        name = f"receipt-{booking.get('booking_no') or 'booking'}.pdf"
        path = self._save_pdf(data, name, "Save booking receipt")
        if path:
            self._after_pdf(path)

    def print_receipt(self) -> None:
        booking = self.current_booking()
        if booking is None:
            messagebox.showinfo("Print", "Select a booking from the list first.", parent=self.root)
            return
        data = documents.booking_receipt(booking, self.settings)
        path = os.path.join(config.export_dir(),
                            f"receipt-{booking.get('booking_no') or 'booking'}.pdf")
        with open(path, "wb") as handle:
            handle.write(data)
        printed = print_file(path)
        self.set_status(f"Sent {os.path.basename(path)} to the printer." if printed
                        else f"Saved {path} (opened in your PDF viewer).")

    def _report(self, rows: List[Dict[str, Any]], subtitle: str, filename: str) -> None:
        if not rows:
            messagebox.showinfo("Nothing to print", "No bookings match the current view.",
                                parent=self.root)
            return
        data = documents.booking_list_report(rows, self.settings, subtitle=subtitle)
        path = self._save_pdf(data, filename, "Save booking list report")
        if path:
            self._after_pdf(path)

    def list_pdf(self) -> None:
        self._report(self.rows, self._filter_description(), "booking-list.pdf")

    def due_pdf(self) -> None:
        rows = [row for row in self.rows if float(row.get("due") or 0) > 0]
        self._report(rows, "Due list", "due-list.pdf")

    def _filter_description(self) -> str:
        bits = []
        if self.search_var.get().strip():
            bits.append(f"Search: {self.search_var.get().strip()}")
        if self.due_only_var.get():
            bits.append("Due only")
        tour = self.tour_filter_var.get()
        if tour and tour != "All tours":
            bits.append(tour)
        return " - ".join(bits) or "All bookings"

    def export_csv(self) -> None:
        if not self.rows:
            messagebox.showinfo("Export", "There is nothing to export in the current view.",
                                parent=self.root)
            return
        path = filedialog.asksaveasfilename(
            parent=self.root, title="Export bookings to CSV", defaultextension=".csv",
            initialdir=str(self.settings.get("last_export_dir") or config.export_dir()),
            initialfile=f"bookings-{_dt.date.today().isoformat()}.csv",
            filetypes=[("CSV file", "*.csv"), ("All files", "*.*")],
        )
        if not path:
            return
        self.db.export_csv(path, self.rows)
        self.settings["last_export_dir"] = os.path.dirname(path)
        config.save_settings(self.settings)
        self.set_status(f"Exported {len(self.rows)} bookings to {path}")
        if messagebox.askyesno("Export finished", "Open the CSV file now?", parent=self.root):
            open_file(path)

    # ------------------------------------------------------------ data tools

    def backup_database(self) -> None:
        path = self.db.backup(config.backup_dir())
        self.set_status(f"Backup saved: {path}")
        messagebox.showinfo("Backup created", f"Database backed up to:\n{path}", parent=self.root)

    def restore_database(self) -> None:
        path = filedialog.askopenfilename(
            parent=self.root, title="Choose a backup file",
            initialdir=config.backup_dir(), filetypes=[("Database file", "*.db"), ("All files", "*.*")],
        )
        if not path:
            return
        if not messagebox.askyesno(
            "Restore backup",
            "Restoring replaces every booking currently stored.\n\nContinue?",
            parent=self.root,
        ):
            return
        try:
            self.db.restore(path)
        except Exception as exc:  # pragma: no cover - defensive
            messagebox.showerror("Restore failed", str(exc), parent=self.root)
            return
        self.clear_form()
        self.refresh()
        self.set_status(f"Restored from {path}")

    def open_data_folder(self) -> None:
        open_file(config.data_dir())

    def load_samples(self) -> None:
        if not messagebox.askyesno(
            "Sample data", "Add a few demo bookings? They are easy to delete afterwards.",
            parent=self.root,
        ):
            return
        self.db.seed_demo()
        self.refresh()
        self.set_status("Sample bookings added.")

    def open_settings(self) -> None:
        SettingsDialog(self.root, self.settings, on_save=self.apply_settings)

    def apply_settings(self) -> None:
        self.currency = str(self.settings.get("currency", "Tk."))
        known = {str(tour["name"]).casefold() for tour in self.db.tour_catalog(include_inactive=True)}
        for suggestion in self.settings.get("tour_suggestions") or ():
            name = str(suggestion).strip()
            if name and name.casefold() not in known:
                try:
                    self.db.add_tour(name, 40)
                    known.add(name.casefold())
                except ValueError:
                    pass
        self.header_company_label.configure(text=str(self.settings.get("company_name") or config.APP_TITLE))
        self.header_owner_label.configure(text=str(self.settings.get("owner_name") or "Safayet Hossain"))
        self.header_owner_phone_label.configure(
            text=str(self.settings.get("owner_phone") or self.settings.get("phone", "")))
        self.apply_tour_choices()
        self.refresh()
        self.set_status("Settings saved.")

    # ----------------------------------------------------------------- misc

    def show_help(self) -> None:
        messagebox.showinfo(
            "How to use",
            "TOUR BOOKINGS\n"
            "Enter passenger name and phone, choose the tour date and tour, then use Map to select open seats. Booked seats are locked for that trip. After a successful booking create or update, all trip/passenger inputs clear and a fresh unique number is shown. Click a saved row to edit it; due is Total minus Advance.\n\n"
            "TOURS & MONTHLY REPORTS\n"
            "Add or edit tours, a unique tour code, and seat capacity. The code is added before new tour booking serials; leaving it blank generates initials. Archive a tour to keep its booking history, or permanently delete it and its booking/payment records. Select a travel month to preview trips and export PDF or CSV.\n\n"
            "BUS TICKETS\n"
            "Bus ticketing is separate from tour bookings and uses its own ticket numbers and seat inventory. Enter a route/date, use Map to pick a free seat, save, then print the ticket.\n\n"
            "Use File → Backup database regularly. Everything is stored offline on this computer.\n\n"
            "Shortcuts: Ctrl+N new tour booking, Ctrl+S save, Ctrl+F search, Ctrl+B new bus ticket.",
            parent=self.root,
        )

    def show_about(self) -> None:
        messagebox.showinfo(
            "About",
            f"{config.APP_TITLE}\n{config.APP_SUBTITLE}\nVersion {config.APP_VERSION}\n\n"
            f"Data folder:\n{config.data_dir()}",
            parent=self.root,
        )

    def on_close(self) -> None:
        try:
            self.settings["window_geometry"] = self.root.geometry()
            config.save_settings(self.settings)
        except Exception:
            pass
        try:
            self.db.close()
        except Exception:
            pass
        self.root.destroy()


class SettingsDialog(tk.Toplevel):
    def __init__(self, master, settings: Dict[str, Any], on_save=None) -> None:
        super().__init__(master)
        self.settings = settings
        self.on_save = on_save
        self.title("Settings")
        self.transient(master)
        self.geometry("570x690")
        self.minsize(500, 500)
        self.resizable(True, True)
        self.configure(background=PAGE_BG)
        self.grab_set()
        self.form_panel = ScrollableFormPanel(self, width=570, card_width=550)
        self.form_panel.pack(fill="both", expand=True)
        content = self.form_panel.card
        content.columnconfigure(0, weight=1)
        content.columnconfigure(1, weight=1)

        self.vars: Dict[str, tk.Variable] = {}
        fields = [
            ("company_name", "Company name"),
            ("company_tagline", "Tagline"),
            ("owner_name", "Owner name"),
            ("owner_phone", "Owner phone"),
            ("address", "Address"),
            ("phone", "Office phone"),
            ("whatsapp", "WhatsApp"),
            ("email", "Email"),
            ("receipt_prefix", "Receipt prefix"),
            ("currency", "Currency symbol"),
            ("footer_note", "Receipt footer note"),
        ]
        row = 0
        for key, label in fields:
            ttk.Label(content, text=label).grid(row=row, column=0, sticky="w", pady=(6, 0))
            var = tk.StringVar(value=str(settings.get(key, "")))
            ttk.Entry(content, textvariable=var, width=52).grid(row=row + 1, column=0, columnspan=2,
                                                                sticky="ew")
            self.vars[key] = var
            row += 2

        ttk.Label(content, text="Terms (one per line)").grid(row=row, column=0, sticky="w",
                                                             pady=(8, 0))
        row += 1
        self.terms = tk.Text(content, height=4, width=52, wrap="word", relief="solid", borderwidth=1)
        self.terms.insert("1.0", "\n".join(str(t) for t in (settings.get("terms") or [])))
        self.terms.grid(row=row, column=0, columnspan=2, sticky="ew")
        row += 1

        ttk.Label(content, text="Manage active tours and seat capacity under Tours & monthly reports.",
                  wraplength=380, foreground=MUTED).grid(row=row, column=0, columnspan=2,
                                                         sticky="w", pady=(9, 0))
        row += 1

        buttons = ttk.Frame(content)
        buttons.grid(row=row, column=0, columnspan=2, sticky="e", pady=(14, 0))
        ttk.Button(buttons, text="Cancel", command=self.destroy).pack(side="right", padx=(8, 0))
        ttk.Button(buttons, text="Save", command=self.save).pack(side="right")

    def _text_list(self, widget: tk.Text) -> List[str]:
        return [line.strip() for line in widget.get("1.0", "end").splitlines() if line.strip()]

    def save(self) -> None:
        for key, var in self.vars.items():
            self.settings[key] = var.get().strip()
        self.settings["terms"] = self._text_list(self.terms)
        config.save_settings(self.settings)
        self.grab_release()
        self.destroy()
        if self.on_save:
            self.on_save()



def seat_ids(capacity: int = 40) -> List[str]:
    """Seat labels mirror the website's standard 40 / extended 46 layout."""
    return db.tour_seat_ids(capacity)


class SeatMapDialog(tk.Toplevel):
    """Admin seat picker using the same four-seat rows as the public website."""

    def __init__(self, master, title: str, capacity: int,
                 occupied: Dict[str, Dict[str, Any]], selected: List[str],
                 max_select: int = 40, on_save=None) -> None:
        super().__init__(master)
        self.capacity = max(1, min(46, int(capacity or 40)))
        self.seats = seat_ids(self.capacity)
        self.occupied = {db.normalise_seat(key): value for key, value in occupied.items()}
        self.selected = {db.normalise_seat(item) for item in selected if db.normalise_seat(item) in self.seats}
        self.max_select = max(1, min(int(max_select or self.capacity), self.capacity))
        self.on_save = on_save
        self.title("Seat plan")
        self.transient(master)
        self.resizable(False, False)
        self.configure(padx=16, pady=14, background=PAGE_BG)
        self.grab_set()

        ttk.Label(self, text=title, font=("Segoe UI", 14, "bold"),
                  foreground=ACCENT_DARK, background=PAGE_BG).grid(row=0, column=0, sticky="w")
        ttk.Label(self, text="Click open seats to assign or release them. Booked seats are locked.",
                  font=("Segoe UI", 10), foreground=MUTED, background=PAGE_BG).grid(
            row=1, column=0, sticky="w", pady=(3, 10))

        plan = ttk.Frame(self, style="Card.TFrame", padding=12)
        plan.grid(row=2, column=0, sticky="ew")
        plan.columnconfigure(0, weight=1)
        top = ttk.Frame(plan, style="Card.TFrame")
        top.grid(row=0, column=0, sticky="ew", pady=(0, 9))
        ttk.Label(top, text="FRONT OF BUS", font=("Segoe UI", 10, "bold"),
                  foreground=MUTED, background=WHITE).pack(side="left")
        ttk.Label(top, text="DRIVER  ◉", font=("Segoe UI", 10, "bold"),
                  foreground=ACCENT_DARK, background=WHITE).pack(side="right")

        self.map_frame = ttk.Frame(plan, style="Card.TFrame")
        self.map_frame.grid(row=1, column=0, sticky="ew")
        self.buttons: Dict[str, ttk.Button] = {}
        if "1" in self.seats:
            ttk.Label(self.map_frame, text="Front passenger", style="Muted.TLabel").grid(
                row=0, column=0, columnspan=3, sticky="w", padx=(0, 8), pady=3)
            self._make_seat_button("1", 0, 3)
            first_row = 1
        else:
            first_row = 0
        for index, letter in enumerate("ABCDEFGHIJ"):
            row_seats = [f"{letter}-{number}" for number in range(1, 5)]
            if not any(seat in self.seats for seat in row_seats):
                break
            grid_row = first_row + index
            ttk.Label(self.map_frame, text=letter, width=3, anchor="center",
                      font=("Segoe UI", 10, "bold"), foreground=MUTED,
                      background=WHITE).grid(row=grid_row, column=2, padx=5, pady=2)
            self._make_seat_button(row_seats[0], grid_row, 0)
            self._make_seat_button(row_seats[1], grid_row, 1)
            self._make_seat_button(row_seats[2], grid_row, 3)
            self._make_seat_button(row_seats[3], grid_row, 4)
        back_row = first_row + 10
        for index in range(1, 6):
            seat = f"K-{index}"
            if seat in self.seats:
                self._make_seat_button(seat, back_row, index - 1)

        legend = ttk.Frame(self, style="Page.TFrame")
        legend.grid(row=3, column=0, sticky="w", pady=(10, 4))
        for text, color in (("Available", ACCENT_SOFT), ("Selected", ACCENT), ("Booked", "#e4e9e9")):
            key = ttk.Label(legend, text=f"  {text}  ", background=color,
                            foreground=ACCENT_DARK if text != "Selected" else WHITE,
                            font=("Segoe UI", 10, "bold"), padding=(4, 3))
            key.pack(side="left", padx=(0, 7))
        self.summary_var = tk.StringVar()
        ttk.Label(self, textvariable=self.summary_var, font=("Segoe UI", 10, "bold"),
                  foreground=ACCENT_DARK, background=PAGE_BG).grid(row=4, column=0, sticky="w", pady=(5, 10))
        buttons = ttk.Frame(self, style="Page.TFrame")
        buttons.grid(row=5, column=0, sticky="e")
        ttk.Button(buttons, text="Cancel", command=self.cancel).pack(side="right", padx=(8, 0))
        ttk.Button(buttons, text="Use selected seats", style="Accent.TButton",
                   command=self.save).pack(side="right")
        self._render()

    def _make_seat_button(self, seat: str, row: int, column: int) -> None:
        if seat not in self.seats:
            return
        button = ttk.Button(self.map_frame, text=seat, width=7,
                            command=lambda label=seat: self.toggle(label))
        button.grid(row=row, column=column, padx=3, pady=2, sticky="ew")
        self.buttons[seat] = button

    def _render(self) -> None:
        for seat, button in self.buttons.items():
            if seat in self.occupied:
                button.configure(style="BookedSeat.TButton", state="disabled")
            elif seat in self.selected:
                button.configure(style="SelectedSeat.TButton", state="normal")
            else:
                button.configure(style="Seat.TButton", state="normal")
        open_count = max(0, len(self.seats) - len(set(self.seats).intersection(self.occupied)))
        self.summary_var.set(
            f"{len(self.selected)} selected  ·  {open_count} open of {len(self.seats)} seats"
        )

    def toggle(self, seat: str) -> None:
        if seat in self.occupied:
            return
        if seat in self.selected:
            self.selected.remove(seat)
        elif len(self.selected) >= self.max_select:
            self.summary_var.set(f"Select up to {self.max_select} seat{'s' if self.max_select != 1 else ''}.")
            return
        else:
            self.selected.add(seat)
        self._render()

    def cancel(self) -> None:
        try:
            self.grab_release()
        except Exception:
            pass
        self.destroy()

    def save(self) -> None:
        result = [seat for seat in self.seats if seat in self.selected]
        self.cancel()
        if self.on_save:
            self.on_save(result)



# ---------------------------------------------------------------- utilities


def open_file(path: str) -> None:
    """Open a file or folder with the operating system's default handler."""
    try:
        if sys.platform.startswith("win"):
            os.startfile(path)  # type: ignore[attr-defined]
        elif sys.platform == "darwin":
            subprocess.Popen(["open", path])
        else:
            subprocess.Popen(["xdg-open", path])
    except Exception:
        pass


def print_file(path: str) -> bool:
    """Send a PDF to the default printer. Returns ``False`` if it only opened."""
    try:
        if sys.platform.startswith("win"):
            os.startfile(path, "print")  # type: ignore[attr-defined]
            return True
        for command in (["lp", path], ["lpr", path]):
            try:
                subprocess.Popen(command)
                return True
            except FileNotFoundError:
                continue
    except Exception:
        pass
    open_file(path)
    return False


def main(argv: Optional[List[str]] = None) -> int:
    argv = list(sys.argv[1:] if argv is None else argv)
    for index, argument in enumerate(argv):
        if argument in ("--data-dir", "-d") and index + 1 < len(argv):
            os.environ["RTT_DATA_DIR"] = argv[index + 1]

    settings = config.load_settings()
    database = db.Database(config.database_path())
    root = tk.Tk()
    try:
        root.call("tk", "scaling", 1.1)
    except tk.TclError:
        pass
    app = BookingApp(root, database, settings)
    if not database.list(limit=1):
        app.new_booking()
    root.mainloop()
    return 0
