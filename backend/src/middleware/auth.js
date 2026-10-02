'use strict';

const jwt = require('jsonwebtoken');
const env = require('../config/env');
const { AppError, asyncHandler } = require('../utils/errors');
const store = require('../services/store');

function signToken(user) {
  return jwt.sign(
    {
      sub: user.id,
      role: user.role,
      phone: user.phone,
      name: user.name,
    },
    env.JWT_SECRET,
    { expiresIn: env.JWT_EXPIRES_IN }
  );
}

function readToken(req) {
  if (req.cookies && req.cookies[env.COOKIE_NAME]) {
    return req.cookies[env.COOKIE_NAME];
  }
  const header = req.get('authorization');
  if (header && header.startsWith('Bearer ')) {
    return header.slice(7).trim();
  }
  return null;
}

const authenticate = asyncHandler(async (req, _res, next) => {
  const token = readToken(req);
  if (!token) {
    throw new AppError(401, 'UNAUTHORIZED', 'অনুগ্রহ করে স্টাফ লগইন করুন (Authentication required)');
  }

  let payload;
  try {
    payload = jwt.verify(token, env.JWT_SECRET);
  } catch {
    throw new AppError(401, 'INVALID_SESSION', 'সেশন মেয়াদোত্তীর্ণ হয়েছে, আবার লগইন করুন');
  }

  const user = store.getUserById(payload.sub);
  if (!user || !user.isActive) {
    throw new AppError(401, 'USER_NOT_FOUND', 'অ্যাকাউন্টটি সচল নেই');
  }

  req.user = user;
  next();
});

const optionalAuth = asyncHandler(async (req, _res, next) => {
  const token = readToken(req);
  if (!token) return next();
  try {
    const payload = jwt.verify(token, env.JWT_SECRET);
    const user = store.getUserById(payload.sub);
    if (user && user.isActive) req.user = user;
  } catch {
    // Ignore invalid optional token
  }
  next();
});

const requireRole =
  (...allowedRoles) =>
  (req, _res, next) => {
    if (!req.user) {
      return next(new AppError(401, 'UNAUTHORIZED', 'লগইন আবশ্যক'));
    }
    if (!allowedRoles.includes(req.user.role)) {
      return next(
        new AppError(
          403,
          'FORBIDDEN',
          `এই কাজের অনুমতি শুধুমাত্র (${allowedRoles.join(', ')}) অ্যাকাউন্টের জন্য সংরক্ষিত`
        )
      );
    }
    return next();
  };

module.exports = {
  signToken,
  readToken,
  authenticate,
  optionalAuth,
  requireRole,
};
