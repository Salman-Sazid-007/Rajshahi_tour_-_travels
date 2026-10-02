# Backend Architecture Analysis & Synthesis for Rajshahi Tours & Travels

This document analyzes the three reference backend codebases in the repository (`backend_1.zip`, `backend_2.zip`, and `backend_3.zip`) and explains how their architecture, domain patterns, and infrastructure modules have been synthesized to build the **Rajshahi Tours & Travels (রাজশাহী ট্যুরস এন্ড ট্রাভেলস)** full-stack platform demonstrated in the prototype video (`https://youtu.be/8obSiSpm0t0`).

---

## 1. Deep-Dive Analysis of the Three Reference Backends

### 1.1 `backend_1.zip` — `hisaab-backend-main` (Multi-Tenant SaaS POS, Inventory, Storefront & Accounting)
- **Runtime & Stack:** Node.js (CommonJS), Express 4.18, Mongoose 8, Redis + BullMQ, Joi validation, Winston logger, Cloudflare R2 (`@aws-sdk/client-s3`) + Sharp image optimization.
- **Key Architectural Strengths:**
  - **Multi-Gateway SMS Engine (`src/services/sms/`):**
    - Implements an adapter/dispatcher architecture (`dispatcher.js`, `routing.js`, `registry.js`) supporting **Automas (`https://api.automas.com.bd/smsapiv3`)** as primary and **MimSMS** as failover.
    - Handles MimSMS's endpoint-specific `TransactionType` matrix (`/SMS` -> `T|P|D`, `/OneToMany` -> `T`, `/DSMS` -> `D`) and parses HTTP 200 payload refusals accurately.
    - Batches bulk SMS campaigns (`BATCH_SIZE: 100`, `SYNC_LIMIT: 100`) and calculates GSM-7 vs Unicode (Bengali 70-char/segment) billing segments (`smsCounter.util.js`).
  - **Storefront & Landing CMS (`publicStorefront.controller.js`, `shopLanding.controller.js`, `PageContent.model.js`):**
    - Separates public-facing storefront/landing queries from authenticated merchant/owner management routes.
    - Supports media library folders (`ShopMedia`, `MediaFolder`) so admins can either pick from previously uploaded images or upload new ones from their device.
  - **Customer & Due Management (`Customer.model.js`, `CustomerBalance.model.js`, `dueSettlement.service.js`):**
    - Auto-suggests returning customers by phone prefix (`017...`), tracks cumulative purchases and remaining dues, and sends automated Bengali receipt/due SMS notifications.
  - **Bangladesh Geography Dataset (`src/data/bdGeo.json`, `bdCityAreas.json`):**
    - Includes all 8 divisions, 64 districts, upazilas, and city corporation wards (including Rajshahi's Boalia, Rajpara, Motihar, Shah Makhdum, Sopura, etc.).

---

### 1.2 `backend_2.zip` — `clinic-hisaab-backend-main` (`NurseBill` — Billing, Seat Allocation, Expenses & Financial Dashboard)
- **Runtime & Stack:** Node.js (CommonJS), Express 4.21, Mongoose 8.8, JWT + `bcryptjs`, Joi validation, `helmet`, `express-rate-limit`.
- **Key Architectural Strengths:**
  - **Clean Service-Controller-Route Layering (`src/controllers/`, `src/services/`, `src/routes/`):**
    - Standardized API envelope via `sendResponse(res, statusCode, message, data)` and centralized error handling via `AppError` + `errorHandler.js`.
  - **Role-Based Access Control (`src/middlewares/authenticate.js`, `authorize.js`):**
    - Clean JWT extraction (Bearer header / cookie) and declarative role guards (`authorize('owner', 'accountant', 'guide')`) plus fine-grained permission checks.
  - **Seat & Booking Allocation (`Seat.js`, `Invoice.js`, `Patient.js`):**
    - Tracks capacity/seats, line-item packages, extra charges/add-ons, discounts with discount reasons, advance payments (Cash/bKash/Nagad/Bank), and automatic due calculation (`totalAmount - discount - advancePaid = dueAmount`).
  - **Monthly Financial P&L Aggregation (`dashboardService.js`, `Expense.js`):**
    - Computes monthly revenue vs itemized operational expenses and fixed overheads (Office Rent, WiFi, Salaries) to report both **Gross Profit** and **Net Profit**, with month-over-month navigation.
  - **Direct MimSMS Service (`src/services/smsService.js`, `SmsLog.js`):**
    - Normalizes Bangladeshi 11-digit numbers (`017XXXXXXXX` -> `88017XXXXXXXX`), supports single (`sendSingleSms`), bulk (`sendBulkSms`), and dynamic personalized (`sendDynamicSms`) dispatches, and logs every dispatch in `SmsLog` even when `SMS_ENABLED=false` (simulation mode).

---

### 1.3 `backend_3.zip` — `chapaimangobd-reseller-main` (Full-Stack Order, Costing, Outbox SMS & Landing Platform)
- **Runtime & Stack:**
  - **Backend:** Node.js >= 20, Express 4.21, Mongoose 8.9, Zod validation, Pino structured logging, Cookie + Bearer JWT sessions, Automas SMS channel (`src/channels/sms.js`), Telegram bot notifications, R2 + ImgBB media storage.
  - **Frontend:** Next.js / React 19, Tailwind CSS, Lucide Icons, `Hind Siliguri` + `Inter` typography, bilingual Bengali-first UX, print-ready A4 financial reports (`@media print` rules in `globals.css`).
- **Key Architectural Strengths:**
  - **Transport-Separated SMS Channel (`backend/src/channels/sms.js` & `services/sms.js`):**
    - Strictly separates transport (`channels/sms.js`) from business logging (`services/sms.js`) and GSM-7 / Unicode segment measurement (`utils/gsm7.js`), ensuring every SMS attempt writes an immutable `SmsLog` entry with segment count, encoding (`unicode` vs `gsm`), and gateway status.
  - **Per-Event / Per-Day Costing & Payees (`services/costing.js`, `expenseService.js`, `Payee.js`):**
    - Tracks direct event/order costs separately from general business/office overhead expenses.
  - **Live Landing Page Editor (`modules/owner/landing.controller.js`, `LandingContent.js`):**
    - Allows the owner to edit hero headlines, background images, customer reviews (visibility toggles, manual additions), and gallery items with instant live preview on the public website.

---

## 2. How These Backends Power Rajshahi Tours & Travels

Combining the best patterns from all three backends and matching every workflow shown in the **Rajshahi Tours and Travels Prototype** video (`https://youtu.be/8obSiSpm0t0`), our platform implements:

| Module | Video Requirement | Synthesized Backend Implementation |
| :--- | :--- | :--- |
| **1. Public Website & Landing CMS** | Branded landing page ("রাজশাহী থেকে সারা বাংলাদেশ"), Highlighted Next Tour, Auto-filtered Upcoming Tours (past dates automatically move out), Previous Tours/Destinations, Moderated Traveler Reviews, Guide Photo/Video Gallery, WhatsApp & Phone CTA, Office Location. | `/api/public/home`, `/api/public/tours`, `/api/cms/*` (modeled on `chapaimangobd` `LandingContent` + `hisaab` `PageContent`). |
| **2. Multi-Role Auth (RBAC)** | Staff Login with **Owner (মালিক)**, **Accountant (একাউন্ট্যান্ট)**, and **Tour Guide (ট্যুর গাইড)** accounts with role-specific permissions & views. | `/api/auth/login`, `/api/auth/quick-login`, `/api/auth/me` with JWT Cookie + Bearer token & `requireRole('owner', 'accountant', 'guide')`. |
| **3. Active Tour Live Group SMS** | Dashboard highlights currently running tour (e.g., Sajek Tour with Monirul Bhai) and lets Owner/Guide edit & broadcast instant SMS (e.g. *"দুপুরের খাবার রেডি, সবাই ডাইনিং এ চলে আসেন"*) to all booked travelers with one click instead of calling 20 people individually. | `/api/tours/:id/broadcast-sms` + `/api/sms/send-bulk` using the unified Automas/MimSMS gateway & `SmsLog` recorder. |
| **4. Smart Tour Builder & Break-Even Calculator** | Create/edit tours with Website Title, Destination, Start Date + Days/Nights with **auto-calculated Return Date**, Departure point (`সপুরা মোড়, রাজশাহী`), Seat limit (`40`), Media picker (Cover image, Facebook Poster, Destination Gallery), Multiple Packages (Couple AC/Non-AC `৳15,000`, 4-Person Shared `৳3,800`), Extra Add-ons (`প্রবেশ টিকিট ৳200`), Transport (`নন-এসি বাস + চাঁদের গাড়ি`), Assigned Guides, Day-by-Day Meal Plan (linked to Meal Menus), Day-by-Day Itinerary & Facebook Marketing Post generator, and **Budget & Break-Even Calculator** (e.g., `৳40,000` food, `৳1,30,000` total budget -> *"কমপক্ষে ৩৫ জন না হলে লস হবে"*). | `/api/tours` CRUD with server-side & client-side return-date calculation, package/add-on schemas, meal-plan costing, and break-even traveler calculation. |
| **5. Traveler Bookings & Auto-Fill CRM** | Inside each tour: view booked travelers (e.g. Tania Parvez — 5 pax, Bill `৳19,995`, Paid `৳7,500`, Due `৳12,495`). Add new booking: typing phone (`01757950...`) auto-suggests & auto-fills returning customer (e.g. Israt Jahan), selects package, extra entry ticket (`৳200`), discount (`৳399` + reason), advance (`৳2,000` via bKash/Cash), auto-computes due (`৳1,600`), records source (`Phone Call`/`Facebook`/`Website`), and immediately opens **"Review & Send Booking Confirmation SMS"**. | `/api/bookings`, `/api/customers/lookup?phone=...`, automatic `Customer` upsert & loyalty tagging, plus instant booking confirmation SMS dispatch. |
| **6. Post-Tour Traveler Feedback Link** | Send SMS with feedback link after a tour completes. Traveler opens `/feedback/:bookingId` ("প্রিয় ইসরাত, আমরা এই ট্যুরটাতে গেছিলাম..."), selects overall rating ("অসাধারণ, আবারও যাব!", "খুব ভালো লেগেছে"), tags what they liked ("খাবার ভালো ছিল", "গাইড ভালো ছিল", "বাস ভালো ছিল"), writes comment ("ভাই আপনাদের হোটেলটা আরেকটু ভালো করতে পারতেন"), and submits directly into the admin panel. | `/api/public/feedback/:code` & `/api/cms/reviews` with one-click SMS link sender and admin moderation toggle. |
| **7. Website Queries / Leads CRM** | Visitors submit tour interest on the website (Tour, Name, Phone, Pax, Notes). Admin manages queries with status tags: **New (`নতুন`)**, **Contacted (`কথা হয়েছে`)**, **Converted (`কনভার্টেড`)**, and one-click Convert to Booking. | `/api/public/inquiries` & `/api/inquiries` with status workflow and booking conversion. |
| **8. Customers CRM & Targeted SMS Panel** | List of all past travelers, which tours they joined, total spent/due, and tags (**Loyal Customer**, **Repeat Customer**). SMS Panel filters recipients by tag (All, Loyal, Repeat, Specific Tour), previews Unicode segment count, sends bulk SMS, and tracks delivery status per recipient. | `/api/customers`, `/api/sms/campaign`, `/api/sms/logs`, `/api/sms/stats`. |
| **9. Accounting & Monthly P&L Statement** | Month-by-month selector (e.g., October vs September). Shows tour-wise budget vs collected income, itemized tour expenses (Bus `৳5,000`, Hotel `৳20,000`, Food `৳33,000`, Guide, Boat, Marketing) -> **Gross Profit (`৳73,000`)**, minus Office Expenses (Office Rent, WiFi Bill = `৳10,000`) -> **Net Profit (`৳63,000`)**, with downloadable/printable A4 statement. | `/api/accounting/monthly?month=2026-10`, `/api/accounting/expenses` (modeled on `clinic-hisaab` & `chapaimangobd` costing + print layout). |
| **10. Meal Menus & Network Contacts** | Reusable **Meal Menus** (e.g. *ডিম খিচুড়ি ৳90*, *পরোটা ডিম*, *ব্যাম্বু বিরিয়ানি*) for quick tour meal-plan & budget calculation. **Network Contacts** directory (Sajek/Sylhet hotel owners, bus operators, Chander Gari drivers) accessible to Tour Guides on the go. | `/api/meal-menus` & `/api/network-contacts`. |
| **11. Team / Staff & Guide Tour History** | Manage Owner, Accountant, and Tour Guide accounts, and view each guide's complete tour history, traveler ratings, and assigned trips. | `/api/staff` with computed guide tour history & performance metrics. |
