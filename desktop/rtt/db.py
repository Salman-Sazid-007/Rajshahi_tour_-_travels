"""SQLite storage for offline tour bookings, the tour catalogue and bus tickets.

Amounts are stored as Taka; each booking or ticket balance is derived from its
fare/total minus the recorded advance. Seat occupancy is scoped to a tour/date
or route/date so independent trips do not block one another.
"""

from __future__ import annotations

import calendar
import csv
import datetime as _dt
import os
import re
import shutil
import sqlite3
from typing import Any, Dict, Iterable, List, Optional, Sequence

from .config import DEFAULT_SETTINGS, money, parse_date

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

-- A local catalogue keeps tour sections stable even before the first booking.
CREATE TABLE IF NOT EXISTS tour_catalog (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    name          TEXT NOT NULL COLLATE NOCASE UNIQUE,
    seat_capacity INTEGER NOT NULL DEFAULT 40,
    active        INTEGER NOT NULL DEFAULT 1,
    created_at    TEXT NOT NULL DEFAULT ''
);

-- The office's offline point-to-point bus inventory is kept separate from
-- tour bookings so the same physical seat can be sold on a different date.
CREATE TABLE IF NOT EXISTS bus_tickets (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    ticket_no      TEXT NOT NULL UNIQUE,
    route          TEXT NOT NULL,
    travel_date    TEXT NOT NULL,
    departure_time TEXT DEFAULT '',
    name           TEXT NOT NULL,
    phone          TEXT DEFAULT '',
    seat           TEXT NOT NULL,
    fare           REAL NOT NULL DEFAULT 0,
    advance        REAL NOT NULL DEFAULT 0,
    due            REAL NOT NULL DEFAULT 0,
    status         TEXT NOT NULL DEFAULT 'Booked',
    notes          TEXT DEFAULT '',
    created_at     TEXT NOT NULL DEFAULT '',
    updated_at     TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_bus_tickets_trip ON bus_tickets(route, travel_date);
CREATE INDEX IF NOT EXISTS idx_bus_tickets_name ON bus_tickets(name);
CREATE TABLE IF NOT EXISTS app_meta (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
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
    for field in ("booking_date", "tour_date"):
        parsed = parse_date(str(data.get(field) or ""))
        if parsed and field in data:
            data[field] = parsed.isoformat()
    if "notes" in data:
        data["notes"] = str(data["notes"]).strip()
    return data


def _normalise_route(value: Any) -> str:
    """Collapse spacing around the common one-way arrow separators."""
    text = re.sub(r"\s+", " ", str(value or "")).strip()
    text = re.sub(r"\s*(?:->|→|–>|—>)\s*", " → ", text)
    return re.sub(r"\s+", " ", text).strip()


def normalise_seat(value: Any) -> str:
    """Canonicalise website-style seat labels (``A1`` → ``A-1``)."""
    text = re.sub(r"\s+", "", str(value or "")).upper()
    match = re.fullmatch(r"([A-K])[-_]?([1-5])", text)
    if match:
        return f"{match.group(1)}-{match.group(2)}"
    return text


def seat_tokens(value: Any) -> List[str]:
    """Split the legacy comma-separated seat field into canonical labels."""
    text = str(value or "").strip()
    if not text:
        return []
    pieces = re.split(r"[,;/\n]+", text)
    result: List[str] = []
    for piece in pieces:
        # Spaces also separate compact legacy values like "A1 A2".
        for token in piece.split():
            seat = normalise_seat(token)
            if seat and seat not in result:
                result.append(seat)
    return result


def tour_seat_ids(capacity: Any = 40) -> List[str]:
    """Website-style tour map labels for a standard or extended coach."""
    try:
        count = int(capacity or 40)
    except (TypeError, ValueError):
        count = 40
    count = max(1, min(46, count))
    standard = [f"{row}-{number}" for row in "ABCDEFGHIJ" for number in range(1, 5)]
    extended = ["1", *standard, *(f"K-{number}" for number in range(1, 6))]
    return extended[:count] if count > 40 else standard[:count]


def _clean_bus_ticket(row: Dict[str, Any]) -> Dict[str, Any]:
    data = {
        "ticket_no": str(row.get("ticket_no") or "").strip(),
        "route": _normalise_route(row.get("route")),
        "travel_date": str(row.get("travel_date") or "").strip(),
        "departure_time": str(row.get("departure_time") or "").strip(),
        "name": str(row.get("name") or "").strip(),
        "phone": str(row.get("phone") or "").strip(),
        "seat": normalise_seat(row.get("seat")),
        "status": str(row.get("status") or "Booked").strip(),
        "notes": str(row.get("notes") or "").strip(),
    }
    parsed_date = parse_date(data["travel_date"])
    if parsed_date:
        data["travel_date"] = parsed_date.isoformat()
    for field in ("fare", "advance"):
        try:
            data[field] = round(float(row.get(field) or 0), 2)
        except (TypeError, ValueError):
            data[field] = 0.0
    data["due"] = round(data["fare"] - data["advance"], 2)
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
        self._normalise_legacy_values()
        self._seed_tour_catalog()

    def _normalise_legacy_values(self) -> None:
        """Canonicalise dates and route separators from older local entries."""
        self.connection.execute("BEGIN IMMEDIATE")
        try:
            rows = self.connection.execute(
                "SELECT id, booking_date, tour_date FROM bookings"
            ).fetchall()
            for row in rows:
                changes = {}
                for field in ("booking_date", "tour_date"):
                    parsed = parse_date(str(row[field] or ""))
                    if parsed and parsed.isoformat() != str(row[field] or ""):
                        changes[field] = parsed.isoformat()
                if changes:
                    self.connection.execute(
                        "UPDATE bookings SET " + ", ".join(f"{field} = ?" for field in changes)
                        + " WHERE id = ?", [*changes.values(), row["id"]],
                    )

            tickets = self.connection.execute(
                "SELECT id, travel_date, route FROM bus_tickets"
            ).fetchall()
            for ticket in tickets:
                changes = {}
                parsed = parse_date(str(ticket["travel_date"] or ""))
                if parsed and parsed.isoformat() != str(ticket["travel_date"] or ""):
                    changes["travel_date"] = parsed.isoformat()
                route = _normalise_route(ticket["route"])
                if route != str(ticket["route"] or ""):
                    changes["route"] = route
                if changes:
                    self.connection.execute(
                        "UPDATE bus_tickets SET " + ", ".join(f"{field} = ?" for field in changes)
                        + " WHERE id = ?", [*changes.values(), ticket["id"]],
                    )
            self.connection.commit()
        except Exception:
            self.connection.rollback()
            raise

    def _seed_tour_catalog(self) -> None:
        """Upgrade old installs and seed defaults exactly once."""
        now = _now()
        seeded = self.connection.execute(
            "SELECT value FROM app_meta WHERE key = 'tour_catalog_seeded'"
        ).fetchone()
        if not seeded:
            defaults = [str(name).strip() for name in DEFAULT_SETTINGS.get("tour_suggestions", ())
                        if str(name).strip()]
            self.connection.executemany(
                "INSERT OR IGNORE INTO tour_catalog(name, seat_capacity, active, created_at) "
                "VALUES (?, 40, 1, ?)", [(name, now) for name in defaults],
            )
            self.connection.execute(
                "INSERT OR REPLACE INTO app_meta(key, value) VALUES ('tour_catalog_seeded', '1')"
            )
        # Upgrade legacy databases: make sure pre-existing booking names are
        # available in the catalogue unless the owner already archived them.
        existing = self.connection.execute(
            "SELECT DISTINCT tour_name FROM bookings WHERE TRIM(tour_name) != ''"
        ).fetchall()
        for row in existing:
            name = str(row[0]).strip()
            if name:
                self.connection.execute(
                    "INSERT OR IGNORE INTO tour_catalog(name, seat_capacity, active, created_at) "
                    "VALUES (?, 40, 1, ?)", (name, now),
                )
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

    def active_tours(self) -> List[str]:
        rows = self.connection.execute(
            "SELECT name FROM tour_catalog WHERE active = 1 ORDER BY name COLLATE NOCASE"
        ).fetchall()
        return [str(row[0]) for row in rows]

    def tours(self) -> List[str]:
        """Active tour names plus historic names retained by old bookings."""
        catalog = self.connection.execute(
            "SELECT name FROM tour_catalog WHERE active = 1 ORDER BY name COLLATE NOCASE"
        ).fetchall()
        historic = self.connection.execute(
            "SELECT DISTINCT tour_name FROM bookings WHERE TRIM(tour_name) != '' ORDER BY tour_name COLLATE NOCASE"
        ).fetchall()
        values = {str(row[0]).strip() for row in catalog + historic if str(row[0]).strip()}
        return sorted(values, key=str.casefold)

    def tour_catalog(self, include_inactive: bool = False) -> List[Dict[str, Any]]:
        active_clause = "" if include_inactive else "WHERE t.active = 1"
        rows = self.connection.execute(
            "SELECT t.id, t.name, t.seat_capacity, t.active, t.created_at, "
            "COUNT(b.id) AS booking_count "
            "FROM tour_catalog t LEFT JOIN bookings b ON b.tour_name = t.name COLLATE NOCASE "
            f"{active_clause} GROUP BY t.id ORDER BY t.active DESC, t.name COLLATE NOCASE"
        ).fetchall()
        return [dict(row) for row in rows]

    def _ensure_tour(self, name: str, capacity: int = 40) -> int:
        name = str(name or "").strip()
        if not name:
            return 0
        row = self.connection.execute(
            "SELECT id FROM tour_catalog WHERE name = ? COLLATE NOCASE", (name,)
        ).fetchone()
        if row:
            return int(row[0])
        cur = self.connection.execute(
            "INSERT INTO tour_catalog(name, seat_capacity, active, created_at) VALUES (?, ?, 1, ?)",
            (name, max(1, min(46, int(capacity))), _now()),
        )
        return int(cur.lastrowid)

    def add_tour(self, name: str, seat_capacity: int = 40) -> int:
        name = str(name or "").strip()
        if not name:
            raise ValueError("Enter a tour name.")
        try:
            capacity = int(seat_capacity)
        except (TypeError, ValueError):
            raise ValueError("Seat capacity must be a whole number.")
        if not 1 <= capacity <= 46:
            raise ValueError("Seat capacity must be between 1 and 46.")
        existing = self.connection.execute(
            "SELECT id, active FROM tour_catalog WHERE name = ? COLLATE NOCASE", (name,)
        ).fetchone()
        if existing:
            if bool(existing["active"]):
                raise ValueError(f"{name} is already in the tour list.")
            self.connection.execute(
                "UPDATE tour_catalog SET active = 1, seat_capacity = ? WHERE id = ?",
                (capacity, existing["id"]),
            )
            self.connection.commit()
            return int(existing["id"])
        cur = self.connection.execute(
            "INSERT INTO tour_catalog(name, seat_capacity, active, created_at) VALUES (?, ?, 1, ?)",
            (name, capacity, _now()),
        )
        self.connection.commit()
        return int(cur.lastrowid)

    def update_tour(self, tour_id: int, name: str, seat_capacity: int) -> None:
        name = str(name or "").strip()
        if not name:
            raise ValueError("Enter a tour name.")
        try:
            capacity = int(seat_capacity)
        except (TypeError, ValueError):
            raise ValueError("Seat capacity must be a whole number.")
        if not 1 <= capacity <= 46:
            raise ValueError("Seat capacity must be between 1 and 46.")
        current = self.connection.execute(
            "SELECT id, name, seat_capacity FROM tour_catalog WHERE id = ?", (tour_id,)
        ).fetchone()
        if not current:
            raise ValueError("This tour no longer exists.")
        duplicate = self.connection.execute(
            "SELECT id FROM tour_catalog WHERE name = ? COLLATE NOCASE AND id != ?", (name, tour_id)
        ).fetchone()
        if duplicate:
            raise ValueError(f"{name} is already in the tour list.")
        old_name = str(current["name"])
        self.connection.execute("BEGIN IMMEDIATE")
        try:
            if capacity < int(current["seat_capacity"]):
                allowed = set(tour_seat_ids(capacity))
                bookings = self.connection.execute(
                    "SELECT seat FROM bookings WHERE tour_name = ? COLLATE NOCASE "
                    "AND LOWER(COALESCE(status, '')) != 'cancelled'", (old_name,)
                ).fetchall()
                assigned = {seat for row in bookings for seat in seat_tokens(row["seat"])}
                invalid = sorted(assigned - allowed)
                if invalid:
                    raise ValueError(
                        "Capacity cannot be reduced; active bookings already use: " + ", ".join(invalid)
                    )
            self.connection.execute(
                "UPDATE tour_catalog SET name = ?, seat_capacity = ? WHERE id = ?",
                (name, capacity, tour_id),
            )
            if old_name != name:
                self.connection.execute(
                    "UPDATE bookings SET tour_name = ?, updated_at = ? WHERE tour_name = ? COLLATE NOCASE",
                    (name, _now(), old_name),
                )
            self.connection.commit()
        except Exception:
            self.connection.rollback()
            raise

    def remove_tour(self, tour_id: int) -> bool:
        """Remove an unused tour; archive it if bookings depend on its history.

        Returns True when the tour was archived, False when it was deleted.
        """
        row = self.connection.execute("SELECT name FROM tour_catalog WHERE id = ?", (tour_id,)).fetchone()
        if not row:
            return False
        used = self.connection.execute(
            "SELECT 1 FROM bookings WHERE tour_name = ? COLLATE NOCASE LIMIT 1", (row["name"],)
        ).fetchone()
        if used:
            self.connection.execute("UPDATE tour_catalog SET active = 0 WHERE id = ?", (tour_id,))
        else:
            self.connection.execute("DELETE FROM tour_catalog WHERE id = ?", (tour_id,))
        self.connection.commit()
        return bool(used)

    def tour_capacity(self, name: str) -> int:
        row = self.connection.execute(
            "SELECT seat_capacity FROM tour_catalog WHERE name = ? COLLATE NOCASE", (str(name or "").strip(),)
        ).fetchone()
        return int(row[0]) if row else 40

    def tour_seat_occupancy(
        self, tour_name: str, tour_date: str, exclude_id: Optional[int] = None
    ) -> Dict[str, Dict[str, Any]]:
        clauses = ["tour_name = ? COLLATE NOCASE", "tour_date = ?", "LOWER(COALESCE(status, '')) != 'cancelled'"]
        parsed_date = parse_date(str(tour_date or ""))
        canonical_date = parsed_date.isoformat() if parsed_date else str(tour_date or "").strip()
        params: List[Any] = [str(tour_name or "").strip(), canonical_date]
        if exclude_id is not None:
            clauses.append("id != ?")
            params.append(exclude_id)
        rows = self.connection.execute(
            "SELECT * FROM bookings WHERE " + " AND ".join(clauses) + " ORDER BY id", params
        ).fetchall()
        occupied: Dict[str, Dict[str, Any]] = {}
        for row in rows:
            data = dict(row)
            for seat in seat_tokens(data.get("seat")):
                occupied.setdefault(seat, data)
        return occupied

    def tour_seat_conflicts(
        self, tour_name: str, tour_date: str, seats: Any, exclude_id: Optional[int] = None
    ) -> List[str]:
        occupied = self.tour_seat_occupancy(tour_name, tour_date, exclude_id=exclude_id)
        return sorted(set(seat_tokens(seats)).intersection(occupied))

    def month_bookings(self, year_month: str) -> List[Dict[str, Any]]:
        try:
            first = _dt.datetime.strptime(str(year_month), "%Y-%m").date().replace(day=1)
        except ValueError:
            raise ValueError("Choose a month in YYYY-MM format.")
        last_day = calendar.monthrange(first.year, first.month)[1]
        return self.list(date_from=first.isoformat(), date_to=first.replace(day=last_day).isoformat(),
                         sort_by="tour_date", sort_desc=False)

    def upcoming_tours(self, limit: int = 8) -> List[Dict[str, Any]]:
        rows = self.list(date_from=_dt.date.today().isoformat(), sort_by="tour_date", sort_desc=False)
        grouped: Dict[tuple, Dict[str, Any]] = {}
        for row in rows:
            if str(row.get("status") or "").lower() == "cancelled":
                continue
            key = (row.get("tour_name", ""), row.get("tour_date", ""))
            group = grouped.setdefault(key, {
                "tour_name": key[0], "tour_date": key[1], "bookings": 0, "seats": 0,
                "total": 0.0, "advance": 0.0, "due": 0.0,
            })
            group["bookings"] += 1
            group["seats"] += len(seat_tokens(row.get("seat"))) or 1
            for key_name in ("total", "advance", "due"):
                group[key_name] += float(row.get(key_name) or 0)
        ordered = sorted(grouped.values(), key=lambda item: (item["tour_date"], item["tour_name"]))
        return ordered[:max(0, int(limit))]

    def totals(self, rows: Optional[Sequence[Dict[str, Any]]] = None) -> Dict[str, float]:
        if rows is None:
            rows = self.list()
        billable = [row for row in rows if str(row.get("status") or "").lower() != "cancelled"]
        total = sum(float(r.get("total") or 0) for r in billable)
        advance = sum(float(r.get("advance") or 0) for r in billable)
        due = sum(float(r.get("due") or 0) for r in billable)
        return {"count": len(billable), "total": total, "advance": advance, "due": due}

    # ------------------------------------------------------------- writing

    def add(self, data: Dict[str, Any]) -> int:
        row = _clean(data)
        row.setdefault("status", "Confirmed")
        row["created_at"] = _now()
        row["updated_at"] = row["created_at"]
        columns = [c for c in COLUMNS if c != "id"]
        sql = f"INSERT INTO bookings ({', '.join(columns)}) VALUES ({', '.join('?' * len(columns))})"
        self.connection.execute("BEGIN IMMEDIATE")
        try:
            conflicts = self.tour_seat_conflicts(row.get("tour_name", ""), row.get("tour_date", ""), row.get("seat", ""))
            if conflicts and str(row.get("status") or "").lower() != "cancelled":
                raise ValueError("These seats are already booked for this tour date: " + ", ".join(conflicts))
            self._ensure_tour(row.get("tour_name", ""))
            cur = self.connection.execute(sql, [row.get(c, "") for c in columns])
            self.connection.commit()
            return int(cur.lastrowid)
        except Exception:
            self.connection.rollback()
            raise

    def update(self, booking_id: int, data: Dict[str, Any]) -> None:
        row = _clean(data)
        row["updated_at"] = _now()
        columns = [c for c in COLUMNS if c not in ("id", "created_at")]
        assignments = ", ".join(f"{c} = ?" for c in columns)
        self.connection.execute("BEGIN IMMEDIATE")
        try:
            conflicts = self.tour_seat_conflicts(
                row.get("tour_name", ""), row.get("tour_date", ""), row.get("seat", ""),
                exclude_id=booking_id,
            )
            if conflicts and str(row.get("status") or "").lower() != "cancelled":
                raise ValueError("These seats are already booked for this tour date: " + ", ".join(conflicts))
            self._ensure_tour(row.get("tour_name", ""))
            self.connection.execute(
                f"UPDATE bookings SET {assignments} WHERE id = ?",
                [row.get(c, "") for c in columns] + [booking_id],
            )
            self.connection.commit()
        except Exception:
            self.connection.rollback()
            raise

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

    # ---------------------------------------------------------- bus tickets

    def next_bus_number(self, prefix: str = "RTT-BUS") -> str:
        year = _dt.date.today().year
        pattern = f"{prefix}-{year}-%"
        row = self.connection.execute(
            "SELECT ticket_no FROM bus_tickets WHERE ticket_no LIKE ? ORDER BY ticket_no DESC LIMIT 1",
            (pattern,),
        ).fetchone()
        last = 0
        if row and row[0]:
            tail = str(row[0]).rsplit("-", 1)[-1]
            if tail.isdigit():
                last = int(tail)
        return f"{prefix}-{year}-{last + 1:04d}"

    def bus_ticket_get(self, ticket_id: int) -> Optional[Dict[str, Any]]:
        row = self.connection.execute("SELECT * FROM bus_tickets WHERE id = ?", (ticket_id,)).fetchone()
        return dict(row) if row else None

    def bus_routes(self) -> List[str]:
        rows = self.connection.execute(
            "SELECT DISTINCT route FROM bus_tickets WHERE TRIM(route) != '' ORDER BY route COLLATE NOCASE"
        ).fetchall()
        values = ["Rajshahi → Dhaka", "Dhaka → Rajshahi", *(str(row[0]) for row in rows)]
        routes = []
        seen = set()
        for value in values:
            route = _normalise_route(value)
            if route and route.casefold() not in seen:
                routes.append(route)
                seen.add(route.casefold())
        return routes

    def list_bus_tickets(
        self, search: str = "", route: str = "", travel_date: str = "",
        sort_by: str = "travel_date", sort_desc: bool = False,
    ) -> List[Dict[str, Any]]:
        clauses: List[str] = []
        params: List[Any] = []
        if search.strip():
            like = f"%{search.strip()}%"
            clauses.append("(ticket_no LIKE ? OR name LIKE ? OR phone LIKE ? OR seat LIKE ? OR route LIKE ?)")
            params.extend([like] * 5)
        if route and route != "All routes":
            clauses.append("route = ? COLLATE NOCASE")
            params.append(_normalise_route(route))
        if travel_date:
            parsed = parse_date(str(travel_date))
            clauses.append("travel_date = ?")
            params.append(parsed.isoformat() if parsed else str(travel_date).strip())
        allowed = {"travel_date", "ticket_no", "name", "route", "seat", "fare", "advance", "due", "id"}
        column = sort_by if sort_by in allowed else "travel_date"
        order = "DESC" if sort_desc else "ASC"
        where = (" WHERE " + " AND ".join(clauses)) if clauses else ""
        rows = self.connection.execute(
            "SELECT * FROM bus_tickets" + where + f" ORDER BY {column} {order}, id DESC", params
        ).fetchall()
        return [dict(row) for row in rows]

    def bus_seat_occupancy(
        self, route: str, travel_date: str, exclude_id: Optional[int] = None
    ) -> Dict[str, Dict[str, Any]]:
        clauses = [
            "UPPER(TRIM(route)) = UPPER(TRIM(?))", "travel_date = ?",
            "LOWER(COALESCE(status, '')) != 'cancelled'",
        ]
        parsed = parse_date(str(travel_date or ""))
        canonical_date = parsed.isoformat() if parsed else str(travel_date or "").strip()
        params: List[Any] = [_normalise_route(route), canonical_date]
        if exclude_id is not None:
            clauses.append("id != ?")
            params.append(exclude_id)
        rows = self.connection.execute(
            "SELECT * FROM bus_tickets WHERE " + " AND ".join(clauses) + " ORDER BY id", params
        ).fetchall()
        occupied: Dict[str, Dict[str, Any]] = {}
        for row in rows:
            data = dict(row)
            seat = normalise_seat(data.get("seat"))
            if seat:
                occupied.setdefault(seat, data)
        return occupied

    def bus_seat_conflicts(
        self, route: str, travel_date: str, seat: str, exclude_id: Optional[int] = None
    ) -> List[str]:
        canonical = normalise_seat(seat)
        return [canonical] if canonical and canonical in self.bus_seat_occupancy(
            route, travel_date, exclude_id=exclude_id
        ) else []

    def add_bus_ticket(self, data: Dict[str, Any]) -> int:
        row = _clean_bus_ticket(data)
        if not row["ticket_no"]:
            row["ticket_no"] = self.next_bus_number()
        if not row["route"] or not row["travel_date"] or not row["name"] or not row["seat"]:
            raise ValueError("Route, travel date, passenger name and seat are required.")
        if not parse_date(row["travel_date"]):
            raise ValueError("Travel date must be a valid calendar date.")
        if row["fare"] < 0 or row["advance"] < 0 or row["advance"] > row["fare"]:
            raise ValueError("Check the fare and amount paid.")
        now = _now()
        row["created_at"] = row["updated_at"] = now
        columns = (
            "ticket_no", "route", "travel_date", "departure_time", "name", "phone", "seat",
            "fare", "advance", "due", "status", "notes", "created_at", "updated_at",
        )
        self.connection.execute("BEGIN IMMEDIATE")
        try:
            conflict = self.bus_seat_conflicts(row["route"], row["travel_date"], row["seat"])
            if conflict and row["status"].lower() != "cancelled":
                raise ValueError(f"Seat {row['seat']} is already booked on this route and date.")
            cur = self.connection.execute(
                f"INSERT INTO bus_tickets ({', '.join(columns)}) VALUES ({', '.join('?' * len(columns))})",
                [row.get(column, "") for column in columns],
            )
            self.connection.commit()
            return int(cur.lastrowid)
        except Exception:
            self.connection.rollback()
            raise

    def update_bus_ticket(self, ticket_id: int, data: Dict[str, Any]) -> None:
        row = _clean_bus_ticket(data)
        if not row["ticket_no"] or not row["route"] or not row["travel_date"] or not row["name"] or not row["seat"]:
            raise ValueError("Ticket number, route, travel date, passenger name and seat are required.")
        if not parse_date(row["travel_date"]):
            raise ValueError("Travel date must be a valid calendar date.")
        if row["fare"] < 0 or row["advance"] < 0 or row["advance"] > row["fare"]:
            raise ValueError("Check the fare and amount paid.")
        row["updated_at"] = _now()
        columns = (
            "ticket_no", "route", "travel_date", "departure_time", "name", "phone", "seat",
            "fare", "advance", "due", "status", "notes", "updated_at",
        )
        self.connection.execute("BEGIN IMMEDIATE")
        try:
            conflict = self.bus_seat_conflicts(
                row["route"], row["travel_date"], row["seat"], exclude_id=ticket_id
            )
            if conflict and row["status"].lower() != "cancelled":
                raise ValueError(f"Seat {row['seat']} is already booked on this route and date.")
            self.connection.execute(
                "UPDATE bus_tickets SET " + ", ".join(f"{column} = ?" for column in columns) + " WHERE id = ?",
                [row.get(column, "") for column in columns] + [ticket_id],
            )
            self.connection.commit()
        except Exception:
            self.connection.rollback()
            raise

    def delete_bus_ticket(self, ticket_id: int) -> None:
        self.connection.execute("DELETE FROM bus_tickets WHERE id = ?", (ticket_id,))
        self.connection.commit()

    def bus_totals(self, rows: Optional[Sequence[Dict[str, Any]]] = None) -> Dict[str, float]:
        if rows is None:
            rows = self.list_bus_tickets()
        active = [row for row in rows if str(row.get("status") or "").lower() != "cancelled"]
        return {
            "count": len(active),
            "fare": sum(float(row.get("fare") or 0) for row in active),
            "advance": sum(float(row.get("advance") or 0) for row in active),
            "due": sum(float(row.get("due") or 0) for row in active),
        }

    def export_bus_csv(self, path: str, rows: Iterable[Dict[str, Any]]) -> str:
        rows = list(rows)
        directory = os.path.dirname(path)
        if directory:
            os.makedirs(directory, exist_ok=True)
        with open(path, "w", newline="", encoding="utf-8-sig") as handle:
            writer = csv.writer(handle)
            writer.writerow(["Ticket No", "Passenger", "Phone", "Route", "Date", "Departure", "Seat",
                             "Fare", "Paid", "Due", "Status", "Notes"])
            for row in rows:
                writer.writerow([row.get("ticket_no", ""), row.get("name", ""), row.get("phone", ""),
                                 row.get("route", ""), row.get("travel_date", ""),
                                 row.get("departure_time", ""), row.get("seat", ""),
                                 f"{float(row.get('fare') or 0):.2f}",
                                 f"{float(row.get('advance') or 0):.2f}",
                                 f"{float(row.get('due') or 0):.2f}", row.get("status", ""),
                                 row.get("notes", "")])
        return path

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
        self._normalise_legacy_values()
        self._seed_tour_catalog()

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
