'use strict';

require('dotenv').config();

const env = {
  NODE_ENV: process.env.NODE_ENV || 'development',
  isProd: process.env.NODE_ENV === 'production',
  PORT: Number(process.env.PORT) || 3000,
  HOST: process.env.HOST || '0.0.0.0',
  MONGODB_URI: process.env.MONGODB_URI || '',
  JWT_SECRET: process.env.JWT_SECRET || 'rajshahi-tours-travels-secret-key-2026-secure',
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '7d',
  COOKIE_NAME: 'rtt_session',

  // SMS Gateways (Automas & MimSMS)
  SMS_ENABLED: process.env.SMS_ENABLED !== 'false',
  AUTOMAS_API_KEY: process.env.AUTOMAS_API_KEY || '',
  AUTOMAS_SENDER_ID: process.env.AUTOMAS_SENDER_ID || 'RajshahiTour',
  AUTOMAS_BASE_URL: process.env.AUTOMAS_BASE_URL || 'https://api.automas.com.bd/smsapiv3',

  MIMSMS_USERNAME: process.env.MIMSMS_USERNAME || '',
  MIMSMS_API_KEY: process.env.MIMSMS_API_KEY || '',
  MIMSMS_SENDER_ID: process.env.MIMSMS_SENDER_ID || 'RajshahiTour',
  MIMSMS_BASE_URL: process.env.MIMSMS_BASE_URL || 'https://api.mimsms.com',
};

if (env.isProd && (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32 || process.env.JWT_SECRET === 'rajshahi-tours-travels-secret-key-2026-secure')) {
  throw new Error('Production requires a unique JWT_SECRET of at least 32 characters.');
}

env.smsGatewayConfigured = Boolean(
  (env.AUTOMAS_API_KEY && env.AUTOMAS_SENDER_ID) ||
    (env.MIMSMS_USERNAME && env.MIMSMS_API_KEY)
);

module.exports = env;
