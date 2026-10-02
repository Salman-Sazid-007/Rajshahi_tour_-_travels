'use strict';

const mongoose = require('mongoose');
const env = require('./config/env');
const app = require('./app');
const store = require('./services/store');

async function start() {
  // Initialize local persistent store with seed data
  store.ensureLoaded();

  // Optional MongoDB connection when MONGODB_URI is provided
  if (env.MONGODB_URI) {
    try {
      await mongoose.connect(env.MONGODB_URI, { serverSelectionTimeoutMS: 5000 });
      console.log('[Rajshahi Tours] Connected to MongoDB');
    } catch (err) {
      console.warn(
        `[Rajshahi Tours] MongoDB connection skipped (${err.message}); using persistent JSON store`
      );
    }
  }

  app.listen(env.PORT, env.HOST, () => {
    console.log(
      `[Rajshahi Tours & Travels] Server listening on http://${env.HOST}:${env.PORT}`
    );
  });
}

start().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
