# Rajshahi Tours & Travels

Two editions, one shared tour and transport model:

- **Classic** keeps the original main-site layout. Its publishing output is `docs/`.
- **International Pro** adds an editorial, responsive experience at `/pro/` with destination search, journey filters, shortlists, package planning and accessible inquiry dialogs.
- Both editions have a persistent **বাংলা / EN** switch, teal/sky-blue/orange branding, and local Bangla/English fonts.
- Public hotline, WhatsApp and manual bKash contact: **01782250709**; WhatsApp link uses **8801782250709**.

## Desktop counter app (bookings and PDF receipts)

`desktop/` holds a separate Tkinter program for the office counter: it collects
Name, Phone Number, Seat, Total Amount, Advance, Due, Booking Date, Tour Date and
Tour Name, stores them in a local SQLite file, and prints a PDF receipt for the
customer plus a booking-list report. It needs nothing but Python and builds into
a double-clickable `RajshahiTours.exe` with PyInstaller.

```bash
cd desktop
python app.py            # run from source
build_windows.bat        # or build dist\RajshahiTours\RajshahiTours.exe
python tests/test_app.py # headless checks
```

Full instructions are in [`desktop/README.md`](desktop/README.md); sample output
is in `desktop/samples/`.

## Publishing paths

| Location | Purpose |
| --- | --- |
| `frontend/src/` | Classic and staff-dashboard source |
| `frontend/src/pro/` + `frontend/pro/index.html` | Pro source |
| `docs/index.html` | Classic on the repository's existing `main:/docs` Pages configuration |
| `docs/pro/index.html` | Pro at the public project URL's `/pro/` path |
| `pro/index.html` | Standalone repository Pro build; its Classic link targets `../docs/` |

The public project URLs, **after these changes are merged to the Pages publishing branch**, are:

- Classic: `https://salman-sazid-007.github.io/Rajshahi_tour_-_travels/`
- Pro: `https://salman-sazid-007.github.io/Rajshahi_tour_-_travels/pro/`

A push to a working branch alone does **not** update legacy Pages hosted from `main:/docs`. Generated `docs/pro/` is included so both editions work with that existing setup. The updated Pages workflow also builds a combined artifact when `main` is updated. If switching to workflow-based deployment, choose **GitHub Actions** under repository Settings → Pages.

## Install, build and preview

Use Node.js 22 and npm.

```bash
npm ci --prefix backend
npm ci --prefix frontend
npm run build:pages
npm run preview
```

The static preview binds `0.0.0.0:4173`. Its default page opens Pro at `/Rajshahi_tour_-_travels/pro/`; Classic is at `/Rajshahi_tour_-_travels/`. `/pro/` and `/docs/` also exercise the standalone copy.

To use the shared API and built editions instead of browser-only demo storage:

```bash
npm run build
npm start
```

The Express server binds `0.0.0.0:3000` and serves Classic plus `/pro/`. For source development, start the backend and run `npm --prefix frontend run dev` for Classic, or `cd frontend && npx vite --config vite.pro.config.js` for Pro. Development API calls use relative URLs through Vite's proxy; browser code never targets a sandbox localhost address.

## Fleet and regular bus services

Staff dashboard → **Bus profiles & tickets**:

1. Choose the seeded Rajshahi Express profile or add another bus profile.
2. The default coach uses the standard **40-seat 2+2 layout**; add another profile only when its real seat plan is different.
3. Configure each direction's departure time (Bangladesh time), fare, boarding point and operating days.
4. Enable ticket sales only after entering the correct operational details. No active schedule or fare is invented in the seed.
5. Set an indefinite repair status or an inclusive repair-date period when needed.
6. Use a date/service-specific override to force regular service on during a tour day, or close a departure. **Repair and inactive status still block sales.** An override must only be used when operations can actually provide that service.

Assigned bus tours automatically pause regular Rajshahi → Dhaka and Dhaka → Rajshahi departures from the tour's start date through its return date, inclusive. Overlapping tour assignments and new tours that conflict with active regular tickets are rejected.

In **Tours & budget planner**, enter Bangla and English titles, select the bus profile, and preview its layout. The default Rajshahi Express uses a standard **40-seat 2+2 map**: rows A–J with four seats per row and a center aisle. The optional legacy 46-seat layout remains available for a different real vehicle. Admins can also save Bangla and English public descriptions; the matching description appears in the tour details dialog. Tour bookings and regular tickets use the same seat rules:
- New reservations require male/female per passenger. Public maps show M/F and status, never passenger names or phone numbers.
- Legacy seats keep an explicit unspecified marker rather than guessing gender.
- Duplicate, invalid and over-capacity seat selections are rejected by the shared engine and API.
- **1–10 remaining seats** show a red low-seat alert; sold out is separate.
- Pending requests hold seats for **30 minutes**, then release them unless approved. Re-checking availability happens periodically and again during submission/approval.

The owner can configure buses and overrides. Owner/accountant can approve or cancel reservations; a guide cannot change fleet settings or approve payments. Tour-seat approval transfers the same seats into a booking with **zero presumed advance payment**. Record actual collections separately.

## Important: demo versus real sales

**GitHub Pages is static.** It has no shared database or staff notification service. Its bookings, seat maps, fleet configuration and approvals use explicitly labelled browser-local demo storage. Another customer's browser will not see them. WhatsApp opens a prepared message; the customer must send it themselves. Static requests are not real tickets.

A running API supplies shared availability and stores operator-visible requests. Prices are calculated from stored fares/packages, not client-supplied totals. All bKash payment handling is **manual**: entering a transaction reference does not charge money, verify payment, or confirm a reservation. Cancellation releases seats but does not automatically refund money. No bKash gateway has been integrated.

Pro's optional USD display is indicative at a fixed demo conversion, not a live exchange-rate feed. Final prices remain BDT. Seeded tours, statistics, traveler stories and staff data are demonstration content; update them before publishing operational promises. Fictional seed phone numbers start with `000` and are labelled as demo contacts.

## Before operating a real backend

Do not use prototype role shortcuts as real authentication. In `NODE_ENV=production`, this build rejects default/missing JWT secrets, hides demo-account listings, refuses seed/demo account logins and requires actual hashed passwords. Store real data in an **untracked** file (`RTT_DATA_FILE`), not `backend/data/store.json`.

One-time provisioning uses environment variables, never credentials entered into source or chat:

- `RTT_DATA_FILE`: absolute production data-file path.
- `JWT_SECRET`: unique secret, at least 32 characters, provisioned through your deployment secret manager.
- `RTT_OWNER_NAME`, `RTT_OWNER_PHONE`, `RTT_OWNER_EMAIL`.
- `RTT_OWNER_PASSWORD`: strong password, at least 12 characters.

Run `npm --prefix backend run setup:owner` in that environment. It stores only a bcrypt hash and disables the seeded demo accounts. Remove the provisioning password variable after setup. Then run the API in production behind HTTPS on the same origin as the site. Configure and verify real schedules/fares before enabling departures.

The store uses temporary-file + rename writes and in-process conflict checking. It supports **one Node process**, not a distributed/multi-worker seat-inventory database. Production needs backups, monitoring, request/abuse controls, deployment access restrictions and a transactional database before scaling. Optional Mongo connection code does not change the JSON transport store into Mongo persistence. SMS delivery also requires a separately configured gateway; demo delivery is not real SMS.

## Logo status and fonts

The exact attached logo file was not mounted in the workspace. `AgencyLogo.jsx` therefore uses a clearly documented **reference-inspired vector mark**, not the original uploaded artwork. Teal, sky-blue and orange match the supplied reference palette. Replace the import with the original asset when it is reattached; the component is shared by both headers, footers and the staff dashboard.

Self-hosted DM Sans, Inter, Cormorant Garamond and Hind Siliguri are redistributed under their OFL licenses. Source licenses are in `frontend/font-licenses/` and included in the publishing output. Existing destination photos are reused from `backend/public/media/`.

## Verification

```bash
npm test                         # shared seat/availability rules, HTTP APIs and production-auth safeguards
npm run build:pages              # builds both editions and regenerates publishing copies
cd frontend && npx playwright install --with-deps chromium
cd .. && npm run test:e2e -- --workers=1
```

Browser tests cover language preference sharing, real search/filter/sort behavior, shortlist persistence, indicative USD, tour and regular-bus seat/gender selection, browser-demo disclosures, unavailable/repair states, 10-seat red alerts, the bilingual fleet settings panel, standalone links and 360/390/768/1440px layouts. Tests use isolated data and never modify the tracked backend store or send payments/SMS.

Core transport rules are in `shared/transport.cjs`, imported by both the browser-demo adapter and the Express API. New display copy belongs in the explicit language dictionaries; IDs, prices, URLs, dates, form values and submitted passenger information are not translated in storage.
