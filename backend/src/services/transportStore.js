'use strict';
const store = require('./store');
const engine = require('../../../shared/transport.cjs');

function mutate(operation) {
  const state = store.ensureLoaded();
  const backup = JSON.parse(JSON.stringify(state));
  try {
    const result = operation(state);
    store.save();
    return result;
  } catch (error) {
    for (const key of Object.keys(state)) delete state[key];
    Object.assign(state, backup);
    throw error;
  }
}
module.exports = {
  getServices: (query) => engine.getBusServices(store.ensureLoaded(), query),
  getTourSeats: (id) => engine.getTourSeats(store.ensureLoaded(), id),
  list: () => { const state = store.ensureLoaded(); return { buses: state.buses, tickets: state.busTickets, overrides: state.busOverrides, tourSeatRequests: state.tourSeatRequests }; },
  saveBus: (id, payload) => mutate((state) => engine.saveBus(state, id, payload)),
  setOverride: (payload) => mutate((state) => engine.setBusOverride(state, payload)),
  createTicket: (payload) => mutate((state) => engine.createBusTicket(state, payload)),
  updateTicket: (id, payload) => mutate((state) => engine.updateBusTicket(state, id, payload)),
  createTourRequest: (payload) => mutate((state) => engine.createTourSeatRequest(state, payload)),
  updateTourRequest: (id, payload) => mutate((state) => {
    if (payload.status === 'confirmed') {
      const result = engine.confirmTourSeatRequest(state, id);
      const tour = state.tours.find((item) => item.id === result.booking.tourId);
      result.booking.customerId = store.syncCustomerFromBooking(result.booking, tour?.title).id;
      return result;
    }
    const request = state.tourSeatRequests.find((item) => item.id === id);
    if (!request) throw new engine.TransportError('REQUEST_NOT_FOUND', 'Request not found / অনুরোধ পাওয়া যায়নি', 404);
    if (payload.status !== 'cancelled' || request.status === 'converted') throw new engine.TransportError('INVALID_STATUS', 'Invalid status / ভুল স্ট্যাটাস');
    request.status = 'cancelled';
    const inquiry = state.inquiries.find((item) => item.id === id);
    if (inquiry) inquiry.status = 'closed';
    return { request };
  }),
};
