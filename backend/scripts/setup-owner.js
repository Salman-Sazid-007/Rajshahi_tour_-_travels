'use strict';
// One-time local provisioning. Never writes a clear-text password to the store.
const fs = require('fs');
const path = require('path');
if (!process.env.RTT_DATA_FILE || !path.isAbsolute(process.env.RTT_DATA_FILE)) {
  throw new Error('Set RTT_DATA_FILE to an absolute, untracked production data-file path first.');
}
const name = String(process.env.RTT_OWNER_NAME || '').trim();
const phone = String(process.env.RTT_OWNER_PHONE || '').trim();
const email = String(process.env.RTT_OWNER_EMAIL || '').trim();
const password = String(process.env.RTT_OWNER_PASSWORD || '');
if (name.length < 2 || !/^\+?\d{7,15}$/.test(phone) || phone.startsWith('000') || password.length < 12 || !email.includes('@')) {
  throw new Error('Set a real owner name, phone, email and RTT_OWNER_PASSWORD (at least 12 characters) in the environment.');
}
fs.mkdirSync(path.dirname(process.env.RTT_DATA_FILE), { recursive: true });
const store = require('../src/services/store');
const state = store.ensureLoaded();
const existing = state.users.find((user) => user.email === email);
const fields = { name, phone, email, password, role:'owner', isActive:true };
if (existing) store.updateStaff(existing.id,fields); else store.addStaff(fields);
for (const user of state.users) if (String(user.phone).startsWith('000')) user.isActive = false;
store.save();
console.log('Owner provisioned with a hashed password; seeded demo accounts disabled. No credentials printed.');
