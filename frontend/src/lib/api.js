import { handleBrowserApi } from './browserStore';

export async function apiFetch(path, options = {}) {
  const isGitHubPages =
    typeof window !== 'undefined' && window.location.hostname.endsWith('github.io');

  if (isGitHubPages) {
    return handleBrowserApi(path, options);
  }

  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };
  const token = localStorage.getItem('rtt_token');
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  try {
    const res = await fetch(path, {
      ...options,
      headers,
      credentials: 'include',
    });

    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      return handleBrowserApi(path, options);
    }

    const data = await res.json();
    if (!res.ok || data.success === false) {
      throw new Error(data.message || 'অনুরোধ সম্পন্ন করা যায়নি');
    }
    return data;
  } catch (err) {
    // Fallback to in-browser store if running in a static-only environment
    if (err instanceof TypeError || String(err.message).includes('Failed to fetch')) {
      return handleBrowserApi(path, options);
    }
    throw err;
  }
}

export function formatTaka(amount) {
  const num = Number(amount) || 0;
  return `৳${num.toLocaleString('en-IN')}`;
}

export function formatBnDate(dateStr) {
  if (!dateStr) return '';
  const monthsBn = [
    'জানুয়ারি',
    'ফেব্রুয়ারি',
    'মার্চ',
    'এপ্রিল',
    'মে',
    'জুন',
    'জুলাই',
    'আগস্ট',
    'সেপ্টেম্বর',
    'অক্টোবর',
    'নভেম্বর',
    'ডিসেম্বর',
  ];
  const parts = String(dateStr).slice(0, 10).split('-');
  if (parts.length !== 3) return dateStr;
  const year = parts[0];
  const monthIdx = parseInt(parts[1], 10) - 1;
  const day = parseInt(parts[2], 10);
  return `${day} ${monthsBn[monthIdx] || parts[1]}, ${year}`;
}

export function calculateReturnDateClient(startDateStr, days = 2, nights = 3) {
  if (!startDateStr) return '';
  const d = new Date(`${startDateStr}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return startDateStr;
  const span = Math.max(Number(days) || 0, Number(nights) || 0, 1);
  d.setUTCDate(d.getUTCDate() + span);
  return d.toISOString().slice(0, 10);
}

export function measureSmsClient(text = '') {
  const str = String(text || '');
  if (!str.length) {
    return { encoding: 'gsm', chars: 0, segments: 0, perSegment: 160 };
  }
  const isAscii = /^[\x00-\x7F]*$/.test(str);
  if (isAscii) {
    const chars = str.length;
    const segments = chars <= 160 ? 1 : Math.ceil(chars / 153);
    return { encoding: 'GSM-7', chars, segments, perSegment: segments === 1 ? 160 : 153 };
  }
  const chars = Array.from(str).length;
  const segments = chars <= 70 ? 1 : Math.ceil(chars / 67);
  return { encoding: 'Unicode (বাংলা)', chars, segments, perSegment: segments === 1 ? 70 : 67 };
}
