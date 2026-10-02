'use strict';
const express = require('express');
const { authenticate, requireRole } = require('../middleware/auth');
const { asyncHandler } = require('../utils/errors');
const transport = require('../services/transportStore');
const router = express.Router();
const reply = (res, data, status = 200) => res.status(status).json({ success: true, mode: 'server', ...data });

// Public responses expose seat labels and gender only, never passenger identities.
router.get('/public/bus-services', asyncHandler(async (req, res) => reply(res, { services: transport.getServices(req.query) })));
router.get('/public/tours/:id/seats', asyncHandler(async (req, res) => reply(res, transport.getTourSeats(req.params.id))));
router.post('/public/bus-tickets', asyncHandler(async (req, res) => reply(res, { ticket: transport.createTicket(req.body || {}) }, 201)));
router.post('/public/tour-seat-requests', asyncHandler(async (req, res) => reply(res, { request: transport.createTourRequest(req.body || {}) }, 201)));

router.get('/buses', authenticate, requireRole('owner', 'accountant', 'guide'), asyncHandler(async (_req, res) => reply(res, transport.list())));
router.post('/buses', authenticate, requireRole('owner'), asyncHandler(async (req, res) => reply(res, { bus: transport.saveBus(null, req.body || {}) }, 201)));
router.put('/buses/:id', authenticate, requireRole('owner'), asyncHandler(async (req, res) => reply(res, { bus: transport.saveBus(req.params.id, req.body || {}) })));
router.post('/bus-overrides', authenticate, requireRole('owner'), asyncHandler(async (req, res) => reply(res, { overrides: transport.setOverride(req.body || {}) })));
router.patch('/bus-tickets/:id', authenticate, requireRole('owner', 'accountant'), asyncHandler(async (req, res) => reply(res, { ticket: transport.updateTicket(req.params.id, req.body || {}) })));
router.patch('/tour-seat-requests/:id', authenticate, requireRole('owner', 'accountant'), asyncHandler(async (req, res) => reply(res, transport.updateTourRequest(req.params.id, req.body || {}))));

module.exports = router;
