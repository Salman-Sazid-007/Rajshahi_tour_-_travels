'use strict';

/**
 * Bangladeshi phone number normalizer.
 * Converts local 01XXXXXXXXX or +8801XXXXXXXXX into canonical local (01XXXXXXXXX)
 * and E.164/gateway (8801XXXXXXXXX) forms.
 */

function toLocalBd(input = '') {
  const digits = String(input || '').replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('01')) return digits;
  if (digits.length === 13 && digits.startsWith('8801')) return digits.slice(2);
  if (digits.length === 10 && digits.startsWith('1')) return `0${digits}`;
  return digits || String(input || '').trim();
}

function toGatewayBd(input = '') {
  const local = toLocalBd(input);
  if (local.length === 11 && local.startsWith('01')) {
    return `88${local}`;
  }
  return local;
}

function isValidBdPhone(input = '') {
  const local = toLocalBd(input);
  return /^01[3-9]\d{8}$/.test(local);
}

module.exports = { toLocalBd, toGatewayBd, isValidBdPhone };
