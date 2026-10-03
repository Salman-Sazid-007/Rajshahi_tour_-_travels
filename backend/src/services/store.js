'use strict';

const fs = require('fs');
const env = require('../config/env');
const { AppError } = require('../utils/errors');
const path = require('path');
const bcrypt = require('bcryptjs');
const { buildDefaultData, calculateReturnDate } = require('../seed/defaultData');
const { dispatchSms } = require('../channels/sms');
const { toLocalBd } = require('../utils/phone');
const gsm7 = require('../utils/gsm7');
const transport = require('../../../shared/transport.cjs');

const DATA_FILE = process.env.RTT_DATA_FILE || path.resolve(__dirname, '..', '..', 'data', 'store.json');
const DATA_DIR = path.dirname(DATA_FILE);

let state = null;

function ensureLoaded() {
  if (state) return state;
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (fs.existsSync(DATA_FILE)) {
    try {
      const raw = fs.readFileSync(DATA_FILE, 'utf8');
      state = JSON.parse(raw);
      const version = state.editionDataVersion;
      transport.migrateEditionData(state);
      if (version !== state.editionDataVersion) save();
      return state;
    } catch {
      // Fallback to default seed
    }
  }
  state = buildDefaultData();
  save();
  return state;
}

function save() {
  if (!state) return;
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  fs.writeFileSync(`${DATA_FILE}.tmp`, JSON.stringify(state, null, 2), 'utf8');
  fs.renameSync(`${DATA_FILE}.tmp`, DATA_FILE);
}

function resetToDefault() {
  state = buildDefaultData();
  save();
  return state;
}

function sanitizeUser(u) {
  if (!u) return null;
  const { passwordHash, ...rest } = u;
  return rest;
}

// ── Auth & Staff ─────────────────────────────────────────────────────────────

function getUserById(id) {
  const s = ensureLoaded();
  const u = s.users.find((x) => x.id === id);
  return sanitizeUser(u);
}

function authenticateUser({ phoneOrRole, password }) {
  const s = ensureLoaded();
  const q = String(phoneOrRole || '').trim().toLowerCase();
  let user = s.users.find(
    (u) =>
      u.role === q ||
      u.phone === toLocalBd(q) ||
      (u.email && u.email.toLowerCase() === q) ||
      u.id === q
  );
  if (!user || !user.isActive) return null;
  if (env.isProd) {
    if (['owner', 'guide', 'accountant'].includes(q) || String(user.phone).startsWith('000') || !password || ['demo', '123456', `${user.role}123`].includes(password)) return null;
    return bcrypt.compareSync(password, user.passwordHash || '') ? sanitizeUser(user) : null;
  }
  if (password && password !== 'demo') {
    const valid =
      password === '123456' ||
      password === `${user.role}123` ||
      bcrypt.compareSync(password, user.passwordHash);
    if (!valid) return null;
  }
  return sanitizeUser(user);
}

function listDemoAccounts() {
  const s = ensureLoaded();
  return env.isProd ? [] : s.users.map(sanitizeUser);
}

function listStaffWithHistory() {
  const s = ensureLoaded();
  return s.users.map((u) => {
    const clean = sanitizeUser(u);
    const assignedTours = s.tours
      .filter((t) => Array.isArray(t.guideIds) && t.guideIds.includes(u.id))
      .map((t) => ({
        id: t.id,
        title: t.title,
        destination: t.destination,
        startDate: t.startDate,
        returnDate: t.returnDate,
        status: t.status,
      }));
    const completedCount = assignedTours.filter((t) => t.status === 'completed').length;
    const runningCount = assignedTours.filter((t) => t.status === 'running').length;
    const upcomingCount = assignedTours.filter((t) => t.status === 'upcoming').length;
    return {
      ...clean,
      assignedTours,
      stats: {
        totalAssigned: assignedTours.length,
        completedCount,
        runningCount,
        upcomingCount,
        totalAllowanceEarned: completedCount * (u.allowancePerTour || 0),
        rating: 4.9,
      },
    };
  });
}

function addStaff(payload) {
  const s = ensureLoaded();
  const id = `staff-${Date.now()}`;
  const name = String(payload.name || '').trim();
  const phone = toLocalBd(payload.phone || '');
  const role = ['owner', 'accountant', 'guide'].includes(payload.role) ? payload.role : 'guide';
  if (env.isProd && (String(payload.password || '').length < 12 || phone.startsWith('000') || !name || !phone)) throw new AppError(400, 'STAFF_SETUP', 'Real staff details and a password of at least 12 characters are required');
  const newStaff = {
    id,
    name,
    phone,
    email: payload.email || '',
    passwordHash: bcrypt.hashSync(payload.password || '123456', 12),
    role,
    designation:
      payload.designation ||
      (role === 'owner' ? 'মালিক' : role === 'accountant' ? 'একাউন্ট্যান্ট' : 'ট্যুর গাইড'),
    avatar: name ? name.slice(0, 2).toUpperCase() : 'ST',
    isActive: true,
    bio: payload.bio || '',
    allowancePerTour: Number(payload.allowancePerTour) || 3000,
  };
  s.users.push(newStaff);
  save();
  return sanitizeUser(newStaff);
}

function updateStaff(id, payload) {
  const s = ensureLoaded();
  const idx = s.users.findIndex((u) => u.id === id);
  if (idx === -1) return null;
  const target = s.users[idx];
  if (payload.password !== undefined) {
    if (String(payload.password).length < 12) throw new AppError(400, 'WEAK_PASSWORD', 'Use a staff password of at least 12 characters');
    target.passwordHash = bcrypt.hashSync(payload.password, 12);
  }
  if (payload.name !== undefined) target.name = String(payload.name).trim();
  if (payload.phone !== undefined) target.phone = toLocalBd(payload.phone);
  if (payload.role !== undefined) target.role = payload.role;
  if (payload.designation !== undefined) target.designation = payload.designation;
  if (payload.bio !== undefined) target.bio = payload.bio;
  if (payload.allowancePerTour !== undefined) target.allowancePerTour = Number(payload.allowancePerTour) || 0;
  if (payload.isActive !== undefined) target.isActive = Boolean(payload.isActive);
  save();
  return sanitizeUser(target);
}

// ── Tours & Booking Stats Enrichment ─────────────────────────────────────────

function enrichTour(tour) {
  const s = ensureLoaded();
  const tourBookings = s.bookings.filter((b) => b.tourId === tour.id && b.status !== 'cancelled');
  const seatsBooked = tourBookings.reduce((sum, b) => sum + (Number(b.pax) || 1), 0);
  const seatInfo = transport.getTourSeats(s, tour.id);
  const seatsRemaining = seatInfo.seatsLeft;
  const totalBillAmount = tourBookings.reduce((sum, b) => sum + (Number(b.totalAmount) || 0), 0);
  const totalCollected = tourBookings.reduce((sum, b) => sum + (Number(b.advancePaid) || 0), 0);
  const totalDue = tourBookings.reduce((sum, b) => sum + (Number(b.dueAmount) || 0), 0);

  const guides = (tour.guideIds || [])
    .map((gid) => s.users.find((u) => u.id === gid))
    .filter(Boolean)
    .map(sanitizeUser);

  const prices = (tour.packages || []).map((p) => Number(p.price) / Math.max(1, Number(p.personsPerUnit) || 1)).filter((p) => Number.isFinite(p) && p > 0);
  const startingPrice = prices.length ? Math.min(...prices) : 3800;

  return {
    ...tour,
    startingPrice,
    seatsLeft: seatsRemaining,
    bookedSeats: seatsBooked,
    totalBill: totalBillAmount,
    bus: seatInfo.bus,
    bookingsCount: tourBookings.length,
    seatsBooked,
    seatsRemaining,
    totalBillAmount,
    totalCollected,
    totalDue,
    guides,
    bookings: tourBookings,
  };
}

function listTours({ status, onlyPublished = false } = {}) {
  const s = ensureLoaded();
  let list = s.tours.map(enrichTour);
  if (onlyPublished) {
    list = list.filter((t) => t.isPublished !== false);
  }
  if (status && status !== 'all') {
    list = list.filter((t) => t.status === status);
  }
  return list.sort((a, b) => String(a.startDate).localeCompare(String(b.startDate)));
}

function getTourById(id) {
  const s = ensureLoaded();
  const t = s.tours.find((x) => x.id === id || x.slug === id);
  return t ? enrichTour(t) : null;
}

function computeBudgetAndBreakEven(budgetInput = {}, packages = [], totalSeats = 40) {
  const foodCostPerPerson = Number(budgetInput.foodCostPerPerson) || 90;
  const foodTotal = Number(budgetInput.foodTotal) || 0;
  const busCost = Number(budgetInput.busCost) || 0;
  const hotelCost = Number(budgetInput.hotelCost) || 0;
  const localTransportCost = Number(budgetInput.localTransportCost) || 0;
  const guideCost = Number(budgetInput.guideCost) || 0;
  const marketingCost = Number(budgetInput.marketingCost) || 0;
  const otherCost = Number(budgetInput.otherCost) || 0;

  const calculatedSum =
    foodTotal + busCost + hotelCost + localTransportCost + guideCost + marketingCost + otherCost;
  const totalBudget =
    Number(budgetInput.totalBudget) > 0 ? Number(budgetInput.totalBudget) : calculatedSum;

  // Base per-person package price for break-even calculation
  const sharedPkg =
    (packages || []).find((p) => p.personsPerUnit === 1) || (packages || [])[0] || { price: 3800, personsPerUnit: 1 };
  const perPersonRevenue =
    (Number(sharedPkg.price) || 3800) / Math.max(1, Number(sharedPkg.personsPerUnit) || 1);

  const minTravelersToBreakEven =
    Number(budgetInput.minTravelersToBreakEven) > 0
      ? Number(budgetInput.minTravelersToBreakEven)
      : perPersonRevenue > 0
      ? Math.min(totalSeats, Math.ceil(totalBudget / perPersonRevenue))
      : 35;

  return {
    foodCostPerPerson,
    foodTotal,
    busCost,
    hotelCost,
    localTransportCost,
    guideCost,
    marketingCost,
    otherCost,
    totalBudget,
    minTravelersToBreakEven,
  };
}

function createTour(payload) {
  const s = ensureLoaded();
  const id = `tour-${Date.now()}`;
  const days = Number(payload.days) || 2;
  const nights = Number(payload.nights) || 3;
  const startDate = payload.startDate || transport.todayDhaka();
  const returnDate = payload.returnDate || calculateReturnDate(startDate, days, nights);
  const totalSeats = Number(payload.totalSeats) || 40;
  const packages =
    Array.isArray(payload.packages) && payload.packages.length
      ? payload.packages.map((p, idx) => ({
          id: p.id || `pkg-${Date.now()}-${idx}`,
          name: p.name || 'শেয়ারিং প্যাকেজ',
          type: p.type || 'shared_4',
          roomType: p.roomType || 'non_ac',
          personsPerUnit: Number(p.personsPerUnit) || (p.type === 'couple' ? 2 : 1),
          price: Number(p.price) || 3800,
          description: p.description || '',
        }))
      : [
          {
            id: `pkg-${Date.now()}-1`,
            name: 'কাপল প্যাকেজ (২ জন এক রুমে)',
            type: 'couple',
            roomType: 'non_ac',
            personsPerUnit: 2,
            price: 15000,
            description: '২ জন এক রুমে',
          },
          {
            id: `pkg-${Date.now()}-2`,
            name: 'সিঙ্গেল পারসন (৪ জন এক রুমে)',
            type: 'shared_4',
            roomType: 'non_ac',
            personsPerUnit: 1,
            price: 3800,
            description: '৪ জন এক রুমে (জনপ্রতি)',
          },
        ];

  const addons = Array.isArray(payload.addons)
    ? payload.addons.map((a, idx) => ({
        id: a.id || `addon-${Date.now()}-${idx}`,
        name: a.name || 'প্রবেশ টিকিট',
        price: Number(a.price) || 200,
        mandatory: Boolean(a.mandatory),
      }))
    : [];

  const budget = computeBudgetAndBreakEven(payload.budget || {}, packages, totalSeats);

  const newTour = {
    id,
    title: String(payload.title || 'নতুন ট্যুর').trim(),
    slug: `tour-${Date.now()}`,
    destination: String(payload.destination || 'সাজেক ভ্যালি').trim(),
    status: payload.status || 'upcoming',
    isPublished: payload.isPublished !== false,
    isFeatured: Boolean(payload.isFeatured),
    startDate,
    days,
    nights,
    returnDate,
    departureLocation: payload.departureLocation || 'সপুরা মোড়, রাজশাহী',
    totalSeats,
    busId: payload.busId || '',
    titleEn: String(payload.titleEn || '').trim(),
    destinationEn: String(payload.destinationEn || '').trim(),
    coverImage: payload.coverImage || '/media/sajek-1.webp',
    posterImage: payload.posterImage || '/media/sajek-poster.svg',
    galleryImages:
      Array.isArray(payload.galleryImages) && payload.galleryImages.length
        ? payload.galleryImages
        : ['/media/sajek-1.webp', '/media/sajek-2.jpg', '/media/sajek-3.jpg'],
    packages,
    addons,
    transport: {
      primary: payload.transport?.primary || 'নন-এসি বাস (Non-AC Bus)',
      local: payload.transport?.local || 'চাঁদের গাড়ি (Chander Gari)',
      notes: payload.transport?.notes || '',
    },
    guideIds: Array.isArray(payload.guideIds) ? payload.guideIds : ['staff-guide-1'],
    mealPlan: Array.isArray(payload.mealPlan) ? payload.mealPlan : [],
    itinerary: Array.isArray(payload.itinerary) ? payload.itinerary : [],
    marketingCaption: payload.marketingCaption || '',
    budget,
  };

  transport.validateTourBus(s, newTour);

  if (newTour.isFeatured) {
    s.tours.forEach((t) => {
      t.isFeatured = false;
    });
    s.siteSettings.highlightedTourId = newTour.id;
  }

  s.tours.unshift(newTour);

  // Also register in monthlyAccounting if startDate month exists
  const monthKey = String(startDate).slice(0, 7);
  if (!s.monthlyAccounting[monthKey]) {
    s.monthlyAccounting[monthKey] = {
      month: monthKey,
      labelBn: monthKey,
      tourRecords: [],
      officeExpenses: [],
    };
  }
  s.monthlyAccounting[monthKey].tourRecords.push({
    tourId: newTour.id,
    tourTitle: newTour.title,
    startDate: newTour.startDate,
    travelersCount: budget.minTravelersToBreakEven,
    plannedBudget: budget.totalBudget,
    totalIncome: 0,
    busCost: budget.busCost,
    hotelCost: budget.hotelCost,
    foodCost: budget.foodTotal,
    guideCost: budget.guideCost,
    boatAndLocalCost: budget.localTransportCost,
    marketingCost: budget.marketingCost,
  });

  save();
  return enrichTour(newTour);
}

function updateTour(id, payload) {
  const s = ensureLoaded();
  const idx = s.tours.findIndex((t) => t.id === id);
  if (idx === -1) return null;
  const current = s.tours[idx];

  const days = payload.days !== undefined ? Number(payload.days) : current.days;
  const nights = payload.nights !== undefined ? Number(payload.nights) : current.nights;
  const startDate = payload.startDate !== undefined ? payload.startDate : current.startDate;
  const returnDate =
    payload.returnDate || calculateReturnDate(startDate, days, nights);
  const totalSeats =
    payload.totalSeats !== undefined ? Number(payload.totalSeats) : current.totalSeats;
  const packages = payload.packages !== undefined ? payload.packages : current.packages;
  const budget =
    payload.budget !== undefined
      ? computeBudgetAndBreakEven(payload.budget, packages, totalSeats)
      : current.budget;

  const updated = {
    ...current,
    ...payload,
    id: current.id,
    days,
    nights,
    startDate,
    returnDate,
    totalSeats,
    packages,
    budget,
  };

  transport.validateTourBus(s, updated);
  const activeBookings = s.bookings.filter((b) => b.tourId === id && b.status !== "cancelled");
  if (updated.busId !== current.busId && activeBookings.length) throw new transport.TransportError("BUS_IN_USE", "Cannot change bus with existing bookings / বুকিং থাকা ট্যুরের বাস বদলানো যাবে না", 409);
  if (activeBookings.reduce((sum, b) => sum + b.pax, 0) > Number(updated.totalSeats)) throw new transport.TransportError("CAPACITY", "Capacity is below existing bookings / বুকিংয়ের চেয়ে সিট কম", 409);

  if (payload.isFeatured) {
    s.tours.forEach((t) => {
      t.isFeatured = t.id === current.id;
    });
    s.siteSettings.highlightedTourId = current.id;
  }

  s.tours[idx] = updated;
  save();
  return enrichTour(updated);
}

function deleteTour(id) {
  const s = ensureLoaded();
  const idx = s.tours.findIndex((t) => t.id === id);
  if (idx === -1) return false;
  s.tours.splice(idx, 1);
  save();
  return true;
}

// ── Bookings & Customer Auto-Upsert ──────────────────────────────────────────

function syncCustomerFromBooking(booking, tourTitle) {
  const s = ensureLoaded();
  const phone = toLocalBd(booking.customerPhone);
  let cust = s.customers.find((c) => toLocalBd(c.phone) === phone);
  if (!cust) {
    cust = {
      id: `cust-${Date.now()}`,
      name: booking.customerName,
      phone,
      email: '',
      address: 'রাজশাহী',
      tags: ['new'],
      toursCompleted: tourTitle ? [tourTitle] : [],
      totalBookings: 1,
      totalSpent: Number(booking.totalAmount) || 0,
      totalDue: Number(booking.dueAmount) || 0,
      notes: 'বুকিং থেকে অটোমেটিক যুক্ত কাস্টমার',
    };
    s.customers.unshift(cust);
  } else {
    cust.name = booking.customerName || cust.name;
    if (tourTitle && !cust.toursCompleted.includes(tourTitle)) {
      cust.toursCompleted.push(tourTitle);
    }
    const custBookings = s.bookings.filter(
      (b) => toLocalBd(b.customerPhone) === phone && b.status !== 'cancelled'
    );
    cust.totalBookings = custBookings.length;
    cust.totalSpent = custBookings.reduce((sum, b) => sum + (Number(b.totalAmount) || 0), 0);
    cust.totalDue = custBookings.reduce((sum, b) => sum + (Number(b.dueAmount) || 0), 0);
    if (cust.totalBookings >= 2 && !cust.tags.includes('repeat')) {
      cust.tags = cust.tags.filter((t) => t !== 'new');
      cust.tags.push('repeat');
    }
    if (cust.totalBookings >= 3 && !cust.tags.includes('loyal')) {
      cust.tags.push('loyal');
    }
  }
  return cust;
}

function buildBookingConfirmationSmsText(booking, tour) {
  const tourName = tour ? tour.title.split('—')[0].trim() : 'গ্রুপ ট্যুর';
  const dateStr = tour ? tour.startDate : '';
  return `প্রিয় ${booking.customerName}, ${tourName} (${dateStr}) ট্যুরে আপনার ${booking.pax} জনের বুকিং কনফার্ম করা হয়েছে। মোট বিল: ৳${booking.totalAmount.toLocaleString('en-IN')}, জমা দেওয়া হয়েছে: ৳${booking.advancePaid.toLocaleString('en-IN')}, বাকি থাকলো: ৳${booking.dueAmount.toLocaleString('en-IN')}। ধন্যবাদ - রাজশাহী ট্যুরস এন্ড ট্রাভেলস।`;
}

function createBooking(payload) {
  const s = ensureLoaded();
  const tour = s.tours.find((t) => t.id === payload.tourId);
  if (!tour) throw new transport.TransportError('TOUR_NOT_FOUND', 'Tour not found / ট্যুর পাওয়া যায়নি', 404);
  const assignments = transport.validateTourBooking(s, tour.id, payload);
  const phone = toLocalBd(payload.customerPhone || '');
  const pax = Math.max(1, Number(payload.pax) || 1);

  const selectedPkg =
    (tour?.packages || []).find((p) => p.id === payload.packageId) ||
    (tour?.packages || [])[0] || {
      id: 'pkg-default',
      name: 'শেয়ারিং প্যাকেজ',
      price: 3800,
      personsPerUnit: 1,
    };

  const packageUnitPrice =
    payload.packageUnitPrice !== undefined
      ? Number(payload.packageUnitPrice)
      : Number(selectedPkg.price) || 3800;

  const units =
    selectedPkg.type === 'couple'
      ? Math.max(1, Math.ceil(pax / 2))
      : pax;

  const basePrice =
    payload.baseAmount !== undefined
      ? Number(payload.baseAmount)
      : packageUnitPrice * units;

  const extraCharge = Number(payload.extraCharge) || 0;
  const discount = Number(payload.discount) || 0;
  const totalAmount =
    payload.totalAmount !== undefined
      ? Number(payload.totalAmount)
      : Math.max(0, basePrice + extraCharge - discount);
  const advancePaid = Number(payload.advancePaid) || 0;
  const dueAmount = Math.max(0, totalAmount - advancePaid);

  const booking = {
    id: transport.uid('bk'),
    bookingCode: `RTT-${Math.floor(300 + Math.random() * 699)}`,
    tourId: tour.id,
    customerId: payload.customerId || '',
    customerName: String(payload.customerName || 'ট্রাভেলার').trim(),
    customerPhone: phone,
    pax,
    seatNumbers: assignments.length ? assignments.map((seat) => seat.id).join(', ') : payload.seatNumbers || '',
    seatAssignments: assignments,
    packageId: selectedPkg.id,
    packageName: selectedPkg.name,
    packageUnitPrice,
    addonsSelected: Array.isArray(payload.addonsSelected) ? payload.addonsSelected : [],
    extraCharge,
    discount,
    discountReason: payload.discountReason || '',
    totalAmount,
    advancePaid,
    dueAmount,
    paymentMethod: payload.paymentMethod || 'bkash',
    source: payload.source || 'phone',
    status: 'confirmed',
    notes: payload.notes || '',
    feedbackSubmitted: false,
    createdAt: new Date().toISOString(),
  };

  s.bookings.unshift(booking);
  const cust = syncCustomerFromBooking(booking, tour.title);
  booking.customerId = cust.id;
  save();

  const smsPreview = buildBookingConfirmationSmsText(booking, tour);
  return { booking, customer: cust, smsPreview };
}

function updateBooking(id, payload) {
  const s = ensureLoaded();
  const idx = s.bookings.findIndex((b) => b.id === id || b.bookingCode === id);
  if (idx === -1) return null;
  const current = s.bookings[idx];

  if (payload.collectDueAmount !== undefined) {
    const addPaid = Number(payload.collectDueAmount) || 0;
    current.advancePaid += addPaid;
    current.dueAmount = Math.max(0, current.totalAmount - current.advancePaid);
  }
  if (payload.seatAssignments !== undefined) {
    const assignments = transport.validateTourBooking(s, current.tourId, { ...current, ...payload }, current.id);
    current.seatAssignments = assignments;
    current.seatNumbers = assignments.map((seat) => seat.id).join(", ");
  } else if (payload.seatNumbers !== undefined && s.tours.find((t) => t.id === current.tourId)?.busId) {
    throw new transport.TransportError("SEATS_REQUIRED", "Use the seat map to update seats / সিট ম্যাপ ব্যবহার করুন");
  }
  if (payload.status === "confirmed" && current.status === "cancelled") transport.validateTourBooking(s, current.tourId, { ...current, ...payload }, current.id);
  if (payload.status !== undefined) current.status = payload.status;
  if (payload.notes !== undefined) current.notes = payload.notes;
  if (payload.paymentMethod !== undefined) current.paymentMethod = payload.paymentMethod;

  const tour = s.tours.find((t) => t.id === current.tourId);
  syncCustomerFromBooking(current, tour?.title);
  save();
  return current;
}

function getBookingById(id) {
  const s = ensureLoaded();
  const b = s.bookings.find((x) => x.id === id || x.bookingCode === id);
  if (!b) return null;
  const tour = s.tours.find((t) => t.id === b.tourId);
  return { ...b, tour };
}

function listBookings({ tourId, search } = {}) {
  const s = ensureLoaded();
  let list = s.bookings.map((b) => {
    const tour = s.tours.find((t) => t.id === b.tourId);
    return {
      ...b,
      tourTitle: tour?.title || '',
      tourStartDate: tour?.startDate || '',
      tourDestination: tour?.destination || '',
    };
  });
  if (tourId && tourId !== 'all') {
    list = list.filter((b) => b.tourId === tourId);
  }
  if (search) {
    const q = String(search).toLowerCase();
    list = list.filter(
      (b) =>
        b.customerName.toLowerCase().includes(q) ||
        b.customerPhone.includes(q) ||
        b.bookingCode.toLowerCase().includes(q)
    );
  }
  return list;
}

// ── Website Queries / Inquiries ──────────────────────────────────────────────

function listInquiries({ status } = {}) {
  const s = ensureLoaded();
  let list = [...s.inquiries];
  if (status && status !== 'all') {
    list = list.filter((i) => i.status === status);
  }
  return list;
}

function createInquiry(payload) {
  const s = ensureLoaded();
  const tour = s.tours.find((t) => t.id === payload.tourId);
  const inq = {
    id: `inq-${Date.now()}`,
    tourId: payload.tourId || tour?.id || '',
    tourTitle: payload.tourTitle || tour?.title || 'জেনারেল ট্যুর কুয়েরি',
    name: String(payload.name || '').trim(),
    phone: toLocalBd(payload.phone || ''),
    pax: Math.max(1, Number(payload.pax) || 1),
    preferredPackage: payload.preferredPackage || '',
    message: payload.message || '',
    status: 'new',
    adminNote: '',
    createdAt: new Date().toISOString(),
  };
  s.inquiries.unshift(inq);
  save();
  return inq;
}

function updateInquiry(id, payload) {
  const s = ensureLoaded();
  const idx = s.inquiries.findIndex((i) => i.id === id);
  if (idx === -1) return null;
  const target = s.inquiries[idx];
  if (payload.status !== undefined) target.status = payload.status;
  if (payload.adminNote !== undefined) target.adminNote = payload.adminNote;
  save();
  return target;
}

// ── Customers CRM ────────────────────────────────────────────────────────────

function listCustomers({ tag, search } = {}) {
  const s = ensureLoaded();
  let list = [...s.customers];
  if (tag && tag !== 'all') {
    list = list.filter((c) => Array.isArray(c.tags) && c.tags.includes(tag));
  }
  if (search) {
    const q = String(search).toLowerCase();
    list = list.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.phone.includes(q) ||
        (c.address && c.address.toLowerCase().includes(q))
    );
  }
  return list;
}

function lookupCustomersByPhone(phoneQuery = '') {
  const s = ensureLoaded();
  const q = String(phoneQuery || '').trim();
  if (!q) return s.customers.slice(0, 6);
  const digits = q.replace(/\D/g, '');
  return s.customers.filter(
    (c) =>
      (digits && c.phone.includes(digits)) ||
      c.name.toLowerCase().includes(q.toLowerCase())
  );
}

function updateCustomer(id, payload) {
  const s = ensureLoaded();
  const idx = s.customers.findIndex((c) => c.id === id);
  if (idx === -1) return null;
  const c = s.customers[idx];
  if (payload.name !== undefined) c.name = payload.name;
  if (payload.phone !== undefined) c.phone = toLocalBd(payload.phone);
  if (payload.address !== undefined) c.address = payload.address;
  if (payload.notes !== undefined) c.notes = payload.notes;
  if (Array.isArray(payload.tags)) c.tags = payload.tags;
  if (payload.toggleTag) {
    const t = payload.toggleTag;
    if (c.tags.includes(t)) {
      c.tags = c.tags.filter((x) => x !== t);
    } else {
      c.tags.push(t);
    }
  }
  save();
  return c;
}

function createCustomer(payload) {
  const s = ensureLoaded();
  const phone = toLocalBd(payload.phone || '');
  const existing = s.customers.find((c) => c.phone === phone);
  if (existing) {
    return updateCustomer(existing.id, payload);
  }
  const cust = {
    id: `cust-${Date.now()}`,
    name: String(payload.name || '').trim(),
    phone,
    email: payload.email || '',
    address: payload.address || 'রাজশাহী',
    tags: Array.isArray(payload.tags) && payload.tags.length ? payload.tags : ['loyal'],
    toursCompleted: Array.isArray(payload.toursCompleted) ? payload.toursCompleted : [],
    totalBookings: Number(payload.totalBookings) || 1,
    totalSpent: Number(payload.totalSpent) || 0,
    totalDue: Number(payload.totalDue) || 0,
    notes: payload.notes || '',
  };
  s.customers.unshift(cust);
  save();
  return cust;
}

// ── SMS Dispatch & Campaign Tracking ─────────────────────────────────────────

async function sendAndRecordSms({
  recipients = [],
  message = '',
  category = 'manual',
  tourId = '',
  bookingId = '',
  sentBy = 'সালমান সাজিদ (মালিক)',
}) {
  const s = ensureLoaded();
  const text = String(message || '').trim();
  const meta = gsm7.measure(text);
  const results = [];

  for (const r of recipients) {
    const phone = toLocalBd(typeof r === 'string' ? r : r.phone);
    const name = typeof r === 'object' && r.name ? r.name : '';
    if (!phone) continue;
    const personalized = name ? text.replace(/\{name\}/g, name) : text;
    const gw = await dispatchSms({ phone, text: personalized });
    const logEntry = {
      id: `sms-${Date.now()}-${Math.floor(100 + Math.random() * 899)}`,
      recipientName: name || 'ট্রাভেলার',
      phone,
      message: personalized,
      category,
      tourId,
      bookingId,
      status: gw.status || 'delivered',
      gateway: gw.gateway || 'Automas/MimSMS',
      encoding: meta.encoding,
      segments: meta.segments,
      sentBy,
      createdAt: new Date().toISOString(),
    };
    s.smsLogs.unshift(logEntry);
    results.push(logEntry);
  }

  save();
  return {
    sentCount: results.length,
    encoding: meta.encoding,
    segmentsPerMessage: meta.segments,
    totalSegments: results.length * meta.segments,
    logs: results,
  };
}

function getSmsOverview() {
  const s = ensureLoaded();
  const totalSent = s.smsLogs.length;
  const totalSegments = s.smsLogs.reduce((sum, l) => sum + (Number(l.segments) || 1), 0);
  return {
    stats: {
      totalDispatched: totalSent,
      totalSegments,
      deliveredCount: s.smsLogs.filter((l) => l.status === 'delivered').length,
      gatewayBalance: 4850,
      activeGateway: 'Automas Primary + MimSMS Failover',
    },
    logs: s.smsLogs,
  };
}

// ── Accounting & Monthly P&L ─────────────────────────────────────────────────

function getMonthlyAccounting(month = '2026-10') {
  const s = ensureLoaded();
  const record = s.monthlyAccounting[month] || {
    month,
    labelBn: month === '2026-10' ? 'অক্টোবর ২০২৬' : month === '2026-09' ? 'সেপ্টেম্বর ২০২৬' : month,
    tourRecords: [],
    officeExpenses: [],
  };

  const enrichedTours = record.tourRecords.map((tr) => {
    // Also check live bookings for this tour
    const liveBookings = s.bookings.filter((b) => b.tourId === tr.tourId && b.status !== 'cancelled');
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
    availableMonths: Object.keys(s.monthlyAccounting).sort().reverse(),
    tourRecords: enrichedTours,
    officeExpenses: record.officeExpenses || [],
    summary: {
      ...totals,
      totalOfficeExpenses,
      netProfit,
    },
  };
}

function updateTourAccountingRecord(month, tourId, payload) {
  const s = ensureLoaded();
  if (!s.monthlyAccounting[month]) return null;
  const list = s.monthlyAccounting[month].tourRecords;
  const idx = list.findIndex((r) => r.tourId === tourId);
  if (idx === -1) return null;
  const target = list[idx];
  ['plannedBudget', 'totalIncome', 'busCost', 'hotelCost', 'foodCost', 'guideCost', 'boatAndLocalCost', 'marketingCost'].forEach(
    (key) => {
      if (payload[key] !== undefined) target[key] = Number(payload[key]) || 0;
    }
  );
  save();
  return getMonthlyAccounting(month);
}

function addOfficeExpense(month, payload) {
  const s = ensureLoaded();
  if (!s.monthlyAccounting[month]) {
    s.monthlyAccounting[month] = {
      month,
      labelBn: month,
      tourRecords: [],
      officeExpenses: [],
    };
  }
  const exp = {
    id: `exp-${Date.now()}`,
    month,
    title: String(payload.title || 'অফিস খরচ').trim(),
    category: payload.category || 'other',
    amount: Number(payload.amount) || 0,
    date: payload.date || `${month}-01`,
    notes: payload.notes || '',
  };
  s.monthlyAccounting[month].officeExpenses.push(exp);
  save();
  return getMonthlyAccounting(month);
}

function deleteOfficeExpense(month, expenseId) {
  const s = ensureLoaded();
  if (!s.monthlyAccounting[month]) return null;
  s.monthlyAccounting[month].officeExpenses = s.monthlyAccounting[month].officeExpenses.filter(
    (e) => e.id !== expenseId
  );
  save();
  return getMonthlyAccounting(month);
}

// ── Meal Menus & Network Contacts ────────────────────────────────────────────

function listMealMenus() {
  return ensureLoaded().mealMenus;
}

function createMealMenu(payload) {
  const s = ensureLoaded();
  const categoryMap = {
    breakfast: 'সকালের নাস্তা (Breakfast)',
    lunch: 'দুপুরের খাবার (Lunch)',
    dinner: 'রাতের খাবার (Dinner)',
    snacks: 'বিকালের নাস্তা (Snacks)',
  };
  const category = payload.category || 'breakfast';
  const item = {
    id: `meal-${Date.now()}`,
    name: String(payload.name || '').trim(),
    category,
    categoryLabel: categoryMap[category] || 'খাবার মেনু',
    costPerPerson: Number(payload.costPerPerson) || 90,
    items: payload.items || '',
    isPopular: Boolean(payload.isPopular),
  };
  s.mealMenus.unshift(item);
  save();
  return item;
}

function updateMealMenu(id, payload) {
  const s = ensureLoaded();
  const idx = s.mealMenus.findIndex((m) => m.id === id);
  if (idx === -1) return null;
  s.mealMenus[idx] = { ...s.mealMenus[idx], ...payload, id };
  save();
  return s.mealMenus[idx];
}

function deleteMealMenu(id) {
  const s = ensureLoaded();
  s.mealMenus = s.mealMenus.filter((m) => m.id !== id);
  save();
  return true;
}

function listNetworkContacts({ destination, category } = {}) {
  const s = ensureLoaded();
  let list = [...s.networkContacts];
  if (destination && destination !== 'all') {
    list = list.filter((c) => c.destination.includes(destination));
  }
  if (category && category !== 'all') {
    list = list.filter((c) => c.category === category);
  }
  return list;
}

function createNetworkContact(payload) {
  const s = ensureLoaded();
  const item = {
    id: `net-${Date.now()}`,
    name: String(payload.name || '').trim(),
    role: payload.role || 'হোটেল ও ট্রান্সপোর্ট পার্টনার',
    category: payload.category || 'hotel',
    destination: payload.destination || 'সাজেক ভ্যালি',
    phone: toLocalBd(payload.phone || ''),
    altPhone: payload.altPhone ? toLocalBd(payload.altPhone) : '',
    address: payload.address || '',
    notes: payload.notes || '',
    rating: Number(payload.rating) || 4.8,
  };
  s.networkContacts.unshift(item);
  save();
  return item;
}

function updateNetworkContact(id, payload) {
  const s = ensureLoaded();
  const idx = s.networkContacts.findIndex((c) => c.id === id);
  if (idx === -1) return null;
  s.networkContacts[idx] = { ...s.networkContacts[idx], ...payload, id };
  save();
  return s.networkContacts[idx];
}

function deleteNetworkContact(id) {
  const s = ensureLoaded();
  s.networkContacts = s.networkContacts.filter((c) => c.id !== id);
  save();
  return true;
}

// ── Website CMS, Reviews, Gallery & Feedback ─────────────────────────────────

function getCmsState() {
  const s = ensureLoaded();
  return {
    siteSettings: s.siteSettings,
    reviews: s.reviews,
    gallery: s.gallery,
    mediaLibrary: s.mediaLibrary,
  };
}

function updateSiteSettings(payload) {
  const s = ensureLoaded();
  s.siteSettings = {
    ...s.siteSettings,
    ...payload,
    stats: {
      ...(s.siteSettings.stats || {}),
      ...(payload.stats || {}),
    },
  };
  if (payload.highlightedTourId) {
    s.tours.forEach((t) => {
      t.isFeatured = t.id === payload.highlightedTourId;
    });
  }
  save();
  return s.siteSettings;
}

function createReview(payload) {
  const s = ensureLoaded();
  const rev = {
    id: `rev-${Date.now()}`,
    customerName: String(payload.customerName || 'ট্রাভেলার').trim(),
    customerLocation: payload.customerLocation || 'রাজশাহী',
    tourTitle: payload.tourTitle || 'সাজেক ভ্যালি ট্যুর',
    rating: Number(payload.rating) || 5,
    verdictLabel: payload.verdictLabel || 'অসাধারণ, আবারও যাব!',
    likedTags: Array.isArray(payload.likedTags) ? payload.likedTags : ['খাবার ভালো ছিল', 'গাইড ভালো ছিল'],
    comment: String(payload.comment || '').trim(),
    isVisibleOnWebsite: payload.isVisibleOnWebsite !== false,
    createdAt: new Date().toISOString(),
  };
  s.reviews.unshift(rev);
  save();
  return rev;
}

function updateReview(id, payload) {
  const s = ensureLoaded();
  const idx = s.reviews.findIndex((r) => r.id === id);
  if (idx === -1) return null;
  s.reviews[idx] = { ...s.reviews[idx], ...payload, id };
  save();
  return s.reviews[idx];
}

function deleteReview(id) {
  const s = ensureLoaded();
  s.reviews = s.reviews.filter((r) => r.id !== id);
  save();
  return true;
}

function submitTravelerFeedback(bookingId, payload) {
  const s = ensureLoaded();
  const booking = s.bookings.find((b) => b.id === bookingId || b.bookingCode === bookingId);
  const tour = booking ? s.tours.find((t) => t.id === booking.tourId) : s.tours[0];

  if (booking) {
    booking.feedbackSubmitted = true;
  }

  const rev = createReview({
    customerName: payload.customerName || booking?.customerName || 'ইসরাত জাহান',
    customerLocation: payload.customerLocation || 'রাজশাহী',
    tourTitle: payload.tourTitle || tour?.title || 'সাজেক ভ্যালি ও খাগড়াছড়ি ট্যুর',
    rating: Number(payload.rating) || 5,
    verdictLabel: payload.verdictLabel || 'অসাধারণ, আবারও যাব!',
    likedTags: payload.likedTags || ['খাবার ভালো ছিল', 'গাইড ভালো ছিল', 'বাস ভালো ছিল'],
    comment: payload.comment || '',
    isVisibleOnWebsite: true,
  });

  save();
  return rev;
}

function addGalleryItem(payload) {
  const s = ensureLoaded();
  const item = {
    id: `gal-${Date.now()}`,
    title: String(payload.title || 'ট্যুর গ্যালারি ছবি').trim(),
    destination: payload.destination || 'সাজেক ভ্যালি',
    imageUrl: payload.imageUrl || '/media/sajek-1.webp',
    capturedBy: payload.capturedBy || 'মনিরুল ভাই (ট্যুর গাইড)',
    type: payload.type || 'photo',
    date: payload.date || 'অক্টোবর ২০২৬',
  };
  s.gallery.unshift(item);
  if (item.imageUrl && !s.mediaLibrary.some((m) => m.url === item.imageUrl)) {
    s.mediaLibrary.unshift({
      id: `med-${Date.now()}`,
      label: item.title,
      url: item.imageUrl,
      kind: 'cover',
    });
  }
  save();
  return item;
}

function deleteGalleryItem(id) {
  const s = ensureLoaded();
  s.gallery = s.gallery.filter((g) => g.id !== id);
  save();
  return true;
}

function addMediaItem(payload) {
  const s = ensureLoaded();
  const item = {
    id: `med-${Date.now()}`,
    label: String(payload.label || 'নতুন আপলোডকৃত ছবি').trim(),
    url: payload.url,
    kind: payload.kind || 'cover',
  };
  s.mediaLibrary.unshift(item);
  save();
  return item;
}

module.exports = {
  ensureLoaded,
  save,
  resetToDefault,
  calculateReturnDate,
  getUserById,
  authenticateUser,
  listDemoAccounts,
  listStaffWithHistory,
  addStaff,
  updateStaff,
  listTours,
  getTourById,
  createTour,
  updateTour,
  deleteTour,
  createBooking,
  syncCustomerFromBooking,
  updateBooking,
  getBookingById,
  listBookings,
  buildBookingConfirmationSmsText,
  listInquiries,
  createInquiry,
  updateInquiry,
  listCustomers,
  lookupCustomersByPhone,
  updateCustomer,
  createCustomer,
  sendAndRecordSms,
  getSmsOverview,
  getMonthlyAccounting,
  updateTourAccountingRecord,
  addOfficeExpense,
  deleteOfficeExpense,
  listMealMenus,
  createMealMenu,
  updateMealMenu,
  deleteMealMenu,
  listNetworkContacts,
  createNetworkContact,
  updateNetworkContact,
  deleteNetworkContact,
  getCmsState,
  updateSiteSettings,
  createReview,
  updateReview,
  deleteReview,
  submitTravelerFeedback,
  addGalleryItem,
  deleteGalleryItem,
  addMediaItem,
};
