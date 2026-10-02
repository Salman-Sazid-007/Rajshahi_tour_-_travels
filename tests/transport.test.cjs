'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const engine = require('../shared/transport.cjs');
const fixture = require('../frontend/src/lib/seedData.json');
const now = new Date('2026-10-03T00:00:00Z');
const fresh = () => engine.ensureTransport(JSON.parse(JSON.stringify(fixture)));
const configured = () => {
  const state = fresh();
  state.buses[0].services = state.buses[0].services.map((service) => ({ ...service, enabled: true, departureTime: '21:30', fare: 700, boardingPoint: service.from === 'Rajshahi' ? 'Sopura Mor' : 'Dhaka terminal' }));
  return state;
};
const ticketInput = (overrides = {}) => ({ busId: 'bus-rajshahi-express', serviceId: 'rajshahi-dhaka', date: '2026-10-05', name: 'Test Traveler', phone: '+15555550100', seats: [{ id: 'A-1', gender: 'male' }], ...overrides });
const tourInput = (overrides = {}) => ({ tourId: 'tour-sylhet-oct', name: 'Test Traveler', phone: '+15555550100', pax: 2, packageId: 'pkg-sylhet-share', seats: [{ id: 'F-1', gender: 'male' }, { id: 'F-2', gender: 'female' }], ...overrides });
const throwsCode = (fn, code) => assert.throws(fn, (error) => error.code === code);

test('reference bus is 46 seats: front 1, A–J 2+2 and K 5-wide', () => {
  const seats = engine.seatIds();
  assert.equal(seats.length, 46); assert.equal(new Set(seats).size, 46);
  assert.deepEqual(seats.slice(0, 5), ['1','A-1','A-2','A-3','A-4']);
  assert.deepEqual(seats.slice(-5), ['K-1','K-2','K-3','K-4','K-5']);
  assert.equal(engine.seatIds('standard40').length, 40);
  assert.equal(engine.normalizeSeat('b3'), 'B-3');
});
test('default regular services are closed until actual schedule and fare are configured', () => {
  const services = engine.getBusServices(fresh(), { date: '2026-10-05' }, now);
  assert.equal(services.length, 2); assert.ok(services.every((s) => s.status === 'setup_required' && !s.bookable && s.fare === 0));
  throwsCode(() => engine.createBusTicket(fresh(), ticketInput(), now), 'SERVICE_UNAVAILABLE');
});
test('tour assignment automatically closes both directions for departure through return date', () => {
  const state = configured();
  for (const date of ['2026-10-01','2026-10-02','2026-10-03','2026-10-04']) {
    const clock = new Date('2026-09-30T00:00:00Z');
    assert.ok(engine.getBusServices(state, { date }, clock).every((s) => s.status === 'on_tour' && !s.bookable));
  }
  assert.ok(engine.getBusServices(state, { date: '2026-10-05' }, now).every((s) => s.bookable));
});
test('admin override opens only the selected service and date, not every tour day', () => {
  const state = configured();
  engine.setBusOverride(state, { busId: state.buses[0].id, serviceId: 'rajshahi-dhaka', date: '2026-10-03', mode: 'force_open' });
  const services = engine.getBusServices(state, { date: '2026-10-03' }, now);
  assert.equal(services[0].status, 'admin_override'); assert.equal(services[1].status, 'on_tour');
  assert.equal(engine.getBusServices(state, { date: '2026-10-04' }, now)[0].status, 'on_tour');
  engine.setBusOverride(state, { busId: state.buses[0].id, serviceId: 'rajshahi-dhaka', date: '2026-10-03', mode: 'auto' });
  assert.equal(engine.getBusServices(state, { date: '2026-10-03' }, now)[0].status, 'on_tour');
});
test('maintenance always wins over a tour-day override', () => {
  const state = configured();
  engine.setBusOverride(state, { busId: state.buses[0].id, serviceId: 'rajshahi-dhaka', date: '2026-10-03', mode: 'force_open' });
  state.buses[0].status = 'maintenance';
  assert.equal(engine.getBusServices(state, { date: '2026-10-03' }, now)[0].status, 'maintenance');
  throwsCode(() => engine.createBusTicket(state, ticketInput({ date: '2026-10-03' }), now), 'SERVICE_UNAVAILABLE');
});
test('scheduled repair period is inclusive and regular service resumes afterward', () => {
  const state = configured(); state.buses[0].maintenanceFrom = '2026-10-05'; state.buses[0].maintenanceTo = '2026-10-06';
  assert.equal(engine.getBusServices(state, { date: '2026-10-05' }, now)[0].status, 'maintenance');
  assert.equal(engine.getBusServices(state, { date: '2026-10-06' }, now)[0].status, 'maintenance');
  assert.equal(engine.getBusServices(state, { date: '2026-10-07' }, now)[0].status, 'available');
});
test('past departures, impossible dates and non-operating weekdays cannot sell tickets', () => {
  const state = configured(); state.buses[0].services[0].days = [0];
  assert.equal(engine.getBusServices(state, { date: '2026-10-05' }, now)[0].status, 'not_scheduled');
  assert.equal(engine.getBusServices(state, { date: '2026-09-01' }, now)[0].status, 'past');
  throwsCode(() => engine.getBusServices(state, { date: '2026-02-30' }, now), 'INVALID_DATE');
});
test('ticket total is calculated on the server and bKash contact is correct', () => {
  const state = configured();
  const ticket = engine.createBusTicket(state, ticketInput({ totalAmount: 1, fare: 1, transactionId: 'TESTREF' }), now);
  assert.equal(ticket.totalAmount, 700); assert.equal(ticket.fare, 700);
  assert.equal(ticket.paymentNumber, '01782250709'); assert.equal(ticket.status, 'pending'); assert.equal(ticket.paymentStatus, 'unverified');
  assert.equal(new Date(ticket.expiresAt).getTime() - now.getTime(), 30 * 60 * 1000);
});
test('double booking fails, including a different gender or legacy seat spelling', () => {
  const state = configured(); engine.createBusTicket(state, ticketInput(), now);
  throwsCode(() => engine.createBusTicket(state, ticketInput({ seats: [{ id: 'a1', gender: 'female' }] }), now), 'SEAT_TAKEN');
  assert.equal(state.busTickets.length, 1);
});
test('seat allocation is separate per route and date', () => {
  const state = configured(); engine.createBusTicket(state, ticketInput(), now);
  engine.createBusTicket(state, ticketInput({ serviceId: 'dhaka-rajshahi' }), now);
  engine.createBusTicket(state, ticketInput({ date: '2026-10-06' }), now);
  assert.equal(state.busTickets.length, 3);
});
test('seats require a valid male/female marker and cannot be duplicated', () => {
  const state = configured();
  throwsCode(() => engine.createBusTicket(state, ticketInput({ seats: [{ id:'A-1', gender:'' }] }), now), 'GENDER_REQUIRED');
  throwsCode(() => engine.createBusTicket(state, ticketInput({ seats: [{ id:'K-6', gender:'female' }] }), now), 'INVALID_SEAT');
  throwsCode(() => engine.createBusTicket(state, ticketInput({ seats: [{ id:'A-1', gender:'male' }, { id:'A-1', gender:'female' }] }), now), 'DUPLICATE_SEAT');
});
test('expired bus holds release inventory and cannot be confirmed later', () => {
  const state = configured(); const ticket = engine.createBusTicket(state, ticketInput(), now);
  const later = new Date(now.getTime() + 31 * 60 * 1000);
  assert.equal(engine.getBusServices(state, { date: '2026-10-05' }, later)[0].occupied.length, 0);
  throwsCode(() => engine.updateBusTicket(state, ticket.id, { status: 'confirmed' }, later), 'HOLD_EXPIRED');
});
test('verified admin confirmation preserves the gender marker; cancellation frees seats', () => {
  const state = configured(); const ticket = engine.createBusTicket(state, ticketInput({ seats:[{ id:'K-5',gender:'female' }] }), now);
  engine.updateBusTicket(state, ticket.id, { status:'confirmed', paymentVerified:true }, now);
  assert.equal(ticket.paymentStatus, 'verified');
  const occupied = engine.getBusServices(state, { date:'2026-10-05' }, now)[0].occupied;
  assert.deepEqual(occupied, [{ id:'K-5',gender:'female',status:'booked' }]);
  assert.ok(!JSON.stringify(occupied).includes(ticket.phone));
  engine.updateBusTicket(state, ticket.id, { status:'cancelled' }, now);
  assert.equal(engine.getBusServices(state, { date:'2026-10-05' }, now)[0].occupied.length, 0);
});
test('tour seat requests validate pax, price, gender and existing seats', () => {
  const state = fresh();
  throwsCode(() => engine.createTourSeatRequest(state, tourInput({ pax:3 }), now), 'SEAT_COUNT');
  throwsCode(() => engine.createTourSeatRequest(state, tourInput({ pax:1, seats:[{id:'A-1',gender:'female'}] }), now), 'SEAT_TAKEN');
  const request = engine.createTourSeatRequest(state, tourInput({ totalAmount:1 }), now);
  assert.equal(request.totalAmount, 7600); assert.equal(request.status, 'pending');
  const info = engine.getTourSeats(state, request.tourId, now.getTime());
  assert.equal(info.seatsLeft, 26); assert.ok(info.occupied.some((seat) => seat.id === 'F-2' && seat.gender === 'female'));
  throwsCode(() => engine.createTourSeatRequest(state, tourInput(), now), 'SEAT_TAKEN');
});
test('confirming a tour hold does not double-count seats or invent a payment', () => {
  const state = fresh(); const request = engine.createTourSeatRequest(state, tourInput(), now);
  const before = engine.getTourSeats(state, request.tourId, now.getTime()).seatsLeft;
  const {booking} = engine.confirmTourSeatRequest(state, request.id, now);
  assert.equal(request.status, 'converted'); assert.equal(booking.advancePaid, 0); assert.equal(booking.dueAmount, 7600);
  assert.equal(engine.getTourSeats(state, request.tourId, now.getTime()).seatsLeft, before);
  assert.equal(state.inquiries.find((q) => q.id === request.id).status, 'converted');
});
test('expired tour requests free inventory and cannot be silently converted', () => {
  const state = fresh(); const request = engine.createTourSeatRequest(state, tourInput(), now);
  const later = new Date(now.getTime()+31*60*1000);
  assert.equal(engine.getTourSeats(state, request.tourId, later.getTime()).seatsLeft, 28);
  throwsCode(() => engine.confirmTourSeatRequest(state, request.id, later), 'HOLD_EXPIRED');
});
test('capacity and the 10-seat low-availability threshold use actual allocations', () => {
  const state = fresh(); state.tours.find((t) => t.id === 'tour-sylhet-oct').totalSeats = 28;
  assert.equal(engine.getTourSeats(state,'tour-sylhet-oct').seatsLeft, 10);
  assert.equal(engine.TOUR_SEAT_LIMIT, 10);
  throwsCode(() => engine.validateTourBooking(state,'tour-sylhet-oct',{pax:11,seatAssignments:engine.seatIds().filter((id)=>/^[FGH]-/.test(id)).slice(0,11).map((id)=>({id,gender:'male'}))}), 'CAPACITY');
});
test('overlapping tour assignments and conflicting regular reservations are rejected', () => {
  const state = configured();
  throwsCode(() => engine.validateTourBus(state,{id:'new',busId:state.buses[0].id,status:'upcoming',startDate:'2026-10-15',returnDate:'2026-10-16',totalSeats:46}), 'BUS_BUSY');
  const ticket = engine.createBusTicket(state,ticketInput(),now);
  engine.updateBusTicket(state,ticket.id,{status:'confirmed',paymentVerified:true},now);
  throwsCode(() => engine.validateTourBus(state,{id:'new',busId:state.buses[0].id,status:'upcoming',startDate:'2026-10-05',returnDate:'2026-10-06',totalSeats:46}), 'BUS_TICKETS_EXIST');
});
test('bus setup refuses invalid fares, enabled incomplete services and live layout changes', () => {
  const state = fresh(),bus=state.buses[0];
  throwsCode(() => engine.saveBus(state,bus.id,{services:[{...bus.services[0],enabled:true}]}), 'SETUP_REQUIRED');
  throwsCode(() => engine.saveBus(state,bus.id,{services:[{...bus.services[0],fare:-10}]}), 'INVALID_SERVICE');
  throwsCode(() => engine.saveBus(state,bus.id,{layout:'standard40'}), 'LAYOUT_IN_USE');
});
test('public contact migration is idempotent and demo phones are non-dialable', () => {
  const state = fresh(); engine.migrateEditionData(state);
  assert.equal(state.siteSettings.phone, '01782250709'); assert.equal(state.siteSettings.whatsapp, '8801782250709'); assert.equal(state.siteSettings.bkashNumber, '01782250709');
  assert.ok(state.users.every((u) => u.phone.startsWith('000')));
  const before=JSON.stringify(state);engine.migrateEditionData(state);assert.equal(JSON.stringify(state),before);
});
