## Rajshahi Tours & Travels — Desktop counter app 1.1.3

This patch fixes duplicate-seat selection and booking for tour departures. Starting
another booking retains the active tour and travel date, and validation clearly
rejects seats already reserved for that same tour/date before anything is saved.
Seats remain available for reuse on a different travel date; cancelled bookings
release their seats.

### What changed

* **Reliable trip context:** creating the next booking keeps the current tour and
  departure date instead of silently switching the trip date to today.
* **Clear duplicate-seat validation:** the booking form checks all selected seats
  against active bookings for the same tour and date, including manually entered
  or edited seat labels, and tells the operator which seats are already taken.
* **Date-specific availability is preserved:** seats can be reused on another
  departure date, and cancelled bookings do not block a seat.

### Included features

* **Date-specific tour seat map:** assign open seats for a selected tour and
  travel date. Occupied seats are locked; edits and cancellations keep
  availability in sync. Standard 40-seat and extended 46-seat labels match the
  website layout.
* **Editable bookings and payments:** update passenger, seat, status, total or
  advance; the outstanding due is recalculated automatically.
* **Monthly travel report:** review trips, passengers, seats, availability and
  balances, then export a printable PDF or CSV spreadsheet.
* **Offline bus tickets:** issue a ticket for any route/date, choose from a
  40-seat map, prevent duplicate route/date/seat sales, reprint or cancel
  tickets, and export the register.
* **Tour data controls:** archive a tour to preserve its history, or permanently
  delete the tour and its associated bookings after a clear warning and
  confirmation.
* **Professional receipts and larger UI text:** supplied company artwork and
  brand colors appear across receipts and reports; receipt typography, spacing
  and app font sizes are improved.

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
