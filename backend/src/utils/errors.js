'use strict';

class AppError extends Error {
  constructor(statusCode, code, message) {
    super(message || code);
    this.name = 'AppError';
    this.statusCode = statusCode || 400;
    this.code = code || 'BAD_REQUEST';
  }
}

const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

const sendResponse = (res, statusCode, message, data = {}) => {
  res.status(statusCode).json({
    success: statusCode >= 200 && statusCode < 300,
    message,
    ...data,
  });
};

module.exports = { AppError, asyncHandler, sendResponse };
