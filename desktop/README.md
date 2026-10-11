# Rajshahi Tours & Travels — Offline Tour & Bus Manager (Desktop)

## Download

These are the **latest published** downloads: desktop version 1.2.1.

| Download | For |
| --- | --- |
| [**RajshahiTours-Windows-1.2.1.zip**](https://github.com/Salman-Sazid-007/Rajshahi_tour_-_travels/releases/download/desktop-v1.2.1/RajshahiTours-Windows-1.2.1.zip) | Windows: unzip, then double-click `RajshahiTours.exe`. Python is **not** required. |
| [**RajshahiTours-Desktop-1.2.1.zip**](https://github.com/Salman-Sazid-007/Rajshahi_tour_-_travels/releases/download/desktop-v1.2.1/RajshahiTours-Desktop-1.2.1.zip) | Python 3.10+ (any OS). Unzip, install `requirements.txt`, then run `python app.py`. |

All published versions: <https://github.com/Salman-Sazid-007/Rajshahi_tour_-_travels/releases?q=desktop> ·
Open `START-HERE.txt` inside a release zip first if you just want to start using it.

To run the current source, follow [Run it with Python](#1-run-it-with-python-no-build-needed) below. The app shows version 1.2.1 in **Help → About**.

---

The desktop app is a local, offline counter workspace. It stores tour bookings,
tour details, bus tickets, seat occupancy and payment balances in SQLite on this
computer. Bangla memos use the supplied Li Abu J M Akkas Unicode font with
HarfBuzz shaping so conjuncts and vowel marks are positioned correctly. The
interface is organized into **Overview**, **Tour bookings**, **Bus tickets**,
and **Tours & monthly reports**.

## What it does

* **Manage tours:** create tours with a unique short tour code and one or more
  buses — each bus has a bus number and is either a **41-seat** or a **45-seat**
  coach (the extra seat sits in the middle of the back row). A tour can run
  several buses, each with its own type and its own seat map; bookings record
  the bus number as well as the seats. Leave the code blank to generate initials from the tour name, or enter your
  own. The code appears at the front of new booking numbers (for example,
  `CBT-RTT-2026-0001`). Existing booking numbers are kept unchanged. Archive a
  tour to keep its history, or permanently delete it and its associated bookings
  after a clear warning and confirmation.
* **Book a tour:** choose a tour and travel date, open the seat map, select free
  seats, and save the customer and payment. Occupied seats are marked booked and
  locked for that same tour/date; form validation also blocks duplicate seats.
  After any successful booking save, the passenger and trip inputs reset and a
  fresh unique serial is shown. Select the tour and departure date for the next
  booking. Seats can be reused on another departure date; saved rows can still
  be selected for intentional edits.
* **Issue offline bus tickets:** a separate workflow with its own ticket numbers,
route/date and seat inventory; it is not linked to tour bookings. Each
route/date runs one 41-seat bus by default; the office can switch that day's
bus to a 45-seat coach or add more buses for the day (bus 1, 2, … each 41 or
45 seats). Pick the bus, then select a passenger count, then assign exactly that many seats and a Male/Female marker to
each seat (blue for Male, pink for Female). Fare is per passenger; the ticket
stores a single group/contact record and the total fare. The same route/date/seat
cannot be sold twice. Cancelled group tickets release every seat.
* **Track trips:** see booked/open seats, trip totals and outstanding amounts on
the Overview and in the monthly travel report.
* **Export a monthly sheet:** filter by travel month, review each departure,
bookings, seats, availability and due, then export a printable PDF or spreadsheet-friendly CSV.
* **Larger entry forms:** taller input boxes and larger text improve readability
in tour booking, bus ticketing, and tour setup.
* **Bangla tour booking memo:** the printed booking receipt uses Bengali labels,
  dates, amounts, status and signatures; it includes the six booking and safety
  terms and shows the office address as **Vodra Mor, Rajshahi**. Existing default
  receipt settings update automatically; custom office settings are preserved.
* **Keep a local record:** search and filter bookings/tickets, reprint a receipt
or ticket, and back up the SQLite database. No internet connection is used.

### Tour seat layouts

Every bus on a tour is one of two coach types:

* **41 seats** — rows `A`–`I` with four seats each (2 + 2 around the aisle) and
  a back row `J-1` … `J-5` with five seats across (the fifth seat fills the
  aisle gap).
* **45 seats** — rows `A`–`J` with four seats each and a back row `K-1` … `K-5`.

A tour may have several buses (bus numbers `1`, `2`, … or any short label), and
each bus can be 41 or 45 seats independently. Seat labels repeat on every bus,
so a booking always stores the bus number together with its seats; the seat map
in the booking form shows the selected bus only. Labels such as `A1` are
normalized to `A-1`. Tours created before 1.2.1 with the classic 40-seat map
become a single 41-seat bus (the old seats keep their labels; `J-5` is added);
other old capacities are kept as a "classic" layout until you change them.

### Receipts and reports

The desktop sidebar, tour receipts, bus tickets, and reports use the supplied
full company logo. The original JPG is bundled at `assets/agency-logo.jpg`; a
trimmed, print-resolution copy is embedded in PDFs and a compact PNG is used by
the Tkinter sidebar, so no image package is required at runtime. Brand accents
match the supplied palette: teal `#22B4B3`, orange `#F97000` / `#EE8625`, and
black `#000000`. The owner **Safayet Hossain** and phone **01782250709** appear
in the upper-right PDF header; booking details and payment balances follow
below in an aligned layout with a compact logo and larger, more legible type.
The desktop uses a matching company icon in the window/task switcher and the
Windows executable (`assets/agency-app-icon.png` and `assets/agency-app.ico`).
The UI and tables also use larger fonts. Company and owner details can be edited
in **Tools → Settings**.

* **Receipt PDF / Print** — a branded A4 receipt for one tour booking.
* **Monthly PDF / CSV** — tour bookings for the selected travel month, with
passenger, seat and payment data.
* **List PDF / Due list PDF** — a landscape report of the filtered tour-booking
view.
* **Bus ticket PDF / Print** — a branded group ticket listing passenger count, seats and gender assignments.
* **Export bus list** — CSV for the currently filtered offline ticket register.

---

## 1. Run it with Python (no build needed)

1. Install **Python 3.10 or newer** from <https://www.python.org/downloads/>
   (tick *Add Python to PATH* during setup).
2. Download or clone this repository.
3. From a terminal in the `desktop` folder, install the PDF shaping dependency and start the app:

```bash
python -m pip install -r requirements.txt
python app.py
```

The bundled Unicode Bangla font is shaped with HarfBuzz so conjuncts and vowel
marks do not break. The Windows executable includes this dependency; the source
version needs it installed once before creating Bangla memos.

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
* **Tours & monthly reports** — add a tour with its buses (use **+ Add bus**
and pick 41 or 45 seats per bus), or select a tour to edit it. A bus cannot be
removed or shrunk while active bookings still use its seats. **Archive (keep history)** removes it from new-booking choices
while retaining its bookings and reports. **Delete tour + bookings** permanently
removes that tour and its associated booking/payment records after confirmation.
Choose a travel month (`YYYY-MM`) and use **Monthly PDF** or **Export CSV**.
* **Bus tickets** — enter a route and date, then use the **Bus & coach type**
row: the drop-down lists the buses running that day (one 41-seat bus until you
change it), the second box sets that bus to **41 seats** or **45 seats** for
this date only, **＋ Bus** adds another coach and **✕** removes an empty one.
Choose the number of passengers, then click **Map** (the seat map is per bus). Choose Male or Female before selecting each open seat; Male
seats are blue and Female seats are pink. Enter fare per passenger and the paid
amount; the due amount is calculated for the whole group. Save, edit, cancel or
delete a group ticket, then print a receipt showing its seats and genders. Seat
occupancy is scoped to route + travel date + bus. Group bus tickets remain
completely separate from tour bookings and their numbering.
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
  requirements.txt       HarfBuzz dependency for correct Bangla shaping
  assets/fonts/          Li Abu J M Akkas Unicode (Bangla) + Hind Siliguri (Latin)
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
python -m pip install -r requirements.txt
python tests/test_app.py          # database, formatting, UI logic
python -m pip install PyMuPDF Pillow fonttools
python tests/test_pdf_render.py   # rasterized glyph-position checks
```

The headless tests use a small Tkinter stand-in; they need the required
`uharfbuzz` dependency listed above. The optional render tests also install
PyMuPDF, Pillow and fontTools to rasterize PDFs and verify glyph placement.

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
