## Rajshahi Tours & Travels — Desktop counter app 1.1.6

* **Group bus tickets:** choose a passenger count and assign exactly that many
  seats, with per-seat Male/Female selection colors. Fare is multiplied by the
  passenger count; group seat occupancy, genders, receipts and CSV exports stay
  within the separate bus-ticket workflow.
* **Larger app text:** increased general UI, input, table and seat-map fonts.
* **Database migration:** existing bus records gain a gender map without losing
  route, seat or payment history.

## Rajshahi Tours & Travels — Desktop counter app 1.1.5

Tours can now be identified by a unique short code, shown before the serial in
new tour-booking numbers. Tour setup and booking inputs are larger and easier to
read. Bus ticketing remains a separate workflow with its own numbering and seat
inventory.

### What changed

* **Tour codes:** add or edit a unique code in the tour catalogue. If left blank,
  the app suggests initials from the tour name and adds a suffix if needed. New
  tour booking numbers use the format `CODE-RTT-YYYY-NNNN`, for example
  `CBT-RTT-2026-0001`. The underlying serial sequence stays unique across tours;
  existing booking numbers are not changed.
* **Existing database migration:** previous tour catalogues receive generated
  codes automatically and keep all bookings and payments unchanged.
* **Larger input boxes:** increased input font size, padding and form width across
  tour bookings, bus ticketing and tour setup for easier reading and entry.
* **Tour booking form:** the departure date is directly after passenger name and
  phone; successful booking creates or edits clear the inputs and prepare a fresh
  unique number.
* **Desktop app logo:** the supplied company mark is used for the app window,
  task switcher and packaged Windows executable icon.
* **Separate bus tickets:** bus-ticket records and ticket numbers remain
  independent from tour bookings.

### Included features

* **Date-specific tour seat map:** standard 40-seat and extended 46-seat layouts;
  occupied seats are marked booked and locked for the selected tour/date.
* **Editable bookings and payments:** new bookings get a fresh unique serial;
  saved entries are edited only after selecting them. Due is recalculated from
  total minus advance.
* **Monthly travel report:** review trips, passengers, seats, availability and
  balances, then export a printable PDF or CSV spreadsheet.
* **Offline bus tickets:** issue a ticket for any route/date, choose from a
  40-seat map, prevent duplicate route/date/seat sales, reprint or cancel
  tickets, and export the register.
* **Tour data controls:** archive a tour to preserve its history, or permanently
  delete the tour and associated bookings after a clear warning and
  confirmation.
* **Professional receipts and branding:** supplied company artwork and exact
  brand colors appear across receipts and reports; receipt typography and app
  readability are improved.

### Which file should I download?

| File | Use it when |
| --- | --- |
| **`RajshahiTours-Windows-<version>.zip`** | Windows PC. Unzip it and double-click `RajshahiTours.exe` — Python is **not** needed. |
| **`RajshahiTours-Desktop-<version>.zip`** | You have **Python 3.10+** already, or you are on macOS / Linux. Unzip, then double-click `app.py`. |

### Getting started (Windows, no Python)

1. Download `RajshahiTours-Windows-<version>.zip`.
2. Right-click the file → **Extract All**.
3. Open the extracted folder and double-click **`RajshahiTours.exe`**.
4. Read `START-HERE.txt` inside the folder for day-to-day instructions.

If Windows shows a blue "Windows protected your PC" box, choose
**More info → Run anyway** — the program is unsigned, so Windows warns about
every new unsigned program. The source code it was built from is in this repository
under `desktop/`.

### Your data

Bookings, tours and tickets are stored together in `bookings.db` under
`Documents\Rajshahi Tours & Travels` (or beside the program in portable mode).
Use **File → Backup database** regularly. The desktop app does **not** sync with
the website, another computer, SMS services, or a payment gateway.
