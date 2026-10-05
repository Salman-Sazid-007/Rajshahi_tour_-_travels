## Rajshahi Tours & Travels — Desktop counter app 1.1.4

This update makes consecutive tour bookings create separate records instead of
leaving the saved passenger loaded for editing. After a new booking saves, the
form clears, retains the current tour and departure date, and displays the next
unique booking number. Bus ticketing remains a separate workflow with its own
serial numbers and seat inventory.

### What changed

* **New entry after each save:** a successfully added tour booking clears the
  form and assigns the next booking serial automatically. A new save inserts a
  new record; an existing booking is changed only after the operator selects it.
* **Booked tour seats stay locked:** the seat map marks seats booked for the same
  tour/date as unavailable. Form validation and the database also reject a
  duplicate reservation. Cancelled bookings release their seats, and the same
  seat can be reused for another departure date.
* **Independent bus tickets:** bus-ticket records, numbering and route/date seat
  availability are kept separate from tour bookings.

### Included features

* **Date-specific tour seat map:** standard 40-seat and extended 46-seat layouts;
  occupied seats are locked for the selected tour/date.
* **Editable bookings and payments:** update passenger, seat, status, total or
  advance after selecting a saved entry; the outstanding due is recalculated.
* **Monthly travel report:** review trips, passengers, seats, availability and
  balances, then export a printable PDF or CSV spreadsheet.
* **Offline bus tickets:** issue a ticket for any route/date, choose from a
  40-seat map, prevent duplicate route/date/seat sales, reprint or cancel
  tickets, and export the register.
* **Tour data controls:** archive a tour to preserve its history, or permanently
  delete the tour and associated bookings after a clear warning and
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
