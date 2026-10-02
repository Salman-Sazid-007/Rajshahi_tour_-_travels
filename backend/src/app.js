'use strict';

const path = require('path');
const fs = require('fs');
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const apiRouter = require('./routes/api');

const app = express();

app.set('trust proxy', 1);

app.use(
  cors({
    origin: true,
    credentials: true,
  })
);

app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ extended: true, limit: '15mb' }));
app.use(cookieParser());

// Serve static media assets (/media/*)
const publicDir = path.resolve(__dirname, '..', 'public');
app.use(express.static(publicDir));

// Mount API routes
app.use('/api', apiRouter);

// Serve built frontend if available (single-origin preview + production support)
const frontendDistDir = path.resolve(__dirname, '..', '..', 'frontend', 'dist');
if (fs.existsSync(frontendDistDir)) {
  app.use(express.static(frontendDistDir));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/media')) {
      return next();
    }
    res.sendFile(path.join(frontendDistDir, 'index.html'));
  });
}

// 404 handler for unmatched API routes
app.use('/api/*', (req, res) => {
  res.status(404).json({
    success: false,
    code: 'NOT_FOUND',
    message: `API endpoint not found: ${req.method} ${req.originalUrl}`,
  });
});

// Centralized Error Handler
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  const statusCode = err.statusCode || 500;
  res.status(statusCode).json({
    success: false,
    code: err.code || 'INTERNAL_ERROR',
    message: err.message || 'সার্ভারে একটি ত্রুটি ঘটেছে',
  });
});

module.exports = app;
