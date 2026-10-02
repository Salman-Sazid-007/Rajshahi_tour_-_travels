'use strict';

const ROLES = Object.freeze({
  OWNER: 'owner',
  ACCOUNTANT: 'accountant',
  GUIDE: 'guide',
});

const ROLE_LABELS_BN = Object.freeze({
  owner: 'মালিক (Owner)',
  accountant: 'একাউন্ট্যান্ট (Accountant)',
  guide: 'ট্যুর গাইড (Tour Guide)',
});

const TOUR_STATUS = Object.freeze({
  RUNNING: 'running',
  UPCOMING: 'upcoming',
  COMPLETED: 'completed',
  DRAFT: 'draft',
});

const INQUIRY_STATUS = Object.freeze({
  NEW: 'new',
  CONTACTED: 'contacted',
  CONVERTED: 'converted',
  CLOSED: 'closed',
});

const CUSTOMER_TAGS = Object.freeze({
  LOYAL: 'loyal',
  REPEAT: 'repeat',
  VIP: 'vip',
  NEW: 'new',
});

const PAYMENT_METHODS = Object.freeze({
  BKASH: 'bkash',
  NAGAD: 'nagad',
  CASH: 'cash',
  BANK: 'bank',
});

const BOOKING_SOURCES = Object.freeze({
  PHONE: 'phone',
  FACEBOOK: 'facebook',
  WEBSITE: 'website',
  WALKIN: 'walkin',
});

const SMS_CATEGORIES = Object.freeze({
  RUNNING_TOUR: 'running_tour',
  BOOKING_CONFIRM: 'booking_confirm',
  FEEDBACK_LINK: 'feedback_link',
  PROMO_CAMPAIGN: 'promo_campaign',
  DUE_REMINDER: 'due_reminder',
  MANUAL: 'manual',
});

module.exports = {
  ROLES,
  ROLE_LABELS_BN,
  TOUR_STATUS,
  INQUIRY_STATUS,
  CUSTOMER_TAGS,
  PAYMENT_METHODS,
  BOOKING_SOURCES,
  SMS_CATEGORIES,
};
