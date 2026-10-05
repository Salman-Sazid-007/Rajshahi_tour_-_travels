"""Headless checks for the booking manager.

Run with ``python tests/test_app.py`` (or ``python -m unittest discover tests``).
They use the small Tkinter stand-in in ``tests/fake_tkinter.py`` and need no
third-party package.
"""

from __future__ import annotations

import os
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
from rtt.text import FontStyle, split_runs  # noqa: E402


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

    def test_company_logo_uses_the_bundled_brand_image(self) -> None:
        logo_path = config.asset_path("agency-logo-sidebar.png")
        self.assertTrue(os.path.isfile(logo_path))
        self.assertEqual(self.app.brand_logo_photo.file, logo_path)
        self.assertEqual(self.app.brand_logo_label.cget("image"), self.app.brand_logo_photo)

    def test_sidebar_navigation_updates_the_active_page(self) -> None:
        self.app.open_bus_page()
        self.assertEqual(self.app.page_title_var.get(), "Bus tickets")
        self.assertEqual(self.app.notebook.tab(self.app.notebook.select(), "text"), "Bus tickets")
        self.app.open_reports_page()
        self.assertEqual(self.app.page_title_var.get(), "Tours & monthly reports")

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

    def test_new_booking_keeps_trip_and_rejects_seats_already_booked_on_that_date(self) -> None:
        self.app.new_booking()
        self.app.vars["tour_name"].set("Sajek Valley Tour")
        self.app.vars["tour_date"].set("2026-12-11")
        self.app.vars["name"].set("Sazid")
        self.app.vars["seat"].set("A1, A2")
        self.app.save_booking()
        self.assertEqual(len(self.database.list()), 1)

        self.app.new_booking()
        self.assertEqual(self.app.vars["tour_name"].get(), "Sajek Valley Tour")
        self.assertEqual(self.app.vars["tour_date"].get(), "2026-12-11")
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
        self.app.save_booking()
        self.assertEqual(len(self.database.list()), 2)
        self.assertEqual(
            sorted(self.database.tour_seat_occupancy("Sajek Valley Tour", "2026-12-12")),
            ["A-1", "A-2"],
        )

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

    def test_delete_requires_selection(self) -> None:
        self.app.selected_id = None
        self.app.delete_booking()
        self.assertGreater(ANSWERS.get("showinfo", 0), 0)

    def test_receipt_pdf_writes_file(self) -> None:
        self.app.new_booking()
        self.app.vars["name"].set("PDF Customer")
        self.app.vars["seat"].set("A-2")
        self.app.vars["total"].set("5000")
        self.app.vars["advance"].set("1000")
        self.app.save_booking()
        self.app.selected_id = self.database.list()[0]["id"]
        self.app.receipt_pdf()
        expected = os.path.join(tempfile.gettempdir(), "receipt-RTT-%d-0001.pdf" % __import__(
            "datetime").date.today().year)
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
        self.app.tour_name_var.set("UI-created day trip")
        self.app.tour_capacity_var.set("28")
        self.app.save_tour(add_only=True)
        tour = next(item for item in self.database.tour_catalog() if item["name"] == "UI-created day trip")
        self.assertEqual(tour["seat_capacity"], 28)
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
        self.app.bus_vars["fare"].set("1200")
        self.app.bus_vars["advance"].set("400")
        self.app.save_bus_ticket()
        ticket_id = self.app.bus_selected_id
        self.assertIsNotNone(ticket_id)
        self.assertEqual(self.database.bus_ticket_get(ticket_id)["due"], 800.0)
        self.app.bus_vars["advance"].set("1200")
        self.app.save_bus_ticket()
        self.assertEqual(self.database.bus_ticket_get(ticket_id)["due"], 0.0)

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
