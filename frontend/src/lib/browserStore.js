import seedData from './seedData.json';
import transport from '@rtt/transport';
import { calculateReturnDateClient, formatBnDate, measureSmsClient } from './api';

const STORAGE_KEY = 'rtt_github_pages_store_v1';

export function resolveMediaUrl(url) {
  if (!url || typeof url !== 'string') return url;
  if (url.startsWith('/media/')) {
    const base = import.meta.env.BASE_URL || '/';
    if (base === './' || base === '.') {
      return `.${url}`;
    }
    return `${base.replace(/\/$/, '')}${url}`;
  }
  return url;
}

function deepMapMediaUrls(obj) {
  if (!obj) return obj;
  if (typeof obj === 'string') {
    return resolveMediaUrl(obj);
  }
  if (Array.isArray(obj)) {
    return obj.map(deepMapMediaUrls);
  }
  if (typeof obj === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(obj)) {
      out[k] = deepMapMediaUrls(v);
    }
    return out;
  }
  return obj;
}

function getState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const state = transport.migrateEditionData(JSON.parse(raw));
      saveState(state);
      return state;
    }
  } catch {
    // ignore
  }
  const initial = JSON.parse(JSON.stringify(seedData));
  saveState(initial);
  return initial;
}

function saveState(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
    // ignore quota errors
  }
}

function enrichTour(state, tour) {
  if (!tour) return null;
  const tourBookings = (state.bookings || []).filter(
    (b) => b.tourId === tour.id && b.status !== 'cancelled'
  );
  const bookedSeats = tourBookings.reduce((sum, b) => sum + (Number(b.pax) || 0), 0);
  const seatInfo = transport.getTourSeats(state, tour.id);
  const seatsLeft = seatInfo.seatsLeft;
  const totalBill = tourBookings.reduce((sum, b) => sum + (Number(b.totalAmount) || 0), 0);
  const totalCollected = tourBookings.reduce((sum, b) => sum + (Number(b.advancePaid) || 0), 0);
  const totalDue = tourBookings.reduce((sum, b) => sum + (Number(b.dueAmount) || 0), 0);

  const guides = (tour.guideIds || [])
    .map((gid) => (state.users || []).find((u) => u.id === gid))
    .filter(Boolean);

  const prices = (tour.packages || []).map((p) => {
    const perPerson =
      p.personsPerUnit && p.personsPerUnit > 1 ? Math.round(p.price / p.personsPerUnit) : p.price;
    return perPerson;
  });
  const startingPrice = prices.length ? Math.min(...prices) : 3800;

  return {
    ...tour,
    bookedSeats,
    seatsLeft,
    seatsBooked: bookedSeats,
    seatsRemaining: seatsLeft,
    totalBillAmount: totalBill,
    bus: seatInfo.bus,
    bookingsCount: tourBookings.length,
    totalBill,
    totalCollected,
    totalDue,
    guides,
    startingPrice,
    bookings: tourBookings,
  };
}

function publicTour(tour) {
  if (!tour) return null;
  const { bookings, totalCollected, totalBill, totalBillAmount, totalDue, budget, ...publicFields } = tour;
  return { ...publicFields, guides: (tour.guides || []).map(({ id, name, avatar }) => ({ id, name, avatar })) };
}

function getMonthlyAccounting(state, month = '2026-10') {
  const record = (state.monthlyAccounting && state.monthlyAccounting[month]) || {
    month,
    labelBn: month === '2026-10' ? 'অক্টোবর ২০২৬' : month === '2026-09' ? 'সেপ্টেম্বর ২০২৬' : month,
    tourRecords: [],
    officeExpenses: [],
  };

  const enrichedTours = (record.tourRecords || []).map((tr) => {
    const liveBookings = (state.bookings || []).filter(
      (b) => b.tourId === tr.tourId && b.status !== 'cancelled'
    );
    const liveCollected = liveBookings.reduce((sum, b) => sum + (Number(b.advancePaid) || 0), 0);
    const liveBill = liveBookings.reduce((sum, b) => sum + (Number(b.totalAmount) || 0), 0);

    const totalIncome =
      typeof tr.totalIncome === 'number' ? tr.totalIncome : liveCollected || liveBill;
    const totalTourExpense =
      (Number(tr.busCost) || 0) +
      (Number(tr.hotelCost) || 0) +
      (Number(tr.foodCost) || 0) +
      (Number(tr.guideCost) || 0) +
      (Number(tr.boatAndLocalCost) || 0) +
      (Number(tr.marketingCost) || 0);
    const grossProfit = totalIncome - totalTourExpense;

    return {
      ...tr,
      totalIncome,
      liveBill,
      liveCollected,
      totalTourExpense,
      grossProfit,
    };
  });

  const totals = enrichedTours.reduce(
    (acc, tr) => {
      acc.plannedBudget += Number(tr.plannedBudget) || 0;
      acc.totalIncome += Number(tr.totalIncome) || 0;
      acc.busCost += Number(tr.busCost) || 0;
      acc.hotelCost += Number(tr.hotelCost) || 0;
      acc.foodCost += Number(tr.foodCost) || 0;
      acc.guideCost += Number(tr.guideCost) || 0;
      acc.boatAndLocalCost += Number(tr.boatAndLocalCost) || 0;
      acc.marketingCost += Number(tr.marketingCost) || 0;
      acc.totalTourExpense += Number(tr.totalTourExpense) || 0;
      acc.grossProfit += Number(tr.grossProfit) || 0;
      return acc;
    },
    {
      plannedBudget: 0,
      totalIncome: 0,
      busCost: 0,
      hotelCost: 0,
      foodCost: 0,
      guideCost: 0,
      boatAndLocalCost: 0,
      marketingCost: 0,
      totalTourExpense: 0,
      grossProfit: 0,
    }
  );

  const totalOfficeExpenses = (record.officeExpenses || []).reduce(
    (sum, e) => sum + (Number(e.amount) || 0),
    0
  );
  const netProfit = totals.grossProfit - totalOfficeExpenses;

  return {
    month: record.month,
    labelBn: record.labelBn,
    tourRecords: enrichedTours,
    officeExpenses: record.officeExpenses || [],
    summary: {
      ...totals,
      totalOfficeExpenses,
      netProfit,
    },
  };
}

function buildBookingConfirmationSmsText(booking, tour) {
  const tourName = tour ? tour.title.split('—')[0].trim() : 'গ্রুপ ট্যুর';
  const startDateBn = tour ? formatBnDate(tour.startDate) : '';
  return `প্রিয় ${booking.customerName}, ${tourName} (${startDateBn}) ${booking.pax} জনের বুকিং কনফার্ম করা হয়েছে। মোট ${booking.totalAmount} টাকা, জমা ${booking.advancePaid} টাকা, বাকি ${booking.dueAmount} টাকা। রওনা: ${tour?.departureLocation || 'রাজশাহী'}। ধন্যবাদ - রাজশাহী ট্যুরস এন্ড ট্রাভেলস।`;
}

function syncDemoCustomer(state, booking) {
  state.customers ||= [];
  const normalize = (phone) => String(phone || '').replace(/[ ()-]/g, '').replace(/^\+?880(?=1)/, '0');
  const phone = normalize(booking.customerPhone);
  let customer = state.customers.find((item) => normalize(item.phone) === phone);
  if (!customer) { customer = { id: transport.uid('cust'), name: booking.customerName, phone, email: '', address: '', tags: ['new'], toursCompleted: [], notes: 'Added from a booking' }; state.customers.unshift(customer); }
  customer.name = booking.customerName || customer.name;
  const bookings = state.bookings.filter((item) => normalize(item.customerPhone) === phone && item.status !== 'cancelled');
  customer.totalBookings = bookings.length;
  customer.totalSpent = bookings.reduce((sum, item) => sum + Number(item.totalAmount || 0), 0);
  customer.totalDue = bookings.reduce((sum, item) => sum + Number(item.dueAmount || 0), 0);
  customer.toursCompleted = [...new Set(bookings.map((item) => state.tours.find((tour) => tour.id === item.tourId)?.title).filter(Boolean))];
  customer.tags ||= ['new'];
  if (bookings.length >= 2 && !customer.tags.includes('repeat')) customer.tags = [...customer.tags.filter((tag) => tag !== 'new'), 'repeat'];
}

export async function handleBrowserApi(rawPath, options = {}) {
  const method = (options.method || 'GET').toUpperCase();
  const body = options.body ? JSON.parse(options.body) : {};
  const url = new URL(rawPath, window.location.origin);
  const pathname = url.pathname.replace(/^.*\/api/, '/api');
  const query = Object.fromEntries(url.searchParams.entries());
  const state = getState();

  const respond = (payload) => deepMapMediaUrls({ success: true, mode: "browser-demo", ...payload });

  // Shared ticketing rules also power the explicitly local static demo.
  if (pathname === '/api/public/bus-services' && method === 'GET') return respond({ services: transport.getBusServices(state, query) });
  const seatMapMatch = pathname.match(/^\/api\/public\/tours\/([^/]+)\/seats$/);
  if (seatMapMatch && method === 'GET') return respond(transport.getTourSeats(state, seatMapMatch[1]));
  if (pathname === '/api/buses' && method === 'GET') return respond({ buses: state.buses, tickets: state.busTickets, overrides: state.busOverrides, tourSeatRequests: state.tourSeatRequests });
  if (pathname === '/api/buses' && method === 'POST') { const bus = transport.saveBus(state, null, body); const persisted = saveState(state); return respond({ bus, persisted }); }
  const busMatch = pathname.match(/^\/api\/buses\/([^/]+)$/);
  if (busMatch && method === 'PUT') { const bus = transport.saveBus(state, busMatch[1], body); const persisted = saveState(state); return respond({ bus, persisted }); }
  if (pathname === '/api/bus-overrides' && method === 'POST') { const overrides = transport.setBusOverride(state, body); const persisted = saveState(state); return respond({ overrides, persisted }); }
  if (pathname === '/api/public/bus-tickets' && method === 'POST') { const ticket = transport.createBusTicket(state, body); const persisted = saveState(state); return respond({ ticket, persisted }); }
  const ticketMatch = pathname.match(/^\/api\/bus-tickets\/([^/]+)$/);
  if (ticketMatch && method === 'PATCH') { const ticket = transport.updateBusTicket(state, ticketMatch[1], body); const persisted = saveState(state); return respond({ ticket, persisted }); }
  if (pathname === '/api/public/tour-seat-requests' && method === 'POST') { const request = transport.createTourSeatRequest(state, body); const persisted = saveState(state); return respond({ request, persisted }); }
  const requestMatch = pathname.match(/^\/api\/tour-seat-requests\/([^/]+)$/);
  if (requestMatch && method === 'PATCH') {
    if (body.status === 'confirmed') { const result = transport.confirmTourSeatRequest(state, requestMatch[1]); syncDemoCustomer(state, result.booking); const persisted = saveState(state); return respond({ ...result, persisted }); }
    const request = state.tourSeatRequests.find((item) => item.id === requestMatch[1]);
    if (!request || body.status !== 'cancelled' || request.status === 'converted') throw new Error('Invalid request / ভুল অনুরোধ');
    request.status = 'cancelled'; const inquiry = state.inquiries.find((item) => item.id === request.id); if (inquiry) inquiry.status = 'closed';
    const persisted = saveState(state); return respond({ request, persisted });
  }

  if (pathname === '/api/auth/me' && method === 'GET') {
    let token = ''; try { token = localStorage.getItem('rtt_token') || ''; } catch {}
    return respond({ user: state.users.find((u) => token === `gh-pages-token-${u.id}`) || null });
  }

  if (pathname === '/api/auth/demo-accounts' && method === 'GET') return respond({ accounts: state.users });

  // 1. Auth
  if (pathname === '/api/auth/login' && method === 'POST') {
    const idf = String(body.phoneOrRole || body.role || 'owner').toLowerCase();
    const user =
      (state.users || []).find(
        (u) => u.role === idf || u.phone === idf || u.id === idf
      ) || state.users[0];
    return respond({
      message: `স্বাগতম, ${user.name}`,
      user,
      token: `gh-pages-token-${user.id}`,
    });
  }

  // 2. Public Bootstrap / Home
  if ((pathname === '/api/public/bootstrap' || pathname === '/api/public/home') && method === 'GET') {
    const allPublished = (state.tours || [])
      .filter((t) => t.isPublished !== false)
      .map((t) => enrichTour(state, t));
    const today = transport.todayDhaka();
    const runningTours = allPublished.filter((t) => t.status === 'running');
    const upcomingTours = allPublished.filter(
      (t) => t.status === 'upcoming' && String(t.startDate) >= today
    );
    const completedTours = allPublished.filter(
      (t) => t.status === 'completed' || (t.status === 'upcoming' && String(t.startDate) < today)
    );
    const highlightedTour =
      upcomingTours.find((t) => t.id === state.siteSettings?.highlightedTourId) ||
      upcomingTours.find((t) => t.isFeatured) ||
      upcomingTours[0] ||
      runningTours[0] ||
      null;
    const reviews = (state.reviews || []).filter((r) => r.isVisibleOnWebsite !== false);
    return respond({
      siteSettings: state.siteSettings,
      highlightedTour,
      runningTours,
      upcomingTours,
      completedTours,
      reviews,
      gallery: state.gallery || [],
    });
  }

  if (pathname === '/api/public/inquiries' && method === 'POST') {
    const inquiry = {
      id: `inq-${Date.now()}`,
      tourId: body.tourId || '',
      tourTitle: body.tourTitle || 'General trip inquiry',
      name: body.name,
      phone: body.phone,
      pax: Number(body.pax) || 2,
      preferredPackage: body.preferredPackage || '',
      message: body.message || '',
      status: 'new',
      source: 'website',
      createdAt: new Date().toISOString(),
    };
    state.inquiries = [inquiry, ...(state.inquiries || [])];
    const persisted = saveState(state);
    return respond({
      persisted,
      message: 'আপনার বুকিং কুয়েরি সফলভাবে জমা হয়েছে! আমাদের প্রতিনিধি খুব শীঘ্রই আপনাকে কল করবেন।',
      inquiry,
    });
  }

  const fbMatch = pathname.match(/^\/api\/public\/feedback\/([^/]+)$/);
  if (fbMatch) {
    const bookingId = fbMatch[1];
    const bkg =
      (state.bookings || []).find((b) => b.id === bookingId) || (state.bookings || [])[0];
    const tour = enrichTour(
      state,
      (state.tours || []).find((t) => t.id === bkg?.tourId) || (state.tours || [])[0]
    );
    if (method === 'GET') {
      return respond({ booking: { ...bkg, tour }, tour });
    }
    if (method === 'POST') {
      const review = {
        id: `rev-${Date.now()}`,
        bookingId,
        tourId: tour?.id || 'tour-sylhet-oct',
        tourTitle: tour?.title || 'সিলেট গ্রুপ ট্যুর',
        customerName: body.customerName || bkg?.customerName || 'সম্মানিত ট্রাভেলার',
        customerPhone: bkg?.customerPhone || '',
        rating: Number(body.rating) || 5,
        verdictLabel: body.verdictLabel || 'খুব ভালো লেগেছে',
        likedTags: Array.isArray(body.likedTags) ? body.likedTags : ['খাবার ভালো ছিল', 'গাইড ভালো ছিল'],
        comment: body.comment || '',
        isVisibleOnWebsite: true,
        createdAt: new Date().toISOString().slice(0, 10),
      };
      state.reviews = [review, ...(state.reviews || [])];
      saveState(state);
      return respond({
        message: 'আপনার মূল্যবান মতামতের জন্য অসংখ্য ধন্যবাদ!',
        review,
      });
    }
  }

  // 3. Dashboard Overview
  if (pathname === '/api/dashboard/overview' && method === 'GET') {
    const allTours = (state.tours || []).map((t) => publicTour(enrichTour(state, t)));
    const runningTour = allTours.find((t) => t.status === 'running') || allTours[0];
    const upcomingTours = allTours.filter((t) => t.status === 'upcoming');
    const octAccounting = getMonthlyAccounting(state, '2026-10');
    return respond({
      kpis: {
        runningToursCount: allTours.filter((t) => t.status === 'running').length,
        upcomingToursCount: upcomingTours.length,
        newInquiriesCount: (state.inquiries || []).filter((i) => i.status === 'new').length,
        totalCustomersCount: (state.customers || []).length,
        octoberGrossProfit: octAccounting.summary.grossProfit,
        octoberNetProfit: octAccounting.summary.netProfit,
        totalSmsSent: (state.smsLogs || []).length,
      },
      runningTour,
      upcomingTours,
      recentInquiries: (state.inquiries || []).slice(0, 5),
      quickBroadcastTemplates: [
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
          id: 'tpl-dinner',
          label: 'রাতের ব্যাম্বু বিরিয়ানি / বারবিকিউ',
          text: 'রাতের স্পেশাল ব্যাম্বু বিরিয়ানি ও বারবিকিউ ডিনার রেডি! সবাই ডাইনিং স্পটে চলে আসুন।',
        },
      ],
    });
  }

  const bcastMatch = pathname.match(/^\/api\/tours\/([^/]+)\/broadcast-sms$/);
  if (bcastMatch && method === 'POST') {
    const tour = enrichTour(
      state,
      (state.tours || []).find((t) => t.id === bcastMatch[1])
    );
    const recipients = (tour?.bookings || []).map((b) => ({
      name: b.customerName,
      phone: b.customerPhone,
    }));
    const meta = measureSmsClient(body.message || '');
    const newLogs = recipients.map((r, idx) => ({
      id: `sms-${Date.now()}-${idx}`,
      recipientName: r.name,
      phone: r.phone,
      message: body.message,
      category: 'running_tour',
      tourId: tour?.id,
      status: 'delivered',
      gateway: 'Automas/MimSMS',
      encoding: meta.encoding,
      segments: meta.segments,
      sentBy: 'মনিরুল ইসলাম (মনিরুল ভাই)',
      createdAt: new Date().toISOString(),
    }));
    state.smsLogs = [...newLogs, ...(state.smsLogs || [])];
    saveState(state);
    return respond({
      message: `${tour?.title || 'ট্যুর'}-এর ${newLogs.length} জন ট্রাভেলারের ফোনে এসএমএস সফলভাবে পাঠানো হয়েছে!`,
      sentCount: newLogs.length,
      logs: newLogs,
    });
  }

  // 4. Tours CRUD
  if (pathname === '/api/tours' && method === 'GET') {
    let tours = (state.tours || []).map((t) => enrichTour(state, t));
    if (query.status && query.status !== 'all') {
      tours = tours.filter((t) => t.status === query.status);
    }
    return respond({ tours: pathname === '/api/public/tours' ? tours.map(publicTour) : tours });
  }

  if (pathname === '/api/tours' && method === 'POST') {
    const days = Number(body.days) || 2;
    const nights = Number(body.nights) || 3;
    const startDate = body.startDate || '2026-10-15';
    const newTour = {
      id: `tour-${Date.now()}`,
      ...body,
      days,
      nights,
      startDate,
      returnDate: body.returnDate || calculateReturnDateClient(startDate, days, nights),
      totalSeats: Number(body.totalSeats) || 40,
      status: body.status || 'upcoming',
      isPublished: body.isPublished !== false,
    };
    transport.validateTourBus(state, newTour);
    state.tours = [newTour, ...(state.tours || [])];
    saveState(state);
    return respond({
      message: 'নতুন ট্যুর সফলভাবে তৈরি ও ওয়েবসাইটে পাবলিশ করা হয়েছে!',
      tour: enrichTour(state, newTour),
    });
  }

  const tourIdMatch = pathname.match(/^\/api\/tours\/([^/]+)$/);
  if (tourIdMatch) {
    const id = tourIdMatch[1];
    if (method === 'GET') {
      const tour = (state.tours || []).find((t) => t.id === id);
      return respond({ tour: enrichTour(state, tour) });
    }
    if (method === 'PUT') {
      const idx = (state.tours || []).findIndex((t) => t.id === id);
      if (idx !== -1) {
        const updated = { ...state.tours[idx], ...body, id };
        transport.validateTourBus(state, updated);
        if (updated.busId !== state.tours[idx].busId && state.bookings.some((b) => b.tourId === id && b.status !== "cancelled")) throw new Error("Cannot change a booked bus / বুকিং থাকা বাস বদলানো যায় না");
        state.tours[idx] = updated;
        saveState(state);
        return respond({
          message: 'ট্যুর তথ্য আপডেট করা হয়েছে!',
          tour: enrichTour(state, state.tours[idx]),
        });
      }
    }
    if (method === 'DELETE') {
      state.tours = (state.tours || []).filter((t) => t.id !== id);
      saveState(state);
      return respond({ message: 'ট্যুর মুছে ফেলা হয়েছে' });
    }
  }

  // 5. Bookings
  if (pathname === '/api/bookings' && method === 'GET') {
    let list = [...(state.bookings || [])];
    if (query.tourId && query.tourId !== 'all') {
      list = list.filter((b) => b.tourId === query.tourId);
    }
    return respond({ bookings: list });
  }

  if (pathname === '/api/bookings' && method === 'POST') {
    const tour = (state.tours || []).find((t) => t.id === body.tourId) || state.tours[0];
    const pkg =
      (tour?.packages || []).find((p) => p.id === body.packageId) ||
      (tour?.packages || [])[0] || { id: 'pkg-default', name: 'রেগুলার প্যাকেজ', price: 3800 };
    const pax = Number(body.pax) || 1;
    const assignments = transport.validateTourBooking(state, tour.id, { ...body, pax });
    const baseAmount =
      body.baseAmount !== undefined
        ? Number(body.baseAmount)
        : pkg.personsPerUnit > 1
        ? Math.ceil(pax / pkg.personsPerUnit) * pkg.price
        : pax * pkg.price;
    const addonAmount = Number(body.addonAmount) || 0;
    const discount = Number(body.discount) || 0;
    const totalAmount =
      body.totalAmount !== undefined
        ? Number(body.totalAmount)
        : Math.max(0, baseAmount + addonAmount - discount);
    const advancePaid = Number(body.advancePaid) || 0;
    const dueAmount = Math.max(0, totalAmount - advancePaid);

    const newBooking = {
      id: `bkg-${Date.now()}`,
      tourId: tour.id,
      tourTitle: tour.title,
      customerName: body.customerName || 'নতুন ট্রাভেলার',
      customerPhone: body.customerPhone || '01700000000',
      pax,
      packageId: pkg.id,
      packageName: body.packageName || pkg.name,
      roomType: body.roomType || pkg.roomType || 'non_ac',
      seatNumbers: assignments.map((seat) => seat.id).join(', '),
      seatAssignments: assignments,
      includeAddon: Boolean(body.includeAddon),
      addonAmount,
      baseAmount,
      discount,
      discountReason: body.discountReason || '',
      totalAmount,
      advancePaid,
      dueAmount,
      paymentMethod: body.paymentMethod || 'bkash',
      source: body.source || 'phone_call',
      status: 'confirmed',
      createdAt: new Date().toISOString().slice(0, 10),
    };
    state.bookings = [newBooking, ...(state.bookings || [])];
    syncDemoCustomer(state, newBooking);
    const smsPreview = buildBookingConfirmationSmsText(newBooking, tour);
    if (body.sendSmsImmediately) {
      state.smsLogs = [
        {
          id: `sms-${Date.now()}`,
          recipientName: newBooking.customerName,
          phone: newBooking.customerPhone,
          message: body.customSmsText || smsPreview,
          category: 'booking_confirm',
          tourId: tour.id,
          bookingId: newBooking.id,
          status: 'delivered',
          gateway: 'Automas/MimSMS',
          encoding: 'Unicode (বাংলা)',
          segments: 2,
          sentBy: 'সালমান সাজিদ (মালিক)',
          createdAt: new Date().toISOString(),
        },
        ...(state.smsLogs || []),
      ];
    }
    saveState(state);
    return respond({
      message: 'বুকিং সফলভাবে সংরক্ষণ করা হয়েছে!',
      booking: newBooking,
      smsPreview,
      tour: enrichTour(state, tour),
    });
  }

  const bkgPatchMatch = pathname.match(/^\/api\/bookings\/([^/]+)$/);
  if (bkgPatchMatch && method === 'PATCH') {
    const idx = (state.bookings || []).findIndex((b) => b.id === bkgPatchMatch[1]);
    if (idx !== -1) {
      const b = state.bookings[idx];
      const advancePaid =
        body.advancePaid !== undefined ? Number(body.advancePaid) : b.advancePaid;
      const totalAmount =
        body.totalAmount !== undefined ? Number(body.totalAmount) : b.totalAmount;
      state.bookings[idx] = {
        ...b,
        ...body,
        advancePaid,
        totalAmount,
        dueAmount: Math.max(0, totalAmount - advancePaid),
      };
      saveState(state);
      const tour = (state.tours || []).find((t) => t.id === b.tourId);
      return respond({
        message: 'বুকিং আপডেট করা হয়েছে!',
        booking: state.bookings[idx],
        tour: enrichTour(state, tour),
      });
    }
  }

  const bkgConfirmSmsMatch = pathname.match(/^\/api\/bookings\/([^/]+)\/send-confirmation-sms$/);
  if (bkgConfirmSmsMatch && method === 'POST') {
    const b = (state.bookings || []).find((x) => x.id === bkgConfirmSmsMatch[1]);
    const tour = (state.tours || []).find((t) => t.id === b?.tourId);
    const msg = body.message || buildBookingConfirmationSmsText(b, tour);
    const log = {
      id: `sms-${Date.now()}`,
      recipientName: b?.customerName || 'ট্রাভেলার',
      phone: b?.customerPhone || '',
      message: msg,
      category: 'booking_confirm',
      status: 'delivered',
      gateway: 'Automas/MimSMS',
      segments: 2,
      sentBy: 'সালমান সাজিদ (মালিক)',
      createdAt: new Date().toISOString(),
    };
    state.smsLogs = [log, ...(state.smsLogs || [])];
    saveState(state);
    return respond({
      message: `${b?.customerName || 'ট্রাভেলার'}-এর নাম্বারে বুকিং কনফার্মেশন এসএমএস পাঠানো হয়েছে!`,
      logs: [log],
    });
  }

  const bkgFbSmsMatch = pathname.match(/^\/api\/bookings\/([^/]+)\/send-feedback-sms$/);
  if (bkgFbSmsMatch && method === 'POST') {
    const b = (state.bookings || []).find((x) => x.id === bkgFbSmsMatch[1]);
    const log = {
      id: `sms-${Date.now()}`,
      recipientName: b?.customerName || 'ট্রাভেলার',
      phone: b?.customerPhone || '',
      message:
        body.message ||
        `প্রিয় ${b?.customerName}, আমাদের ট্যুরটি আপনার কাছে কেমন লেগেছে? আপনার মতামত জানান।`,
      category: 'feedback_link',
      status: 'delivered',
      gateway: 'Automas/MimSMS',
      segments: 2,
      sentBy: 'সালমান সাজিদ (মালিক)',
      createdAt: new Date().toISOString(),
    };
    state.smsLogs = [log, ...(state.smsLogs || [])];
    saveState(state);
    return respond({
      message: `${b?.customerName || 'ট্রাভেলার'}-কে ফিডব্যাক লিংক এসএমএস পাঠানো হয়েছে!`,
      feedbackBookingId: b?.id,
    });
  }

  // 6. Inquiries & Customers
  if (pathname === '/api/inquiries' && method === 'GET') {
    return respond({ inquiries: state.inquiries || [] });
  }

  const inqPatchMatch = pathname.match(/^\/api\/inquiries\/([^/]+)$/);
  if (inqPatchMatch && method === 'PATCH') {
    const idx = (state.inquiries || []).findIndex((i) => i.id === inqPatchMatch[1]);
    if (idx !== -1) {
      state.inquiries[idx] = { ...state.inquiries[idx], ...body };
      saveState(state);
      return respond({ message: 'কুয়েরি স্ট্যাটাস আপডেট হয়েছে', inquiry: state.inquiries[idx] });
    }
  }

  const inqConvMatch = pathname.match(/^\/api\/inquiries\/([^/]+)\/convert$/);
  if (inqConvMatch && method === 'POST') {
    const inq = (state.inquiries || []).find((i) => i.id === inqConvMatch[1]);
    if (inq) {
      if (inq.seatRequestId) { const result = transport.confirmTourSeatRequest(state, inq.seatRequestId); syncDemoCustomer(state, result.booking); saveState(state); return respond(result); }
      throw new Error('Select seats in the bookings tab / বুকিং ট্যাবে সিট নির্বাচন করুন');
    }
  }

  if (pathname === '/api/customers' && method === 'GET') {
    return respond({ customers: state.customers || [] });
  }

  if (pathname === '/api/customers/lookup' && method === 'GET') {
    const q = String(query.q || query.phone || '').trim();
    const suggestions = (state.customers || []).filter(
      (c) => c.phone.includes(q) || c.name.toLowerCase().includes(q.toLowerCase())
    );
    return respond({ suggestions });
  }

  const custPatchMatch = pathname.match(/^\/api\/customers\/([^/]+)$/);
  if (custPatchMatch && method === 'PATCH') {
    const idx = (state.customers || []).findIndex((c) => c.id === custPatchMatch[1]);
    if (idx !== -1) {
      const cust = state.customers[idx];
      if (body.toggleTag) {
        const tags = new Set(cust.tags || []);
        if (tags.has(body.toggleTag)) tags.delete(body.toggleTag);
        else tags.add(body.toggleTag);
        cust.tags = Array.from(tags);
      } else {
        Object.assign(cust, body);
      }
      saveState(state);
      return respond({ message: 'কাস্টমার তথ্য ও ট্যাগ আপডেট হয়েছে', customer: cust });
    }
  }

  // 7. SMS Overview & Send
  if (pathname === '/api/sms/overview' && method === 'GET') {
    const logs = state.smsLogs || [];
    return respond({
      stats: {
        totalDispatched: logs.length,
        totalSegments: logs.reduce((s, l) => s + (Number(l.segments) || 1), 0),
        deliveredCount: logs.length,
        gatewayBalance: 4850,
        activeGateway: 'Automas Primary + MimSMS Failover',
      },
      logs,
    });
  }

  if (pathname === '/api/sms/send' && method === 'POST') {
    const recipients = body.customRecipients || [];
    const meta = measureSmsClient(body.message || '');
    const newLogs = recipients.map((r, i) => ({
      id: `sms-${Date.now()}-${i}`,
      recipientName: r.name || 'কাস্টমার',
      phone: r.phone,
      message: String(body.message || '').replace(/\{name\}/g, r.name || 'গ্রাহক'),
      category: 'promo_campaign',
      status: 'delivered',
      gateway: 'Automas/MimSMS',
      encoding: meta.encoding,
      segments: meta.segments,
      sentBy: 'সালমান সাজিদ (মালিক)',
      createdAt: new Date().toISOString(),
    }));
    state.smsLogs = [...newLogs, ...(state.smsLogs || [])];
    saveState(state);
    return respond({
      message: `মোট ${newLogs.length} জন প্রাপকের কাছে এসএমএস সফলভাবে পাঠানো হয়েছে!`,
      sentCount: newLogs.length,
      logs: newLogs,
    });
  }

  // 8. Accounting
  if (pathname === '/api/accounting/monthly' && method === 'GET') {
    return respond({ report: getMonthlyAccounting(state, query.month || '2026-10') });
  }

  const accTourMatch = pathname.match(/^\/api\/accounting\/tour-costs\/([^/]+)$/);
  if (accTourMatch && method === 'PUT') {
    const month = body.month || '2026-10';
    const rec = state.monthlyAccounting?.[month];
    if (rec) {
      const idx = (rec.tourRecords || []).findIndex((t) => t.tourId === accTourMatch[1]);
      if (idx !== -1) {
        rec.tourRecords[idx] = { ...rec.tourRecords[idx], ...body };
        saveState(state);
      }
    }
    return respond({ report: getMonthlyAccounting(state, month) });
  }

  if (pathname === '/api/accounting/expenses' && method === 'POST') {
    const month = body.month || '2026-10';
    const rec = state.monthlyAccounting?.[month];
    if (rec) {
      rec.officeExpenses = [
        ...(rec.officeExpenses || []),
        {
          id: `exp-${Date.now()}`,
          title: body.title,
          category: body.category || 'other',
          amount: Number(body.amount) || 0,
          date: new Date().toISOString().slice(0, 10),
        },
      ];
      saveState(state);
    }
    return respond({ report: getMonthlyAccounting(state, month) });
  }

  const expDelMatch = pathname.match(/^\/api\/accounting\/expenses\/([^/]+)$/);
  if (expDelMatch && method === 'DELETE') {
    const month = query.month || '2026-10';
    const rec = state.monthlyAccounting?.[month];
    if (rec) {
      rec.officeExpenses = (rec.officeExpenses || []).filter((e) => e.id !== expDelMatch[1]);
      saveState(state);
    }
    return respond({ report: getMonthlyAccounting(state, month) });
  }

  // 9. Meal Menus
  if (pathname === '/api/meal-menus' && method === 'GET') {
    return respond({ mealMenus: state.mealMenus || [] });
  }
  if (pathname === '/api/meal-menus' && method === 'POST') {
    const item = { id: `meal-${Date.now()}`, ...body };
    state.mealMenus = [...(state.mealMenus || []), item];
    saveState(state);
    return respond({ mealMenu: item, mealMenus: state.mealMenus });
  }
  const mealMatch = pathname.match(/^\/api\/meal-menus\/([^/]+)$/);
  if (mealMatch) {
    if (method === 'PUT') {
      const idx = (state.mealMenus || []).findIndex((m) => m.id === mealMatch[1]);
      if (idx !== -1) {
        state.mealMenus[idx] = { ...state.mealMenus[idx], ...body };
        saveState(state);
      }
      return respond({ mealMenus: state.mealMenus });
    }
    if (method === 'DELETE') {
      state.mealMenus = (state.mealMenus || []).filter((m) => m.id !== mealMatch[1]);
      saveState(state);
      return respond({ mealMenus: state.mealMenus });
    }
  }

  // 10. Network Contacts
  if (pathname === '/api/network-contacts' && method === 'GET') {
    return respond({ contacts: state.networkContacts || [] });
  }
  if (pathname === '/api/network-contacts' && method === 'POST') {
    const item = { id: `net-${Date.now()}`, ...body };
    state.networkContacts = [...(state.networkContacts || []), item];
    saveState(state);
    return respond({ contact: item, contacts: state.networkContacts });
  }
  const netMatch = pathname.match(/^\/api\/network-contacts\/([^/]+)$/);
  if (netMatch && method === 'DELETE') {
    state.networkContacts = (state.networkContacts || []).filter((c) => c.id !== netMatch[1]);
    saveState(state);
    return respond({ contacts: state.networkContacts });
  }

  // 11. CMS
  if (pathname === '/api/cms' && method === 'GET') {
    return respond({
      siteSettings: state.siteSettings,
      reviews: state.reviews || [],
      gallery: state.gallery || [],
      mediaLibrary: state.mediaLibrary || [],
      tours: (state.tours || []).map((t) => enrichTour(state, t)),
    });
  }
  if (pathname === '/api/cms/settings' && method === 'PUT') {
    state.siteSettings = { ...(state.siteSettings || {}), ...body };
    saveState(state);
    return respond({ siteSettings: state.siteSettings });
  }
  const revMatch = pathname.match(/^\/api\/cms\/reviews\/([^/]+)$/);
  if (revMatch && method === 'PATCH') {
    const idx = (state.reviews || []).findIndex((r) => r.id === revMatch[1]);
    if (idx !== -1) {
      state.reviews[idx] = { ...state.reviews[idx], ...body };
      saveState(state);
    }
    return respond({ review: state.reviews?.[idx] });
  }
  if (pathname === '/api/cms/gallery' && method === 'POST') {
    const item = { id: `gal-${Date.now()}`, ...body };
    state.gallery = [item, ...(state.gallery || [])];
    saveState(state);
    return respond({ item, gallery: state.gallery });
  }
  const galDelMatch = pathname.match(/^\/api\/cms\/gallery\/([^/]+)$/);
  if (galDelMatch && method === 'DELETE') {
    state.gallery = (state.gallery || []).filter((g) => g.id !== galDelMatch[1]);
    saveState(state);
    return respond({ gallery: state.gallery });
  }

  // 12. Staff
  if (pathname === '/api/staff' && method === 'GET') {
    const staff = (state.users || []).map((u) => ({
      ...u,
      assignedTours: (state.tours || []).filter((t) => (t.guideIds || []).includes(u.id)),
    }));
    return respond({ staff });
  }
  if (pathname === '/api/staff' && method === 'POST') {
    const member = {
      id: `staff-${Date.now()}`,
      name: body.name,
      role: body.role || 'guide',
      roleLabelBn:
        body.role === 'owner'
          ? 'মালিক (Owner)'
          : body.role === 'accountant'
          ? 'একাউন্ট্যান্ট (Accountant)'
          : 'ট্যুর গাইড (Tour Guide)',
      phone: body.phone,
      specialty: body.specialty || '',
      completedToursCount: 1,
      rating: 5.0,
    };
    state.users = [...(state.users || []), member];
    saveState(state);
    return respond({ member });
  }

  throw new Error(`Unsupported demo endpoint: ${method} ${pathname}`);
}
