## Rajshahi Tours & Travels — Desktop counter app 1.1.2

This release improves receipt readability and alignment, increases desktop UI
font sizes, and makes tour deletion an explicit permanent action while keeping
history-preserving archive as a separate choice. The app remains a local,
offline workspace for bookings, payments, bus tickets and reports.

### What changed

* **Professional receipts:** reduced the company-logo footprint, aligned the
  receipt sections and payment cards, and increased small type on receipts,
  bus tickets and PDF reports. Corrected PDF rectangle placement so filled and
  stroked boxes render at their intended positions.
* **Larger desktop text:** raised the default app font and improved legibility
  across forms, tour and booking tables, buttons, the dashboard and seat maps.
* **Tour data controls:** archive a tour to remove it from new-booking choices
  while retaining its booking/payment history. The separate **Delete tour +
  bookings** action permanently removes the tour and all associated booking
  records from the local database after a clear confirmation warning.
* **Tour creation:** create tours with a configurable seat capacity, edit their
  names and capacity, and reactivate archived tours by adding the same name.

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
* **Official brand image:** the supplied full company logo appears in the
  desktop sidebar and PDF headers. Accent colors use the supplied teal
  (`#22B4B3`), orange (`#F97000` / `#EE8625`) and black (`#000000`). PDF headers
  show owner **Safayet Hossain** and phone **01782250709** at the upper right.
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
