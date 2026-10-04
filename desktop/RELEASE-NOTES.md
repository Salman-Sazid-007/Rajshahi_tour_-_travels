## Rajshahi Tours & Travels — Desktop counter app

The office-counter program: nine booking fields, a local database, and a PDF
receipt plus booking-list report for the customer. Everything runs on the shop
computer — it never connects to the internet.

### Which file should I download?

| File | Use it when |
| --- | --- |
| **`RajshahiTours-Windows-<version>.zip`** | Windows PC. Unzip it and double-click `RajshahiTours.exe` — Python is **not** needed. |
| **`RajshahiTours-Desktop-<version>.zip`** | You have **Python 3.10+** already, or you are on macOS / Linux. Unzip, then double-click `app.py`. |

### Getting started (Windows, no Python)

1. Download `RajshahiTours-Windows-<version>.zip`.
2. Right-click the file → **Extract All**.
3. Open the extracted folder and double-click **`RajshahiTours.exe`**.
4. Read `START-HERE.txt` inside the folder for the day-to-day instructions.

If Windows shows a blue "Windows protected your PC" box, choose
**More info → Run anyway** — the program is unsigned, so Windows warns about
every new unsigned program. It is safe: the source code it was built from is in
this repository under `desktop/`.

### Getting started (source zip)

1. Install Python 3.10 or newer from <https://www.python.org/downloads/> and
   tick **Add Python to PATH** during setup.
2. Unzip the download and double-click `app.py` (or run `python app.py`).
3. To make your own double-clickable program later, run `build_windows.bat`
   (Windows) or `./build_linux_mac.sh` (macOS / Linux).

### Your data

| Item | Location |
| --- | --- |
| Database | `Documents\Rajshahi Tours & Travels\bookings.db` |
| Settings | `Documents\Rajshahi Tours & Travels\settings.json` |
| Backups | `Documents\Rajshahi Tours & Travels\Backups\` |
| Exported receipts and reports | wherever you choose (defaults to `...\Exports\`) |

Keep `bookings.db` safe and use **File → Backup database** regularly — that one
file holds every booking.

### What is inside

* **Receipt PDF** — one booking on an A4 page: letterhead, passenger and tour
  details, amounts with the due highlighted in red, amount in words, terms and
  two signature lines.
* **List PDF / Due list PDF** — landscape report of the bookings on screen,
  with summary cards and a totals row, paginated automatically.
* Search and filters (name, phone, seat, tour, booking number, only-with-due).
* CSV export, database backup, and editable company details, receipt prefix,
  currency symbol and printed terms under **Tools → Settings**.
* Bangla and English names both print correctly — the PDF engine and the
  Hind Siliguri fonts are bundled.

### Not included

* The desktop program does **not** sync with the online website editions and has
  no SMS or payment-gateway integration. It is a standalone counter tool.
* The `.exe` is unsigned, so Windows SmartScreen warns on first run.
