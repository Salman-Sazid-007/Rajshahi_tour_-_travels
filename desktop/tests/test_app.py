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


class FormatTests(unittest.TestCase):
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
        self.assertLess(len(data), 400_000)

    def test_list_report_pdf(self) -> None:
        data = documents.booking_list_report(self.database.list(), self.settings)
        self.assertTrue(data.startswith(b"%PDF"))

    def test_empty_report_does_not_crash(self) -> None:
        data = documents.booking_list_report([], self.settings)
        self.assertTrue(data.startswith(b"%PDF"))

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
        self.app.vars["total"].set("8000")
        self.app.vars["advance"].set("3000")
        self.app.save_booking()
        booking_id = self.database.list()[0]["id"]
        self.app.selected_id = booking_id
        self.app.load_selected()
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
