# Rajshahi Tours & Travels — Booking & Receipt Manager (Desktop)

A small Windows/Mac/Linux program for the office counter. It collects the nine
booking details, stores them in a local database, and prints a PDF you can hand
to the customer, email, or send over WhatsApp.

| Field | Notes |
| --- | --- |
| Name | Required |
| Phone Number | Free text, any format |
| Seat | e.g. `A1, A2` |
| Total Amount | Auto-formatted, e.g. `12,500.00` |
| Advance | Paid now |
| Due | Calculated automatically (Total − Advance) |
| Booking Date | Date picker (`...` button) or type `YYYY-MM-DD` |
| Tour Date | Date picker (`...` button) or type `YYYY-MM-DD` |
| Tour Name | Dropdown with your own suggestions |

Two PDFs are produced:

* **Receipt PDF** — one booking on an A4 page: letterhead, passenger and tour
  details, payment amounts (due highlighted in red), amount in words, notes,
  terms and two signature lines.
* **List PDF** — a landscape table of the bookings currently on screen with
  summary cards and a totals row, paginated automatically.

Both are ready-made samples you can open right now:
[`samples/sample-receipt.pdf`](samples/sample-receipt.pdf) ·
[`samples/sample-booking-list.pdf`](samples/sample-booking-list.pdf)

---

## 1. Run it with Python (no build needed)

1. Install **Python 3.10 or newer** from <https://www.python.org/downloads/>
   (tick *Add Python to PATH* during setup).
2. Download or clone this repository.
3. Double-click `app.py`, or from a terminal:

```bash
cd desktop
python app.py
```

Nothing else has to be installed — the PDF engine is written in pure Python and
the fonts are bundled. (`pip install uharfbuzz` is optional; it only improves how
Bangla names are spaced inside the PDF. English output is identical either way.)

## 2. Build a double-clickable program

**Windows** — double-click `build_windows.bat`. It installs PyInstaller and
creates `dist\RajshahiTours\RajshahiTours.exe`. Copy the whole
`RajshahiTours` folder to the office computer and send a shortcut to the
desktop.

**macOS / Linux** — run `./build_linux_mac.sh`, which produces
`dist/RajshahiTours/RajshahiTours`.

## 3. Where your data lives

| Item | Location |
| --- | --- |
| Database | `Documents\Rajshahi Tours & Travels\bookings.db` |
| Settings | `Documents\Rajshahi Tours & Travels\settings.json` |
| Backups | `Documents\Rajshahi Tours & Travels\Backups\` |
| PDF/CSV exports | wherever you choose (defaults to `...\Exports\`) |

*Help → About* shows the exact folder. The database is a normal SQLite file, so
copying that one file copies every booking.

**Portable mode:** put an empty file named `portable.txt` next to the program and
it keeps the data in a `data` folder beside itself — handy for a USB stick.

## 4. Using it

* **New** (or `Ctrl+N`) clears the form and assigns the next receipt number.
* **Save** (or `Ctrl+S`) stores the booking; **Due** updates as you type.
* Click a row to select it, double-click to load it into the form for editing.
* **Search** matches name, phone, seat, tour name or booking number. Combine it
  with *Only with due* and the *Tour* filter; every PDF/CSV you export then
  follows that same view.
* **Receipt PDF / Print** — `Print` sends the receipt straight to the default
  printer and keeps a copy in the Exports folder; `Receipt PDF` asks where to
  save it (that is the file you send to the customer).
* **List PDF / Due list PDF** — print or share a report of what is on screen.
* **File → Backup database** copies the database into `Backups` with a
  timestamp. Do it regularly, and keep a copy on Google Drive too.
* **Tools → Settings** changes the company name, address, phone, email, receipt
  prefix, currency symbol, the terms printed on the receipt, and the tour names
  offered in the dropdown.

Keyboard shortcuts: `Ctrl+N` new · `Ctrl+S` save · `Ctrl+F` jump to search.

## 5. Project layout

```
desktop/
  app.py                 entry point (python app.py)
  rajshahi_tours.spec    PyInstaller build recipe
  build_windows.bat      one-click Windows build
  build_linux_mac.sh     Linux/macOS build
  requirements.txt       nothing required; uharfbuzz optional
  assets/fonts/          Hind Siliguri (SIL Open Font License) for the PDFs
  rtt/
    config.py            settings, paths, money/date formatting
    db.py                SQLite storage, CSV export, backup/restore
    ttf.py               TrueType parser + subsetter
    pdf.py               PDF writer with embedded subset fonts
    text.py              text shaping and measuring
    documents.py         receipt and booking-list layouts
    ui.py                the Tkinter application
  samples/               example PDFs
  tests/                 headless tests (python tests/test_app.py)
```

## 6. Tests

```bash
python tests/test_app.py          # database, formatting, UI logic (no deps)
python tests/test_pdf_render.py   # rendering checks (needs pymupdf, pillow,
                                  # fonttools, uharfbuzz - skipped if absent)
```

`test_pdf_render.py` rasterises a page and compares the ink against the
font outlines, so a regression in glyph placement fails the suite immediately.

## 7. If something goes wrong

* *"Python was not found"* — reinstall Python and tick *Add Python to PATH*.
* The window does not open on Linux — `sudo apt install python3-tk`.
* Want a fresh start — close the program and delete
  `Documents\Rajshahi Tours & Travels\bookings.db` (or restore a backup first).

## 8. Notes

* Amounts are stored as numbers and printed with two decimals; the receipt also
  spells the amount out in words (`Taka Twelve Thousand Five Hundred Only`).
* Printing a PDF and *sending* it are the same file — after saving, the program
  asks whether to open it, and you can attach it to WhatsApp or email.
* The program never sends anything anywhere: no internet connection is used.
