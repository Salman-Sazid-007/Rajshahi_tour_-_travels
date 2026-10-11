"""SQLite storage for offline tour bookings, the tour catalogue and bus tickets.

Amounts are stored as Taka; each booking or ticket balance is derived from its
fare/total minus the recorded advance. Seat occupancy is scoped to a tour/date
or route/date so independent trips do not block one another.
"""

from __future__ import annotations

import calendar
import csv
import datetime as _dt
import json
import os
import re
import shutil
import sqlite3
from typing import Any, Dict, Iterable, List, Optional, Sequence, Tuple

from .config import DEFAULT_SETTINGS, money, parse_date

SCHEMA = """
CREATE TABLE IF NOT EXISTS bookings (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    booking_no    TEXT UNIQUE,
    name          TEXT NOT NULL,
    phone         TEXT DEFAULT '',
    seat          TEXT DEFAULT '',
    bus_no        TEXT DEFAULT '',
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
    tour_code     TEXT NOT NULL DEFAULT '',
    seat_capacity INTEGER NOT NULL DEFAULT 40,
    active        INTEGER NOT NULL DEFAULT 1,
    created_at    TEXT NOT NULL DEFAULT ''
);

-- Every tour runs one or more coaches. Each coach has an office-chosen bus
-- number and a seat layout ("41" or "45" for the current coach types, or a
-- "legacyNN" layout kept for tours created before buses existed).
CREATE TABLE IF NOT EXISTS tour_buses (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    tour_id   INTEGER NOT NULL,
    bus_no    TEXT NOT NULL,
    layout    TEXT NOT NULL DEFAULT '41',
    position  INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_tour_buses_tour ON tour_buses(tour_id);

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
    seat_genders    TEXT NOT NULL DEFAULT '[]',
    bus_no         TEXT NOT NULL DEFAULT '1',
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
-- Which coach(es) run a point-to-point route on a given day. A route/date
-- without a row runs one 41-seat bus numbered "1" by default.
CREATE TABLE IF NOT EXISTS bus_trip_buses (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    route       TEXT NOT NULL COLLATE NOCASE,
    travel_date TEXT NOT NULL,
    bus_no      TEXT NOT NULL DEFAULT '1',
    layout      TEXT NOT NULL DEFAULT '41',
    position    INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT NOT NULL DEFAULT '',
    UNIQUE(route, travel_date, bus_no)
);
CREATE INDEX IF NOT EXISTS idx_bus_trip_buses_trip ON bus_trip_buses(route, travel_date);
CREATE TABLE IF NOT EXISTS app_meta (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
"""

COLUMNS = (
    "id", "booking_no", "name", "phone", "seat", "bus_no", "total", "advance", "due",
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
    for field in ("name", "phone", "seat", "bus_no", "tour_name", "booking_no", "status"):
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


def normalise_tour_code(value: Any) -> str:
    """Return a compact, uppercase tour identifier safe to place in serials."""
    text = str(value or "").strip().upper()
    text = re.sub(r"(?<=[A-Z0-9])['’](?=[A-Z0-9])", "", text)
    code = re.sub(r"[^A-Z0-9]+", "-", text).strip("-")
    if len(code) > 12:
        raise ValueError("Tour code must be 12 characters or fewer.")
    return code


def _suggest_tour_code(name: Any) -> str:
    """Suggest initials for a tour (``Cox's Bazar Tour`` → ``CBT``)."""
    text = str(name or "").strip().upper()
    text = re.sub(r"(?<=[A-Z0-9])['’](?=[A-Z0-9])", "", text)
    words = re.findall(r"[A-Z0-9]+", text)
    if not words:
        return "TOUR"
    if len(words) == 1:
        return words[0][:4]
    return "".join(word[0] for word in words)[:8] or "TOUR"


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


def _parse_seat_genders(value: Any) -> Dict[str, str]:
    """Decode the per-seat gender map stored with an offline bus booking."""
    if isinstance(value, str):
        try:
            value = json.loads(value or "{}")
        except (TypeError, ValueError):
            value = {}
    if isinstance(value, list):
        entries = {}
        for item in value:
            if isinstance(item, dict):
                seat = item.get("seat") or item.get("id")
                if seat:
                    entries[seat] = item.get("gender")
        value = entries
    if not isinstance(value, dict):
        return {}
    result: Dict[str, str] = {}
    for raw_seat, raw_gender in value.items():
        seat = normalise_seat(raw_seat)
        gender = str(raw_gender or "").strip().casefold()
        if seat and gender in {"male", "female"}:
            result[seat] = gender
    return result


def tour_seat_ids(capacity: Any = 40) -> List[str]:
    """Classic tour map labels (standard 40 / extended 46), kept for old tours."""
    try:
        count = int(capacity or 40)
    except (TypeError, ValueError):
        count = 40
    count = max(1, min(46, count))
    standard = [f"{row}-{number}" for row in "ABCDEFGHIJ" for number in range(1, 5)]
    extended = ["1", *standard, *(f"K-{number}" for number in range(1, 6))]
    return extended[:count] if count > 40 else standard[:count]


# Coach types the office can pick for a tour bus. Both are 2+2 rows with a
# five-across back row: the extra seat sits in the middle of the last row.
#   41 seats = rows A–I (36) + back row J-1 … J-5
#   45 seats = rows A–J (40) + back row K-1 … K-5
BUS_TYPES: Dict[str, str] = {"41": "41 seats", "45": "45 seats"}
MAX_BUSES_PER_TOUR = 12
DEFAULT_BUS_LAYOUT = "41"  # a route/date with no bus set-up runs one 41-seat bus


def normalise_layout(value: Any) -> str:
    """Return a layout code: ``"41"``, ``"45"`` or ``"legacy<n>"`` (1–46)."""
    text = str(value if value is not None else "").strip().lower()
    if text in BUS_TYPES:
        return text
    if text.startswith("legacy"):
        text = text[len("legacy"):]
        try:
            count = int(text or 40)
        except ValueError:
            raise ValueError("Unknown bus layout.")
        if not 1 <= count <= 46:
            raise ValueError("Seat capacity must be between 1 and 46.")
        return f"legacy{count}"
    if text.endswith(" seats"):
        text = text[:-len(" seats")].strip()
    try:
        count = int(text)
    except ValueError:
        raise ValueError("Choose a 41-seat or 45-seat bus.")
    if str(count) in BUS_TYPES:
        return str(count)
    if not 1 <= count <= 46:
        raise ValueError("Seat capacity must be between 1 and 46.")
    return f"legacy{count}"


def bus_seat_ids(layout: Any = "41") -> List[str]:
    """Seat labels for one bus, front to back."""
    try:
        code = normalise_layout(layout)
    except ValueError:
        code = "41"
    if code == "41":
        rows = [f"{row}-{number}" for row in "ABCDEFGHI" for number in range(1, 5)]
        return rows + [f"J-{number}" for number in range(1, 6)]
    if code == "45":
        rows = [f"{row}-{number}" for row in "ABCDEFGHIJ" for number in range(1, 5)]
        return rows + [f"K-{number}" for number in range(1, 6)]
    return tour_seat_ids(int(code[len("legacy"):]))


def layout_capacity(layout: Any) -> int:
    return len(bus_seat_ids(layout))


def layout_label(layout: Any) -> str:
    """Human label for a layout: ``41 seats`` or ``40 seats (classic)``."""
    try:
        code = normalise_layout(layout)
    except ValueError:
        code = "41"
    if code in BUS_TYPES:
        return BUS_TYPES[code]
    return f"{layout_capacity(code)} seats (classic)"


def normalise_bus_no(value: Any) -> str:
    return re.sub(r"\s+", " ", str(value if value is not None else "")).strip()


def normalise_bus_specs(value: Any) -> List[Dict[str, Any]]:
    """Accept a capacity, a layout, or a list of bus specs; return clean specs.

    A spec is ``{"id": Optional[int], "bus_no": str, "layout": str}``. A bare
    number such as ``40`` (old callers) becomes one bus numbered ``1``.
    """
    if value is None or isinstance(value, (int, float, str)):
        return [{"id": None, "bus_no": "1", "layout": normalise_layout(value if value not in (None, "") else 41)}]
    if isinstance(value, dict):
        value = [value]
    specs: List[Dict[str, Any]] = []
    seen = set()
    for index, item in enumerate(value, start=1):
        if isinstance(item, (list, tuple)):
            item = {"bus_no": item[0] if len(item) > 0 else "", "layout": item[1] if len(item) > 1 else 41,
                    "id": item[2] if len(item) > 2 else None}
        if not isinstance(item, dict):
            raise ValueError("Bus details are not valid.")
        bus_no = normalise_bus_no(item.get("bus_no")) or str(index)
        if len(bus_no) > 24:
            raise ValueError(f"Bus number '{bus_no}' is too long (24 characters at most).")
        if bus_no.casefold() in seen:
            raise ValueError(f"Bus number '{bus_no}' is used twice. Give every bus its own number.")
        seen.add(bus_no.casefold())
        raw_id = item.get("id")
        try:
            bus_id = int(raw_id) if raw_id not in (None, "") else None
        except (TypeError, ValueError):
            bus_id = None
        specs.append({"id": bus_id, "bus_no": bus_no, "layout": normalise_layout(item.get("layout", 41))})
    if not specs:
        raise ValueError("Add at least one bus to the tour.")
    if len(specs) > MAX_BUSES_PER_TOUR:
        raise ValueError(f"A tour can have at most {MAX_BUSES_PER_TOUR} buses.")
    return specs


def _clean_bus_ticket(row: Dict[str, Any]) -> Dict[str, Any]:
    seats = seat_tokens(row.get("seat"))
    genders = _parse_seat_genders(row.get("seat_genders"))
    data = {
        "ticket_no": str(row.get("ticket_no") or "").strip(),
        "route": _normalise_route(row.get("route")),
        "travel_date": str(row.get("travel_date") or "").strip(),
        "departure_time": str(row.get("departure_time") or "").strip(),
        "name": str(row.get("name") or "").strip(),
        "phone": str(row.get("phone") or "").strip(),
        "seat": ", ".join(seats),
        "seat_genders": json.dumps({seat: gender for seat, gender in genders.items() if seat in seats},
                                    ensure_ascii=False),
        "bus_no": normalise_bus_no(row.get("bus_no")),
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
        self._ensure_tour_code_column()
        self._ensure_bus_ticket_columns()
        self._ensure_booking_bus_column()
        self._normalise_legacy_values()
        self._seed_tour_catalog()
        self._backfill_tour_codes()
        self._backfill_tour_buses()

    def _ensure_tour_code_column(self) -> None:
        columns = {str(row["name"]) for row in self.connection.execute("PRAGMA table_info(tour_catalog)")}
        if "tour_code" not in columns:
            self.connection.execute(
                "ALTER TABLE tour_catalog ADD COLUMN tour_code TEXT NOT NULL DEFAULT ''"
            )
            self.connection.commit()

    def _ensure_booking_bus_column(self) -> None:
        columns = {str(row["name"]) for row in self.connection.execute("PRAGMA table_info(bookings)")}
        if "bus_no" not in columns:
            self.connection.execute("ALTER TABLE bookings ADD COLUMN bus_no TEXT DEFAULT ''")
            self.connection.commit()

    def _backfill_tour_buses(self) -> None:
        """Give every tour created before bus support exactly one bus ("1").

        40-seat tours become 41-seat buses (same labels plus J-5); any other
        size keeps its old seat plan as ``legacy<n>`` so existing labels such as
        the front seat "1" of a 46-seat coach stay valid. Bookings without a
        bus are attached to that single bus.
        """
        rows = self.connection.execute(
            "SELECT t.id, t.seat_capacity FROM tour_catalog t "
            "WHERE NOT EXISTS (SELECT 1 FROM tour_buses b WHERE b.tour_id = t.id)"
        ).fetchall()
        for row in rows:
            capacity = max(1, min(46, int(row["seat_capacity"] or 40)))
            # The 41-seat coach is the old 40-seat plan plus the middle seat of
            # the back row, so 40-seat tours become 41-seat buses without any
            # seat label changing. Other sizes keep their exact classic plan.
            layout = "41" if capacity == 40 else f"legacy{capacity}"
            self.connection.execute(
                "INSERT INTO tour_buses(tour_id, bus_no, layout, position) VALUES (?, '1', ?, 0)",
                (row["id"], layout),
            )
        self.connection.execute(
            "UPDATE bookings SET bus_no = ("
            "  SELECT b.bus_no FROM tour_buses b JOIN tour_catalog t ON t.id = b.tour_id "
            "  WHERE t.name = bookings.tour_name COLLATE NOCASE ORDER BY b.position, b.id LIMIT 1"
            ") WHERE TRIM(COALESCE(bus_no, '')) = '' AND EXISTS ("
            "  SELECT 1 FROM tour_catalog t WHERE t.name = bookings.tour_name COLLATE NOCASE)"
        )
        self.connection.commit()

    def _ensure_bus_ticket_columns(self) -> None:
        columns = {str(row["name"]) for row in self.connection.execute("PRAGMA table_info(bus_tickets)")}
        if "seat_genders" not in columns:
            self.connection.execute(
                "ALTER TABLE bus_tickets ADD COLUMN seat_genders TEXT NOT NULL DEFAULT '[]'"
            )
            self.connection.commit()
        if "bus_no" not in columns:
            # Tickets issued before 1.2.1 all belong to the single default bus.
            self.connection.execute("ALTER TABLE bus_tickets ADD COLUMN bus_no TEXT NOT NULL DEFAULT '1'")
            self.connection.commit()

    def _unique_tour_code(
        self, name: str, exclude_id: Optional[int] = None, reserved_codes: Iterable[str] = ()
    ) -> str:
        base = normalise_tour_code(_suggest_tour_code(name)) or "TOUR"
        occupied = {str(code).casefold() for code in reserved_codes if str(code).strip()}
        rows = self.connection.execute("SELECT id, tour_code FROM tour_catalog").fetchall()
        for row in rows:
            if exclude_id is not None and int(row["id"]) == exclude_id:
                continue
            code = str(row["tour_code"] or "").strip()
            if code:
                occupied.add(code.casefold())
        candidate = base
        suffix = 2
        while candidate.casefold() in occupied:
            tail = f"-{suffix}"
            candidate = f"{base[:12 - len(tail)]}{tail}"
            suffix += 1
        return candidate

    def _backfill_tour_codes(self) -> None:
        rows = self.connection.execute(
            "SELECT id, name, tour_code FROM tour_catalog ORDER BY id"
        ).fetchall()
        reserved = set()
        for row in rows:
            raw = str(row["tour_code"] or "").strip()
            if raw:
                try:
                    normalised = normalise_tour_code(raw)
                except ValueError:
                    normalised = ""
                if normalised:
                    reserved.add(normalised)
        used = set()
        for row in rows:
            raw = str(row["tour_code"] or "").strip()
            try:
                code = normalise_tour_code(raw)
            except ValueError:
                code = ""
            if not code or code.casefold() in used:
                code = self._unique_tour_code(
                    str(row["name"]), exclude_id=int(row["id"]),
                    reserved_codes=reserved | used,
                )
            used.add(code.casefold())
            if code != raw:
                self.connection.execute(
                    "UPDATE tour_catalog SET tour_code = ? WHERE id = ?", (code, row["id"])
                )
        self.connection.commit()
        self.connection.execute(
            "CREATE UNIQUE INDEX IF NOT EXISTS idx_tour_catalog_tour_code "
            "ON tour_catalog(tour_code COLLATE NOCASE) WHERE tour_code != ''"
        )
        self.connection.commit()

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
                "SELECT id, travel_date, route, seat, seat_genders FROM bus_tickets"
            ).fetchall()
            for ticket in tickets:
                changes = {}
                parsed = parse_date(str(ticket["travel_date"] or ""))
                if parsed and parsed.isoformat() != str(ticket["travel_date"] or ""):
                    changes["travel_date"] = parsed.isoformat()
                route = _normalise_route(ticket["route"])
                if route != str(ticket["route"] or ""):
                    changes["route"] = route
                seats = ", ".join(seat_tokens(ticket["seat"]))
                if seats != str(ticket["seat"] or ""):
                    changes["seat"] = seats
                genders = json.dumps(_parse_seat_genders(ticket["seat_genders"]), ensure_ascii=False)
                if genders != str(ticket["seat_genders"] or ""):
                    changes["seat_genders"] = genders
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
            "SELECT t.id, t.name, t.tour_code, t.seat_capacity, t.active, t.created_at, "
            "COUNT(b.id) AS booking_count "
            "FROM tour_catalog t LEFT JOIN bookings b ON b.tour_name = t.name COLLATE NOCASE "
            f"{active_clause} GROUP BY t.id ORDER BY t.active DESC, t.name COLLATE NOCASE"
        ).fetchall()
        result = []
        for row in rows:
            tour = dict(row)
            buses = self.tour_buses(int(tour["id"]))
            tour["buses"] = buses
            tour["bus_count"] = len(buses)
            if buses:
                tour["seat_capacity"] = sum(int(bus["capacity"]) for bus in buses)
            result.append(tour)
        return result

    # ---------------------------------------------------------------- buses

    def _tour_id_for(self, tour: Any) -> Optional[int]:
        if isinstance(tour, int):
            return tour
        name = str(tour or "").strip()
        if not name:
            return None
        row = self.connection.execute(
            "SELECT id FROM tour_catalog WHERE name = ? COLLATE NOCASE", (name,)
        ).fetchone()
        return int(row[0]) if row else None

    def tour_buses(self, tour: Any) -> List[Dict[str, Any]]:
        """Buses of a tour (by id or name), front of the list = bus position 0."""
        tour_id = self._tour_id_for(tour)
        if tour_id is None:
            return []
        rows = self.connection.execute(
            "SELECT id, tour_id, bus_no, layout, position FROM tour_buses "
            "WHERE tour_id = ? ORDER BY position, id", (tour_id,)
        ).fetchall()
        buses = []
        for row in rows:
            layout = normalise_layout(row["layout"])
            seats = bus_seat_ids(layout)
            buses.append({
                "id": int(row["id"]), "tour_id": int(row["tour_id"]),
                "bus_no": str(row["bus_no"]), "layout": layout, "seats": seats,
                "capacity": len(seats), "label": layout_label(layout),
            })
        return buses

    def tour_bus(self, tour: Any, bus_no: Any = "") -> Optional[Dict[str, Any]]:
        """One bus of a tour; an empty ``bus_no`` means the first bus."""
        buses = self.tour_buses(tour)
        if not buses:
            return None
        wanted = normalise_bus_no(bus_no)
        if not wanted:
            return buses[0]
        for bus in buses:
            if bus["bus_no"].casefold() == wanted.casefold():
                return bus
        return None

    def resolve_bus_no(self, tour: Any, bus_no: Any = "") -> str:
        bus = self.tour_bus(tour, bus_no)
        return bus["bus_no"] if bus else normalise_bus_no(bus_no)

    def _write_tour_buses(self, tour_id: int, specs: List[Dict[str, Any]], tour_name: str) -> None:
        """Replace a tour's buses with *specs* without stranding any booking.

        Buses are matched by id when the spec carries one, else by number.
        Removing a bus that still has active bookings, or shrinking a layout
        below seats already sold, is refused. Renumbering a bus renumbers its
        bookings.
        """
        existing = {bus["id"]: bus for bus in self.tour_buses(tour_id)}
        by_number = {bus["bus_no"].casefold(): bus for bus in existing.values()}
        active_rows = self.connection.execute(
            "SELECT bus_no, seat FROM bookings WHERE tour_name = ? COLLATE NOCASE "
            "AND LOWER(COALESCE(status, '')) != 'cancelled'", (tour_name,)
        ).fetchall()
        first_bus_no = next(iter(existing.values()))["bus_no"] if existing else ""
        seats_by_bus: Dict[str, set] = {}
        for row in active_rows:
            key = (normalise_bus_no(row["bus_no"]) or first_bus_no).casefold()
            seats_by_bus.setdefault(key, set()).update(seat_tokens(row["seat"]))

        matched: Dict[int, Dict[str, Any]] = {}
        for spec in specs:
            current = existing.get(spec["id"]) if spec["id"] is not None else None
            if current is None:
                current = by_number.get(spec["bus_no"].casefold())
            if current is not None and current["id"] not in matched:
                matched[current["id"]] = spec
                spec["_current"] = current
        removed = [bus for bus_id, bus in existing.items() if bus_id not in matched]
        for bus in removed:
            if seats_by_bus.get(bus["bus_no"].casefold()):
                raise ValueError(
                    f"Bus {bus['bus_no']} still has active bookings and cannot be removed. "
                    "Move or cancel those bookings first."
                )
        for spec in specs:
            current = spec.get("_current")
            if current is None:
                continue
            used = seats_by_bus.get(current["bus_no"].casefold(), set())
            invalid = sorted(used - set(bus_seat_ids(spec["layout"])))
            if invalid:
                raise ValueError(
                    f"Bus {current['bus_no']} cannot change to {layout_label(spec['layout'])}; "
                    "active bookings already use seats: " + ", ".join(invalid)
                )
        for bus in removed:
            self.connection.execute("DELETE FROM tour_buses WHERE id = ?", (bus["id"],))
        for position, spec in enumerate(specs):
            current = spec.pop("_current", None)
            if current is None:
                self.connection.execute(
                    "INSERT INTO tour_buses(tour_id, bus_no, layout, position) VALUES (?, ?, ?, ?)",
                    (tour_id, spec["bus_no"], spec["layout"], position),
                )
                continue
            self.connection.execute(
                "UPDATE tour_buses SET bus_no = ?, layout = ?, position = ? WHERE id = ?",
                (spec["bus_no"], spec["layout"], position, current["id"]),
            )
            if current["bus_no"] != spec["bus_no"]:
                self.connection.execute(
                    "UPDATE bookings SET bus_no = ?, updated_at = ? WHERE tour_name = ? COLLATE NOCASE "
                    "AND (bus_no = ? COLLATE NOCASE OR (TRIM(COALESCE(bus_no, '')) = '' AND ? = ?))",
                    (spec["bus_no"], _now(), tour_name, current["bus_no"], current["bus_no"], first_bus_no),
                )
        total = sum(layout_capacity(spec["layout"]) for spec in specs)
        self.connection.execute(
            "UPDATE tour_catalog SET seat_capacity = ? WHERE id = ?", (max(1, min(999, total)), tour_id)
        )

    def tour_code(self, name: str) -> str:
        name = str(name or "").strip()
        if not name:
            return ""
        row = self.connection.execute(
            "SELECT tour_code FROM tour_catalog WHERE name = ? COLLATE NOCASE", (name,)
        ).fetchone()
        if row and str(row[0] or "").strip():
            return normalise_tour_code(row[0])
        return self._unique_tour_code(name)

    def _validate_unique_tour_code(self, value: Any, exclude_id: Optional[int] = None) -> str:
        code = normalise_tour_code(value)
        if not code:
            raise ValueError("Enter a tour code using letters or numbers.")
        if exclude_id is None:
            duplicate = self.connection.execute(
                "SELECT name FROM tour_catalog WHERE tour_code = ? COLLATE NOCASE", (code,)
            ).fetchone()
        else:
            duplicate = self.connection.execute(
                "SELECT name FROM tour_catalog WHERE tour_code = ? COLLATE NOCASE AND id != ?",
                (code, exclude_id),
            ).fetchone()
        if duplicate:
            raise ValueError(f"Tour code {code} is already assigned to {duplicate['name']}.")
        return code

    def _ensure_tour(self, name: str, capacity: int = 40) -> int:
        name = str(name or "").strip()
        if not name:
            return 0
        row = self.connection.execute(
            "SELECT id, tour_code FROM tour_catalog WHERE name = ? COLLATE NOCASE", (name,)
        ).fetchone()
        if row:
            if not str(row["tour_code"] or "").strip():
                code = self._unique_tour_code(name, exclude_id=int(row["id"]))
                self.connection.execute(
                    "UPDATE tour_catalog SET tour_code = ? WHERE id = ?", (code, row["id"])
                )
            return int(row["id"])
        code = self._unique_tour_code(name)
        specs = normalise_bus_specs(capacity)
        cur = self.connection.execute(
            "INSERT INTO tour_catalog(name, tour_code, seat_capacity, active, created_at) "
            "VALUES (?, ?, ?, 1, ?)",
            (name, code, sum(layout_capacity(spec["layout"]) for spec in specs), _now()),
        )
        tour_id = int(cur.lastrowid)
        self._write_tour_buses(tour_id, specs, name)
        return tour_id

    def add_tour(
        self, name: str, buses: Any = 41, tour_code: Optional[str] = None
    ) -> int:
        """Create (or re-activate) a tour.

        ``buses`` is a list of ``{"bus_no", "layout"}`` specs — layout ``"41"``
        or ``"45"`` — or, for old callers, a single seat capacity.
        """
        name = str(name or "").strip()
        if not name:
            raise ValueError("Enter a tour name.")
        specs = normalise_bus_specs(buses)
        capacity = sum(layout_capacity(spec["layout"]) for spec in specs)
        requested_code = str(tour_code or "").strip()
        existing = self.connection.execute(
            "SELECT id, active, tour_code FROM tour_catalog WHERE name = ? COLLATE NOCASE", (name,)
        ).fetchone()
        if existing:
            if bool(existing["active"]):
                raise ValueError(f"{name} is already in the tour list.")
            code = str(existing["tour_code"] or "").strip()
            if requested_code:
                code = self._validate_unique_tour_code(requested_code, exclude_id=int(existing["id"]))
            elif not code:
                code = self._unique_tour_code(name, exclude_id=int(existing["id"]))
            self.connection.execute("BEGIN IMMEDIATE")
            try:
                self.connection.execute(
                    "UPDATE tour_catalog SET active = 1, seat_capacity = ?, tour_code = ? WHERE id = ?",
                    (capacity, code, existing["id"]),
                )
                self._write_tour_buses(int(existing["id"]), specs, name)
                self.connection.commit()
            except Exception:
                self.connection.rollback()
                raise
            return int(existing["id"])
        code = (
            self._validate_unique_tour_code(requested_code)
            if requested_code else self._unique_tour_code(name)
        )
        self.connection.execute("BEGIN IMMEDIATE")
        try:
            cur = self.connection.execute(
                "INSERT INTO tour_catalog(name, tour_code, seat_capacity, active, created_at) "
                "VALUES (?, ?, ?, 1, ?)",
                (name, code, capacity, _now()),
            )
            tour_id = int(cur.lastrowid)
            self._write_tour_buses(tour_id, specs, name)
            self.connection.commit()
        except Exception:
            self.connection.rollback()
            raise
        return tour_id

    def update_tour(
        self, tour_id: int, name: str, buses: Any, tour_code: Optional[str] = None
    ) -> None:
        name = str(name or "").strip()
        if not name:
            raise ValueError("Enter a tour name.")
        specs = normalise_bus_specs(buses)
        current = self.connection.execute(
            "SELECT id, name, seat_capacity, tour_code FROM tour_catalog WHERE id = ?", (tour_id,)
        ).fetchone()
        if not current:
            raise ValueError("This tour no longer exists.")
        duplicate = self.connection.execute(
            "SELECT id FROM tour_catalog WHERE name = ? COLLATE NOCASE AND id != ?", (name, tour_id)
        ).fetchone()
        if duplicate:
            raise ValueError(f"{name} is already in the tour list.")
        requested_code = str(tour_code or "").strip()
        if requested_code:
            code = self._validate_unique_tour_code(requested_code, exclude_id=tour_id)
        else:
            code = str(current["tour_code"] or "").strip()
            if not code:
                code = self._unique_tour_code(name, exclude_id=tour_id)
        old_name = str(current["name"])
        self.connection.execute("BEGIN IMMEDIATE")
        try:
            self._write_tour_buses(tour_id, specs, old_name)
            self.connection.execute(
                "UPDATE tour_catalog SET name = ?, tour_code = ? WHERE id = ?",
                (name, code, tour_id),
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

    def archive_tour(self, tour_id: int) -> bool:
        """Hide a tour from new bookings while retaining all records and reports."""
        self.connection.execute("BEGIN IMMEDIATE")
        try:
            row = self.connection.execute(
                "SELECT id FROM tour_catalog WHERE id = ?", (tour_id,)
            ).fetchone()
            if not row:
                self.connection.rollback()
                return False
            self.connection.execute("UPDATE tour_catalog SET active = 0 WHERE id = ?", (tour_id,))
            self.connection.commit()
            return True
        except Exception:
            self.connection.rollback()
            raise

    def delete_tour(self, tour_id: int) -> bool:
        """Permanently delete a tour and every booking/payment record attached to it."""
        self.connection.execute("BEGIN IMMEDIATE")
        try:
            row = self.connection.execute(
                "SELECT name FROM tour_catalog WHERE id = ?", (tour_id,)
            ).fetchone()
            if not row:
                self.connection.rollback()
                return False
            name = str(row["name"])
            self.connection.execute(
                "DELETE FROM bookings WHERE tour_name = ? COLLATE NOCASE", (name,)
            )
            self.connection.execute("DELETE FROM tour_buses WHERE tour_id = ?", (tour_id,))
            self.connection.execute("DELETE FROM tour_catalog WHERE id = ?", (tour_id,))
            self.connection.commit()
            return True
        except Exception:
            self.connection.rollback()
            raise

    def remove_tour(self, tour_id: int) -> bool:
        """Compatibility alias: removing a tour is now a permanent deletion."""
        return self.delete_tour(tour_id)

    def tour_capacity(self, name: str) -> int:
        """Total seats across all buses of the tour."""
        buses = self.tour_buses(name)
        if buses:
            return sum(int(bus["capacity"]) for bus in buses)
        row = self.connection.execute(
            "SELECT seat_capacity FROM tour_catalog WHERE name = ? COLLATE NOCASE", (str(name or "").strip(),)
        ).fetchone()
        return int(row[0]) if row else 41

    def tour_seat_occupancy(
        self, tour_name: str, tour_date: str, exclude_id: Optional[int] = None,
        bus_no: Any = None,
    ) -> Dict[str, Dict[str, Any]]:
        """Seats taken on one bus (``bus_no``; default: the tour's first bus).

        Pass ``bus_no=""`` explicitly for the first bus, or ``bus_no="*"`` to
        count every bus together (used for totals only — seat labels repeat
        across buses).
        """
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
        wanted = None
        if bus_no != "*":
            wanted = self.resolve_bus_no(tour_name, bus_no or "")
        first_bus = self.resolve_bus_no(tour_name, "")
        occupied: Dict[str, Dict[str, Any]] = {}
        for row in rows:
            data = dict(row)
            row_bus = normalise_bus_no(data.get("bus_no")) or first_bus
            if wanted is not None and row_bus.casefold() != wanted.casefold():
                continue
            for seat in seat_tokens(data.get("seat")):
                occupied.setdefault(seat, data)
        return occupied

    def tour_seats_taken(self, tour_name: str, tour_date: str) -> int:
        """Number of seats sold across every bus of a departure."""
        buses = self.tour_buses(tour_name) or [{"bus_no": ""}]
        return sum(
            len(self.tour_seat_occupancy(tour_name, tour_date, bus_no=bus["bus_no"]))
            for bus in buses
        )

    def tour_seat_conflicts(
        self, tour_name: str, tour_date: str, seats: Any, exclude_id: Optional[int] = None,
        bus_no: Any = None,
    ) -> List[str]:
        occupied = self.tour_seat_occupancy(tour_name, tour_date, exclude_id=exclude_id, bus_no=bus_no)
        return sorted(set(seat_tokens(seats)).intersection(occupied))

    def _check_booking_bus(self, row: Dict[str, Any]) -> None:
        """Attach the booking to a real bus of its tour and validate its seats."""
        tour_name = str(row.get("tour_name") or "")
        buses = self.tour_buses(tour_name)
        if not buses:
            return  # tour is created on the fly by _ensure_tour (single bus)
        bus = self.tour_bus(tour_name, row.get("bus_no"))
        if bus is None:
            numbers = ", ".join(b["bus_no"] for b in buses)
            raise ValueError(
                f"Bus '{row.get('bus_no')}' is not part of {tour_name}. Choose one of: {numbers}."
            )
        row["bus_no"] = bus["bus_no"]
        invalid = [seat for seat in seat_tokens(row.get("seat")) if seat not in bus["seats"]]
        if invalid:
            raise ValueError(
                f"Seat(s) {', '.join(invalid)} do not exist on bus {bus['bus_no']} "
                f"({bus['label']}). Open the seat map and choose again."
            )

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
        if not str(row.get("booking_no") or "").strip():
            code = self.tour_code(str(row.get("tour_name") or ""))
            row["booking_no"] = self.next_number(tour_code=code)
        row.setdefault("status", "Confirmed")
        row["created_at"] = _now()
        row["updated_at"] = row["created_at"]
        columns = [c for c in COLUMNS if c != "id"]
        sql = f"INSERT INTO bookings ({', '.join(columns)}) VALUES ({', '.join('?' * len(columns))})"
        self.connection.execute("BEGIN IMMEDIATE")
        try:
            self._check_booking_bus(row)
            conflicts = self.tour_seat_conflicts(
                row.get("tour_name", ""), row.get("tour_date", ""), row.get("seat", ""),
                bus_no=row.get("bus_no", ""),
            )
            if conflicts and str(row.get("status") or "").lower() != "cancelled":
                raise ValueError(
                    f"These seats are already booked on bus {row.get('bus_no') or '1'} for this "
                    "tour date: " + ", ".join(conflicts)
                )
            self._ensure_tour(row.get("tour_name", ""))
            if not normalise_bus_no(row.get("bus_no")):
                row["bus_no"] = self.resolve_bus_no(row.get("tour_name", ""), "")
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
            self._check_booking_bus(row)
            conflicts = self.tour_seat_conflicts(
                row.get("tour_name", ""), row.get("tour_date", ""), row.get("seat", ""),
                exclude_id=booking_id, bus_no=row.get("bus_no", ""),
            )
            if conflicts and str(row.get("status") or "").lower() != "cancelled":
                raise ValueError(
                    f"These seats are already booked on bus {row.get('bus_no') or '1'} for this "
                    "tour date: " + ", ".join(conflicts)
                )
            self._ensure_tour(row.get("tour_name", ""))
            if not normalise_bus_no(row.get("bus_no")):
                row["bus_no"] = self.resolve_bus_no(row.get("tour_name", ""), "")
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

    def next_number(self, prefix: str = "RTT", tour_code: Optional[str] = None) -> str:
        """Next global booking serial, optionally prefixed by the tour code."""
        prefix = str(prefix or "RTT").strip()
        year = _dt.date.today().year
        serial_pattern = re.compile(rf"(?:^|-){re.escape(prefix)}-{year}-(\d+)$", re.IGNORECASE)
        last = 0
        for row in self.connection.execute("SELECT booking_no FROM bookings WHERE booking_no IS NOT NULL"):
            match = serial_pattern.search(str(row[0] or ""))
            if match:
                last = max(last, int(match.group(1)))
        serial = f"{prefix}-{year}-{last + 1:04d}"
        code = normalise_tour_code(tour_code) if str(tour_code or "").strip() else ""
        return f"{code}-{serial}" if code else serial

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
        return self._bus_ticket_dict(row) if row else None

    @staticmethod
    def _bus_ticket_dict(row: sqlite3.Row) -> Dict[str, Any]:
        data = dict(row)
        data["seat_genders"] = _parse_seat_genders(data.get("seat_genders"))
        return data

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
        allowed = {"travel_date", "ticket_no", "name", "route", "bus_no", "seat", "fare", "advance", "due", "id"}
        column = sort_by if sort_by in allowed else "travel_date"
        order = "DESC" if sort_desc else "ASC"
        where = (" WHERE " + " AND ".join(clauses)) if clauses else ""
        rows = self.connection.execute(
            "SELECT * FROM bus_tickets" + where + f" ORDER BY {column} {order}, id DESC", params
        ).fetchall()
        return [self._bus_ticket_dict(row) for row in rows]

    # ------------------------------------------------ buses of a daily trip

    @staticmethod
    def _trip_key(route: Any, travel_date: Any) -> Tuple[str, str]:
        parsed = parse_date(str(travel_date or ""))
        return _normalise_route(route), parsed.isoformat() if parsed else str(travel_date or "").strip()

    @staticmethod
    def _trip_bus_row(bus_no: str, layout: str, row_id: Optional[int] = None) -> Dict[str, Any]:
        layout = normalise_layout(layout)
        seats = bus_seat_ids(layout)
        return {"id": row_id, "bus_no": normalise_bus_no(bus_no) or "1", "layout": layout,
                "seats": seats, "capacity": len(seats), "label": layout_label(layout)}

    def trip_buses(self, route: Any, travel_date: Any) -> List[Dict[str, Any]]:
        """Buses running ``route`` on ``travel_date`` (default: one 41-seat bus "1")."""
        route_key, date_key = self._trip_key(route, travel_date)
        rows = self.connection.execute(
            "SELECT id, bus_no, layout FROM bus_trip_buses WHERE route = ? COLLATE NOCASE AND travel_date = ? "
            "ORDER BY position, id", (route_key, date_key)
        ).fetchall()
        if not rows:
            return [self._trip_bus_row("1", DEFAULT_BUS_LAYOUT)]
        return [self._trip_bus_row(str(row["bus_no"]), str(row["layout"]), int(row["id"])) for row in rows]

    def trip_bus(self, route: Any, travel_date: Any, bus_no: Any = "") -> Optional[Dict[str, Any]]:
        """One bus of a daily trip; an empty ``bus_no`` means the first bus."""
        buses = self.trip_buses(route, travel_date)
        wanted = normalise_bus_no(bus_no)
        if not wanted:
            return buses[0]
        for bus in buses:
            if bus["bus_no"].casefold() == wanted.casefold():
                return bus
        return None

    def _persist_trip_buses(self, route_key: str, date_key: str) -> None:
        """Write the virtual default bus to the table before the trip is edited."""
        exists = self.connection.execute(
            "SELECT 1 FROM bus_trip_buses WHERE route = ? COLLATE NOCASE AND travel_date = ? LIMIT 1",
            (route_key, date_key),
        ).fetchone()
        if exists:
            return
        for position, bus in enumerate(self.trip_buses(route_key, date_key)):
            self.connection.execute(
                "INSERT INTO bus_trip_buses(route, travel_date, bus_no, layout, position, created_at) "
                "VALUES (?, ?, ?, ?, ?, ?)",
                (route_key, date_key, bus["bus_no"], bus["layout"], position, _now()),
            )

    def set_trip_bus(self, route: Any, travel_date: Any, bus_no: Any, layout: Any) -> Dict[str, Any]:
        """Add a bus to a daily trip, or change the coach type of an existing one."""
        route_key, date_key = self._trip_key(route, travel_date)
        if not route_key or not parse_date(date_key):
            raise ValueError("Enter the bus route and a valid travel date first.")
        number = normalise_bus_no(bus_no)
        if not number:
            raise ValueError("Give the bus a number or short name (for example 1, 2 or A).")
        if len(number) > 12:
            raise ValueError("Keep the bus number short (12 characters or fewer).")
        layout = normalise_layout(layout)
        label = layout_label(layout)
        allowed = set(bus_seat_ids(layout))
        used = sorted(seat for seat in self.bus_seat_occupancy(route_key, date_key, bus_no=number)
                      if seat not in allowed)
        if used:
            raise ValueError(
                f"Bus {number} cannot change to {label}; tickets on this date already use seats: "
                f"{', '.join(used)}."
            )
        self.connection.execute("BEGIN IMMEDIATE")
        try:
            self._persist_trip_buses(route_key, date_key)
            existing = self.connection.execute(
                "SELECT id FROM bus_trip_buses WHERE route = ? COLLATE NOCASE AND travel_date = ? "
                "AND UPPER(TRIM(bus_no)) = UPPER(TRIM(?))", (route_key, date_key, number)
            ).fetchone()
            if existing:
                self.connection.execute("UPDATE bus_trip_buses SET layout = ? WHERE id = ?",
                                        (layout, int(existing["id"])))
            else:
                count = self.connection.execute(
                    "SELECT COUNT(*) FROM bus_trip_buses WHERE route = ? COLLATE NOCASE AND travel_date = ?",
                    (route_key, date_key),
                ).fetchone()[0]
                if int(count) >= MAX_BUSES_PER_TOUR:
                    raise ValueError(f"A route can run at most {MAX_BUSES_PER_TOUR} buses on one date.")
                self.connection.execute(
                    "INSERT INTO bus_trip_buses(route, travel_date, bus_no, layout, position, created_at) "
                    "VALUES (?, ?, ?, ?, ?, ?)", (route_key, date_key, number, layout, int(count), _now()),
                )
            self.connection.commit()
        except Exception:
            self.connection.rollback()
            raise
        bus = self.trip_bus(route_key, date_key, number)
        assert bus is not None
        return bus

    def remove_trip_bus(self, route: Any, travel_date: Any, bus_no: Any) -> None:
        """Take a bus off a daily trip (refused while tickets still use it)."""
        route_key, date_key = self._trip_key(route, travel_date)
        bus = self.trip_bus(route_key, date_key, bus_no)
        if bus is None:
            return
        buses = self.trip_buses(route_key, date_key)
        if len(buses) <= 1:
            raise ValueError("A trip needs at least one bus; change its coach type instead.")
        if self.bus_seat_occupancy(route_key, date_key, bus_no=bus["bus_no"]):
            raise ValueError(
                f"Bus {bus['bus_no']} still has tickets on this date and cannot be removed. "
                "Move or cancel those tickets first."
            )
        self.connection.execute(
            "DELETE FROM bus_trip_buses WHERE route = ? COLLATE NOCASE AND travel_date = ? "
            "AND UPPER(TRIM(bus_no)) = UPPER(TRIM(?))", (route_key, date_key, bus["bus_no"])
        )
        self.connection.commit()

    def trip_seats_taken(self, route: Any, travel_date: Any, exclude_id: Optional[int] = None) -> int:
        """Occupied seats across every bus of the trip (labels repeat per bus)."""
        return sum(
            len(self.bus_seat_occupancy(route, travel_date, exclude_id=exclude_id, bus_no=bus["bus_no"]))
            for bus in self.trip_buses(route, travel_date)
        )

    def trip_capacity(self, route: Any, travel_date: Any) -> int:
        return sum(bus["capacity"] for bus in self.trip_buses(route, travel_date))

    def _check_ticket_bus(self, row: Dict[str, Any]) -> Dict[str, Any]:
        """Attach the ticket to a bus of its trip and make sure its seats exist there."""
        route_key, date_key = self._trip_key(row.get("route"), row.get("travel_date"))
        bus = self.trip_bus(route_key, date_key, row.get("bus_no"))
        if bus is None:
            numbers = ", ".join(b["bus_no"] for b in self.trip_buses(route_key, date_key))
            raise ValueError(
                f"Bus '{row.get('bus_no')}' does not run {route_key} on {date_key}. Choose one of: {numbers}."
            )
        row["bus_no"] = bus["bus_no"]
        invalid = [seat for seat in seat_tokens(row.get("seat")) if seat not in bus["seats"]]
        if invalid:
            raise ValueError(
                f"Seat(s) {', '.join(invalid)} do not exist on bus {bus['bus_no']} ({bus['label']}). "
                "Open the seat map and choose again."
            )
        return bus

    def bus_seat_occupancy(
        self, route: str, travel_date: str, exclude_id: Optional[int] = None,
        bus_no: Optional[str] = None,
    ) -> Dict[str, Dict[str, Any]]:
        """Occupied seats of a trip; pass ``bus_no`` to look at one bus only.

        Without ``bus_no`` the rows of every bus are merged and keyed by seat
        label (labels repeat across buses), so use :meth:`trip_seats_taken`
        when you need a count for the whole trip.
        """
        clauses = [
            "UPPER(TRIM(route)) = UPPER(TRIM(?))", "travel_date = ?",
            "LOWER(COALESCE(status, '')) != 'cancelled'",
        ]
        parsed = parse_date(str(travel_date or ""))
        canonical_date = parsed.isoformat() if parsed else str(travel_date or "").strip()
        params: List[Any] = [_normalise_route(route), canonical_date]
        if bus_no is not None and str(bus_no).strip() and str(bus_no) != "*":
            clauses.append("UPPER(TRIM(COALESCE(bus_no, '1'))) = UPPER(TRIM(?))")
            params.append(normalise_bus_no(bus_no))
        if exclude_id is not None:
            clauses.append("id != ?")
            params.append(exclude_id)
        rows = self.connection.execute(
            "SELECT * FROM bus_tickets WHERE " + " AND ".join(clauses) + " ORDER BY id", params
        ).fetchall()
        occupied: Dict[str, Dict[str, Any]] = {}
        for row in rows:
            data = self._bus_ticket_dict(row)
            for seat in seat_tokens(data.get("seat")):
                occupied.setdefault(seat, {
                    **data,
                    "seat": seat,
                    "gender": data["seat_genders"].get(seat, ""),
                })
        return occupied

    def bus_seat_conflicts(
        self, route: str, travel_date: str, seat: str, exclude_id: Optional[int] = None,
        bus_no: Optional[str] = None,
    ) -> List[str]:
        requested = seat_tokens(seat)
        occupied = self.bus_seat_occupancy(route, travel_date, exclude_id=exclude_id, bus_no=bus_no)
        return [item for item in requested if item in occupied]

    def add_bus_ticket(self, data: Dict[str, Any]) -> int:
        row = _clean_bus_ticket(data)
        if not row["ticket_no"]:
            row["ticket_no"] = self.next_bus_number()
        seats = seat_tokens(row["seat"])
        if not row["route"] or not row["travel_date"] or not row["name"] or not seats:
            raise ValueError("Route, travel date, passenger name and at least one seat are required.")
        if not parse_date(row["travel_date"]):
            raise ValueError("Travel date must be a valid calendar date.")
        self._check_ticket_bus(row)
        if row["fare"] < 0 or row["advance"] < 0 or row["advance"] > row["fare"]:
            raise ValueError("Check the fare and amount paid.")
        now = _now()
        row["created_at"] = row["updated_at"] = now
        columns = (
            "ticket_no", "route", "travel_date", "departure_time", "name", "phone", "seat", "seat_genders",
            "bus_no", "fare", "advance", "due", "status", "notes", "created_at", "updated_at",
        )
        self.connection.execute("BEGIN IMMEDIATE")
        try:
            conflict = self.bus_seat_conflicts(row["route"], row["travel_date"], row["seat"],
                                               bus_no=row["bus_no"])
            if conflict and row["status"].lower() != "cancelled":
                raise ValueError(
                    f"Seat(s) {', '.join(conflict)} already booked on bus {row['bus_no']} for this route and date."
                )
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
        seats = seat_tokens(row["seat"])
        if not row["ticket_no"] or not row["route"] or not row["travel_date"] or not row["name"] or not seats:
            raise ValueError("Ticket number, route, travel date, passenger name and at least one seat are required.")
        if not parse_date(row["travel_date"]):
            raise ValueError("Travel date must be a valid calendar date.")
        self._check_ticket_bus(row)
        if row["fare"] < 0 or row["advance"] < 0 or row["advance"] > row["fare"]:
            raise ValueError("Check the fare and amount paid.")
        row["updated_at"] = _now()
        columns = (
            "ticket_no", "route", "travel_date", "departure_time", "name", "phone", "seat", "seat_genders",
            "bus_no", "fare", "advance", "due", "status", "notes", "updated_at",
        )
        self.connection.execute("BEGIN IMMEDIATE")
        try:
            conflict = self.bus_seat_conflicts(
                row["route"], row["travel_date"], row["seat"], exclude_id=ticket_id, bus_no=row["bus_no"]
            )
            if conflict and row["status"].lower() != "cancelled":
                raise ValueError(
                    f"Seat(s) {', '.join(conflict)} already booked on bus {row['bus_no']} for this route and date."
                )
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
            "count": sum(len(seat_tokens(row.get("seat"))) or 1 for row in active),
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
            writer.writerow(["Ticket No", "Booking contact", "Phone", "Route", "Date", "Bus", "Departure",
                             "Passengers", "Seats", "Seat genders", "Fare", "Paid", "Due", "Status", "Notes"])
            for row in rows:
                genders = _parse_seat_genders(row.get("seat_genders"))
                gender_text = "; ".join(f"{seat}: {gender.title()}" for seat, gender in genders.items())
                writer.writerow([row.get("ticket_no", ""), row.get("name", ""), row.get("phone", ""),
                                 row.get("route", ""), row.get("travel_date", ""), row.get("bus_no", "1"),
                                 row.get("departure_time", ""), len(seat_tokens(row.get("seat"))) or 1,
                                 row.get("seat", ""), gender_text,
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
            "Booking No", "Name", "Phone", "Seat", "Bus", "Total Amount", "Advance",
            "Due", "Booking Date", "Tour Date", "Tour Name", "Notes", "Status",
        ]
        with open(path, "w", newline="", encoding="utf-8-sig") as handle:
            writer = csv.writer(handle)
            writer.writerow(headers)
            for row in rows:
                writer.writerow([
                    row.get("booking_no", ""), row.get("name", ""), row.get("phone", ""),
                    row.get("seat", ""), row.get("bus_no", ""), f"{float(row.get('total') or 0):.2f}",
                    f"{float(row.get('advance') or 0):.2f}", f"{float(row.get('due') or 0):.2f}",
                    row.get("booking_date", ""), row.get("tour_date", ""),
                    row.get("tour_name", ""), row.get("notes", ""), row.get("status", ""),
                ])
            writer.writerow([])
            totals = self.totals(rows)
            writer.writerow([
                "TOTAL", f"{totals['count']} bookings", "", "", "",
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
        self._ensure_tour_code_column()
        self._ensure_bus_ticket_columns()
        self._ensure_booking_bus_column()
        self._normalise_legacy_values()
        self._seed_tour_catalog()
        self._backfill_tour_codes()
        self._backfill_tour_buses()

    def seed_demo(self, count: int = 6) -> None:
        """Insert a few sample rows (used by the Settings dialog and tests)."""
        samples = [
            ("Mohammad Rahim", "01712223344", "A1, A2", 12500, 5000, "2026-11-15", "Cox's Bazar Tour"),
            ("Fatima Akter", "01823334455", "B3", 9800, 9800, "2026-11-20", "Sajek Valley Tour"),
            ("Abdul Karim", "01934445566", "C3, C4", 18500, 8000, "2026-12-02", "Sylhet Tour"),
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
                "booking_no": self.next_number("RTT", tour_code=self.tour_code(tour)),
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
