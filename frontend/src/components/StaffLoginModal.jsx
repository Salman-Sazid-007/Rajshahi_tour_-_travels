import React, { useState } from 'react';
import {
  Calculator,
  Compass,
  Crown,
  KeyRound,
  LogIn,
  ShieldCheck,
  X,
} from 'lucide-react';
import { apiFetch } from '../lib/api';

const ROLE_CARDS = [
  {
    role: 'owner',
    title: 'মালিক অ্যাকাউন্ট (Owner)',
    person: 'সালমান সাজিদ',
    phone: '01711000001',
    badge: 'সম্পূর্ণ নিয়ন্ত্রণ',
    badgeColor: 'bg-amber-500 text-slate-950',
    icon: Crown,
    desc: 'ট্যুর তৈরি, বাজেট ও ব্রেক-ইভেন হিসাব, চলমান ট্যুরের এসএমএস, বুকিং, কাস্টমার সিআরএম, একাউন্টিং ও ওয়েবসাইট কন্ট্রোল।',
  },
  {
    role: 'accountant',
    title: 'একাউন্ট্যান্ট (Accountant)',
    person: 'তানভীর আহমেদ',
    phone: '01711000002',
    badge: 'হিসাব ও বুকিং',
    badgeColor: 'bg-sky-500 text-white',
    icon: Calculator,
    desc: 'ট্রাভেলার বুকিং, এডভান্স ও বাকি (Due) হিসাব, মাসিক ট্যুর খরচ, অফিস ভাড়া ও নিট প্রফিট স্টেটমেন্ট।',
  },
  {
    role: 'guide',
    title: 'ট্যুর গাইড (Tour Guide)',
    person: 'মনিরুল ইসলাম (মনিরুল ভাই)',
    phone: '01711000003',
    badge: 'মাঠ পর্যায়ের গাইড',
    badgeColor: 'bg-emerald-600 text-white',
    icon: Compass,
    desc: 'চলমান ট্যুরের ট্রাভেলারদের ১ ক্লিকে গ্রুপ এসএমএস ("দুপুরের খাবার রেডি"), খাবার তালিকা ও সাজেকের হোটেল/গাড়ির নাম্বার।',
  },
];

export default function StaffLoginModal({ onClose, onLoginSuccess }) {
  const [phoneOrRole, setPhoneOrRole] = useState('01711000001');
  const [password, setPassword] = useState('123456');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleQuickLogin = async (roleKey) => {
    setLoading(true);
    setError('');
    try {
      const res = await apiFetch('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ phoneOrRole: roleKey, password: 'demo' }),
      });
      if (res.token) {
        localStorage.setItem('rtt_token', res.token);
      }
      onLoginSuccess(res.user);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleFormLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await apiFetch('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ phoneOrRole, password }),
      });
      if (res.token) {
        localStorage.setItem('rtt_token', res.token);
      }
      onLoginSuccess(res.user);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 p-4 backdrop-blur-sm overflow-y-auto">
      <div className="relative w-full max-w-2xl rounded-3xl bg-white shadow-2xl border border-slate-200 overflow-hidden my-8">
        <div className="bg-gradient-to-r from-emerald-950 via-emerald-900 to-slate-900 px-6 py-5 text-white flex items-center justify-between">
          <div>
            <div className="inline-flex items-center gap-1.5 rounded-full bg-amber-400/20 px-3 py-0.5 text-xs font-bold text-amber-300 mb-1">
              <ShieldCheck className="h-3.5 w-3.5" />
              স্টাফ ও ম্যানেজমেন্ট পোর্টাল
            </div>
            <h3 className="text-xl font-bold">রাজশাহী ট্যুরস এন্ড ট্রাভেলস — স্টাফ লগইন</h3>
            <p className="text-xs text-emerald-200 mt-0.5">
              ভিডিওতে দেখানো ৩ ধরনের অ্যাকাউন্ট (মালিক, একাউন্ট্যান্ট ও ট্যুর গাইড) ১ ক্লিকে প্রবেশ করুন
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-full bg-white/10 p-2 text-white hover:bg-white/20 transition"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {error && (
            <div className="rounded-xl bg-rose-50 border border-rose-200 px-4 py-3 text-sm text-rose-700 font-medium">
              {error}
            </div>
          )}

          {/* One-click Role Demo Cards (as shown in the video) */}
          <div>
            <div className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3">
              ১ ক্লিকে ডেমো অ্যাকাউন্টে প্রবেশ করুন (ভিডিও প্রোটোটাইপ মোড):
            </div>
            <div className="grid grid-cols-1 gap-3">
              {ROLE_CARDS.map((card) => {
                const Icon = card.icon;
                return (
                  <div
                    key={card.role}
                    onClick={() => handleQuickLogin(card.role)}
                    className="group cursor-pointer rounded-2xl border border-slate-200 bg-slate-50/70 p-4 hover:border-emerald-600 hover:bg-emerald-50/40 transition flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                  >
                    <div className="flex items-start gap-3.5">
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-emerald-900 text-amber-400 shadow-sm">
                        <Icon className="h-5 w-5" />
                      </div>
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-bold text-slate-900">{card.title}</span>
                          <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${card.badgeColor}`}>
                            {card.badge}
                          </span>
                        </div>
                        <div className="text-xs font-semibold text-emerald-800 mt-0.5">
                          {card.person} • {card.phone}
                        </div>
                        <p className="text-xs text-slate-600 mt-1 leading-relaxed">{card.desc}</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      disabled={loading}
                      className="shrink-0 inline-flex items-center justify-center gap-1.5 rounded-xl bg-emerald-800 px-4 py-2.5 text-xs font-bold text-white group-hover:bg-amber-500 group-hover:text-slate-950 transition"
                    >
                      <LogIn className="h-4 w-4" />
                      প্রবেশ করুন
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Standard Credentials Form */}
          <form onSubmit={handleFormLogin} className="border-t border-slate-200 pt-5">
            <div className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3 flex items-center gap-1.5">
              <KeyRound className="h-3.5 w-3.5" />
              অথবা ফোন নাম্বার ও পাসওয়ার্ড দিয়ে লগইন করুন
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <input
                type="text"
                value={phoneOrRole}
                onChange={(e) => setPhoneOrRole(e.target.value)}
                placeholder="ফোন নাম্বার (01711000001)"
                className="rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm focus:border-emerald-600 focus:outline-none"
              />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="পাসওয়ার্ড"
                className="rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm focus:border-emerald-600 focus:outline-none"
              />
              <button
                type="submit"
                disabled={loading}
                className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-bold text-white hover:bg-slate-800 transition"
              >
                {loading ? 'লগইন হচ্ছে...' : 'লগইন করুন'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
