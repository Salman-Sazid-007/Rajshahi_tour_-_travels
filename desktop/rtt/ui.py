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

ACCENT = "#0b5c60"
ACCENT_DARK = "#083f42"
ACCENT_SOFT = "#e6f3f3"
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
        self.db = database
        self.settings = settings
        self.selected_id: Optional[int] = None
        self.sort_column = "booking_date"
        self.sort_desc = True
        self.rows: List[Dict[str, Any]] = []
        self.currency = str(settings.get("currency", "Tk."))
        self.search_entry: Optional[ttk.Entry] = None
        self.tour_combo: Optional[ttk.Combobox] = None

        self.ui_font = _pick_font("Segoe UI", "Helvetica Neue", "DejaVu Sans", "TkDefaultFont")
        self.ui_font_bold = (self.ui_font, 10, "bold")

        self._build_style()
        self._build_layout()
        self._bind_keys()
        self.refresh()

    # ---------------------------------------------------------------- setup

    def _build_style(self) -> None:
        style = ttk.Style()
        for theme in ("vista", "clam", "default"):
            try:
                style.theme_use(theme)
                break
            except tk.TclError:
                continue
        style.configure(".", font=(self.ui_font, 10))
        style.configure("TFrame", background="#f5f7f8")
        style.configure("Card.TFrame", background="white", relief="flat")
        style.configure("Title.TLabel", font=(self.ui_font, 15, "bold"), foreground=ACCENT_DARK,
                        background="#f5f7f8")
        style.configure("Sub.TLabel", font=(self.ui_font, 9), foreground="#5b6b70",
                        background="#f5f7f8")
        style.configure("Field.TLabel", font=(self.ui_font, 9, "bold"), foreground="#3d4c50",
                        background="white")
        style.configure("Card.TLabel", font=(self.ui_font, 10, "bold"), foreground=ACCENT_DARK,
                        background="white")
        style.configure("Header.TLabel", font=(self.ui_font, 10, "bold"), foreground=ACCENT_DARK,
                        background="white")
        style.configure("Accent.TButton", font=(self.ui_font, 10, "bold"))
        style.configure("Due.TLabel", font=(self.ui_font, 13, "bold"), foreground=DANGER,
                        background="white")
        style.configure("Treeview", font=(self.ui_font, 9), rowheight=24)
        style.configure("Treeview.Heading", font=(self.ui_font, 9, "bold"))
        style.map("Treeview", background=[("selected", ACCENT_SOFT)],
                  foreground=[("selected", "#0b2b2d")])

        self.root.configure(background="#f5f7f8")

    def _build_layout(self) -> None:
        self.root.title(f"{config.APP_TITLE} - {config.APP_SUBTITLE}")
        geometry = str(self.settings.get("window_geometry") or "1180x720")
        self.root.geometry(geometry)
        self.root.minsize(980, 620)
        self.root.protocol("WM_DELETE_WINDOW", self.on_close)

        header = ttk.Frame(self.root, padding=(16, 12, 16, 6))
        header.pack(fill="x")
        ttk.Label(header, text=config.APP_TITLE, style="Title.TLabel").pack(anchor="w")
        ttk.Label(header, text="Collect bookings, track advance and due, and print PDF receipts",
                  style="Sub.TLabel").pack(anchor="w")

        body = ttk.Frame(self.root, padding=(16, 8, 16, 8))
        body.pack(fill="both", expand=True)
        body.columnconfigure(1, weight=1)
        body.rowconfigure(0, weight=1)

        self._build_form(body)
        self._build_table(body)
        self._build_status()
        self._build_menu()

    def _build_menu(self) -> None:
        menubar = tk.Menu(self.root)
        file_menu = tk.Menu(menubar, tearoff=0)
        file_menu.add_command(label="New booking", command=self.new_booking, accelerator="Ctrl+N")
        file_menu.add_command(label="Save booking", command=self.save_booking, accelerator="Ctrl+S")
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
        card = ttk.Frame(parent, width=360, style="Card.TFrame", padding=14)
        card.grid(row=0, column=0, sticky="nsw", padx=(0, 12))
        card.grid_propagate(False)

        ttk.Label(card, text="Booking details", style="Header.TLabel").grid(
            row=0, column=0, columnspan=3, sticky="w", pady=(0, 10))

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

        row = 1
        row = self._form_row(card, row, "Booking No", "booking_no", extra="auto")
        row = self._form_row(card, row, "Name *", "name")
        row = self._form_row(card, row, "Phone Number", "phone")
        row = self._form_row(card, row, "Seat", "seat")
        row = self._form_row(card, row, "Tour Name", "tour_name", combobox=True)

        # Money fields with live due calculation.
        ttk.Label(card, text="Total Amount", style="Field.TLabel").grid(row=row, column=0,
                                                                        sticky="w", pady=(8, 0))
        self.total_entry = ttk.Entry(card, textvariable=self.vars["total"], width=18)
        self.total_entry.grid(row=row + 1, column=0, columnspan=3, sticky="ew")
        row += 2
        ttk.Label(card, text="Advance", style="Field.TLabel").grid(row=row, column=0, sticky="w",
                                                                   pady=(8, 0))
        self.advance_entry = ttk.Entry(card, textvariable=self.vars["advance"], width=18)
        self.advance_entry.grid(row=row + 1, column=0, columnspan=3, sticky="ew")
        row += 2

        ttk.Label(card, text="Due", style="Field.TLabel").grid(row=row, column=0, sticky="w",
                                                               pady=(8, 0))
        self.due_label = ttk.Label(card, textvariable=self.due_var, style="Due.TLabel")
        self.due_label.grid(row=row + 1, column=0, columnspan=3, sticky="w")
        row += 2

        row = self._form_row(card, row, "Booking Date", "booking_date", date=True)
        row = self._form_row(card, row, "Tour Date", "tour_date", date=True)

        ttk.Label(card, text="Notes", style="Field.TLabel").grid(row=row, column=0, sticky="w",
                                                                 pady=(8, 0))
        row += 1
        self.notes_text = tk.Text(card, height=4, width=30, font=(self.ui_font, 9),
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

    def _form_row(self, card: ttk.Frame, row: int, label: str, key: str,
                  combobox: bool = False, date: bool = False, extra: str = "") -> int:
        ttk.Label(card, text=label, style="Field.TLabel").grid(row=row, column=0, sticky="w",
                                                               pady=(8, 0))
        if combobox:
            values = list(self.settings.get("tour_suggestions") or [])
            for used in self.db.tours():
                if used not in values:
                    values.append(used)
            widget = ttk.Combobox(card, textvariable=self.vars[key], values=values, width=28)
            self.tour_combo = widget
        else:
            widget = ttk.Entry(card, textvariable=self.vars[key], width=30)
        widget.grid(row=row + 1, column=0, columnspan=3 if not (date or extra) else 2, sticky="ew")
        if date:
            ttk.Button(card, text="...", width=4,
                       command=lambda k=key: self.pick_date(k)).grid(row=row + 1, column=2,
                                                                     sticky="e")
        if extra == "auto":
            ttk.Button(card, text="Auto", width=6,
                       command=self.assign_number).grid(row=row + 1, column=2, sticky="e")
        return row + 2

    def _build_table(self, parent: ttk.Frame) -> None:
        panel = ttk.Frame(parent)
        panel.grid(row=0, column=1, sticky="nsew")
        panel.rowconfigure(1, weight=1)
        panel.columnconfigure(0, weight=1)

        filters = ttk.Frame(panel)
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
            ("booking_no", "Booking No", 96),
            ("name", "Name", 150),
            ("phone", "Phone", 92),
            ("seat", "Seat", 74),
            ("tour_name", "Tour Name", 130),
            ("tour_date", "Tour Date", 88),
            ("booking_date", "Booked On", 88),
            ("total", "Total", 82),
            ("advance", "Advance", 82),
            ("due", "Due", 82),
        )
        self.columns = columns
        frame = ttk.Frame(panel)
        frame.grid(row=1, column=0, sticky="nsew")
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
        scrollbar = ttk.Scrollbar(frame, orient="vertical", command=self.tree.yview)
        self.tree.configure(yscrollcommand=scrollbar.set)
        self.tree.pack(side="left", fill="both", expand=True)
        scrollbar.pack(side="right", fill="y")
        self.tree.bind("<<TreeviewSelect>>", self.on_select)
        self.tree.bind("<Double-1>", lambda event: self.load_selected())

    def _build_status(self) -> None:
        bar = ttk.Frame(self.root, padding=(16, 6, 16, 10))
        bar.pack(fill="x")
        self.status_var = tk.StringVar(value="Ready")
        ttk.Label(bar, textvariable=self.status_var).pack(side="left")
        self.totals_var = tk.StringVar()
        ttk.Label(bar, textvariable=self.totals_var,
                  font=(self.ui_font, 10, "bold"), foreground=ACCENT_DARK).pack(side="right")

    def _bind_keys(self) -> None:
        self.root.bind("<Control-n>", lambda event: self.new_booking())
        self.root.bind("<Control-N>", lambda event: self.new_booking())
        self.root.bind("<Control-s>", lambda event: self.save_booking())
        self.root.bind("<Control-S>", lambda event: self.save_booking())
        self.root.bind("<Control-f>", lambda event: self.focus_search())

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
        self.vars["booking_no"].set(self.db.next_number(prefix))

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
        data["total"] = self._amount("total")
        data["advance"] = self._amount("advance")
        data["due"] = round(data["total"] - data["advance"], 2)
        data["notes"] = self.notes_text.get("1.0", "end").strip()
        return data

    def validate_form(self, data: Dict[str, Any]) -> Optional[str]:
        if not str(data.get("name") or "").strip():
            return "Customer name is required."
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
            else:
                var.set("")
        self.notes_text.delete("1.0", "end")
        self.selected_id = None
        self.update_due()

    def new_booking(self) -> None:
        self.clear_form()
        self.vars["booking_date"].set(_dt.date.today().isoformat())
        self.assign_number()
        self.set_status("New booking - fill in the details and press Save.")

    # ---------------------------------------------------------------- actions

    def save_booking(self) -> None:
        data = self.collect_form()
        error = self.validate_form(data)
        if error:
            messagebox.showerror("Cannot save", error, parent=self.root)
            return
        if not data["booking_no"]:
            data["booking_no"] = self.db.next_number(str(self.settings.get("receipt_prefix") or "RTT"))
        if self.db.number_taken(data["booking_no"], self.selected_id):
            messagebox.showerror(
                "Duplicate booking number",
                f"Booking number {data['booking_no']} is already used. Press 'Auto' for a new one.",
                parent=self.root,
            )
            return
        try:
            if self.selected_id is None:
                self.selected_id = self.db.add(data)
                message = f"Booking {data['booking_no']} saved."
            else:
                self.db.update(self.selected_id, data)
                message = f"Booking {data['booking_no']} updated."
        except Exception as exc:  # pragma: no cover - defensive
            messagebox.showerror("Database error", str(exc), parent=self.root)
            return
        self.refresh(keep_selection=True)
        self.set_status(message)

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
        if keep_selection and self.selected_id is not None:
            self.tree.selection_set(str(self.selected_id))
            self.tree.focus(str(self.selected_id))

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
        values = list(self.settings.get("tour_suggestions") or [])
        for used in self.db.tours():
            if used not in values:
                values.append(used)
        if self.tour_combo is not None:
            try:
                self.tour_combo.configure(values=values)
            except tk.TclError:
                pass
        self.refresh()
        self.set_status("Settings saved.")

    # ----------------------------------------------------------------- misc

    def show_help(self) -> None:
        messagebox.showinfo(
            "How to use",
            "1. Click New, fill in the customer details and press Save.\n"
            "2. Due is calculated automatically: Total minus Advance.\n"
            "3. Select a row to edit it, or double-click to load it into the form.\n"
            "4. Receipt PDF prints one booking; List PDF prints the whole table.\n"
            "5. Use Backup regularly - it copies the database into the Backups folder.\n\n"
            "Shortcuts: Ctrl+N new, Ctrl+S save, Ctrl+F search.",
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
        self.resizable(False, False)
        self.configure(padx=16, pady=12, background="white")
        self.grab_set()

        self.vars: Dict[str, tk.Variable] = {}
        fields = [
            ("company_name", "Company name"),
            ("company_tagline", "Tagline"),
            ("address", "Address"),
            ("phone", "Phone"),
            ("whatsapp", "WhatsApp"),
            ("email", "Email"),
            ("receipt_prefix", "Receipt prefix"),
            ("currency", "Currency symbol"),
            ("footer_note", "Receipt footer note"),
        ]
        row = 0
        for key, label in fields:
            ttk.Label(self, text=label).grid(row=row, column=0, sticky="w", pady=(6, 0))
            var = tk.StringVar(value=str(settings.get(key, "")))
            ttk.Entry(self, textvariable=var, width=52).grid(row=row + 1, column=0, columnspan=2,
                                                             sticky="ew")
            self.vars[key] = var
            row += 2

        ttk.Label(self, text="Terms (one per line)").grid(row=row, column=0, sticky="w",
                                                          pady=(8, 0))
        row += 1
        self.terms = tk.Text(self, height=4, width=52, wrap="word", relief="solid", borderwidth=1)
        self.terms.insert("1.0", "\n".join(str(t) for t in (settings.get("terms") or [])))
        self.terms.grid(row=row, column=0, columnspan=2, sticky="ew")
        row += 1

        ttk.Label(self, text="Tour name suggestions (one per line)").grid(row=row, column=0,
                                                                          sticky="w", pady=(8, 0))
        row += 1
        self.tours = tk.Text(self, height=5, width=52, wrap="word", relief="solid", borderwidth=1)
        self.tours.insert("1.0", "\n".join(str(t) for t in (settings.get("tour_suggestions") or [])))
        self.tours.grid(row=row, column=0, columnspan=2, sticky="ew")
        row += 1

        buttons = ttk.Frame(self)
        buttons.grid(row=row, column=0, columnspan=2, sticky="e", pady=(14, 0))
        ttk.Button(buttons, text="Cancel", command=self.destroy).pack(side="right", padx=(8, 0))
        ttk.Button(buttons, text="Save", command=self.save).pack(side="right")

    def _text_list(self, widget: tk.Text) -> List[str]:
        return [line.strip() for line in widget.get("1.0", "end").splitlines() if line.strip()]

    def save(self) -> None:
        for key, var in self.vars.items():
            self.settings[key] = var.get().strip()
        self.settings["terms"] = self._text_list(self.terms)
        self.settings["tour_suggestions"] = self._text_list(self.tours)
        config.save_settings(self.settings)
        self.grab_release()
        self.destroy()
        if self.on_save:
            self.on_save()


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
