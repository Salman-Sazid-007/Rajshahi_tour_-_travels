## Rajshahi Tours & Travels — Desktop counter app 1.1.0

A locally stored, offline counter workspace for tour bookings and manual bus
ticket sales. Tour catalogues, bookings, payment balances, bus tickets and seat
occupancy are stored in the local SQLite database.

### What is included

* **Tour catalogue:** add, edit, set seat capacity, remove, or safely archive a
tour. Tours with booking history stay available in reports.
* **Date-specific tour seat map:** assign open seats for the selected tour and
travel date. Occupied seats are locked; edits and cancellations keep availability
in sync. Standard 40-seat and extended 46-seat labels match the website layout.
* **Editable bookings and payments:** update passenger, seat, status, total or
advance; the outstanding due is recalculated automatically.
* **Monthly travel report:** review trips, passengers, seats, availability and
balances, then export a printable PDF or CSV spreadsheet.
* **Offline bus tickets:** issue a ticket for any route/date, choose from a
40-seat map, prevent duplicate route/date/seat sales, reprint or cancel tickets,
and export the register.
* **Branded receipts:** the agency's teal/orange vector logo mark, owner
**Safayet Hossain**, and phone **01782250709** appear in the upper-right / header
area of customer documents.
* **Overview dashboard:** quick view of tour departures, seats, due amounts and
bus-ticket activity.

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
