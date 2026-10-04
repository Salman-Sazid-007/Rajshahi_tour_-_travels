"""SQLite storage for bookings.

One table, one row per booking. Every amount is stored as a REAL number of
Taka; ``due`` is kept in sync with ``total - advance`` whenever a row is
written so that reports never have to guess.
"""

from __future__ import annotations

import csv
import datetime as _dt
import os
import shutil
import sqlite3
from typing import Any, Dict, Iterable, List, Optional, Sequence

from .config import BOOKING_FIELDS, money

SCHEMA = """
CREATE TABLE IF NOT EXISTS bookings (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    booking_no    TEXT UNIQUE,
    name          TEXT NOT NULL,
    phone         TEXT DEFAULT '',
    seat          TEXT DEFAULT '',
    total         REAL DEFAULT 0,
    advance       REAL DEFAULT 0,
    due           REAL DEFAULT 0,
    booking_date  TEXT DEFAULT '',
    tour_date     TEXT DEFAULT '',
    tour_name     TEXT DEFAULT '',
    notes         TEXT DEFAULT '',
    status        TEXT DEFAULT 'Confirmed',
    created_at    TEXT DEFAULT '',
    updated_at    TEXT DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_bookings_name  ON bookings(name);
CREATE INDEX IF NOT EXISTS idx_bookings_phone ON bookings(phone);
CREATE INDEX IF NOT EXISTS idx_bookings_tour  ON bookings(tour_name);
CREATE INDEX IF NOT EXISTS idx_bookings_tdate ON bookings(tour_date);
"""

COLUMNS = (
    "id", "booking_no", "name", "phone", "seat", "total", "advance", "due",
    "booking_date", "tour_date", "tour_name", "notes", "status",
    "created_at", "updated_at",
)


def _now() -> str:
    return _dt.datetime.now().isoformat(timespec="seconds")


def _clean(row: Dict[str, Any]) -> Dict[str, Any]:
    """Normalise a booking dictionary coming from the UI."""
    data = {key: ("" if row.get(key) is None else row.get(key)) for key in COLUMNS if key in row}
    for field in ("total", "advance", "due"):
        try:
            data[field] = round(float(row.get(field) or 0), 2)
        except (TypeError, ValueError):
            data[field] = 0.0
    data["due"] = round(data.get("total", 0) - data.get("advance", 0), 2)
    for field in ("name", "phone", "seat", "tour_name", "booking_no", "status"):
        if field in data:
            data[field] = str(data[field]).strip()
    if "notes" in data:
        data["notes"] = str(data["notes"]).strip()
    return data


class Database:
    def __init__(self, path: str) -> None:
        self.path = path
        directory = os.path.dirname(path)
        if directory:
            os.makedirs(directory, exist_ok=True)
        self.connection = sqlite3.connect(path)
        self.connection.row_factory = sqlite3.Row
        self.connection.execute("PRAGMA foreign_keys = ON")
        self.connection.executescript(SCHEMA)
        self.connection.commit()

    # ------------------------------------------------------------ lifecycle

    def close(self) -> None:
        try:
            self.connection.commit()
        except sqlite3.Error:
            pass
        self.connection.close()

    def __enter__(self) -> "Database":
        return self

    def __exit__(self, *exc) -> None:
        self.close()

    # ------------------------------------------------------------- reading

    def get(self, booking_id: int) -> Optional[Dict[str, Any]]:
        cur = self.connection.execute("SELECT * FROM bookings WHERE id = ?", (booking_id,))
        row = cur.fetchone()
        return dict(row) if row else None

    def list(
        self,
        search: str = "",
        only_due: bool = False,
        tour: str = "",
        date_from: str = "",
        date_to: str = "",
        sort_by: str = "booking_date",
        sort_desc: bool = True,
        limit: int = 0,
    ) -> List[Dict[str, Any]]:
        clauses: List[str] = []
        params: List[Any] = []
        if search:
            like = f"%{search}%"
            clauses.append(
                "(name LIKE ? OR phone LIKE ? OR seat LIKE ? OR tour_name LIKE ? OR booking_no LIKE ?)"
            )
            params.extend([like] * 5)
        if only_due:
            clauses.append("due > 0")
        if tour and tour != "All tours":
            clauses.append("tour_name = ?")
            params.append(tour)
        if date_from:
            clauses.append("tour_date >= ?")
            params.append(date_from)
        if date_to:
            clauses.append("tour_date <= ?")
            params.append(date_to)
        where = (" WHERE " + " AND ".join(clauses)) if clauses else ""
        allowed = {
            "booking_date", "tour_date", "name", "tour_name", "seat",
            "total", "advance", "due", "booking_no", "id",
        }
        column = sort_by if sort_by in allowed else "booking_date"
        order = "DESC" if sort_desc else "ASC"
        sql = (
            "SELECT * FROM bookings"
            + where
            + f" ORDER BY {column} {order}, id DESC"
        )
        if limit:
            sql += " LIMIT ?"
            params.append(limit)
        cur = self.connection.execute(sql, params)
        return [dict(row) for row in cur.fetchall()]

    def tours(self) -> List[str]:
        cur = self.connection.execute(
            "SELECT DISTINCT tour_name FROM bookings WHERE tour_name != '' ORDER BY tour_name"
        )
        return [row[0] for row in cur.fetchall()]

    def totals(self, rows: Optional[Sequence[Dict[str, Any]]] = None) -> Dict[str, float]:
        if rows is None:
            rows = self.list()
        total = sum(float(r.get("total") or 0) for r in rows)
        advance = sum(float(r.get("advance") or 0) for r in rows)
        due = sum(float(r.get("due") or 0) for r in rows)
        return {"count": len(rows), "total": total, "advance": advance, "due": due}

    # ------------------------------------------------------------- writing

    def add(self, data: Dict[str, Any]) -> int:
        row = _clean(data)
        row.setdefault("status", "Confirmed")
        row["created_at"] = _now()
        row["updated_at"] = row["created_at"]
        columns = [c for c in COLUMNS if c != "id"]
        sql = f"INSERT INTO bookings ({', '.join(columns)}) VALUES ({', '.join('?' * len(columns))})"
        cur = self.connection.execute(sql, [row.get(c, "") for c in columns])
        self.connection.commit()
        return int(cur.lastrowid)

    def update(self, booking_id: int, data: Dict[str, Any]) -> None:
        row = _clean(data)
        row["updated_at"] = _now()
        columns = [c for c in COLUMNS if c not in ("id", "created_at")]
        assignments = ", ".join(f"{c} = ?" for c in columns)
        self.connection.execute(
            f"UPDATE bookings SET {assignments} WHERE id = ?",
            [row.get(c, "") for c in columns] + [booking_id],
        )
        self.connection.commit()

    def delete(self, booking_id: int) -> None:
        self.connection.execute("DELETE FROM bookings WHERE id = ?", (booking_id,))
        self.connection.commit()

    def next_number(self, prefix: str = "RTT") -> str:
        """Next receipt number: ``RTT-2026-0007`` (year based, per prefix)."""
        year = _dt.date.today().year
        pattern = f"{prefix}-{year}-%"
        cur = self.connection.execute(
            "SELECT booking_no FROM bookings WHERE booking_no LIKE ? ORDER BY booking_no DESC LIMIT 1",
            (pattern,),
        )
        row = cur.fetchone()
        last = 0
        if row and row[0]:
            tail = str(row[0]).rsplit("-", 1)[-1]
            if tail.isdigit():
                last = int(tail)
        return f"{prefix}-{year}-{last + 1:04d}"

    def number_taken(self, booking_no: str, exclude_id: Optional[int] = None) -> bool:
        if exclude_id:
            cur = self.connection.execute(
                "SELECT 1 FROM bookings WHERE booking_no = ? AND id != ?", (booking_no, exclude_id)
            )
        else:
            cur = self.connection.execute(
                "SELECT 1 FROM bookings WHERE booking_no = ?", (booking_no,)
            )
        return cur.fetchone() is not None

    # -------------------------------------------------------------- export

    def export_csv(self, path: str, rows: Iterable[Dict[str, Any]]) -> str:
        rows = list(rows)
        directory = os.path.dirname(path)
        if directory:
            os.makedirs(directory, exist_ok=True)
        headers = [
            "Booking No", "Name", "Phone", "Seat", "Total Amount", "Advance",
            "Due", "Booking Date", "Tour Date", "Tour Name", "Notes", "Status",
        ]
        with open(path, "w", newline="", encoding="utf-8-sig") as handle:
            writer = csv.writer(handle)
            writer.writerow(headers)
            for row in rows:
                writer.writerow([
                    row.get("booking_no", ""), row.get("name", ""), row.get("phone", ""),
                    row.get("seat", ""), f"{float(row.get('total') or 0):.2f}",
                    f"{float(row.get('advance') or 0):.2f}", f"{float(row.get('due') or 0):.2f}",
                    row.get("booking_date", ""), row.get("tour_date", ""),
                    row.get("tour_name", ""), row.get("notes", ""), row.get("status", ""),
                ])
            writer.writerow([])
            totals = self.totals(rows)
            writer.writerow([
                "TOTAL", f"{totals['count']} bookings", "", "",
                f"{totals['total']:.2f}", f"{totals['advance']:.2f}", f"{totals['due']:.2f}",
            ])
        return path

    def backup(self, target_dir: str) -> str:
        os.makedirs(target_dir, exist_ok=True)
        stamp = _dt.datetime.now().strftime("%Y%m%d-%H%M%S")
        target = os.path.join(target_dir, f"bookings-{stamp}.db")
        self.connection.commit()
        # sqlite3.Connection.backup keeps the file consistent even while open.
        with sqlite3.connect(target) as destination:
            self.connection.backup(destination)
        return target

    def restore(self, source: str) -> None:
        if not os.path.exists(source):
            raise FileNotFoundError(source)
        self.close()
        shutil.copy2(source, self.path)
        self.connection = sqlite3.connect(self.path)
        self.connection.row_factory = sqlite3.Row
        self.connection.executescript(SCHEMA)
        self.connection.commit()

    def seed_demo(self, count: int = 6) -> None:
        """Insert a few sample rows (used by the Settings dialog and tests)."""
        samples = [
            ("Mohammad Rahim", "01712223344", "A1, A2", 12500, 5000, "2026-11-15", "Cox's Bazar Tour"),
            ("Fatima Akter", "01823334455", "B3", 9800, 9800, "2026-11-20", "Sajek Valley Tour"),
            ("Abdul Karim", "01934445566", "C5, C6", 18500, 8000, "2026-12-02", "Sylhet Tour"),
            ("Sumaiya Islam", "01645556677", "D2", 7600, 2000, "2026-12-10", "Sundarbans Tour"),
            ("Tanvir Ahmed", "01556667788", "E4", 14200, 14200, "2026-12-18", "Bandarban Tour"),
            ("Nusrat Jahan", "01367778899", "F1, F2, F3", 21500, 10000, "2026-12-22", "Saint Martin Tour"),
        ]
        today = _dt.date.today()
        for index, (name, phone, seat, total, advance, tour_date, tour) in enumerate(samples[:count]):
            if self.connection.execute("SELECT 1 FROM bookings WHERE phone = ?", (phone,)).fetchone():
                continue
            booking_date = (today - _dt.timedelta(days=index * 3)).isoformat()
            self.add({
                "booking_no": self.next_number("RTT"),
                "name": name,
                "phone": phone,
                "seat": seat,
                "total": total,
                "advance": advance,
                "booking_date": booking_date,
                "tour_date": tour_date,
                "tour_name": tour,
                "notes": "Sample record created for demonstration.",
            })
