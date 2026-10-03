'use strict';

// One deterministic engine is used by the API and the static browser demo.
// All money is calculated here, never accepted from the public client.
const CONTACT = '01782250709';
const WHATSAPP = '8801782250709';
const TOUR_SEAT_LIMIT = 10;
const ACTIVE_TICKET_STATUSES = ['pending', 'confirmed'];

class TransportError extends Error {
  constructor(code, message, statusCode = 400) {
    super(message); this.name = 'TransportError'; this.code = code; this.statusCode = statusCode;
  }
}
const fail = (code, message, statusCode) => { throw new TransportError(code, message, statusCode); };
const uid = (prefix) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

function todayDhaka(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Dhaka', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}
function validDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value || '') && !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
}
function seatIds(layout = 'express46') {
  const rows = 'ABCDEFGHIJ'.split('').flatMap((row) => [1, 2, 3, 4].map((n) => `${row}-${n}`));
  return layout === 'express46' ? ['1', ...rows, ...[1, 2, 3, 4, 5].map((n) => `K-${n}`)] : rows;
}
function normalizeSeat(id) {
  const str = String(id || '').trim().toUpperCase();
  return /^[A-K][1-5]$/.test(str) ? `${str[0]}-${str.slice(1)}` : str;
}
function defaultBus() {
  return {
    id: 'bus-rajshahi-express', name: 'Rajshahi Express', nameBn: 'রাজশাহী এক্সপ্রেস',
    registration: '', layout: 'express46', status: 'active', maintenanceFrom: '', maintenanceTo: '',
    maintenanceNote: '', services: [
      { id: 'rajshahi-dhaka', from: 'Rajshahi', to: 'Dhaka', departureTime: '', fare: 0, boardingPoint: '', enabled: false, days: [0,1,2,3,4,5,6] },
      { id: 'dhaka-rajshahi', from: 'Dhaka', to: 'Rajshahi', departureTime: '', fare: 0, boardingPoint: '', enabled: false, days: [0,1,2,3,4,5,6] },
    ],
  };
}
function ensureTransport(state) {
  if (!Array.isArray(state.buses)) state.buses = [defaultBus()];
  if (!Array.isArray(state.busTickets)) state.busTickets = [];
  if (!Array.isArray(state.busOverrides)) state.busOverrides = [];
  if (!Array.isArray(state.tourSeatRequests)) state.tourSeatRequests = [];
  return state;
}
function getBus(state, id) {
  ensureTransport(state);
  const bus = state.buses.find((b) => b.id === id);
  if (!bus) fail('BUS_NOT_FOUND', 'Bus not found / বাস পাওয়া যায়নি', 404);
  return bus;
}
function activeRequest(request, now = Date.now()) {
  return request.status === 'approved' || (request.status === 'pending' && Date.parse(request.expiresAt) > now);
}
function bookedTourSeats(state, tourId, excludeBookingId = null, now = Date.now(), excludeRequestId = null) {
  ensureTransport(state);
  const seats = [];
  for (const booking of state.bookings || []) {
    if (booking.tourId !== tourId || booking.status === 'cancelled' || booking.id === excludeBookingId) continue;
    const assigned = Array.isArray(booking.seatAssignments) ? booking.seatAssignments : (Array.isArray(booking.seatNumbers) ? booking.seatNumbers : String(booking.seatNumbers || '').split(/[ ,]+/)).filter(Boolean).map((id) => ({ id: normalizeSeat(id), gender: 'unspecified' }));
    seats.push(...assigned.map((seat) => ({ id: normalizeSeat(seat.id), gender: seat.gender || 'unspecified', status: 'booked' })));
  }
  for (const request of state.tourSeatRequests) {
    if (request.id !== excludeRequestId && request.tourId === tourId && activeRequest(request, now)) seats.push(...request.seats.map((seat) => ({ ...seat, status: 'reserved' })));
  }
  return seats;
}
function getTourSeats(state, tourId, now = Date.now()) {
  ensureTransport(state);
  const tour = (state.tours || []).find((t) => t.id === tourId);
  if (!tour) fail('TOUR_NOT_FOUND', 'Tour not found / ট্যুর পাওয়া যায়নি', 404);
  const bus = tour.busId ? getBus(state, tour.busId) : null;
  const all = bus ? seatIds(bus.layout) : [];
  const occupied = bookedTourSeats(state, tourId, null, now);
  const pax = (state.bookings || []).filter((b) => b.tourId === tourId && b.status !== 'cancelled').reduce((sum, b) => sum + Number(b.pax || 0), 0);
  const requestsPax = state.tourSeatRequests.filter((r) => r.tourId === tourId && activeRequest(r, now)).reduce((sum, r) => sum + r.seats.length, 0);
  const capacity = bus ? Math.min(Number(tour.totalSeats) || all.length, all.length) : Number(tour.totalSeats) || 40;
  return { bus: bus ? { id: bus.id, name: bus.name, nameBn: bus.nameBn, layout: bus.layout } : null, seats: all, occupied, capacity, seatsLeft: Math.max(0, capacity - pax - requestsPax) };
}
function validateSeats(selected, allowed, occupied, expected) {
  if (!Array.isArray(selected) || !selected.length) fail('SEATS_REQUIRED', 'Select your seats / আপনার সিট নির্বাচন করুন');
  if (expected !== undefined && selected.length !== Number(expected)) fail('SEAT_COUNT', 'Choose one seat for every traveler / প্রত্যেক যাত্রীর জন্য একটি সিট নির্বাচন করুন');
  if (selected.length > 46) fail('SEAT_COUNT', 'Too many seats / সিট সংখ্যা অতিরিক্ত');
  const normalized = selected.map((seat) => ({ id: normalizeSeat(seat.id), gender: seat.gender }));
  if (new Set(normalized.map((seat) => seat.id)).size !== normalized.length) fail('DUPLICATE_SEAT', 'Duplicate seats / একই সিট একাধিকবার');
  for (const seat of normalized) {
    if (!allowed.includes(seat.id)) fail('INVALID_SEAT', `Invalid seat / ভুল সিট: ${seat.id}`);
    if (!['male', 'female'].includes(seat.gender)) fail('GENDER_REQUIRED', 'Select male or female for each passenger / প্রত্যেক যাত্রীর নারী বা পুরুষ নির্বাচন করুন');
    if (occupied.some((item) => item.id === seat.id)) fail('SEAT_TAKEN', `Seat already taken / সিট বুক হয়েছে: ${seat.id}`, 409);
  }
  return normalized;
}
function serviceStatus(state, bus, service, date, now = new Date()) {
  if (!validDate(date)) fail('INVALID_DATE', 'Invalid journey date / যাত্রার তারিখ সঠিক নয়');
  if (date < todayDhaka(now)) return { status: 'past', reason: 'Departure date has passed / যাত্রার তারিখ পার হয়েছে', bookable: false };
  const departure = /^([01]\d|2[0-3]):[0-5]\d$/.test(service.departureTime || '') ? Date.parse(`${date}T${service.departureTime}:00+06:00`) : null;
  if (departure && departure <= now.getTime()) return { status: 'past', reason: 'Departure time has passed / যাত্রার সময় পার হয়েছে', bookable: false };
  if (bus.status === 'inactive') return { status: 'unavailable', reason: 'Bus unavailable / বাস অনুপলব্ধ', bookable: false };
  if (bus.status === 'maintenance' || (bus.maintenanceFrom && date >= bus.maintenanceFrom && (!bus.maintenanceTo || date <= bus.maintenanceTo))) return { status: 'maintenance', reason: 'Bus under repair / বাস মেরামতে আছে', bookable: false };
  const override = state.busOverrides.find((o) => o.busId === bus.id && o.serviceId === service.id && o.date === date);
  if (override?.mode === 'closed') return { status: 'unavailable', reason: override.note || 'Closed by admin / অ্যাডমিন বন্ধ রেখেছেন', bookable: false };
  const tour = (state.tours || []).find((t) => t.busId === bus.id && !['cancelled', 'draft'].includes(t.status) && t.startDate <= date && (t.returnDate || t.startDate) >= date);
  if (tour && override?.mode !== 'force_open') return { status: 'on_tour', reason: 'Bus is on tour / বাস ট্যুরে আছে', tourId: tour.id, bookable: false };
  if (!service.enabled || !departure || !Number.isFinite(Number(service.fare)) || Number(service.fare) <= 0 || !String(service.boardingPoint || '').trim()) return { status: 'setup_required', reason: 'Schedule and fare will be announced / সময়সূচি ও ভাড়া শিগগির জানানো হবে', bookable: false };
  const weekday = new Date(`${date}T12:00:00+06:00`).getUTCDay();
  if (!service.days?.includes(weekday)) return { status: 'not_scheduled', reason: 'No service on this day / এই দিনে সার্ভিস নেই', bookable: false };
  return { status: override?.mode === 'force_open' ? 'admin_override' : 'available', reason: tour ? 'Opened by admin despite tour assignment / ট্যুর থাকলেও অ্যাডমিন চালু করেছেন' : 'Available / চালু আছে', bookable: true, overriddenTourId: tour?.id };
}
function getBusServices(state, { date = todayDhaka(), route = 'all' } = {}, now = new Date()) {
  ensureTransport(state);
  const results = [];
  for (const bus of state.buses) for (const service of bus.services || []) {
    if (route !== 'all' && service.id !== route) continue;
    const status = serviceStatus(state, bus, service, date, now);
    const occupied = state.busTickets.filter((ticket) => ticket.busId === bus.id && ticket.serviceId === service.id && ticket.date === date && (ticket.status === 'confirmed' || (ticket.status === 'pending' && Date.parse(ticket.expiresAt) > now.getTime()))).flatMap((ticket) => ticket.seats.map((seat) => ({ id: seat.id, gender: seat.gender, status: ticket.status === 'confirmed' ? 'booked' : 'reserved' })));
    const ids = seatIds(bus.layout);
    results.push({ ...service, busId: bus.id, busName: bus.name, busNameBn: bus.nameBn, layout: bus.layout, date, ...status, seats: ids, occupied, seatsLeft: ids.length - occupied.length, totalSeats: ids.length });
  }
  return results;
}
function validateContact(payload) {
  const name = String(payload.name || payload.customerName || '').trim();
  const phone = String(payload.phone || payload.customerPhone || '').trim();
  if (!name || name.length > 100 || !/^[+\d() .-]{7,25}$/.test(phone) || phone.replace(/\D/g, '').length < 7 || phone.replace(/\D/g, '').length > 15) fail('CONTACT_REQUIRED', 'Valid name and phone required / নাম ও সঠিক মোবাইল নম্বর দিন');
  return { name, phone };
}
function createBusTicket(state, payload, now = new Date()) {
  ensureTransport(state);
  const service = getBusServices(state, { date: payload.date }, now).find((item) => item.busId === payload.busId && item.id === payload.serviceId);
  if (!service) fail('SERVICE_NOT_FOUND', 'Bus service not found / বাস সার্ভিস পাওয়া যায়নি', 404);
  if (!service.bookable) fail('SERVICE_UNAVAILABLE', service.reason, 409);
  const contact = validateContact(payload);
  const seats = validateSeats(payload.seats, service.seats, service.occupied);
  const ticket = {
    id: uid('ticket'), code: uid('RX').toUpperCase(), busId: service.busId, serviceId: service.id, date: service.date,
    from: service.from, to: service.to, departureTime: service.departureTime, boardingPoint: service.boardingPoint,
    ...contact, seats, fare: Number(service.fare), totalAmount: Number(service.fare) * seats.length,
    status: 'pending', paymentStatus: 'unverified', paymentMethod: 'bkash', paymentNumber: CONTACT,
    transactionId: String(payload.transactionId || '').trim().slice(0, 60),
    createdAt: now.toISOString(), expiresAt: new Date(now.getTime() + 30 * 60 * 1000).toISOString(),
    note: String(payload.note || '').slice(0, 600),
  };
  state.busTickets.unshift(ticket);
  return ticket;
}
function updateBusTicket(state, id, payload, now = new Date()) {
  ensureTransport(state);
  const ticket = state.busTickets.find((item) => item.id === id);
  if (!ticket) fail('TICKET_NOT_FOUND', 'Ticket not found / টিকিট পাওয়া যায়নি', 404);
  if (payload.status === 'confirmed') {
    if (ticket.status === 'pending' && Date.parse(ticket.expiresAt) <= now.getTime()) fail('HOLD_EXPIRED', 'Seat hold has expired; make a new reservation / সিটের সময় শেষ; নতুন করে বুক করুন', 409);
    if (!['pending', 'confirmed'].includes(ticket.status)) fail('TICKET_CANCELLED', 'Cancelled ticket cannot be confirmed / বাতিল টিকিট নিশ্চিত করা যায় না', 409);
    const service = getBusServices(state, { date: ticket.date }, now).find((item) => item.busId === ticket.busId && item.id === ticket.serviceId);
    if (!service?.bookable) fail('SERVICE_UNAVAILABLE', service?.reason || 'Service unavailable', 409);
    const others = state.busTickets.filter((item) => item.id !== id && item.busId === ticket.busId && item.serviceId === ticket.serviceId && item.date === ticket.date && (item.status === 'confirmed' || (item.status === 'pending' && Date.parse(item.expiresAt) > now.getTime()))).flatMap((item) => item.seats);
    validateSeats(ticket.seats, service.seats, others);
    ticket.status = 'confirmed'; ticket.paymentStatus = payload.paymentVerified === true ? 'verified' : 'unverified';
  } else if (payload.status === 'cancelled') { ticket.status = 'cancelled'; }
  else if (payload.status) fail('INVALID_STATUS', 'Invalid status / ভুল স্ট্যাটাস');
  if (payload.note !== undefined) ticket.note = String(payload.note).slice(0, 600);
  return ticket;
}
function createTourSeatRequest(state, payload, now = new Date()) {
  ensureTransport(state);
  const tour = (state.tours || []).find((item) => item.id === payload.tourId);
  if (!tour || tour.isPublished === false || !['upcoming', 'running'].includes(tour.status)) fail('TOUR_UNAVAILABLE', 'Tour unavailable / ট্যুর অনুপলব্ধ', 409);
  if (tour.startDate < todayDhaka(now)) fail('TOUR_DEPARTED', 'This tour has departed / ট্যুরটি রওনা হয়ে গেছে', 409);
  const contact = validateContact(payload);
  const info = getTourSeats(state, tour.id, now.getTime());
  if (!info.bus) fail('BUS_REQUIRED', 'Ask admin to assign a bus / অ্যাডমিনকে বাস যুক্ত করতে বলুন');
  const pkg = tour.packages?.find((item) => item.id === payload.packageId);
  if (!pkg || Number(pkg.price) <= 0) fail('PACKAGE_REQUIRED', 'Choose a room package / রুম প্যাকেজ নির্বাচন করুন');
  const seats = validateSeats(payload.seats, info.seats, info.occupied, payload.pax);
  if (seats.length > info.seatsLeft) fail('CAPACITY', 'Not enough seats / পর্যাপ্ত সিট নেই', 409);
  const request = {
    id: uid('tour-request'), tourId: tour.id, ...contact, seats, pax: seats.length,
    packageId: pkg.id, packageName: pkg.name, totalAmount: Math.ceil(seats.length / Math.max(1, Number(pkg.personsPerUnit) || 1)) * Number(pkg.price),
    message: String(payload.message || '').slice(0, 1000), status: 'pending', createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + 30 * 60 * 1000).toISOString(),
  };
  state.tourSeatRequests.unshift(request);
  state.inquiries = [{ id: request.id, tourId: tour.id, tourTitle: tour.title, name: request.name, phone: request.phone, pax: request.pax, preferredPackage: pkg.name, message: request.message, seatAssignments: seats, seatRequestId: request.id, status: 'new', createdAt: request.createdAt }, ...(state.inquiries || [])];
  return request;
}
function validateTourBooking(state, tourId, payload, excludeId = null, now = Date.now()) {
  const tour = (state.tours || []).find((item) => item.id === tourId);
  if (!tour) fail('TOUR_NOT_FOUND', 'Tour not found / ট্যুর পাওয়া যায়নি', 404);
  if (!Number.isInteger(Number(payload.pax)) || Number(payload.pax) < 1) fail('INVALID_PAX', 'Invalid passenger count / যাত্রী সংখ্যা সঠিক নয়');
  if (!tour.busId) {
    const alreadyBooked = (state.bookings || []).filter((b) => b.tourId === tourId && b.id !== excludeId && b.status !== 'cancelled').reduce((sum, b) => sum + Number(b.pax || 0), 0);
    if (alreadyBooked + Number(payload.pax) > Number(tour.totalSeats || 0)) fail('CAPACITY', 'Not enough seats / পর্যাপ্ত সিট নেই', 409);
    return [];
  }
  const bus = getBus(state, tour.busId);
  const seats = validateSeats(payload.seatAssignments, seatIds(bus.layout), bookedTourSeats(state, tourId, excludeId, now, payload.seatRequestId), payload.pax);
  const bookedPax = (state.bookings || []).filter((item) => item.tourId === tourId && item.id !== excludeId && item.status !== 'cancelled').reduce((sum, item) => sum + Number(item.pax || 0), 0);
  const requestsPax = state.tourSeatRequests.filter((r) => r.tourId === tourId && r.id !== payload.seatRequestId && activeRequest(r, now)).reduce((sum, r) => sum + r.seats.length, 0);
  if (bookedPax + requestsPax + seats.length > Math.min(Number(tour.totalSeats) || 46, seatIds(bus.layout).length)) fail('CAPACITY', 'Not enough seats / পর্যাপ্ত সিট নেই', 409);
  return seats;
}
function confirmTourSeatRequest(state, id, now = new Date()) {
  ensureTransport(state);
  const request = state.tourSeatRequests.find((item) => item.id === id);
  if (!request) fail('REQUEST_NOT_FOUND', 'Request not found / অনুরোধ পাওয়া যায়নি', 404);
  if (request.status !== 'pending' || !activeRequest(request, now.getTime())) fail('HOLD_EXPIRED', 'Request expired or already processed / অনুরোধের সময় শেষ বা প্রক্রিয়া হয়েছে', 409);
  const tour = (state.tours || []).find((item) => item.id === request.tourId);
  if (!tour || tour.startDate < todayDhaka(now) || !['upcoming', 'running'].includes(tour.status)) fail('TOUR_UNAVAILABLE', 'Tour unavailable / ট্যুর অনুপলব্ধ', 409);
  const seats = validateTourBooking(state, tour.id, { pax: request.pax, seatAssignments: request.seats, seatRequestId: request.id }, null, now.getTime());
  const pkg = tour.packages.find((item) => item.id === request.packageId);
  if (!pkg || Number(pkg.price) <= 0) fail('PACKAGE_REQUIRED', 'Room package no longer available / রুম প্যাকেজ এখন নেই');
  const total = Math.ceil(request.pax / Math.max(1, Number(pkg.personsPerUnit) || 1)) * Number(pkg.price);
  const booking = {
    id: uid('bk'), bookingCode: uid('RTT').toUpperCase(), tourId: tour.id, customerName: request.name, customerPhone: request.phone,
    pax: request.pax, seatAssignments: seats, seatNumbers: seats.map((seat) => seat.id).join(', '),
    packageId: pkg.id, packageName: pkg.name, packageUnitPrice: Number(pkg.price), totalAmount: total,
    extraCharge: 0, discount: 0, advancePaid: 0, dueAmount: total, paymentMethod: 'bkash', source: 'website',
    status: 'confirmed', notes: request.message, feedbackSubmitted: false, createdAt: now.toISOString(),
  };
  state.bookings.unshift(booking);
  request.status = 'converted'; request.bookingId = booking.id;
  const inquiry = state.inquiries.find((item) => item.id === id);
  if (inquiry) inquiry.status = 'converted';
  return { request, booking };
}

function saveBus(state, id, payload) {
  ensureTransport(state);
  const current = id ? getBus(state, id) : { ...defaultBus(), id: uid('bus') };
  const layout = payload.layout || current.layout;
  if (!['express46', 'standard40'].includes(layout)) fail('INVALID_LAYOUT', 'Invalid layout / ভুল সিট বিন্যাস');
  if (layout !== current.layout && ((state.tours || []).some((t) => t.busId === current.id) || state.busTickets.some((t) => t.busId === current.id && t.status !== 'cancelled'))) fail('LAYOUT_IN_USE', 'Cannot change layout of an assigned bus / বুকিং বা ট্যুর থাকা বাসের সিট বিন্যাস বদলানো যায় না', 409);
  const name = String(payload.name ?? current.name).trim();
  if (!name || name.length > 100) fail('BUS_NAME', 'Bus name required / বাসের নাম দিন');
  const status = payload.status || current.status;
  if (!['active', 'maintenance', 'inactive'].includes(status)) fail('BUS_STATUS', 'Invalid bus status / ভুল বাস স্ট্যাটাস');
  const maintenanceFrom = payload.maintenanceFrom ?? current.maintenanceFrom;
  const maintenanceTo = payload.maintenanceTo ?? current.maintenanceTo;
  if ((maintenanceFrom && !validDate(maintenanceFrom)) || (maintenanceTo && (!validDate(maintenanceTo) || !maintenanceFrom || maintenanceTo < maintenanceFrom))) fail('INVALID_DATE', 'Invalid maintenance dates / মেরামতের তারিখ ভুল');
  const services = (payload.services || current.services).map((service) => {
    if (!['Rajshahi', 'Dhaka'].includes(service.from) || !['Rajshahi', 'Dhaka'].includes(service.to) || service.from === service.to) fail('INVALID_ROUTE', 'Use Rajshahi–Dhaka or Dhaka–Rajshahi / রাজশাহী–ঢাকা অথবা ঢাকা–রাজশাহী ব্যবহার করুন');
    const fare = Number(service.fare);
    if (!Number.isFinite(fare) || fare < 0 || !Array.isArray(service.days) || !service.days.length || service.days.some((day) => !Number.isInteger(day) || day < 0 || day > 6)) fail('INVALID_SERVICE', 'Invalid fare or operating days / ভাড়া বা চলাচলের দিন সঠিক নয়');
    if (service.departureTime && !/^([01]\d|2[0-3]):[0-5]\d$/.test(service.departureTime)) fail('INVALID_TIME', 'Invalid departure time / যাত্রার সময় সঠিক নয়');
    if (service.enabled && (!service.departureTime || fare <= 0 || !String(service.boardingPoint || '').trim())) fail('SETUP_REQUIRED', 'Enter departure, fare and pickup before enabling / চালুর আগে সময়, ভাড়া ও ওঠার স্থান দিন');
    return { id: service.id || uid('service'), from: service.from, to: service.to, departureTime: service.departureTime || '', fare, boardingPoint: String(service.boardingPoint || '').trim().slice(0, 180), enabled: Boolean(service.enabled), days: [...new Set(service.days)] };
  });
  if (new Set(services.map((s) => s.id)).size !== services.length) fail('DUPLICATE_SERVICE', 'Duplicate service IDs');
  const bus = { ...current, name, nameBn: String(payload.nameBn ?? current.nameBn).slice(0, 100), registration: String(payload.registration ?? current.registration).slice(0, 100), layout, status, maintenanceFrom, maintenanceTo, maintenanceNote: String(payload.maintenanceNote ?? current.maintenanceNote).slice(0, 300), services };
  const index = state.buses.findIndex((b) => b.id === bus.id);
  if (index < 0) state.buses.push(bus); else state.buses[index] = bus;
  return bus;
}
function setBusOverride(state, payload) {
  const bus = getBus(state, payload.busId);
  if (!bus.services.some((service) => service.id === payload.serviceId) || !validDate(payload.date) || !['auto', 'force_open', 'closed'].includes(payload.mode)) fail('INVALID_OVERRIDE', 'Invalid availability override / ভুল ওভাররাইড');
  state.busOverrides = state.busOverrides.filter((item) => !(item.busId === bus.id && item.serviceId === payload.serviceId && item.date === payload.date));
  if (payload.mode !== 'auto') state.busOverrides.push({ busId: bus.id, serviceId: payload.serviceId, date: payload.date, mode: payload.mode, note: String(payload.note || '').slice(0, 300) });
  return state.busOverrides;
}
function validateTourBus(state, tour) {
  if (!tour.busId) return;
  const bus = getBus(state, tour.busId);
  if (!validDate(tour.startDate) || !validDate(tour.returnDate) || tour.returnDate < tour.startDate) fail('INVALID_DATE', 'Invalid tour dates / ট্যুরের তারিখ সঠিক নয়');
  if (!Number.isInteger(Number(tour.totalSeats)) || Number(tour.totalSeats) < 1 || Number(tour.totalSeats) > seatIds(bus.layout).length) fail('CAPACITY', 'Tour seats exceed bus capacity / সিট সংখ্যা বাসের ধারণক্ষমতার বেশি');
  if (!['cancelled', 'draft'].includes(tour.status) && state.busTickets.some((ticket) => ticket.busId === bus.id && ticket.date >= tour.startDate && ticket.date <= tour.returnDate && (ticket.status === 'confirmed' || (ticket.status === 'pending' && Date.parse(ticket.expiresAt) > Date.now())))) fail('BUS_TICKETS_EXIST', 'Resolve regular bus tickets before assigning this tour / ট্যুরে বাস দেওয়ার আগে রেগুলার টিকিটের ব্যবস্থা করুন', 409);
  if (!['cancelled','draft'].includes(tour.status) && (state.tours || []).some((t) => t.id !== tour.id && t.busId === tour.busId && !['cancelled','draft'].includes(t.status) && t.startDate <= tour.returnDate && t.returnDate >= tour.startDate)) fail('BUS_BUSY', 'Bus assigned to another overlapping tour / একই সময়ে বাস অন্য ট্যুরে আছে', 409);
}

const legacyPhoneMap = {
  "01521445588": "00000000101",
  "01556889900": "00000000102",
  "01677889900": "00000000103",
  "01711000001": "00000000104",
  "01711000002": "00000000105",
  "01711000003": "00000000106",
  "01711000004": "00000000107",
  "01711000005": "00000000108",
  "01711334455": "00000000109",
  "01711334456": "00000000110",
  "01712345678": "00000000111",
  "01712445566": "00000000112",
  "01715223344": "00000000113",
  "01733667788": "00000000114",
  "01744556677": "00000000115",
  "01757950321": "00000000116",
  "01788990011": "00000000117",
  "01819223344": "00000000118",
  "01819445566": "00000000119",
  "01822889900": "00000000120",
  "01844556677": "00000000121",
  "01855667788": "00000000122",
  "01911223344": "00000000123",
  "01966778899": "00000000124",
  "01711-987654": "01782250709",
  "8801711987654": "8801782250709"
};
function migrateEditionData(state) {
  ensureTransport(state);
  if (state.editionDataVersion === 3) return state;
  const visit = (value) => {
    if (typeof value === 'string') { for (const [old, next] of Object.entries(legacyPhoneMap)) value = value.split(old).join(next); return value; }
    if (Array.isArray(value)) return value.map(visit);
    if (value && typeof value === 'object') { for (const key of Object.keys(value)) value[key] = visit(value[key]); }
    return value;
  };
  visit(state);
  state.siteSettings = { ...state.siteSettings, phone: CONTACT, whatsapp: WHATSAPP, bkashNumber: CONTACT };
  const seededTours = ['tour-sajek-running','tour-sylhet-oct','tour-sajek-oct15','tour-coxs-nov','tour-sep-sajek','tour-sep-sylhet','tour-sep-sundarbans'];
  for (const tour of state.tours || []) {
    if (seededTours.includes(tour.id) && tour.busId === undefined) { tour.busId = 'bus-rajshahi-express'; tour.totalSeats = 46; }
  }
  for (const booking of state.bookings || []) {
    if (!booking.seatAssignments) {
      const ids = Array.isArray(booking.seatNumbers) ? booking.seatNumbers : String(booking.seatNumbers || '').split(/[ ,]+/);
      booking.seatAssignments = ids.filter(Boolean).map((id) => ({ id: normalizeSeat(id), gender: 'unspecified' }));
      booking.seatNumbers = booking.seatAssignments.map((s) => s.id).join(', ');
    }
  }
  const translations = {"tour-sajek-running":{"title":"সাজেক ভ্যালি ও খাগড়াছড়ি মেঘের রাজ্য গ্রুপ ট্যুর","titleEn":"Sajek Valley & Khagrachhari — the kingdom of clouds","destinationEn":"Sajek Valley"},"tour-sylhet-oct":{"title":"সিলেট ভ্রমণ — সাদাপাথর, জাফলং ও রাতারগুল স্পেশাল ট্যুর","titleEn":"Sylhet — Sadapathor, Jaflong & Ratargul","destinationEn":"Sylhet"},"tour-sajek-oct15":{"title":"সাজেক ভ্যালি প্রিমিয়াম গ্রুপ ট্যুর (অক্টোবর স্পেশাল)","titleEn":"Sajek Valley premium group tour — October special","destinationEn":"Sajek Valley"},"tour-coxs-nov":{"title":"কক্সবাজার, ইনানী ও মেরিন ড্রাইভ সমুদ্র বিলাস ট্যুর","titleEn":"Cox’s Bazar, Inani & Marine Drive coastal escape","destinationEn":"Cox’s Bazar"},"tour-sep-sajek":{"title":"সাজেক ভ্যালি শরতের মেঘের রাজ্য ট্যুর (সেপ্টেম্বর ব্যাচ)","titleEn":"Sajek Valley autumn journey — September group","destinationEn":"Sajek Valley"},"tour-sep-sylhet":{"title":"সিলেট ও টাঙ্গুয়ার হাওর পূর্ণিমা বিলাস ট্যুর (সেপ্টেম্বর)","titleEn":"Sylhet & Tanguar Haor moonlit escape — September","destinationEn":"Sylhet & Sunamganj"},"tour-sep-sundarbans":{"title":"সুন্দরবন রয়েল ম্যানগ্রোভ ক্রুজ ট্যুর (সেপ্টেম্বর)","titleEn":"Sundarbans royal mangrove cruise — September","destinationEn":"Sundarbans"}};
  for (const tour of state.tours || []) {
    const translation = translations[tour.id];
    if (translation && tour.title === translation.title && !tour.titleEn) { tour.titleEn = translation.titleEn; tour.destinationEn = translation.destinationEn; }
  }
  state.editionDataVersion = 3;
  return state;
}

module.exports = { confirmTourSeatRequest, migrateEditionData, CONTACT, WHATSAPP, TOUR_SEAT_LIMIT, TransportError, todayDhaka, validDate, seatIds, normalizeSeat, defaultBus, ensureTransport, getBus, getTourSeats, bookedTourSeats, validateSeats, getBusServices, createBusTicket, updateBusTicket, createTourSeatRequest, validateTourBooking, saveBus, setBusOverride, validateTourBus, activeRequest, uid };
