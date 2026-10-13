## Rajshahi Tours & Travels — Desktop counter app 1.2.3

* **Seventh memo term.** The tour memo's terms & conditions now end with:
  "ট্যুরে থাকা অবস্থায় কোনো ব্যাক্তির অনাকাঙ্ক্ষিত দূর্ঘটনার শিকার হলে এবং আইন
  বহিরাগত কর্মকান্ডে জরালে রাজশাহী ট্যুরস এন্ড ট্রাভেলস দায়ী থাকবে না।"
  Installs that still use the standard six terms receive it automatically; a
  customised terms list is left exactly as the office wrote it.
* **Owner name corrected** to **Md Safayat Hossain** in the memo's owner panel
  and the app sidebar (an untouched old spelling upgrades automatically).
* **Second office number.** **01744262302** is printed next to 01782250709 in
  the memo letterhead and footer (and on bus tickets and reports). It is a
  new *Second phone* field under Tools → Settings. The WhatsApp value is only
  listed when it is a different line from the phones, so the old +88 duplicate
  no longer appears.

## Rajshahi Tours & Travels — Desktop counter app 1.2.2

* **Male / Female seats for tour bookings** — the same feature the bus-ticket
  desk already had. In the tour seat map choose **Male** or **Female**, then
  click each passenger's seat; selected seats turn blue or pink and seats sold
  earlier show the gender of the passenger sitting there. Unlike bus tickets
  there is no fixed passenger count: pick as many seats as the group needs.
  Every seat must have a gender before the booking saves (bookings made before
  this version can still be edited unchanged until their seats change).
* The booking table shows the markers (`A-1 M, A-2 F`), the seat summary counts
  them (`3 selected (1 M / 2 F)`) and the CSV export gains a **Seat genders**
  column. Genders are stored per seat with the booking and follow seat edits.
* **Logo watermark on the memo.** A large, faint copy of the company logo now
  sits in the middle of the booking memo, spanning most of the page width,
  behind all text and boxes — on every page of the memo, on screen and in
  print.

## Rajshahi Tours & Travels — Desktop counter app 1.2.1

* **41- and 45-seat coaches for daily bus tickets too.** The *Bus tickets* form
  gains a **Bus & coach type** row. Every route/date runs one 41-seat bus until
  the office changes it; pick **45 seats** there and that day's bus (only that
  day) becomes a 45-seat coach with the K-1 … K-5 back row.
* **Choose which bus runs on which date.** Press **＋ Bus** to run a second (or
  third …) coach on a busy day — each bus has its own number and its own 41/45
  type — and **✕** to take an empty bus off the trip again. The drop-down lists
  the day's buses (`Bus 1 · 41 seats`, `Bus 2 · 45 seats`); the seat map,
  passenger-count limit and "filled / open" summary are per bus, with an
  all-buses total when more than one coach runs.
* **Tickets know their bus.** Seats are checked against the chosen bus (so A-1
  can be sold on bus 1 and again on bus 2, and K-5 is refused on a 41-seater).
  The bus number appears in the ticket table, CSV export and the printed ticket
  (which now shows "Bus 2" and "Coach type 45 seats").
* **Safe changes.** A bus cannot be switched to a coach type that lacks one of
  its sold seats, cannot be removed while it still has tickets, and a trip
  always keeps at least one bus.
* **Automatic upgrade.** Existing bus tickets are assigned to bus 1 of their
  route/date, which keeps the classic plan's seat labels (now with J-5 added).

## Rajshahi Tours & Travels — Desktop counter app 1.2.0

* **Two coach types — 41 and 45 seats.** Every bus is now either a 41-seat
  coach (rows A–I with 2 + 2 seats, back row J-1 … J-5) or a 45-seat coach
  (rows A–J, back row K-1 … K-5). The fifth seat sits in the middle of the back
  row, so the whole coach is filled. The seat map draws the five-across back
  row exactly like the real bus.
* **Multiple buses per tour.** In *Tours & monthly reports* a tour has a bus
  list instead of a single capacity: give each bus a bus number (1, 2, … or any
  short label) and choose 41 or 45 seats for it independently, using
  **+ Add bus** / **Remove**. The catalogue shows the buses (for example
  `1:41 + 2:45`) and the summed capacity.
* **Bookings know their bus.** The booking form has a **Bus** drop-down next to
  the tour (pre-selected when the tour has one bus). Seats, the seat map, the
  "booked / open" summary and double-booking checks are all per bus, so seat
  A-1 can be sold once on bus 1 and once on bus 2. A booking saved against
  seats that do not exist on the chosen bus type is refused with a clear
  message. The booking table, booking-list PDF and CSV export gained a **Bus**
  column; the customer memo prints the bus number after the seats
  (`K-1, K-2  (বাস ২)`).
* **Safe edits.** A bus with active bookings cannot be removed, and cannot be
  switched to a type that lacks one of its booked seats; renumbering a bus
  carries its bookings along.
* **Upgrade from earlier versions is automatic.** Existing tours with the
  classic 40-seat plan become one 41-seat bus "1" (all old seat labels stay
  valid; J-5 is simply added). Tours with any other old capacity keep their
  previous seat plan as a "classic" bus until you change the bus type. All
  existing bookings are assigned to bus 1.
* Demo data and the built-in default tours now use 41-seat buses.

## Rajshahi Tours & Travels — Desktop counter app 1.1.9

* **Office e-mail:** `rajshahitoursandtravels@gmail.com` is now the default
  e-mail printed in the memo header and footer (and shown under Tools →
  Settings). Existing installs that still had the old placeholder address are
  upgraded automatically; a customised e-mail is left alone.
* **Bangla office address:** the memo address now reads "ভদ্রা মোড়, রাজশাহী".
  Installs that still had "Vodra Mor, Rajshahi" migrate automatically.
* **Memo bottom section no longer overlaps:** the booking status and the print
  date sit on their own row, separated from the terms by a rule, with the
  signature lines below them. The terms are fitted into the space above that
  block (shrinking slightly if needed) and, only if they still cannot fit,
  continue on a second page — nothing is drawn on top of other text any more.
* **"%" prints correctly** in the terms (previously shown as the word
  "percent").
* **Bigger text inside the input boxes — really fixed this time:** the earlier
  versions set the font on the ttk *style*, which Tk ignores for entry boxes
  and drop-downs. The font is now set on the widgets themselves, so booking,
  bus-ticket, tour-setup, filter and settings inputs show large 20 pt / 17 pt
  text, including the drop-down lists.
* **Mouse wheel scrolling fixed:** the booking, bus-ticket and settings forms
  scroll with the wheel wherever the pointer is over the form (previously only
  in the empty margin). Works on Windows, macOS and Linux.

## Rajshahi Tours & Travels — Desktop counter app 1.1.8

* **Correct Bangla memo shaping:** use the repository's Li Abu J M Akkas Unicode
  font with HarfBuzz so conjuncts and vowel marks print in the right positions.
* **Bundled shaping support:** the source instructions and Windows build now
  install/include HarfBuzz; Bangla PDFs fail with a clear hint if it is missing
  instead of silently producing broken glyphs.

## Rajshahi Tours & Travels — Desktop counter app 1.1.7

* **বাংলা ট্যুর বুকিং মেমো:** receipt headings, dates, amount labels, status,
  signatures, footer and the six requested booking terms are printed in Bangla.
* **Office address:** the memo address is now Vodra Mor, Rajshahi. Existing
  default settings migrate automatically; owner-customized settings are retained.
* **Larger input text:** tour, bus and tour-setup entry fields use larger fonts,
  with readable base styles for the remaining inputs and notes.

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
