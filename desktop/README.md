# Rajshahi Tours & Travels — Offline Tour & Bus Manager (Desktop)

## Download

These are the **latest published** downloads: desktop version 1.1.2.

| Download | For |
| --- | --- |
| [**RajshahiTours-Windows-1.1.2.zip**](https://github.com/Salman-Sazid-007/Rajshahi_tour_-_travels/releases/download/desktop-v1.1.2/RajshahiTours-Windows-1.1.2.zip) | Windows: unzip, then double-click `RajshahiTours.exe`. Python is **not** required. |
| [**RajshahiTours-Desktop-1.1.2.zip**](https://github.com/Salman-Sazid-007/Rajshahi_tour_-_travels/releases/download/desktop-v1.1.2/RajshahiTours-Desktop-1.1.2.zip) | Run the source with Python 3.10+ (any OS). Unzip and double-click `app.py`. |

All published versions: <https://github.com/Salman-Sazid-007/Rajshahi_tour_-_travels/releases?q=desktop> ·
Open `START-HERE.txt` inside a release zip first if you just want to start using it.

To run the current source, follow [Run it with Python](#1-run-it-with-python-no-build-needed) below. The app shows version 1.1.2 in **Help → About**.

---

The desktop app is a local, offline counter workspace. It stores tour bookings,
tour details, bus tickets, seat occupancy and payment balances in SQLite on this
computer. The interface is organized into **Overview**, **Tour bookings**,
**Bus tickets**, and **Tours & monthly reports**.

## What it does

* **Manage tours:** create, rename and adjust seat capacity. Archive a tour to
hide it from new bookings while keeping its history, or permanently delete the
tour and every associated booking/payment record from the database after an
explicit warning and confirmation.
* **Book a tour:** choose a tour and travel date, open the seat map, select free
seats, and save the customer and payment. Occupied seats are locked for that
same tour/date. Edit bookings or payments later; the remaining due is recalculated.
* **Issue offline bus tickets:** enter a route and any travel date, choose from
the 40-seat map, record passenger and payment information, and print a ticket.
The same route/date/seat cannot be sold twice. Cancelled tickets release seats.
* **Track trips:** see booked/open seats, trip totals and outstanding amounts on
the Overview and in the monthly travel report.
* **Export a monthly sheet:** filter by travel month, review each departure,
bookings, seats, availability and due, then export a printable PDF or spreadsheet-friendly CSV.
* **Keep a local record:** search and filter bookings/tickets, reprint a receipt
or ticket, and back up the SQLite database. No internet connection is used.

### Tour seat layouts

The standard tour map has 40 seats (`A-1` through `J-4`), with four seats per
row and an aisle. A 46-seat tour can use the extended layout: front seat `1`,
rows A–J, and `K-1` through `K-5`. Smaller capacities use the corresponding
subset of the standard map. Labels such as `A1` are normalized to `A-1`.

### Receipts and reports

The desktop sidebar, tour receipts, bus tickets, and reports use the supplied
full company logo. The original JPG is bundled at `assets/agency-logo.jpg`; a
trimmed, print-resolution copy is embedded in PDFs and a compact PNG is used by
the Tkinter sidebar, so no image package is required at runtime. Brand accents
match the supplied palette: teal `#22B4B3`, orange `#F97000` / `#EE8625`, and
black `#000000`. The owner **Safayet Hossain** and phone **01782250709** appear
in the upper-right PDF header; booking details and payment balances follow
below in an aligned layout with a compact logo and larger, more legible type.
The desktop UI and tables also use larger fonts. Company and owner details can
be edited in **Tools → Settings**.

* **Receipt PDF / Print** — a branded A4 receipt for one tour booking.
* **Monthly PDF / CSV** — tour bookings for the selected travel month, with
passenger, seat and payment data.
* **List PDF / Due list PDF** — a landscape report of the filtered tour-booking
view.
* **Bus ticket PDF / Print** — a branded ticket for one manually issued bus seat.
* **Export bus list** — CSV for the currently filtered offline ticket register.

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
`RajshahiTours` folder to the office computer and create a shortcut on the desktop.

**macOS / Linux** — run `./build_linux_mac.sh`, which produces
`dist/RajshahiTours/RajshahiTours`.

## 3. Where your data lives

| Item | Location |
| --- | --- |
| Database (bookings, tour catalogue, bus tickets) | `Documents\Rajshahi Tours & Travels\bookings.db` |
| Settings | `Documents\Rajshahi Tours & Travels\settings.json` |
| Backups | `Documents\Rajshahi Tours & Travels\Backups\` |
| PDF/CSV exports | wherever you choose (defaults to `...\Exports\`) |

*Help → About* shows the exact folder. Back up `bookings.db` regularly; it
contains the tour catalogue, booking history, and offline bus tickets.

**Portable mode:** put an empty file named `portable.txt` next to the program and
it keeps the data in a `data` folder beside itself — handy for a USB stick.

## 4. Using it

* **Overview** shows this month's tour bookings, seats sold, outstanding tour
due, bus-ticket count and upcoming departures.
* **Tour bookings** — choose a tour/date, click **Map**, select available seats,
then save. Select a row and edit it to change customer details, seats, status,
or payment; due is recalculated as Total − Advance. The seat map excludes the
currently edited booking from its occupied-seat list.
* **Tours & monthly reports** — add a tour, set its seat capacity, or select a
tour to edit it. **Archive (keep history)** removes it from new-booking choices
while retaining its bookings and reports. **Delete tour + bookings** permanently
removes that tour and its associated booking/payment records after confirmation.
Choose a travel month (`YYYY-MM`) and use **Monthly PDF** or **Export CSV**.
* **Bus tickets** — enter a route, date, departure time, passenger and fare;
click **Map** to choose an open seat. Save, edit, cancel or delete a ticket, and
print the branded ticket. Seat occupancy is scoped to route + travel date.
* **Search and filters** apply to the relevant list. Select a booking or ticket
row to load it for editing (double-click also works). Cancelled records stay in
history but do not occupy a seat or add to payment totals.
* **File → Backup database** copies all local data into `Backups` with a
timestamp. Keep a second copy somewhere safe.
* **Tools → Settings** changes the company and owner names, phone numbers,
address, email, receipt prefix, currency symbol, and printed terms.

Keyboard shortcuts for the tour-booking page: `Ctrl+N` new · `Ctrl+S` save ·
`Ctrl+F` jump to search.

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
    db.py                SQLite booking, tour and bus-ticket storage; CSV/backup
    ttf.py               TrueType parser + subsetter
    pdf.py               PDF writer with embedded subset fonts
    text.py              text shaping and measuring
    documents.py         branded receipt, ticket and monthly-report layouts
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

The headless tests use a small Tkinter stand-in and need no third-party package.
The optional render tests rasterize PDFs and verify glyph placement.

## 7. If something goes wrong

* *"Python was not found"* — reinstall Python and tick *Add Python to PATH*.
* The window does not open on Linux — `sudo apt install python3-tk`.
* Want a fresh start — close the program and delete
  `Documents\Rajshahi Tours & Travels\bookings.db` (or restore a backup first).

## 8. Notes

* Amounts are stored as numbers and printed with two decimals; receipts also
  spell the amount out in words (`Taka Twelve Thousand Five Hundred Only`).
* Printing a PDF and *sending* it use the same file — after saving, the program
  asks whether to open it, and you can attach it to WhatsApp or email.
* The desktop app never sends anything anywhere and does not sync with the
  website or another computer. All bookings and seat locks are local to this
  database. Back it up before moving the program or computer.
