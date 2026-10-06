"""Headless checks for the booking manager.

Run with ``python tests/test_app.py`` (or ``python -m unittest discover tests``)
after installing ``requirements.txt``. The tests use the small Tkinter stand-in
in ``tests/fake_tkinter.py`` and require the app's HarfBuzz dependency.
"""

from __future__ import annotations

import datetime as _dt
import json
import os
import sqlite3
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import fake_tkinter  # noqa: E402

# One shared answers dict: rtt.ui binds the dialog modules at import time.
ANSWERS: dict = {}
fake_tkinter.install(ANSWERS)

from rtt import config, db, documents, pdf, ui  # noqa: E402
from rtt.text import FontStyle, HARFBUZZ_AVAILABLE, split_runs  # noqa: E402


def temp_dir() -> str:
    os.environ["RTT_DATA_DIR"] = tempfile.mkdtemp(prefix="rtt-test-")
    return os.environ["RTT_DATA_DIR"]


class DatabaseTests(unittest.TestCase):
    def setUp(self) -> None:
        temp_dir()
        self.database = db.Database(config.database_path())

    def tearDown(self) -> None:
        self.database.close()

    def test_due_is_derived(self) -> None:
        booking_id = self.database.add({
            "booking_no": "RTT-2026-0001", "name": "Test Customer", "phone": "01700000000",
            "seat": "A1", "total": 12500, "advance": 5000, "booking_date": "2026-10-05",
            "tour_date": "2026-11-15", "tour_name": "Cox's Bazar Tour",
        })
        row = self.database.get(booking_id)
        self.assertEqual(row["due"], 7500.0)

    def test_update_recomputes_due(self) -> None:
        booking_id = self.database.add({"name": "A", "total": 1000, "advance": 100})
        self.database.update(booking_id, {"name": "A", "total": 1000, "advance": 1000})
        self.assertEqual(self.database.get(booking_id)["due"], 0.0)

    def test_next_number_increments(self) -> None:
        first = self.database.next_number("RTT")
        self.database.add({"booking_no": first, "name": "A", "total": 1})
        second = self.database.next_number("RTT")
        self.assertNotEqual(first, second)
        self.assertTrue(second.endswith("0002"), second)

    def test_tour_codes_prefix_booking_serials_and_remain_unique(self) -> None:
        first_id = self.database.add_tour("Sajek Code Tour", 40, "sjk")
        second_id = self.database.add_tour("Cox Code Tour", 40, "CXB")
        tours = {tour["id"]: tour for tour in self.database.tour_catalog()}
        self.assertEqual(tours[first_id]["tour_code"], "SJK")
        self.assertEqual(tours[second_id]["tour_code"], "CXB")
        collision_one = self.database.add_tour("Khulna River Tour")
        collision_two = self.database.add_tour("Kaptai River Tour")
        collision_codes = {
            tour["id"]: tour["tour_code"] for tour in self.database.tour_catalog()
        }
        self.assertEqual(collision_codes[collision_one], "KRT")
        self.assertEqual(collision_codes[collision_two], "KRT-2")

        first = self.database.next_number("RTT", tour_code=tours[first_id]["tour_code"])
        self.assertTrue(first.startswith("SJK-RTT-"), first)
        self.database.add({
            "booking_no": first, "name": "Sajek customer", "tour_name": "Sajek Code Tour",
            "tour_date": "2026-12-11", "seat": "A1",
        })
        second = self.database.next_number("RTT", tour_code=tours[second_id]["tour_code"])
        self.assertTrue(second.startswith("CXB-RTT-"), second)
        self.assertTrue(second.endswith("0002"), second)
        self.assertNotEqual(first, second)
        automatic_id = self.database.add({
            "name": "Automatic number passenger", "tour_name": "Automatic code tour",
            "tour_date": "2026-12-12", "seat": "A2",
        })
        automatic = self.database.get(automatic_id)
        self.assertTrue(automatic["booking_no"].startswith("ACT-RTT-"), automatic)
        self.assertTrue(automatic["booking_no"].endswith("0002"), automatic)
        with self.assertRaisesRegex(ValueError, "already assigned"):
            self.database.add_tour("Duplicate code tour", 40, "SJK")

    def test_legacy_tour_catalog_is_migrated_and_codes_are_backfilled(self) -> None:
        path = os.path.join(os.environ["RTT_DATA_DIR"], "legacy-catalog.db")
        connection = sqlite3.connect(path)
        connection.executescript("""
            CREATE TABLE bookings (
                id INTEGER PRIMARY KEY, booking_no TEXT, name TEXT NOT NULL, phone TEXT,
                seat TEXT, total REAL, advance REAL, due REAL, booking_date TEXT,
                tour_date TEXT, tour_name TEXT, notes TEXT, status TEXT,
                created_at TEXT, updated_at TEXT
            );
            CREATE TABLE tour_catalog (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL COLLATE NOCASE UNIQUE,
                seat_capacity INTEGER NOT NULL DEFAULT 40,
                active INTEGER NOT NULL DEFAULT 1,
                created_at TEXT NOT NULL DEFAULT ''
            );
            INSERT INTO tour_catalog(name, seat_capacity, active, created_at)
            VALUES ('Legacy Weekend', 40, 1, '');
            INSERT INTO bookings(booking_no, name, tour_name, booking_date, tour_date)
            VALUES ('RTT-2026-0777', 'Legacy customer', 'Legacy Weekend', '2026-10-01', '2026-12-11');
        """)
        connection.close()

        # Restoring a pre-code backup must run the same migration as opening it.
        self.database.restore(path)
        restored = next(
            tour for tour in self.database.tour_catalog(include_inactive=True)
            if tour["name"] == "Legacy Weekend"
        )
        self.assertEqual(restored["tour_code"], "LW")
        restored_codes = [tour["tour_code"] for tour in self.database.tour_catalog(include_inactive=True)]
        self.assertEqual(len(restored_codes), len({code.casefold() for code in restored_codes}))
        self.assertEqual(
            self.database.connection.execute("SELECT booking_no FROM bookings WHERE name = 'Legacy customer'").fetchone()[0],
            "RTT-2026-0777",
        )

        migrated = db.Database(path)
        try:
            legacy = next(
                tour for tour in migrated.tour_catalog(include_inactive=True)
                if tour["name"] == "Legacy Weekend"
            )
            self.assertEqual(legacy["tour_code"], "LW")
            columns = {row["name"] for row in migrated.connection.execute("PRAGMA table_info(tour_catalog)")}
            self.assertIn("tour_code", columns)
            self.assertEqual(migrated.get(1)["booking_no"], "RTT-2026-0777")
        finally:
            migrated.close()

    def test_filters(self) -> None:
        self.database.seed_demo(4)
        self.assertEqual(len(self.database.list()), 4)
        self.assertEqual(len(self.database.list(only_due=True)), 3)
        self.assertEqual(len(self.database.list(search="Cox's")), 1)
        self.assertEqual(len(self.database.list(tour="Sylhet Tour")), 1)

    def test_csv_export(self) -> None:
        self.database.seed_demo(3)
        path = os.path.join(tempfile.mkdtemp(), "out.csv")
        self.database.export_csv(path, self.database.list())
        with open(path, encoding="utf-8-sig") as handle:
            content = handle.read()
        self.assertIn("Booking No", content)
        self.assertIn("TOTAL", content)

    def test_backup_creates_file(self) -> None:
        self.database.seed_demo(2)
        target = self.database.backup(tempfile.mkdtemp())
        self.assertTrue(os.path.exists(target))
        self.assertGreater(os.path.getsize(target), 0)

    def test_archiving_tour_preserves_booking_history(self) -> None:
        tour_id = self.database.add_tour("Sajek Weekend", 32)
        self.assertIn("Sajek Weekend", self.database.active_tours())
        booking_id = self.database.add({
            "booking_no": self.database.next_number("RTT"), "name": "Tour customer",
            "tour_name": "Sajek Weekend", "tour_date": "2026-12-10", "seat": "A1",
            "total": 5000, "advance": 1000,
        })
        self.assertEqual(self.database.tour_seat_conflicts("Sajek Weekend", "2026-12-10", "A-1"), ["A-1"])
        self.assertTrue(self.database.archive_tour(tour_id))
        self.assertNotIn("Sajek Weekend", self.database.active_tours())
        self.assertIn("Sajek Weekend", self.database.tours())
        self.assertEqual(self.database.get(booking_id)["name"], "Tour customer")
        self.assertEqual(self.database.tour_catalog(include_inactive=True)[-1]["active"], 0)

    def test_permanent_tour_delete_removes_bookings_and_payment_data(self) -> None:
        tour_id = self.database.add_tour("Delete Weekend", 32)
        keeper_id = self.database.add_tour("Keep Weekend", 32)
        deleted_booking = self.database.add({
            "booking_no": self.database.next_number("RTT"), "name": "Delete customer",
            "tour_name": "Delete Weekend", "tour_date": "2026-12-10", "seat": "A1",
            "total": 5000, "advance": 1000,
        })
        kept_booking = self.database.add({
            "booking_no": self.database.next_number("RTT"), "name": "Keep customer",
            "tour_name": "Keep Weekend", "tour_date": "2026-12-10", "seat": "A2",
            "total": 4000, "advance": 2000,
        })
        self.database.connection.execute(
            "UPDATE bookings SET tour_name = 'delete weekend' WHERE id = ?", (deleted_booking,)
        )
        self.database.connection.commit()
        self.assertTrue(self.database.delete_tour(tour_id))
        self.assertIsNone(self.database.get(deleted_booking))
        self.assertEqual(self.database.list(tour="Delete Weekend"), [])
        self.assertNotIn("Delete Weekend", self.database.tours())
        self.assertNotIn("Delete Weekend", [tour["name"] for tour in self.database.tour_catalog(True)])
        self.assertEqual(self.database.get(kept_booking)["name"], "Keep customer")
        self.assertIn(keeper_id, [tour["id"] for tour in self.database.tour_catalog()])
        self.assertFalse(self.database.delete_tour(tour_id))

    def test_remove_tour_is_a_permanent_delete_alias(self) -> None:
        tour_id = self.database.add_tour("Removed tour", 30)
        booking_id = self.database.add({
            "booking_no": self.database.next_number("RTT"), "name": "Removed passenger",
            "tour_name": "Removed tour", "total": 1200, "advance": 300,
        })
        self.assertTrue(self.database.remove_tour(tour_id))
        self.assertIsNone(self.database.get(booking_id))

    def test_legacy_trip_dates_and_routes_are_normalised_on_open(self) -> None:
        booking_id = self.database.add({
            "booking_no": self.database.next_number("RTT"), "name": "Legacy passenger",
            "tour_name": "Sajek Valley Tour", "tour_date": "2026-12-22", "seat": "A-1",
        })
        ticket_id = self.database.add_bus_ticket({
            "ticket_no": self.database.next_bus_number(), "route": "Rajshahi → Dhaka",
            "travel_date": "2026-12-22", "name": "Legacy bus passenger", "seat": "A-2",
        })
        self.database.connection.execute(
            "UPDATE bookings SET tour_date = '22/12/2026' WHERE id = ?", (booking_id,)
        )
        self.database.connection.execute(
            "UPDATE bus_tickets SET route = 'Rajshahi→Dhaka', travel_date = '22/12/2026' WHERE id = ?",
            (ticket_id,),
        )
        self.database.connection.commit()
        self.database.close()
        self.database = db.Database(config.database_path())
        self.assertEqual(self.database.get(booking_id)["tour_date"], "2026-12-22")
        ticket = self.database.bus_ticket_get(ticket_id)
        self.assertEqual(ticket["travel_date"], "2026-12-22")
        self.assertEqual(ticket["route"], "Rajshahi → Dhaka")

    def test_deleted_tour_stays_removed_after_reopen(self) -> None:
        tour_id = self.database.add_tour("One-time special", 30)
        self.assertTrue(self.database.delete_tour(tour_id))
        self.database.close()
        self.database = db.Database(config.database_path())
        self.assertNotIn("One-time special", self.database.active_tours())
        self.assertNotIn("One-time special", [tour["name"] for tour in self.database.tour_catalog(True)])

    def test_renaming_tour_keeps_booking_history_with_the_tour(self) -> None:
        tour_id = self.database.add_tour("Old tour name", 40)
        booking_id = self.database.add({
            "booking_no": self.database.next_number("RTT"), "name": "Renamed passenger",
            "tour_name": "Old tour name", "tour_date": "2026-12-15", "seat": "C-2",
        })
        self.database.update_tour(tour_id, "New tour name", 40)
        self.assertEqual(self.database.get(booking_id)["tour_name"], "New tour name")
        self.assertEqual(self.database.tour_seat_conflicts("New tour name", "2026-12-15", "C2"), ["C-2"])

    def test_capacity_cannot_hide_an_active_booked_seat(self) -> None:
        tour_id = self.database.add_tour("Long coach", 40)
        self.database.add({
            "booking_no": self.database.next_number("RTT"), "name": "Rear-row passenger",
            "tour_name": "Long coach", "tour_date": "2026-12-25", "seat": "J-4",
        })
        with self.assertRaisesRegex(ValueError, "Capacity cannot be reduced"):
            self.database.update_tour(tour_id, "Long coach", 32)
        self.database.update_tour(tour_id, "Long coach", 46)
        self.assertEqual(self.database.tour_capacity("Long coach"), 46)

    def test_tour_seats_are_unique_per_date_and_release_on_cancel(self) -> None:
        base = {
            "booking_no": self.database.next_number("RTT"), "name": "First passenger",
            "tour_name": "Sajek Valley Tour", "tour_date": "2026-12-11", "seat": "B-1",
            "total": 1000, "advance": 0,
        }
        booking_id = self.database.add(base)
        duplicate = dict(base, booking_no=self.database.next_number("RTT"), name="Second passenger",
                         seat="B1", tour_date="11/12/2026")
        with self.assertRaisesRegex(ValueError, "already booked"):
            self.database.add(duplicate)
        base["status"] = "Cancelled"
        self.database.update(booking_id, base)
        self.database.add(duplicate)
        self.assertEqual(len(self.database.tour_seat_occupancy("Sajek Valley Tour", "2026-12-11")), 1)

    def test_month_bookings_filters_by_travel_month(self) -> None:
        self.database.add({"booking_no": "RTT-2026-1101", "name": "October", "tour_name": "Sajek Valley Tour",
                           "tour_date": "2026-10-12", "booking_date": "2026-10-01", "seat": "A-1"})
        self.database.add({"booking_no": "RTT-2026-1102", "name": "November", "tour_name": "Sylhet Tour",
                           "tour_date": "2026-11-12", "booking_date": "2026-10-02", "seat": "A-1"})
        self.assertEqual([row["name"] for row in self.database.month_bookings("2026-10")], ["October"])

    def test_bus_tickets_lock_a_seat_per_route_and_day(self) -> None:
        ticket = {
            "ticket_no": self.database.next_bus_number(), "route": "Rajshahi → Dhaka",
            "travel_date": "2026-12-20", "departure_time": "09:00 AM", "name": "Bus passenger",
            "phone": "01700000000", "seat": "A-1", "fare": 1200, "advance": 500,
        }
        ticket_id = self.database.add_bus_ticket(ticket)
        self.assertEqual(self.database.bus_ticket_get(ticket_id)["due"], 700.0)
        self.assertIn("A-1", self.database.bus_seat_occupancy(ticket["route"], ticket["travel_date"]))
        self.assertEqual(self.database.bus_ticket_get(ticket_id)["travel_date"], "2026-12-20")
        duplicate = dict(ticket, ticket_no=self.database.next_bus_number(), name="Another passenger",
                         route="Rajshahi→Dhaka", travel_date="20/12/2026")
        with self.assertRaisesRegex(ValueError, "already booked"):
            self.database.add_bus_ticket(duplicate)
        next_day = dict(duplicate, ticket_no=self.database.next_bus_number(), travel_date="2026-12-21")
        self.database.add_bus_ticket(next_day)
        ticket["status"] = "Cancelled"
        self.database.update_bus_ticket(ticket_id, ticket)
        duplicate["ticket_no"] = self.database.next_bus_number()
        self.database.add_bus_ticket(duplicate)
        self.assertEqual(len(self.database.list_bus_tickets(route=ticket["route"], travel_date=ticket["travel_date"])), 2)

    def test_bus_group_ticket_locks_each_seat_and_keeps_gender(self) -> None:
        ticket = {
            "ticket_no": self.database.next_bus_number(), "route": "Rajshahi → Dhaka",
            "travel_date": "2026-12-20", "name": "Group contact", "phone": "01700000000",
            "seat": "A1, A2", "seat_genders": {"A-1": "male", "A-2": "female"},
            "fare": 2400, "advance": 400,
        }
        ticket_id = self.database.add_bus_ticket(ticket)
        saved = self.database.bus_ticket_get(ticket_id)
        self.assertEqual(saved["seat"], "A-1, A-2")
        self.assertEqual(saved["seat_genders"], {"A-1": "male", "A-2": "female"})
        occupancy = self.database.bus_seat_occupancy(ticket["route"], ticket["travel_date"])
        self.assertEqual(occupancy["A-1"]["gender"], "male")
        self.assertEqual(occupancy["A-2"]["gender"], "female")
        self.assertEqual(self.database.bus_totals()["count"], 2)

        duplicate = dict(ticket, ticket_no=self.database.next_bus_number(), seat="A-2, A-3")
        with self.assertRaisesRegex(ValueError, "A-2.*already booked"):
            self.database.add_bus_ticket(duplicate)
        ticket["status"] = "Cancelled"
        self.database.update_bus_ticket(ticket_id, ticket)
        self.assertEqual(self.database.bus_seat_occupancy(ticket["route"], ticket["travel_date"]), {})

    def test_legacy_bus_database_adds_gender_column_and_normalises_seat(self) -> None:
        path = os.path.join(os.environ["RTT_DATA_DIR"], "legacy-bus.db")
        connection = sqlite3.connect(path)
        connection.executescript("""
            CREATE TABLE bus_tickets (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                ticket_no TEXT NOT NULL UNIQUE,
                route TEXT NOT NULL,
                travel_date TEXT NOT NULL,
                departure_time TEXT DEFAULT '',
                name TEXT NOT NULL,
                phone TEXT DEFAULT '',
                seat TEXT NOT NULL,
                fare REAL NOT NULL DEFAULT 0,
                advance REAL NOT NULL DEFAULT 0,
                due REAL NOT NULL DEFAULT 0,
                status TEXT NOT NULL DEFAULT 'Booked',
                notes TEXT DEFAULT '',
                created_at TEXT NOT NULL DEFAULT '',
                updated_at TEXT NOT NULL DEFAULT ''
            );
            INSERT INTO bus_tickets (ticket_no, route, travel_date, name, seat)
            VALUES ('RTT-BUS-2026-0001', 'Rajshahi->Dhaka', '20/12/2026', 'Legacy', 'A1');
        """)
        connection.commit()
        connection.close()
        migrated = db.Database(path)
        try:
            ticket = migrated.bus_ticket_get(1)
            self.assertEqual(ticket["seat"], "A-1")
            self.assertEqual(ticket["seat_genders"], {})
            columns = {row["name"] for row in migrated.connection.execute("PRAGMA table_info(bus_tickets)")}
            self.assertIn("seat_genders", columns)
        finally:
            migrated.close()

    def test_bus_csv_export(self) -> None:
        ticket_id = self.database.add_bus_ticket({
            "ticket_no": self.database.next_bus_number(), "route": "Rajshahi → Dhaka",
            "travel_date": "2026-12-20", "name": "CSV passenger", "seat": "J-4", "fare": 500,
        })
        path = os.path.join(tempfile.mkdtemp(), "bus.csv")
        self.database.export_bus_csv(path, [self.database.bus_ticket_get(ticket_id)])
        with open(path, encoding="utf-8-sig") as handle:
            self.assertIn("Ticket No", handle.read())


class FormatTests(unittest.TestCase):
    def test_offline_seat_labels_match_website_layout(self) -> None:
        standard = ui.seat_ids(40)
        self.assertEqual(len(standard), 40)
        self.assertEqual((standard[0], standard[-1]), ("A-1", "J-4"))
        express = ui.seat_ids(46)
        self.assertEqual(len(express), 46)
        self.assertEqual((express[0], express[-1]), ("1", "K-5"))

    def test_amount_to_words(self) -> None:
        self.assertEqual(config.amount_to_words(12500), "Taka Twelve Thousand Five Hundred Only")
        self.assertEqual(config.amount_to_words(100000), "Taka One Lakh Only")
        self.assertEqual(config.amount_to_words(0), "Taka Zero Only")
        self.assertIn("Paisa", config.amount_to_words(1250.75))

    def test_money(self) -> None:
        self.assertEqual(config.money(12500), "12,500.00")
        self.assertEqual(config.money_with_symbol(50, "Tk."), "Tk. 50.00")

    def test_dates(self) -> None:
        self.assertEqual(config.format_date("2026-11-15"), "15 Nov 2026")
        self.assertIsNone(config.parse_date("not a date"))

    def test_bangla_memo_format_helpers(self) -> None:
        self.assertEqual(documents._bangla_date("2026-10-06"), "৬ অক্টোবর ২০২৬")
        self.assertEqual(documents._bangla_number_words(12500), "বারো হাজার পাঁচশ")
        self.assertEqual(documents._bangla_amount_words(12500), "বারো হাজার পাঁচশ টাকা মাত্র")
        self.assertEqual(
            documents._bangla_printed_at(_dt.datetime(2026, 10, 6, 13, 5)),
            "৬ অক্টোবর ২০২৬, দুপুর ০১:০৫",
        )

    def test_lipighor_unicode_font_and_harfbuzz_shape_memo_text(self) -> None:
        paths = config.font_paths()
        self.assertTrue(paths["bangla"].endswith("Li Abu J M Akkas Unicode.ttf"))
        self.assertEqual(paths["bangla"], paths["bangla-bold"])
        self.assertTrue(os.path.isfile(paths["bangla"]))
        self.assertTrue(HARFBUZZ_AVAILABLE, "desktop requirements must include uharfbuzz")
        face = pdf.get_face(paths["bangla"])
        for char in "শর্তাবলি":
            self.assertNotEqual(face.char_to_gid(ord(char)), 0, f"missing glyph for {char}")
        document = pdf.make_document(paths, documents.STYLES)
        shaped = document.shaper.shape("শর্তাবলি", "bangla")
        self.assertLess(len(shaped), len("শর্তাবলি"), "HarfBuzz should form Bengali clusters")

        # If the dependency is missing, fail clearly rather than printing broken
        # one-glyph-per-codepoint Bengali text.
        import rtt.text as textmod
        original = textmod._hb
        textmod._hb = None
        try:
            with self.assertRaisesRegex(RuntimeError, "requires HarfBuzz"):
                pdf.make_document(paths, documents.STYLES).shaper.shape("শর্তাবলি", "bangla")
        finally:
            textmod._hb = original

    def test_new_receipt_defaults_and_legacy_migration(self) -> None:
        temp_dir()
        old_terms = [
            "Advance payment is non-refundable within 7 days of the tour date.",
            "Please carry this receipt on the day of departure.",
            "Seat numbers are confirmed only after full payment unless stated otherwise.",
        ]
        with open(config.settings_path(), "w", encoding="utf-8") as handle:
            json.dump({
                "company_tagline": "Tour operator, bus service & ticketing",
                "address": "Sopura Mor, near Shaheb Bazar Zero Point, Boalia, Rajshahi 6100",
                "footer_note": "Thank you for travelling with Rajshahi Tours & Travels.",
                "terms": old_terms,
            }, handle)
        settings = config.load_settings()
        self.assertEqual(settings["address"], "ভদ্রা মোড়, রাজশাহী")
        self.assertEqual(settings["email"], "rajshahitoursandtravels@gmail.com")
        self.assertEqual(settings["terms"], config.DEFAULT_TERMS_BN)
        self.assertEqual(settings["company_tagline"], config.DEFAULT_SETTINGS["company_tagline"])
        self.assertEqual(settings["footer_note"], config.DEFAULT_SETTINGS["footer_note"])
        self.assertEqual(len(settings["terms"]), 6)

        # 1.1.7/1.1.8 installs stored the English address and the placeholder
        # e-mail; both are untouched defaults and upgrade to the Bangla address
        # and the office Gmail address.
        with open(config.settings_path(), "w", encoding="utf-8") as handle:
            json.dump({"address": "Vodra Mor, Rajshahi", "email": "info@rajshahitours.com"}, handle)
        upgraded = config.load_settings()
        self.assertEqual(upgraded["address"], "ভদ্রা মোড়, রাজশাহী")
        self.assertEqual(upgraded["email"], "rajshahitoursandtravels@gmail.com")

        with open(config.settings_path(), "w", encoding="utf-8") as handle:
            json.dump({"address": "My office", "email": "owner@example.com",
                       "terms": ["Custom office policy"]}, handle)
        custom = config.load_settings()
        self.assertEqual(custom["address"], "My office")
        self.assertEqual(custom["email"], "owner@example.com")
        self.assertEqual(custom["terms"], ["Custom office policy"])


class FontEngineTests(unittest.TestCase):
    def test_fonts_exist(self) -> None:
        for path in config.font_paths().values():
            self.assertTrue(os.path.exists(path), path)

    def test_subset_keeps_metrics(self) -> None:
        face = pdf.get_face(config.font_paths()["latin"])
        subset, mapping, advances = face.subset([10, 12, 14, 16])
        self.assertEqual(advances[0], face.advance_widths[0])
        self.assertIn(10, mapping)
        self.assertTrue(subset.startswith(b"\x00\x01\x00\x00"))

    def test_run_splitting(self) -> None:
        runs = split_runs("Cox's 12")
        self.assertTrue(all(variant == "latin" for variant, _ in runs))


class DocumentTests(unittest.TestCase):
    def test_pdf_rect_uses_top_left_coordinates(self) -> None:
        doc = type("StubDocument", (), {"default_style": "regular"})()
        canvas = pdf.Canvas(doc, width=100, height=100)
        canvas.rect(5, 10, 20, 30, fill=(1, 0, 0))
        self.assertIn("5 60 20 30 re", canvas.ops[0])

    def setUp(self) -> None:
        temp_dir()
        self.settings = config.load_settings()
        self.database = db.Database(config.database_path())
        self.database.seed_demo(3)

    def tearDown(self) -> None:
        self.database.close()

    def test_receipt_pdf(self) -> None:
        data = documents.booking_receipt(self.database.list()[0], self.settings)
        self.assertTrue(data.startswith(b"%PDF"))
        self.assertTrue(data.rstrip().endswith(b"%%EOF"))
        self.assertLess(len(data), 500_000)
        self.assertIn(b"/Subtype /Image", data)
        self.assertIn(b"/XObject << /Im1", data)
        self.assertIn(b"/DCTDecode", data)
        with open(config.asset_path("agency-logo-print.jpg"), "rb") as handle:
            self.assertIn(handle.read(), data)

    def _memo_text_positions(self, booking, settings):
        """Render a memo and return ``[(page_index, y, text)]`` for every text draw."""
        draws = []
        original = pdf.Canvas.text

        def recording_text(canvas, x, y, text, *args, **kwargs):
            page_index = canvas.doc.pages.index(canvas) if canvas in canvas.doc.pages else -1
            draws.append((page_index, y, str(text)))
            return original(canvas, x, y, text, *args, **kwargs)

        pdf.Canvas.text = recording_text
        try:
            data = documents.booking_receipt(booking, settings)
        finally:
            pdf.Canvas.text = original
        return data, draws

    def test_memo_contact_lines_show_bangla_address_and_office_email(self) -> None:
        booking = self.database.list()[0]
        _, draws = self._memo_text_positions(booking, self.settings)
        texts = [text for _, _, text in draws]
        self.assertTrue(any("rajshahitoursandtravels@gmail.com" in text for text in texts))
        self.assertTrue(any("ভদ্রা মোড়, রাজশাহী" in text for text in texts))
        self.assertTrue(any(text.startswith("বুকিংয়ের অবস্থা:") for text in texts))
        self.assertTrue(any(text.startswith("প্রিন্টের তারিখ:") for text in texts))

    def test_memo_terms_never_overlap_status_or_signature_block(self) -> None:
        """Long terms and a note must flow above the reserved bottom block or onto
        a second page, never on top of the status line, date or signatures."""
        height = documents.PAGE[1]
        reserved_top = height - documents.RECEIPT_BOTTOM_RESERVED
        allowed_in_reserved = ("বুকিংয়ের অবস্থা:", "প্রিন্টের তারিখ:", "অফিস প্রতিনিধির স্বাক্ষর",
                               "গ্রাহকের স্বাক্ষর")
        footer_zone = height - 52
        booking = dict(self.database.list()[0], notes="হোটেল: সি ক্রাউন, ২ রাত। " * 3)
        for multiplier in (1, 2, 3):
            settings = dict(self.settings, terms=list(config.DEFAULT_TERMS_BN) * multiplier)
            data, draws = self._memo_text_positions(booking, settings)
            self.assertTrue(data.startswith(b"%PDF"))
            pages = {page for page, _, _ in draws}
            for page in pages:
                page_draws = [(y, text) for p, y, text in draws if p == page]
                intruders = [
                    text for y, text in page_draws
                    if reserved_top < y < footer_zone - 4
                    and not text.startswith(allowed_in_reserved)
                ]
                self.assertEqual(intruders, [], f"terms x{multiplier} page {page}: {intruders}")
                # The last page always carries status, date and both signature labels.
                if page == max(pages):
                    joined = " ".join(text for _, text in page_draws)
                    for marker in allowed_in_reserved:
                        self.assertIn(marker, joined)
            # The default six terms fit on one page.
            if multiplier == 1:
                self.assertEqual(pages, {0})

    def test_memo_prints_percent_and_pipe_characters(self) -> None:
        doc = pdf.make_document(config.font_paths(), documents.STYLES)
        self.assertEqual(doc.sanitise("৫০% অগ্রিম | বাকি"), "৫০% অগ্রিম | বাকি")

    def test_list_report_pdf(self) -> None:
        data = documents.booking_list_report(self.database.list(), self.settings)
        self.assertTrue(data.startswith(b"%PDF"))

    def test_empty_report_does_not_crash(self) -> None:
        data = documents.booking_list_report([], self.settings)
        self.assertTrue(data.startswith(b"%PDF"))

    def test_branded_bus_ticket_pdf(self) -> None:
        ticket = {
            "ticket_no": "RTT-BUS-2026-0001", "route": "Rajshahi → Dhaka",
            "travel_date": "2026-12-20", "departure_time": "09:00 AM", "name": "Bus customer",
            "phone": "01700000000", "seat": "A-1", "fare": 1000, "advance": 400,
            "due": 600, "status": "Booked",
        }
        data = documents.bus_ticket_receipt(ticket, self.settings)
        self.assertTrue(data.startswith(b"%PDF"))
        self.assertTrue(data.rstrip().endswith(b"%%EOF"))

    def test_group_bus_receipt_renders_seats_and_gender_assignments(self) -> None:
        ticket = {
            "ticket_no": "RTT-BUS-2026-0002", "route": "Rajshahi → Dhaka",
            "travel_date": "2026-12-23", "name": "Group contact", "phone": "01700000000",
            "seat": "A-1, A-2", "seat_genders": {"A-1": "male", "A-2": "female"},
            "fare": 2400, "advance": 400, "due": 2000, "status": "Booked",
        }
        data = documents.bus_ticket_receipt(ticket, self.settings)
        self.assertTrue(data.startswith(b"%PDF"))
        self.assertTrue(data.rstrip().endswith(b"%%EOF"))

    def test_long_values_are_not_lost(self) -> None:
        row = dict(self.database.list()[0])
        row["name"] = "A" * 120
        row["notes"] = "Long note. " * 40
        row["tour_name"] = "Very Long Tour Name " * 6
        data = documents.booking_receipt(row, self.settings)
        self.assertTrue(data.startswith(b"%PDF"))


class UiTests(unittest.TestCase):
    def setUp(self) -> None:
        temp_dir()
        ANSWERS.clear()
        ui.open_file = lambda path: None
        ui.print_file = lambda path: True
        self.settings = config.load_settings()
        self.database = db.Database(config.database_path())
        self.root = fake_tkinter.Tk()
        self.app = ui.BookingApp(self.root, self.database, self.settings)

    def tearDown(self) -> None:
        self.database.close()

    def test_booking_form_inputs_use_large_readable_type(self) -> None:
        self.assertEqual(self.app.style.configured["Input.TEntry"]["font"][1], 20)
        self.assertEqual(self.app.style.configured["Input.TCombobox"]["font"][1], 20)
        self.assertEqual(self.app.booking_form_widgets["name"].cget("style"), "Input.TEntry")
        self.assertEqual(self.app.booking_form_widgets["tour_name"].cget("style"), "Input.TCombobox")
        self.assertEqual(self.app.notes_text.cget("font"), (self.app.ui_font, 18))

    def test_inputs_carry_the_large_font_as_a_widget_option(self) -> None:
        """ttk ignores a style font on Entry/Combobox, so the font must be set on
        the widgets themselves and as option-database defaults."""
        large = (self.app.ui_font, ui.LARGE_INPUT_FONT_SIZE)
        for key, widget in self.app.booking_form_widgets.items():
            self.assertEqual(widget.cget("font"), large, key)
        self.assertEqual(self.app.total_entry.cget("font"), large)
        self.assertEqual(self.app.advance_entry.cget("font"), large)
        self.assertEqual(self.app.status_combo.cget("font"), large)
        self.assertEqual(self.app.tour_name_entry.cget("font"), large)
        self.assertEqual(self.app.tour_code_entry.cget("font"), large)
        self.assertEqual(self.app.tour_capacity_entry.cget("font"), large)
        self.assertEqual(self.app.bus_status_combo.cget("font"), large)
        self.assertEqual(self.app.bus_passenger_count_combo.cget("font"), large)
        bus_inputs = [w for w in self.app.bus_form_panel.card.winfo_children()
                      if str(w.cget("style") or "").startswith("Input.")]
        self.assertGreaterEqual(len(bus_inputs), 6)
        for widget in bus_inputs:
            self.assertEqual(widget.cget("font"), large)
        self.assertGreaterEqual(ui.LARGE_INPUT_FONT_SIZE, 20)
        base = (self.app.ui_font, ui.BASE_INPUT_FONT_SIZE)
        for pattern in ("*TEntry.font", "*TCombobox.font", "*TCombobox*Listbox.font",
                        "*TSpinbox.font"):
            self.assertEqual(self.root.option_db[pattern], base, pattern)

    def test_settings_dialog_inputs_use_the_large_font(self) -> None:
        dialog = ui.SettingsDialog(self.root, self.settings, on_save=lambda s: None)
        entries = [w for w in dialog.form_panel.card.winfo_children()
                   if w.cget("style") == "Input.TEntry"]
        self.assertTrue(entries)
        for entry in entries:
            self.assertEqual(entry.cget("font"), (dialog.ui_font, ui.LARGE_INPUT_FONT_SIZE))

    def test_mouse_wheel_scrolls_the_form_under_the_pointer(self) -> None:
        from types import SimpleNamespace

        steps = ui.ScrollableFormPanel.wheel_steps
        self.assertEqual(steps(SimpleNamespace(delta=120)), -1)     # Windows notch up
        self.assertEqual(steps(SimpleNamespace(delta=-240)), 2)     # Windows two notches down
        self.assertEqual(steps(SimpleNamespace(delta=3)), -1)       # macOS small delta
        self.assertEqual(steps(SimpleNamespace(num=4, delta=0)), -1)  # X11 wheel up
        self.assertEqual(steps(SimpleNamespace(num=5, delta=0)), 1)   # X11 wheel down
        self.assertEqual(steps(SimpleNamespace(delta=0)), 0)

        sequences = {args[0] for args, _ in self.root.all_bindings}
        self.assertTrue({"<MouseWheel>", "<Button-4>", "<Button-5>"} <= sequences)

        panel = self.app.tour_form_panel
        scrolled = []
        panel.canvas.yview = lambda *args: (0.0, 0.4)
        panel.canvas.yview_scroll = lambda number, what: scrolled.append((number, what))
        # The pointer is over an entry deep inside the card, not the canvas.
        entry = self.app.booking_form_widgets["name"]
        event = SimpleNamespace(widget=entry, delta=-120, num=0, x_root=0, y_root=0)
        self.assertEqual(ui.ScrollableFormPanel._dispatch_wheel(event), "break")
        self.assertEqual(scrolled, [(1, "units")])
        # Nothing to scroll when the whole form is already visible.
        panel.canvas.yview = lambda *args: (0.0, 1.0)
        ui.ScrollableFormPanel._dispatch_wheel(event)
        self.assertEqual(scrolled, [(1, "units")])
        # The notes box keeps its own wheel scrolling.
        notes_event = SimpleNamespace(widget=self.app.notes_text, delta=-120, num=0,
                                      x_root=0, y_root=0)
        self.assertIsNone(ui.ScrollableFormPanel._dispatch_wheel(notes_event))

    def test_company_logo_uses_the_bundled_brand_image(self) -> None:
        logo_path = config.asset_path("agency-logo-sidebar.png")
        app_icon_png = config.asset_path("agency-app-icon.png")
        app_icon_ico = config.asset_path("agency-app.ico")
        self.assertTrue(os.path.isfile(logo_path))
        self.assertTrue(os.path.isfile(app_icon_png))
        self.assertTrue(os.path.isfile(app_icon_ico))
        self.assertEqual(self.app.brand_logo_photo.file, logo_path)
        self.assertEqual(self.app.brand_logo_label.cget("image"), self.app.brand_logo_photo)
        self.assertEqual(self.app.window_icon_photo.file, app_icon_png)
        self.assertEqual(self.app.root.cget("iconphoto")[0], (True, self.app.window_icon_photo))

    def test_sidebar_navigation_updates_the_active_page(self) -> None:
        self.app.open_bus_page()
        self.assertEqual(self.app.page_title_var.get(), "Bus tickets")
        self.assertEqual(self.app.notebook.tab(self.app.notebook.select(), "text"), "Bus tickets")
        self.app.open_reports_page()
        self.assertEqual(self.app.page_title_var.get(), "Tours & monthly reports")

    def test_tour_date_field_follows_name_and_phone(self) -> None:
        fields = self.app.booking_form_widgets
        self.assertLess(fields["name"].cget("row"), fields["phone"].cget("row"))
        self.assertLess(fields["phone"].cget("row"), fields["tour_date"].cget("row"))
        self.assertEqual(fields["tour_date"].cget("row"), fields["phone"].cget("row") + 2)

    def test_new_and_save(self) -> None:
        self.app.new_booking()
        self.app.vars["name"].set("Kamal Hossain")
        self.app.vars["phone"].set("01711112222")
        self.app.vars["seat"].set("A4")
        self.app.vars["tour_name"].set("Sajek Valley Tour")
        self.app.vars["total"].set("15000")
        self.app.vars["advance"].set("6000")
        self.app.vars["tour_date"].set("2026-12-01")
        self.app.save_booking()
        rows = self.database.list()
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["due"], 9000.0)
        self.assertEqual(len(self.app.tree.get_children()), 1)
        self.assertEqual(self.app.vars["name"].get(), "")
        self.assertEqual(self.app.vars["phone"].get(), "")
        self.assertEqual(self.app.vars["tour_name"].get(), "")
        self.assertEqual(self.app.vars["tour_date"].get(), "")

    def test_successful_booking_resets_inputs_and_rejects_seats_already_booked(self) -> None:
        self.app.new_booking()
        first_number = self.app.vars["booking_no"].get()
        self.app.vars["tour_name"].set("Sajek Valley Tour")
        self.app.vars["tour_date"].set("2026-12-11")
        self.app.vars["name"].set("Sazid")
        self.app.vars["phone"].set("01710000000")
        self.app.vars["seat"].set("A1, A2")
        self.app.save_booking()
        self.assertEqual(len(self.database.list()), 1)
        self.assertIsNone(self.app.selected_id)
        self.assertNotEqual(self.app.vars["booking_no"].get(), first_number)
        self.assertEqual(self.app.vars["booking_no"].get(), self.database.next_number("RTT"))
        for key in ("name", "phone", "seat", "tour_name", "tour_date"):
            self.assertEqual(self.app.vars[key].get(), "", key)
        self.assertEqual(self.app.vars["total"].get(), "0")
        self.assertEqual(self.app.vars["advance"].get(), "0")

        self.app.vars["tour_name"].set("Sajek Valley Tour")
        self.app.vars["tour_date"].set("2026-12-11")
        self.app.vars["name"].set("Second passenger")
        self.app.vars["seat"].set("A-1, A-2")
        error = self.app.validate_form(self.app.collect_form())
        self.assertIsNotNone(error)
        self.assertIn("A-1, A-2", error)
        self.assertIn("already booked", error)
        self.app.save_booking()
        self.assertEqual(len(self.database.list()), 1)
        self.assertEqual(ANSWERS.get("showerror"), 1)

        # Seats belong to a departure, not to a tour for all time.
        self.app.vars["tour_date"].set("2026-12-12")
        self.assertIsNone(self.app.validate_form(self.app.collect_form()))
        second_number = self.app.vars["booking_no"].get()
        self.app.save_booking()
        rows = {row["name"]: row for row in self.database.list()}
        self.assertEqual(set(rows), {"Sazid", "Second passenger"})
        self.assertNotEqual(rows["Sazid"]["id"], rows["Second passenger"]["id"])
        self.assertEqual(rows["Second passenger"]["booking_no"], second_number)
        self.assertNotEqual(rows["Sazid"]["booking_no"], rows["Second passenger"]["booking_no"])
        self.assertEqual(
            sorted(self.database.tour_seat_occupancy("Sajek Valley Tour", "2026-12-12")),
            ["A-1", "A-2"],
        )

    def test_new_booking_number_uses_selected_tour_code(self) -> None:
        self.database.add_tour("Sajek Code Booking", 40, "SJB")
        self.app.new_booking()
        self.app.vars["tour_name"].set("Sajek Code Booking")
        first_number = self.app.vars["booking_no"].get()
        self.assertTrue(first_number.startswith("SJB-RTT-"), first_number)
        self.app.vars["name"].set("Coded passenger")
        self.app.vars["seat"].set("A1")
        self.app.vars["tour_date"].set("2026-12-11")
        self.app.save_booking()
        booking = self.database.list()[0]
        self.assertEqual(booking["booking_no"], first_number)
        self.assertEqual(self.app.vars["tour_name"].get(), "")
        self.assertEqual(self.app.vars["tour_date"].get(), "")
        next_number = self.app.vars["booking_no"].get()
        self.app.vars["tour_name"].set("Sajek Code Booking")
        self.assertTrue(self.app.vars["booking_no"].get().startswith("SJB-RTT-"))
        self.assertNotEqual(self.app.vars["booking_no"].get(), first_number)
        self.assertEqual(self.app.vars["booking_no"].get().rsplit("-", 1)[-1], "0002")
        self.assertTrue(next_number.endswith("0002"), next_number)

    def test_tour_seat_map_disables_seats_booked_for_the_departure(self) -> None:
        self.database.add({
            "booking_no": self.database.next_number("RTT"), "name": "Already booked",
            "tour_name": "Sajek Valley Tour", "tour_date": "2026-12-11", "seat": "A1",
        })
        occupied = self.database.tour_seat_occupancy("Sajek Valley Tour", "2026-12-11")
        dialog = ui.SeatMapDialog(
            self.root, "Sajek Valley Tour · 11 Dec 2026", 40, occupied, [],
        )
        self.assertEqual(dialog.buttons["A-1"].cget("style"), "BookedSeat.TButton")
        self.assertEqual(dialog.buttons["A-1"].cget("state"), "disabled")
        dialog.toggle("A-1")
        self.assertNotIn("A-1", dialog.selected)
        self.assertEqual(dialog.buttons["A-2"].cget("state"), "normal")
        dialog.destroy()

    def test_due_updates_live(self) -> None:
        self.app.vars["total"].set("1000")
        self.app.vars["advance"].set("250")
        self.assertEqual(self.app.due_var.get(), "750.00")

    def test_validation_rejects_empty_name(self) -> None:
        self.app.new_booking()
        self.app.vars["name"].set("")
        data = self.app.collect_form()
        self.assertIsNotNone(self.app.validate_form(data))

    def test_validation_rejects_advance_over_total(self) -> None:
        self.app.new_booking()
        self.app.vars["name"].set("Someone")
        self.app.vars["total"].set("100")
        self.app.vars["advance"].set("500")
        self.assertIsNotNone(self.app.validate_form(self.app.collect_form()))

    def test_edit_round_trip(self) -> None:
        self.app.new_booking()
        self.app.vars["name"].set("Rina Akter")
        self.app.vars["tour_name"].set("Sajek Valley Tour")
        self.app.vars["tour_date"].set("2026-12-11")
        self.app.vars["seat"].set("A-1")
        self.app.vars["total"].set("8000")
        self.app.vars["advance"].set("3000")
        self.app.save_booking()
        booking_id = self.database.list()[0]["id"]
        self.app.tree.selection_set(str(booking_id))
        self.app.on_select()
        self.assertEqual(self.app.vars["name"].get(), "Rina Akter")
        self.app.vars["advance"].set("8000")
        self.app.save_booking()
        self.assertEqual(self.database.get(booking_id)["due"], 0.0)
        self.assertIsNone(self.app.selected_id)
        self.assertEqual(self.app.vars["name"].get(), "")
        self.assertEqual(self.app.vars["tour_name"].get(), "")
        self.assertEqual(self.app.vars["tour_date"].get(), "")

    def test_delete_requires_selection(self) -> None:
        self.app.selected_id = None
        self.app.delete_booking()
        self.assertGreater(ANSWERS.get("showinfo", 0), 0)

    def test_print_receipt_shows_harfbuzz_error_if_dependency_is_missing(self) -> None:
        booking_id = self.database.add({
            "booking_no": "RTT-TEST-0001", "name": "Test passenger",
            "tour_name": "Test tour", "tour_date": "2026-12-11", "seat": "A-1",
        })
        self.app.selected_id = booking_id
        import rtt.text as textmod
        original = textmod._hb
        textmod._hb = None
        try:
            self.app.print_receipt()
        finally:
            textmod._hb = original
        self.assertEqual(ANSWERS.get("showerror"), 1)

    def test_receipt_pdf_writes_file(self) -> None:
        self.app.new_booking()
        self.app.vars["name"].set("PDF Customer")
        self.app.vars["tour_name"].set("Sajek Valley Tour")
        self.app.vars["tour_date"].set("2026-12-11")
        self.app.vars["seat"].set("A-2")
        self.app.vars["total"].set("5000")
        self.app.vars["advance"].set("1000")
        self.app.save_booking()
        booking = self.database.list()[0]
        self.app.selected_id = booking["id"]
        self.app.receipt_pdf()
        expected = os.path.join(tempfile.gettempdir(), f"receipt-{booking['booking_no']}.pdf")
        self.assertTrue(os.path.exists(expected), expected)

    def test_list_and_due_reports(self) -> None:
        self.database.seed_demo(4)
        self.app.refresh()
        self.app.list_pdf()
        self.app.due_pdf()
        self.assertTrue(os.path.exists(os.path.join(tempfile.gettempdir(), "booking-list.pdf")))
        self.assertTrue(os.path.exists(os.path.join(tempfile.gettempdir(), "due-list.pdf")))

    def test_csv_export(self) -> None:
        self.database.seed_demo(3)
        self.app.refresh()
        self.app.export_csv()
        self.assertTrue(os.path.exists(os.path.join(
            tempfile.gettempdir(), "bookings-%s.csv" % __import__("datetime").date.today().isoformat())))

    def test_backup_and_filters(self) -> None:
        self.database.seed_demo(4)
        self.app.refresh()
        self.app.due_only_var.set(True)
        self.app.refresh()
        self.assertEqual(len(self.app.rows), 3)
        self.app.backup_database()
        self.assertGreater(ANSWERS.get("showinfo", 0), 0)

    def test_tour_catalog_can_add_and_permanently_delete_saved_data(self) -> None:
        self.assertEqual(self.app.tour_code_entry.cget("style"), "Input.TEntry")
        self.assertEqual(self.app.tour_name_entry.cget("style"), "Input.TEntry")
        self.app.tour_name_var.set("UI-created day trip")
        self.app.tour_code_var.set("uid")
        self.app.tour_capacity_var.set("28")
        self.app.save_tour(add_only=True)
        self.assertEqual(self.app.tour_name_var.get(), "")
        self.assertEqual(self.app.tour_code_var.get(), "")
        self.assertEqual(self.app.tour_capacity_var.get(), "40")
        tour = next(item for item in self.database.tour_catalog() if item["name"] == "UI-created day trip")
        self.assertEqual(tour["tour_code"], "UID")
        self.assertEqual(tour["seat_capacity"], 28)
        self.assertEqual(
            self.app.tour_catalog_tree.item(str(tour["id"]))["values"][1], "UID"
        )
        booking_id = self.database.add({
            "booking_no": self.database.next_number("RTT"), "name": "UI trip customer",
            "tour_name": "UI-created day trip", "tour_date": "2026-12-10", "seat": "A1",
            "total": 2800, "advance": 1000,
        })
        self.app.selected_tour_catalog_id = int(tour["id"])
        self.app.tour_name_var.set(tour["name"])
        self.app.delete_tour_permanently()
        self.assertIsNone(self.database.get(booking_id))
        self.assertNotIn("UI-created day trip", self.database.active_tours())
        self.assertNotIn("UI-created day trip", [item["name"] for item in self.database.tour_catalog(True)])
        self.assertIn("permanently deleted", self.app.status_var.get())

    def test_tour_catalog_archive_keeps_history(self) -> None:
        tour_id = self.database.add_tour("UI archive test", 28)
        booking_id = self.database.add({
            "booking_no": self.database.next_number("RTT"), "name": "Archive customer",
            "tour_name": "UI archive test", "tour_date": "2026-12-10", "seat": "A1",
            "total": 2800, "advance": 1000,
        })
        self.app.selected_tour_catalog_id = tour_id
        self.app.archive_tour()
        self.assertNotIn("UI archive test", self.database.active_tours())
        self.assertEqual(self.database.get(booking_id)["name"], "Archive customer")
        self.assertIn("UI archive test", self.database.tours())

    def test_deleting_default_tour_persists_across_app_restart(self) -> None:
        name = "Cox's Bazar Tour"
        tour = next(item for item in self.database.tour_catalog() if item["name"] == name)
        booking_id = self.database.add({
            "booking_no": self.database.next_number("RTT"), "name": "Default tour passenger",
            "tour_name": name, "tour_date": "2026-12-10", "seat": "A1",
            "total": 5000, "advance": 1500,
        })
        self.app.selected_tour_catalog_id = int(tour["id"])
        self.app.delete_tour_permanently()
        self.assertIsNone(self.database.get(booking_id))
        self.assertNotIn(name, config.load_settings()["tour_suggestions"])
        self.database.close()
        self.database = db.Database(config.database_path())
        restarted = ui.BookingApp(fake_tkinter.Tk(), self.database, config.load_settings())
        self.assertNotIn(name, self.database.active_tours())
        self.assertNotIn(name, [item["name"] for item in self.database.tour_catalog(True)])
        self.assertNotIn(name, restarted.settings["tour_suggestions"])

    def test_monthly_report_groups_trips_and_shows_open_seats(self) -> None:
        for index, seat in enumerate(("A-1", "A-2"), start=1):
            self.database.add({
                "booking_no": self.database.next_number("RTT"), "name": f"Monthly passenger {index}",
                "tour_name": "Sajek Valley Tour", "tour_date": "2026-12-11", "seat": seat,
                "total": 1000, "advance": 250,
            })
        self.app.month_var.set("2026-12")
        self.app.refresh_month_report()
        rows = self.app.month_tree.get_children()
        self.assertEqual(len(rows), 1)
        values = self.app.month_tree.item(rows[0])["values"]
        self.assertEqual(values[2:5], (2, 2, 38))
        self.assertIn("1 departures", self.app.month_summary_var.get())

    def test_renamed_tour_updates_legacy_suggestions(self) -> None:
        old_name = "Cox's Bazar Tour"
        tour = next(item for item in self.database.tour_catalog() if item["name"] == old_name)
        self.app.selected_tour_catalog_id = int(tour["id"])
        self.app.tour_name_var.set("Coastal Weekend")
        self.app.tour_capacity_var.set("40")
        self.app.save_tour()
        self.assertNotIn(old_name, self.app.settings["tour_suggestions"])
        self.assertIn("Coastal Weekend", self.app.settings["tour_suggestions"])
        self.assertNotIn(old_name, self.database.active_tours())

    def test_bus_ticket_form_saves_and_updates_payment(self) -> None:
        self.app.new_bus_ticket()
        self.app.bus_vars["name"].set("Counter passenger")
        self.app.bus_vars["travel_date"].set("2026-12-22")
        self.app.bus_vars["seat"].set("A1")
        self.app.bus_seat_genders = {"A-1": "male"}
        self.app.bus_vars["fare"].set("1200")
        self.app.bus_vars["advance"].set("400")
        self.app.save_bus_ticket()
        ticket_id = self.app.bus_selected_id
        self.assertIsNotNone(ticket_id)
        self.assertEqual(self.database.bus_ticket_get(ticket_id)["due"], 800.0)
        self.app.bus_vars["advance"].set("1200")
        self.app.save_bus_ticket()
        self.assertEqual(self.database.bus_ticket_get(ticket_id)["due"], 0.0)

    def test_bus_group_booking_uses_passenger_count_for_seats_and_fare(self) -> None:
        self.app.new_bus_ticket()
        self.app.bus_vars["name"].set("Group contact")
        self.app.bus_vars["travel_date"].set("2026-12-23")
        self.app.bus_passenger_count_var.set("2")
        self.app.bus_vars["seat"].set("A1, A2")
        self.app.bus_seat_genders = {"A-1": "male", "A-2": "female"}
        self.app.bus_vars["fare"].set("1200")
        self.app.bus_vars["advance"].set("400")
        self.app.save_bus_ticket()

        ticket = self.database.bus_ticket_get(self.app.bus_selected_id)
        self.assertEqual(ticket["seat"], "A-1, A-2")
        self.assertEqual(ticket["seat_genders"], {"A-1": "male", "A-2": "female"})
        self.assertEqual(ticket["fare"], 2400)
        self.assertEqual(ticket["due"], 2000)
        occupied = self.database.bus_seat_occupancy(ticket["route"], ticket["travel_date"])
        self.assertEqual(occupied["A-1"]["gender"], "male")
        self.assertEqual(occupied["A-2"]["gender"], "female")
        self.assertEqual(self.database.bus_totals()["count"], 2)

    def test_bus_passenger_count_adjusts_selected_seats_and_total_due(self) -> None:
        self.app.new_bus_ticket()
        self.app.bus_vars["fare"].set("1000")
        self.app.bus_vars["advance"].set("500")
        self.app.bus_passenger_count_var.set("2")
        self.assertEqual(self.app.bus_due_var.get(), "1,500.00")
        self.app.bus_vars["seat"].set("A1, A2")
        self.app.bus_seat_genders = {"A-1": "male", "A-2": "female"}
        self.app.bus_passenger_count_var.set("1")
        self.assertEqual(self.app.bus_vars["seat"].get(), "A-1")
        self.assertEqual(self.app.bus_seat_genders, {"A-1": "male"})
        self.assertEqual(self.app.bus_due_var.get(), "500.00")

    def test_bus_ticket_requires_exactly_one_seat_and_gender_per_passenger(self) -> None:
        self.app.new_bus_ticket()
        self.app.bus_vars["name"].set("Group contact")
        self.app.bus_vars["travel_date"].set("2026-12-24")
        self.app.bus_passenger_count_var.set("2")
        self.app.bus_vars["seat"].set("A1")
        error = self.app.validate_bus_ticket(self.app.collect_bus_ticket())
        self.assertIn("exactly 2", error)
        self.app.bus_vars["seat"].set("A1, A2")
        error = self.app.validate_bus_ticket(self.app.collect_bus_ticket())
        self.assertIn("Male or Female", error)

    def test_bus_seat_map_selects_exact_count_and_colours_gender(self) -> None:
        selected = []
        dialog = ui.SeatMapDialog(
            self.root, "Counter bus · 23 Dec 2026", 40,
            {"A-3": {"gender": "female"}}, [], max_select=2, gendered=True,
            on_save=lambda seats, genders: selected.append((seats, genders)),
        )
        dialog.toggle("A-1")
        self.assertNotIn("A-1", dialog.selected)
        dialog.set_active_gender("male")
        dialog.toggle("A-1")
        self.assertEqual(dialog.buttons["A-1"].cget("style"), "SelectedMaleSeat.TButton")
        self.assertEqual(dialog.buttons["A-1"].cget("text"), "A-1 M")
        dialog.set_active_gender("female")
        dialog.toggle("A-2")
        self.assertEqual(dialog.buttons["A-2"].cget("style"), "SelectedFemaleSeat.TButton")
        self.assertEqual(dialog.buttons["A-2"].cget("text"), "A-2 F")
        self.assertEqual(dialog.buttons["A-3"].cget("style"), "BookedFemaleSeat.TButton")
        self.assertEqual(dialog.save_button.cget("state"), "normal")
        dialog.save()
        self.assertEqual(selected, [(["A-1", "A-2"], {"A-1": "male", "A-2": "female"})])

    def test_settings_round_trip(self) -> None:
        dialog = ui.SettingsDialog(self.root, self.settings, on_save=self.app.apply_settings)
        dialog.vars["company_name"].set("Rajshahi Tours & Travels")
        dialog.vars["currency"].set("Tk.")
        dialog.save()
        reloaded = config.load_settings()
        self.assertEqual(reloaded["company_name"], "Rajshahi Tours & Travels")
        self.assertIsInstance(reloaded["terms"], list)
        self.assertIsInstance(reloaded["tour_suggestions"], list)


if __name__ == "__main__":
    unittest.main(verbosity=2)
