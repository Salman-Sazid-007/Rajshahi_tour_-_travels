'use strict';

/**
 * GSM-7 vs Unicode (Bengali) SMS segment calculator.
 * Synthesized from chapaimangobd-reseller-main/backend/src/utils/gsm7.js
 * and hisaab-backend-main/src/utils/smsCounter.util.js.
 *
 * Standard GSM-7: 160 chars single segment, 153 chars per multipart segment.
 * Unicode (Bengali): 70 chars single segment, 67 chars per multipart segment.
 */

const GSM7_BASIC = new Set(
  '@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞ !"#¤%&\'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà'
);
const GSM7_EXT = new Set('^{}\\[~]|€\f');

function isGsm7(text = '') {
  for (const ch of String(text)) {
    if (!GSM7_BASIC.has(ch) && !GSM7_EXT.has(ch)) return false;
  }
  return true;
}

function measure(text = '') {
  const str = String(text || '');
  if (!str.length) {
    return { encoding: 'gsm', chars: 0, segments: 0, perSegment: 160, remaining: 160 };
  }

  const gsm = isGsm7(str);
  if (gsm) {
    let septets = 0;
    for (const ch of str) {
      septets += GSM7_EXT.has(ch) ? 2 : 1;
    }
    const singleMax = 160;
    const multiMax = 153;
    const segments = septets <= singleMax ? 1 : Math.ceil(septets / multiMax);
    const perSegment = segments === 1 ? singleMax : multiMax;
    const remaining = segments * perSegment - septets;
    return { encoding: 'gsm', chars: septets, segments, perSegment, remaining };
  }

  const chars = Array.from(str).length;
  const singleMax = 70;
  const multiMax = 67;
  const segments = chars <= singleMax ? 1 : Math.ceil(chars / multiMax);
  const perSegment = segments === 1 ? singleMax : multiMax;
  const remaining = segments * perSegment - chars;
  return { encoding: 'unicode', chars, segments, perSegment, remaining };
}

module.exports = { isGsm7, measure };
