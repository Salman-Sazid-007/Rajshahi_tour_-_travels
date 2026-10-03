'use strict';

const express = require('express');
const env = require('../config/env');
const store = require('../services/store');
const gsm7 = require('../utils/gsm7');
const { todayDhaka } = require('../../../shared/transport.cjs');
const transportStore = require('../services/transportStore');
const { AppError, asyncHandler, sendResponse } = require('../utils/errors');
const { signToken, authenticate, optionalAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

// Operational and customer records are staff-only; public tours use sanitized views.
router.use(['/tours', '/bookings', '/inquiries', '/customers', '/staff', '/cms', '/network-contacts', '/meal-menus', '/accounting', '/sms', '/dashboard'], authenticate);
router.use(['/tours', '/cms', '/staff'], (req, res, next) => req.method === 'GET' ? next() : requireRole('owner')(req, res, next));

function publicTour(tour) {
  if (!tour) return null;
  const { bookings, totalCollected, totalBill, totalBillAmount, totalDue, budget, ...publicFields } = tour;
  return { ...publicFields, guides: (tour.guides || []).map(({ id, name, avatar }) => ({ id, name, avatar })) };
}

// ── Health Check ─────────────────────────────────────────────────────────────

router.get('/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'Rajshahi Tours & Travels API',
    timestamp: new Date().toISOString(),
  });
});

// ── Auth & Demo Role Login ───────────────────────────────────────────────────

router.get(
  '/auth/demo-accounts',
  asyncHandler(async (_req, res) => {
    const accounts = store.listDemoAccounts();
    sendResponse(res, 200, 'ডেমো স্টাফ অ্যাকাউন্ট তালিকা', { accounts });
  })
);

router.post(
  '/auth/login',
  asyncHandler(async (req, res) => {
    const { phoneOrRole, phone, role, password } = req.body || {};
    const identifier = phoneOrRole || phone || role || '';
    const user = store.authenticateUser({ phoneOrRole: identifier, password });
    if (!user) {
      throw new AppError(401, 'INVALID_CREDENTIALS', 'ফোন নাম্বার অথবা পাসওয়ার্ড সঠিক নয়');
    }
    const token = signToken(user);
    res.cookie(env.COOKIE_NAME, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: env.isProd,
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });
    sendResponse(res, 200, `স্বাগতম, ${user.name}`, { user, token });
  })
);

router.post('/auth/logout', (_req, res) => {
  res.clearCookie(env.COOKIE_NAME);
  sendResponse(res, 200, 'লগআউট সফল হয়েছে');
});

router.get(
  '/auth/me',
  optionalAuth,
  asyncHandler(async (req, res) => {
    sendResponse(res, 200, 'সেশন তথ্য', { user: req.user || null });
  })
);

// ── Public Website Endpoints ─────────────────────────────────────────────────

router.get(
  '/public/bootstrap',
  asyncHandler(async (_req, res) => {
    const cms = store.getCmsState();
    const allPublished = store.listTours({ onlyPublished: true }).map(publicTour);
    const today = todayDhaka();

    const runningTours = allPublished.filter((t) => t.status === 'running');
    // Automatic date-based filtering: upcoming tours whose startDate has passed automatically move out
    const upcomingTours = allPublished.filter(
      (t) => t.status === 'upcoming' && String(t.startDate) >= today
    );
    const completedTours = allPublished.filter(
      (t) => t.status === 'completed' || (t.status === 'upcoming' && String(t.startDate) < today)
    );

    const highlightedTour =
      upcomingTours.find((t) => t.id === cms.siteSettings.highlightedTourId) ||
      upcomingTours.find((t) => t.isFeatured) ||
      upcomingTours[0] ||
      runningTours[0] ||
      null;

    const visibleReviews = cms.reviews.filter((r) => r.isVisibleOnWebsite !== false);

    sendResponse(res, 200, 'ওয়েবসাইট ডাটা', {
      siteSettings: cms.siteSettings,
      highlightedTour,
      runningTours,
      upcomingTours,
      completedTours,
      reviews: visibleReviews,
      gallery: cms.gallery,
    });
  })
);

router.get(
  '/public/tours/:id',
  asyncHandler(async (req, res) => {
    const tour = store.getTourById(req.params.id);
    if (!tour) {
      throw new AppError(404, 'TOUR_NOT_FOUND', 'ট্যুরটি খুঁজে পাওয়া যায়নি');
    }
    sendResponse(res, 200, 'ট্যুর বিস্তারিত', { tour: publicTour(tour) });
  })
);

router.post(
  '/public/inquiries',
  asyncHandler(async (req, res) => {
    const { name, phone } = req.body || {};
    if (!name || !phone) {
      throw new AppError(400, 'VALIDATION_ERROR', 'অনুগ্রহ করে আপনার নাম ও ফোন নাম্বার দিন');
    }
    const inquiry = store.createInquiry(req.body);
    sendResponse(
      res,
      201,
      'আপনার বুকিং কুয়েরি সফলভাবে জমা হয়েছে! আমাদের প্রতিনিধি খুব শীঘ্রই আপনাকে কল করবেন।',
      { inquiry }
    );
  })
);

router.get(
  '/public/feedback/:bookingId',
  asyncHandler(async (req, res) => {
    const data = store.getBookingById(req.params.bookingId);
    const defaultBooking = store.listBookings()[0];
    const target = data || {
      ...defaultBooking,
      tour: store.getTourById(defaultBooking?.tourId || 'tour-sajek-running'),
    };
    sendResponse(res, 200, 'ফিডব্যাক ফর্ম তথ্য', {
      booking: target,
      tour: target.tour,
    });
  })
);

router.post(
  '/public/feedback/:bookingId',
  asyncHandler(async (req, res) => {
    const review = store.submitTravelerFeedback(req.params.bookingId, req.body || {});
    sendResponse(res, 201, 'আপনার মূল্যবান মতামতের জন্য অসংখ্য ধন্যবাদ!', { review });
  })
);

// ── Dashboard & Active Tour Live Broadcast ───────────────────────────────────

router.get(
  '/dashboard/overview',
  optionalAuth,
  asyncHandler(async (_req, res) => {
    const allTours = store.listTours();
    const runningTour = allTours.find((t) => t.status === 'running') || allTours[0];
    const upcomingTours = allTours.filter((t) => t.status === 'upcoming');
    const inquiries = store.listInquiries();
    const customers = store.listCustomers();
    const octAccounting = store.getMonthlyAccounting('2026-10');
    const smsOverview = store.getSmsOverview();

    const quickBroadcastTemplates = [
      {
        id: 'tpl-lunch',
        label: 'দুপুরের খাবার রেডি',
        text: 'দুপুরের খাবার রেডি, সবাই ডাইনিং এ চলে আসেন। - রাজশাহী ট্যুরস এন্ড ট্রাভেলস',
      },
      {
        id: 'tpl-breakfast',
        label: 'সকালের নাস্তা রেডি',
        text: 'শুভ সকাল! সকালের নাস্তা (ডিম খিচুড়ি/পরোটা) রেডি, সবাই রেস্টুরেন্টে চলে আসুন।',
      },
      {
        id: 'tpl-bus',
        label: 'বাস ছাড়ার সময়',
        text: 'সম্মানিত ট্রাভেলারবৃন্দ, আগামী ২০ মিনিটের মধ্যে আমাদের গাড়ি ছেড়ে যাবে। সবাই নিজ নিজ সিটে চলে আসুন।',
      },
      {
        id: 'tpl-checkout',
        label: 'রিসোর্ট চেক-আউট',
        text: 'সকাল ১০:০০ টায় রিসোর্ট চেক-আউট। অনুগ্রহ করে ব্যাগ গুছিয়ে লবিতে চলে আসুন।',
      },
      {
        id: 'tpl-dinner',
        label: 'রাতের ব্যাম্বু বিরিয়ানি / বারবিকিউ',
        text: 'রাতের স্পেশাল ব্যাম্বু বিরিয়ানি ও বারবিকিউ ডিনার রেডি! সবাই ডাইনিং স্পটে চলে আসুন।',
      },
    ];

    sendResponse(res, 200, 'ড্যাশবোর্ড ওভারভিউ', {
      kpis: {
        runningToursCount: allTours.filter((t) => t.status === 'running').length,
        upcomingToursCount: upcomingTours.length,
        newInquiriesCount: inquiries.filter((i) => i.status === 'new').length,
        totalCustomersCount: customers.length,
        octoberGrossProfit: octAccounting.summary.grossProfit,
        octoberNetProfit: octAccounting.summary.netProfit,
        totalSmsSent: smsOverview.stats.totalDispatched,
      },
      runningTour,
      upcomingTours,
      recentInquiries: inquiries.slice(0, 5),
      quickBroadcastTemplates,
    });
  })
);

router.post(
  '/tours/:id/broadcast-sms',
  optionalAuth,
  asyncHandler(async (req, res) => {
    const tour = store.getTourById(req.params.id);
    if (!tour) {
      throw new AppError(404, 'TOUR_NOT_FOUND', 'ট্যুর খুঁজে পাওয়া যায়নি');
    }
    const { message, customRecipients } = req.body || {};
    if (!message || !String(message).trim()) {
      throw new AppError(400, 'EMPTY_MESSAGE', 'অনুগ্রহ করে মেসেজ লিখুন');
    }

    const recipients =
      Array.isArray(customRecipients) && customRecipients.length
        ? customRecipients
        : (tour.bookings || []).map((b) => ({
            name: b.customerName,
            phone: b.customerPhone,
          }));

    const result = await store.sendAndRecordSms({
      recipients,
      message,
      category: 'running_tour',
      tourId: tour.id,
      sentBy: req.user?.name || 'মনিরুল ইসলাম (মনিরুল ভাই)',
    });

    sendResponse(
      res,
      201,
      `${tour.title}-এর ${result.sentCount} জন ট্রাভেলারের ফোনে এসএমএস সফলভাবে পাঠানো হয়েছে!`,
      result
    );
  })
);

// ── Tours CRUD & Smart Tour Builder ──────────────────────────────────────────

router.get(
  '/tours',
  optionalAuth,
  asyncHandler(async (req, res) => {
    const tours = store.listTours({ status: req.query.status });
    sendResponse(res, 200, 'ট্যুর তালিকা', { tours });
  })
);

router.get(
  '/tours/:id',
  optionalAuth,
  asyncHandler(async (req, res) => {
    const tour = store.getTourById(req.params.id);
    if (!tour) {
      throw new AppError(404, 'TOUR_NOT_FOUND', 'ট্যুর খুঁজে পাওয়া যায়নি');
    }
    sendResponse(res, 200, 'ট্যুর বিস্তারিত', { tour });
  })
);

router.post(
  '/tours',
  optionalAuth,
  asyncHandler(async (req, res) => {
    const tour = store.createTour(req.body || {});
    sendResponse(res, 201, 'নতুন ট্যুর সফলভাবে তৈরি ও ওয়েবসাইটে পাবলিশ করা হয়েছে!', { tour });
  })
);

router.put(
  '/tours/:id',
  optionalAuth,
  asyncHandler(async (req, res) => {
    const tour = store.updateTour(req.params.id, req.body || {});
    if (!tour) {
      throw new AppError(404, 'TOUR_NOT_FOUND', 'ট্যুর খুঁজে পাওয়া যায়নি');
    }
    sendResponse(res, 200, 'ট্যুর তথ্য আপডেট করা হয়েছে!', { tour });
  })
);

router.delete(
  '/tours/:id',
  optionalAuth,
  asyncHandler(async (req, res) => {
    store.deleteTour(req.params.id);
    sendResponse(res, 200, 'ট্যুর মুছে ফেলা হয়েছে');
  })
);

// ── Traveler Bookings & Confirmation / Feedback SMS ──────────────────────────

router.get(
  '/bookings',
  optionalAuth,
  asyncHandler(async (req, res) => {
    const bookings = store.listBookings({
      tourId: req.query.tourId,
      search: req.query.search,
    });
    sendResponse(res, 200, 'বুকিং তালিকা', { bookings });
  })
);

router.post(
  '/bookings',
  optionalAuth,
  asyncHandler(async (req, res) => {
    const { booking, customer, smsPreview } = store.createBooking(req.body || {});
    let smsResult = null;
    if (req.body?.sendSmsImmediately) {
      smsResult = await store.sendAndRecordSms({
        recipients: [{ name: booking.customerName, phone: booking.customerPhone }],
        message: req.body.customSmsText || smsPreview,
        category: 'booking_confirm',
        tourId: booking.tourId,
        bookingId: booking.id,
        sentBy: req.user?.name || 'সালমান সাজিদ (মালিক)',
      });
    }
    const updatedTour = store.getTourById(booking.tourId);
    sendResponse(res, 201, 'বুকিং সফলভাবে সংরক্ষণ করা হয়েছে!', {
      booking,
      customer,
      smsPreview,
      smsResult,
      tour: updatedTour,
    });
  })
);

router.patch(
  '/bookings/:id',
  optionalAuth,
  asyncHandler(async (req, res) => {
    const booking = store.updateBooking(req.params.id, req.body || {});
    if (!booking) {
      throw new AppError(404, 'BOOKING_NOT_FOUND', 'বুকিং খুঁজে পাওয়া যায়নি');
    }
    const updatedTour = store.getTourById(booking.tourId);
    sendResponse(res, 200, 'বুকিং আপডেট করা হয়েছে!', { booking, tour: updatedTour });
  })
);

router.post(
  '/bookings/:id/send-confirmation-sms',
  optionalAuth,
  asyncHandler(async (req, res) => {
    const data = store.getBookingById(req.params.id);
    if (!data) {
      throw new AppError(404, 'BOOKING_NOT_FOUND', 'বুকিং খুঁজে পাওয়া যায়নি');
    }
    const message =
      req.body?.message || store.buildBookingConfirmationSmsText(data, data.tour);
    const result = await store.sendAndRecordSms({
      recipients: [{ name: data.customerName, phone: data.customerPhone }],
      message,
      category: 'booking_confirm',
      tourId: data.tourId,
      bookingId: data.id,
      sentBy: req.user?.name || 'সালমান সাজিদ (মালিক)',
    });
    sendResponse(
      res,
      201,
      `${data.customerName}-এর নাম্বারে বুকিং কনফার্মেশন এসএমএস পাঠানো হয়েছে!`,
      result
    );
  })
);

router.post(
  '/bookings/:id/send-feedback-sms',
  optionalAuth,
  asyncHandler(async (req, res) => {
    const data = store.getBookingById(req.params.id);
    if (!data) {
      throw new AppError(404, 'BOOKING_NOT_FOUND', 'বুকিং খুঁজে পাওয়া যায়নি');
    }
    const origin = req.body?.origin || '';
    const feedbackLink = `${origin}/?feedback=${data.id}`;
    const tourName = data.tour ? data.tour.title.split('—')[0].trim() : 'ট্যুর';
    const message =
      req.body?.message ||
      `প্রিয় ${data.customerName}, আমাদের ${tourName} ট্যুরটি আপনার কাছে কেমন লেগেছে? আপনার মূল্যবান রেটিং ও মতামত জানান এই লিংকে: ${feedbackLink} - রাজশাহী ট্যুরস এন্ড ট্রাভেলস`;

    const result = await store.sendAndRecordSms({
      recipients: [{ name: data.customerName, phone: data.customerPhone }],
      message,
      category: 'feedback_link',
      tourId: data.tourId,
      bookingId: data.id,
      sentBy: req.user?.name || 'সালমান সাজিদ (মালিক)',
    });
    sendResponse(res, 201, `${data.customerName}-কে ফিডব্যাক লিংক এসএমএস পাঠানো হয়েছে!`, {
      ...result,
      feedbackBookingId: data.id,
    });
  })
);

// ── Website Queries / Leads (`Inquiries`) ────────────────────────────────────

router.get(
  '/inquiries',
  optionalAuth,
  asyncHandler(async (req, res) => {
    const inquiries = store.listInquiries({ status: req.query.status });
    sendResponse(res, 200, 'ওয়েবসাইট কুয়েরি তালিকা', { inquiries });
  })
);

router.patch(
  '/inquiries/:id',
  optionalAuth,
  asyncHandler(async (req, res) => {
    const inquiry = store.updateInquiry(req.params.id, req.body || {});
    if (!inquiry) {
      throw new AppError(404, 'INQUIRY_NOT_FOUND', 'কুয়েরি খুঁজে পাওয়া যায়নি');
    }
    sendResponse(res, 200, 'কুয়েরি স্ট্যাটাস আপডেট হয়েছে', { inquiry });
  })
);

router.post(
  '/inquiries/:id/convert',
  optionalAuth,
  asyncHandler(async (req, res) => {
    const inquiries = store.listInquiries();
    const inq = inquiries.find((i) => i.id === req.params.id);
    if (!inq) {
      throw new AppError(404, 'INQUIRY_NOT_FOUND', 'কুয়েরি খুঁজে পাওয়া যায়নি');
    }
    if (inq.seatRequestId) {
      const created = transportStore.updateTourRequest(inq.seatRequestId, { status: 'confirmed' });
      return sendResponse(res, 201, 'Seat request confirmed / সিটের অনুরোধ নিশ্চিত হয়েছে', created);
    }
    if (!req.body?.seatAssignments?.length) throw new AppError(400, 'SEATS_REQUIRED', 'Select seats in the bookings tab / বুকিং ট্যাবে সিট নির্বাচন করুন');
    const created = store.createBooking({
      tourId: req.body?.tourId || inq.tourId,
      customerName: inq.name, customerPhone: inq.phone,
      pax: req.body?.pax || inq.pax || 1,
      seatAssignments: req.body.seatAssignments,
      advancePaid: req.body?.advancePaid ?? 0,
      packageId: req.body?.packageId, source: 'website', notes: inq.message,
    });
    store.updateInquiry(inq.id, {
      status: 'converted',
      adminNote: req.body?.adminNote || 'বুকিংয়ে রূপান্তরিত করা হয়েছে',
    });
    sendResponse(res, 201, 'কুয়েরিটি সফলভাবে কনফার্ম বুকিংয়ে রূপান্তরিত হয়েছে!', created);
  })
);

// ── Customers CRM ────────────────────────────────────────────────────────────

router.get(
  '/customers',
  optionalAuth,
  asyncHandler(async (req, res) => {
    const customers = store.listCustomers({
      tag: req.query.tag,
      search: req.query.search,
    });
    sendResponse(res, 200, 'কাস্টমার তালিকা', { customers });
  })
);

router.get(
  '/customers/lookup',
  optionalAuth,
  asyncHandler(async (req, res) => {
    const suggestions = store.lookupCustomersByPhone(req.query.q || req.query.phone || '');
    sendResponse(res, 200, 'কাস্টমার সাজেশন', { suggestions });
  })
);

router.post(
  '/customers',
  optionalAuth,
  asyncHandler(async (req, res) => {
    const customer = store.createCustomer(req.body || {});
    sendResponse(res, 201, 'কাস্টমার সংরক্ষণ করা হয়েছে', { customer });
  })
);

router.patch(
  '/customers/:id',
  optionalAuth,
  asyncHandler(async (req, res) => {
    const customer = store.updateCustomer(req.params.id, req.body || {});
    if (!customer) {
      throw new AppError(404, 'CUSTOMER_NOT_FOUND', 'কাস্টমার খুঁজে পাওয়া যায়নি');
    }
    sendResponse(res, 200, 'কাস্টমার তথ্য ও ট্যাগ আপডেট হয়েছে', { customer });
  })
);

// ── SMS Panel & Campaign Dispatch ────────────────────────────────────────────

router.get(
  '/sms/overview',
  optionalAuth,
  asyncHandler(async (_req, res) => {
    const overview = store.getSmsOverview();
    sendResponse(res, 200, 'এসএমএস প্যানেল ওভারভিউ', overview);
  })
);

router.post(
  '/sms/preview',
  optionalAuth,
  asyncHandler(async (req, res) => {
    const meta = gsm7.measure(req.body?.message || '');
    sendResponse(res, 200, 'এসএমএস প্রিভিউ হিসাব', { meta });
  })
);

router.post(
  '/sms/send',
  optionalAuth,
  asyncHandler(async (req, res) => {
    const { audience = 'all', customRecipients = [], tourId = '', message = '' } = req.body || {};
    if (!String(message).trim()) {
      throw new AppError(400, 'EMPTY_MESSAGE', 'অনুগ্রহ করে এসএমএস টেক্সট লিখুন');
    }

    let recipients = [];
    if (Array.isArray(customRecipients) && customRecipients.length) {
      recipients = customRecipients;
    } else if (audience === 'tour' && tourId) {
      const tour = store.getTourById(tourId);
      recipients = (tour?.bookings || []).map((b) => ({
        name: b.customerName,
        phone: b.customerPhone,
      }));
    } else {
      const tagFilter =
        audience === 'loyal' ? 'loyal' : audience === 'repeat' ? 'repeat' : audience === 'vip' ? 'vip' : 'all';
      recipients = store.listCustomers({ tag: tagFilter }).map((c) => ({
        name: c.name,
        phone: c.phone,
      }));
    }

    const result = await store.sendAndRecordSms({
      recipients,
      message,
      category: audience === 'tour' ? 'running_tour' : 'promo_campaign',
      tourId,
      sentBy: req.user?.name || 'সালমান সাজিদ (মালিক)',
    });

    sendResponse(
      res,
      201,
      `মোট ${result.sentCount} জন প্রাপকের কাছে এসএমএস সফলভাবে পাঠানো হয়েছে!`,
      result
    );
  })
);

// ── Accounting & Monthly Financial Statement ─────────────────────────────────

router.get(
  '/accounting/monthly',
  optionalAuth,
  asyncHandler(async (req, res) => {
    const month = req.query.month || '2026-10';
    const report = store.getMonthlyAccounting(month);
    sendResponse(res, 200, 'মাসিক একাউন্টিং রিপোর্ট', { report });
  })
);

router.put(
  '/accounting/tour-costs/:tourId',
  optionalAuth,
  asyncHandler(async (req, res) => {
    const month = req.body?.month || '2026-10';
    const report = store.updateTourAccountingRecord(month, req.params.tourId, req.body || {});
    sendResponse(res, 200, 'ট্যুরের আয়-ব্যয়ের হিসাব আপডেট করা হয়েছে', { report });
  })
);

router.post(
  '/accounting/expenses',
  optionalAuth,
  asyncHandler(async (req, res) => {
    const month = req.body?.month || '2026-10';
    const report = store.addOfficeExpense(month, req.body || {});
    sendResponse(res, 201, 'নতুন খরচ যুক্ত করা হয়েছে', { report });
  })
);

router.delete(
  '/accounting/expenses/:id',
  optionalAuth,
  asyncHandler(async (req, res) => {
    const month = req.query.month || '2026-10';
    const report = store.deleteOfficeExpense(month, req.params.id);
    sendResponse(res, 200, 'খরচ মুছে ফেলা হয়েছে', { report });
  })
);

// ── Meal Menus (`মিল মেনুস`) ─────────────────────────────────────────────────

router.get(
  '/meal-menus',
  optionalAuth,
  asyncHandler(async (_req, res) => {
    const mealMenus = store.listMealMenus();
    sendResponse(res, 200, 'মিল মেনু তালিকা', { mealMenus });
  })
);

router.post(
  '/meal-menus',
  optionalAuth,
  asyncHandler(async (req, res) => {
    const mealMenu = store.createMealMenu(req.body || {});
    sendResponse(res, 201, 'নতুন মিল মেনু যুক্ত হয়েছে', { mealMenu });
  })
);

router.put(
  '/meal-menus/:id',
  optionalAuth,
  asyncHandler(async (req, res) => {
    const mealMenu = store.updateMealMenu(req.params.id, req.body || {});
    sendResponse(res, 200, 'মিল মেনু আপডেট হয়েছে', { mealMenu });
  })
);

router.delete(
  '/meal-menus/:id',
  optionalAuth,
  asyncHandler(async (req, res) => {
    store.deleteMealMenu(req.params.id);
    sendResponse(res, 200, 'মিল মেনু মুছে ফেলা হয়েছে');
  })
);

// ── Network Contacts (`নেটওয়ার্ক কন্টাক্টস`) ─────────────────────────────────

router.get(
  '/network-contacts',
  optionalAuth,
  asyncHandler(async (req, res) => {
    const contacts = store.listNetworkContacts({
      destination: req.query.destination,
      category: req.query.category,
    });
    sendResponse(res, 200, 'নেটওয়ার্ক কন্টাক্টস তালিকা', { contacts });
  })
);

router.post(
  '/network-contacts',
  optionalAuth,
  asyncHandler(async (req, res) => {
    const contact = store.createNetworkContact(req.body || {});
    sendResponse(res, 201, 'নতুন নেটওয়ার্ক কন্টাক্ট সংরক্ষিত হয়েছে', { contact });
  })
);

router.put(
  '/network-contacts/:id',
  optionalAuth,
  asyncHandler(async (req, res) => {
    const contact = store.updateNetworkContact(req.params.id, req.body || {});
    sendResponse(res, 200, 'নেটওয়ার্ক কন্টাক্ট আপডেট হয়েছে', { contact });
  })
);

router.delete(
  '/network-contacts/:id',
  optionalAuth,
  asyncHandler(async (req, res) => {
    store.deleteNetworkContact(req.params.id);
    sendResponse(res, 200, 'নেটওয়ার্ক কন্টাক্ট মুছে ফেলা হয়েছে');
  })
);

// ── Website CMS (`ওয়েবসাইট কন্ট্রোল`) ────────────────────────────────────────

router.get(
  '/cms',
  optionalAuth,
  asyncHandler(async (_req, res) => {
    const cms = store.getCmsState();
    const tours = store.listTours();
    sendResponse(res, 200, 'ওয়েবসাইট সিএমএস ডাটা', { ...cms, tours });
  })
);

router.put(
  '/cms/settings',
  optionalAuth,
  asyncHandler(async (req, res) => {
    const siteSettings = store.updateSiteSettings(req.body || {});
    sendResponse(res, 200, 'ওয়েবসাইট সেকশন সফলভাবে আপডেট হয়েছে!', { siteSettings });
  })
);

router.post(
  '/cms/reviews',
  optionalAuth,
  asyncHandler(async (req, res) => {
    const review = store.createReview(req.body || {});
    sendResponse(res, 201, 'নতুন রিভিউ যুক্ত হয়েছে', { review });
  })
);

router.patch(
  '/cms/reviews/:id',
  optionalAuth,
  asyncHandler(async (req, res) => {
    const review = store.updateReview(req.params.id, req.body || {});
    sendResponse(res, 200, 'রিভিউ আপডেট হয়েছে', { review });
  })
);

router.delete(
  '/cms/reviews/:id',
  optionalAuth,
  asyncHandler(async (req, res) => {
    store.deleteReview(req.params.id);
    sendResponse(res, 200, 'রিভিউ মুছে ফেলা হয়েছে');
  })
);

router.post(
  '/cms/gallery',
  optionalAuth,
  asyncHandler(async (req, res) => {
    const item = store.addGalleryItem(req.body || {});
    sendResponse(res, 201, 'গ্যালারিতে নতুন ছবি যুক্ত হয়েছে', { item });
  })
);

router.delete(
  '/cms/gallery/:id',
  optionalAuth,
  asyncHandler(async (req, res) => {
    store.deleteGalleryItem(req.params.id);
    sendResponse(res, 200, 'গ্যালারি ছবি মুছে ফেলা হয়েছে');
  })
);

router.post(
  '/cms/media',
  optionalAuth,
  asyncHandler(async (req, res) => {
    const item = store.addMediaItem(req.body || {});
    sendResponse(res, 201, 'মিডিয়া লাইব্রেরিতে ছবি আপলোড হয়েছে', { item });
  })
);

// ── Team / Staff & Guide History (`টিম ও গাইড হিস্ট্রি`) ──────────────────────

router.get(
  '/staff',
  optionalAuth,
  asyncHandler(async (_req, res) => {
    const staff = store.listStaffWithHistory();
    sendResponse(res, 200, 'টিম ও গাইড হিস্ট্রি তালিকা', { staff });
  })
);

router.post(
  '/staff',
  optionalAuth,
  requireRole('owner'),
  asyncHandler(async (req, res) => {
    const member = store.addStaff(req.body || {});
    sendResponse(res, 201, 'নতুন টিম মেম্বার যুক্ত হয়েছে', { member });
  })
);

router.patch(
  '/staff/:id',
  optionalAuth,
  requireRole('owner'),
  asyncHandler(async (req, res) => {
    const member = store.updateStaff(req.params.id, req.body || {});
    sendResponse(res, 200, 'টিম মেম্বার আপডেট হয়েছে', { member });
  })
);

module.exports = router;
