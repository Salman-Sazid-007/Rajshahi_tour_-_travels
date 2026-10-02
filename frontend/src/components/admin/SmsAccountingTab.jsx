import React, { useEffect, useState } from 'react';
import {
  Calculator,
  Calendar,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Download,
  Edit3,
  MessageSquare,
  Plus,
  Printer,
  Send,
  Trash2,
  TrendingUp,
} from 'lucide-react';
import { apiFetch, formatBnDate, formatTaka, measureSmsClient } from '../../lib/api';

const PROMO_TEMPLATES = [
  {
    label: 'সাজেক ভ্যালি স্পেশাল ডিসকাউন্ট অফার',
    text: 'প্রিয় {name}, আমাদের ১৫ অক্টোবরের সাজেক ভ্যালি গ্রুপ ট্যুরে লয়াল কাস্টমারদের জন্য থাকছে ৫০০ টাকা স্পেশাল ডিসকাউন্ট! সিট বুক করতে কল করুন: 01711-987654 - রাজশাহী ট্যুরস এন্ড ট্রাভেলস।',
  },
  {
    label: 'সিলেট ভ্রমণ (৩০ অক্টোবর) আমন্ত্রণ',
    text: 'প্রিয় {name}, আগামী ৩০ অক্টোবর আমাদের সিলেট (সাদাপাথর, রাতারগুল ও জাফলং) ট্যুর অনুষ্ঠিত হবে। জনপ্রতি মাত্র ৩,৮০০ টাকা! বুকিং হটলাইন: 01711-987654',
  },
  {
    label: 'চলমান ট্যুর — দুপুরের খাবার রেডি',
    text: 'দুপুরের খাবার রেডি, সবাই ডাইনিং এ চলে আসেন। - মনিরুল ভাই (রাজশাহী ট্যুরস এন্ড ট্রাভেলস)',
  },
];

export function SmsPanelView({ showToast }) {
  const [overview, setOverview] = useState({ stats: {}, logs: [] });
  const [customers, setCustomers] = useState([]);
  const [audience, setAudience] = useState('loyal'); // 'all' | 'loyal' | 'repeat' | 'vip'
  const [selectedPhones, setSelectedPhones] = useState([]);
  const [message, setMessage] = useState(PROMO_TEMPLATES[0].text);
  const [sending, setSending] = useState(false);

  const loadData = () => {
    Promise.all([apiFetch('/api/sms/overview'), apiFetch('/api/customers')])
      .then(([sRes, cRes]) => {
        setOverview({ stats: sRes.stats || {}, logs: sRes.logs || [] });
        const custs = cRes.customers || [];
        setCustomers(custs);
        const loyalPhones = custs
          .filter((c) => (c.tags || []).includes('loyal'))
          .map((c) => c.phone);
        setSelectedPhones(loyalPhones);
      })
      .catch(() => {});
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleAudienceChange = (aud) => {
    setAudience(aud);
    if (aud === 'all') {
      setSelectedPhones(customers.map((c) => c.phone));
    } else {
      setSelectedPhones(
        customers.filter((c) => (c.tags || []).includes(aud)).map((c) => c.phone)
      );
    }
  };

  const togglePhone = (phone) => {
    setSelectedPhones((prev) =>
      prev.includes(phone) ? prev.filter((p) => p !== phone) : [...prev, phone]
    );
  };

  const smsMeta = measureSmsClient(message);

  const handleSendCampaign = async (e) => {
    e.preventDefault();
    const recipients = customers
      .filter((c) => selectedPhones.includes(c.phone))
      .map((c) => ({ name: c.name, phone: c.phone }));

    if (!recipients.length) {
      alert('অনুগ্রহ করে অন্তত ১ জন প্রাপক সিলেক্ট করুন');
      return;
    }

    setSending(true);
    try {
      const res = await apiFetch('/api/sms/send', {
        method: 'POST',
        body: JSON.stringify({
          audience,
          customRecipients: recipients,
          message,
        }),
      });
      showToast(res.message || 'ক্যাম্পেইন এসএমএস পাঠানো হয়েছে!');
      loadData();
    } catch (err) {
      alert(err.message);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Gateway & Stats Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-2xl bg-white border border-slate-200 p-4">
          <div className="text-xs font-bold text-slate-500">মোট পাঠানো এসএমএস</div>
          <div className="text-2xl font-black text-slate-900 mt-1">
            {overview.stats.totalDispatched || 0}টি মেসেজ
          </div>
          <div className="text-[11px] text-emerald-700 font-semibold mt-0.5">
            ডেলিভারি রেট: ১০০% ({overview.stats.deliveredCount || 0} ডেলিভারড)
          </div>
        </div>
        <div className="rounded-2xl bg-white border border-slate-200 p-4">
          <div className="text-xs font-bold text-slate-500">ব্যবহৃত সেগমেন্ট ও গেটওয়ে</div>
          <div className="text-2xl font-black text-emerald-800 mt-1">
            {overview.stats.totalSegments || 0} সেগমেন্ট
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5">
            {overview.stats.activeGateway || 'Automas + MimSMS'}
          </div>
        </div>
        <div className="rounded-2xl bg-emerald-950 text-white p-4">
          <div className="text-xs font-bold text-amber-300">এসএমএস ক্রেডিট ব্যালেন্স</div>
          <div className="text-2xl font-black mt-1">
            {overview.stats.gatewayBalance || 4850} ক্রেডিট
          </div>
          <div className="text-[11px] text-emerald-200 mt-0.5">
            বাংলা ইউনিকোড ও ইংরেজি GSM-7 সাপোর্টেড
          </div>
        </div>
      </div>

      {/* Campaign Composer + Recipient Checkboxes */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <form
          onSubmit={handleSendCampaign}
          className="lg:col-span-7 rounded-3xl bg-white border border-slate-200 p-6 shadow-sm space-y-4"
        >
          <div>
            <h3 className="text-lg font-black text-slate-900">
              টার্গেটেড অফার ও ডিসকাউন্ট এসএমএস প্যানেল
            </h3>
            <p className="text-xs text-slate-500">
              সব কাস্টমার, শুধুমাত্র লয়াল কাস্টমার অথবা রিপিট কাস্টমারদের একসাথে এসএমএস পাঠান (`{'{name}'}` দিলে প্রত্যেকের নিজ নাম বসবে)
            </p>
          </div>

          {/* Audience Filter Buttons */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-2">
              ১. কাদের কাছে মেসেজ পাঠাতে চান?
            </label>
            <div className="flex flex-wrap gap-2">
              {[
                { id: 'loyal', label: '★ শুধু লয়াল কাস্টমার (Loyal)' },
                { id: 'repeat', label: '↻ শুধু রিপিট কাস্টমার (Repeat)' },
                { id: 'all', label: '👥 সব কাস্টমার (All)' },
                { id: 'vip', label: '👑 VIP কাস্টমার' },
              ].map((btn) => (
                <button
                  type="button"
                  key={btn.id}
                  onClick={() => handleAudienceChange(btn.id)}
                  className={`rounded-xl px-3.5 py-2 text-xs font-bold border transition ${
                    audience === btn.id
                      ? 'bg-emerald-800 text-white border-emerald-800'
                      : 'bg-slate-50 text-slate-700 border-slate-200 hover:border-emerald-500'
                  }`}
                >
                  {btn.label}
                </button>
              ))}
            </div>
          </div>

          {/* Quick Templates */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              ২. রেডিমেড প্রমোশনাল টেমপ্লেট:
            </label>
            <div className="flex flex-wrap gap-2">
              {PROMO_TEMPLATES.map((tpl, idx) => (
                <button
                  type="button"
                  key={idx}
                  onClick={() => setMessage(tpl.text)}
                  className="rounded-xl bg-amber-50 hover:bg-amber-100 border border-amber-200 px-3 py-1.5 text-xs font-bold text-amber-950 transition"
                >
                  {tpl.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between text-xs mb-1">
              <span className="font-bold text-slate-700">৩. মেসেজ লিখুন:</span>
              <span className="text-slate-500 font-semibold">
                {smsMeta.encoding} • {smsMeta.chars} অক্ষর • {smsMeta.segments} সেগমেন্ট/এসএমএস
              </span>
            </div>
            <textarea
              rows={4}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              className="w-full rounded-2xl border border-slate-300 p-4 text-sm font-medium focus:border-emerald-600 focus:outline-none"
            />
          </div>

          <div className="flex items-center justify-between pt-2">
            <span className="text-xs font-bold text-emerald-800">
              সিলেক্টেড প্রাপক: {selectedPhones.length} জন (মোট {selectedPhones.length * smsMeta.segments} সেগমেন্ট)
            </span>
            <button
              type="submit"
              disabled={sending}
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-800 hover:bg-emerald-900 px-6 py-3 text-xs sm:text-sm font-bold text-white shadow-md transition"
            >
              <Send className="h-4 w-4 text-amber-300" />
              {sending ? 'পাঠানো হচ্ছে...' : `একসাথে ${selectedPhones.length} জনকে এসএমএস পাঠান`}
            </button>
          </div>
        </form>

        {/* Individual Recipient Selection List ("কাকে দিব কাকে দিব না") */}
        <div className="lg:col-span-5 rounded-3xl bg-white border border-slate-200 p-5 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <div>
                <h4 className="font-extrabold text-sm text-slate-900">
                  প্রাপক তালিকা (কাকে দিবেন / কাকে বাদ দিবেন)
                </h4>
                <p className="text-[11px] text-slate-500">
                  টিক চিহ্ন দিয়ে নির্দিষ্ট কাস্টমারকে যুক্ত বা বাদ দিতে পারেন
                </p>
              </div>
              <span className="rounded-full bg-emerald-100 text-emerald-900 px-2.5 py-0.5 text-xs font-bold">
                {selectedPhones.length}/{customers.length}
              </span>
            </div>

            <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
              {customers.map((c) => {
                const checked = selectedPhones.includes(c.phone);
                return (
                  <label
                    key={c.id}
                    className={`flex items-center justify-between rounded-xl border p-3 cursor-pointer text-xs transition ${
                      checked
                        ? 'border-emerald-500 bg-emerald-50/40'
                        : 'border-slate-200 bg-slate-50/50 opacity-70'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => togglePhone(c.phone)}
                        className="h-4 w-4 accent-emerald-700"
                      />
                      <div>
                        <div className="font-bold text-slate-900">{c.name}</div>
                        <div className="text-slate-500 font-mono">{c.phone}</div>
                      </div>
                    </div>
                    <div className="flex gap-1">
                      {(c.tags || []).map((t) => (
                        <span
                          key={t}
                          className="rounded-full bg-white border border-slate-200 px-2 py-0.5 text-[10px] font-bold text-slate-700"
                        >
                          {t === 'loyal' ? '★ লয়াল' : t === 'repeat' ? '↻ রিপিট' : t}
                        </span>
                      ))}
                    </div>
                  </label>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* SMS Delivery Tracking Logs */}
      <div className="rounded-3xl bg-white border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200">
          <h4 className="font-extrabold text-base text-slate-900">
            এসএমএস ডেলিভারি ট্র্যাকিং লগ (কার কার কাছে গেছে)
          </h4>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-extrabold uppercase text-slate-500">
                <th className="py-3 px-4">প্রাপক ও নাম্বার</th>
                <th className="py-3 px-4">মেসেজ টেক্সট</th>
                <th className="py-3 px-4">ক্যাটাগরি ও গেটওয়ে</th>
                <th className="py-3 px-4">স্ট্যাটাস</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {(overview.logs || []).map((log) => (
                <tr key={log.id} className="hover:bg-slate-50/70">
                  <td className="py-3 px-4">
                    <div className="font-bold text-slate-900">{log.recipientName}</div>
                    <div className="font-mono text-slate-500">{log.phone}</div>
                  </td>
                  <td className="py-3 px-4 max-w-md">
                    <p className="text-slate-700 line-clamp-2">{log.message}</p>
                  </td>
                  <td className="py-3 px-4">
                    <div className="font-semibold text-slate-800">{log.gateway}</div>
                    <div className="text-[11px] text-slate-500">
                      {log.segments} সেগমেন্ট • {log.sentBy}
                    </div>
                  </td>
                  <td className="py-3 px-4">
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 text-emerald-800 px-2.5 py-1 font-bold text-[11px]">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      Delivered
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export function AccountingView({ showToast }) {
  const [month, setMonth] = useState('2026-10');
  const [report, setReport] = useState(null);
  const [editingTour, setEditingTour] = useState(null);
  const [newExpense, setNewExpense] = useState({
    title: '',
    category: 'marketing',
    amount: '',
  });

  const loadReport = (targetMonth = month) => {
    apiFetch(`/api/accounting/monthly?month=${targetMonth}`)
      .then((res) => setReport(res.report))
      .catch(() => {});
  };

  useEffect(() => {
    loadReport(month);
  }, [month]);

  const handleSaveTourCost = async (e) => {
    e.preventDefault();
    if (!editingTour) return;
    try {
      const res = await apiFetch(`/api/accounting/tour-costs/${editingTour.tourId}`, {
        method: 'PUT',
        body: JSON.stringify({ month, ...editingTour }),
      });
      setReport(res.report);
      setEditingTour(null);
      showToast('ট্যুরের আয়-ব্যয়ের হিসাব আপডেট হয়েছে!');
    } catch (err) {
      alert(err.message);
    }
  };

  const handleAddExpense = async (e) => {
    e.preventDefault();
    if (!newExpense.title || !newExpense.amount) return;
    try {
      const res = await apiFetch('/api/accounting/expenses', {
        method: 'POST',
        body: JSON.stringify({
          month,
          title: newExpense.title,
          category: newExpense.category,
          amount: Number(newExpense.amount) || 0,
        }),
      });
      setReport(res.report);
      setNewExpense({ title: '', category: 'marketing', amount: '' });
      showToast('নতুন খরচ যুক্ত করা হয়েছে!');
    } catch (err) {
      alert(err.message);
    }
  };

  const handleDeleteExpense = async (id) => {
    try {
      const res = await apiFetch(`/api/accounting/expenses/${id}?month=${month}`, {
        method: 'DELETE',
      });
      setReport(res.report);
      showToast('খরচ মুছে ফেলা হয়েছে');
    } catch (err) {
      alert(err.message);
    }
  };

  if (!report) {
    return <div className="p-8 text-center text-slate-500">একাউন্টিং রিপোর্ট লোড হচ্ছে...</div>;
  }

  const { summary = {}, tourRecords = [], officeExpenses = [] } = report;

  return (
    <div className="space-y-6">
      {/* Top Month Switcher & Print/Download Receipt Button */}
      <div className="rounded-3xl bg-white border border-slate-200 p-5 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4 no-print">
        <div>
          <h3 className="text-xl font-black text-slate-900">
            একাউন্টিং ও মাসিক প্রফিট-লস স্টেটমেন্ট (মালিক ও একাউন্ট্যান্ট)
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            ট্যুরভিত্তিক ইনকাম, বাস, হোটেল, খাবার, গাইড, নৌকা ও অফিস ভাড়া/ওয়াইফাই বাদে নিট প্রফিট হিসাব
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <div className="inline-flex items-center rounded-2xl bg-slate-100 p-1 border border-slate-200">
            <button
              onClick={() => setMonth('2026-09')}
              className={`rounded-xl px-4 py-2 text-xs font-extrabold transition ${
                month === '2026-09'
                  ? 'bg-emerald-800 text-white shadow-sm'
                  : 'text-slate-700 hover:text-slate-950'
              }`}
            >
              ← সেপ্টেম্বর ২০২৬ (৩টি ট্যুর)
            </button>
            <button
              onClick={() => setMonth('2026-10')}
              className={`rounded-xl px-4 py-2 text-xs font-extrabold transition ${
                month === '2026-10'
                  ? 'bg-emerald-800 text-white shadow-sm'
                  : 'text-slate-700 hover:text-slate-950'
              }`}
            >
              অক্টোবর ২০২৬ (চলতি মাস) →
            </button>
          </div>

          <button
            onClick={() => window.print()}
            className="inline-flex items-center gap-2 rounded-xl bg-amber-400 hover:bg-amber-300 px-4 py-2.5 text-xs font-black text-slate-950 shadow-sm transition"
          >
            <Download className="h-4 w-4" />
            রিসিপ্ট ডাউনলোড / প্রিন্ট
          </button>
        </div>
      </div>

      {/* Main Financial KPI Cards (Video Numbers: Gross Profit 73,000, Office Rent+WiFi 10,000, Net Profit 63,000!) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-2xl bg-white border border-slate-200 p-5">
          <div className="text-xs font-bold text-slate-500">
            {report.labelBn} — মোট ট্যুর ইনকাম
          </div>
          <div className="text-2xl font-black text-slate-900 mt-1 tabular-nums">
            {formatTaka(summary.totalIncome)}
          </div>
          <div className="text-[11px] text-slate-500 mt-1">
            মোট প্ল্যানড বাজেট: {formatTaka(summary.plannedBudget)}
          </div>
        </div>

        <div className="rounded-2xl bg-white border border-slate-200 p-5">
          <div className="text-xs font-bold text-slate-500">
            ট্যুর পরিচালনা মোট খরচ (Bus+Hotel+Food)
          </div>
          <div className="text-2xl font-black text-rose-700 mt-1 tabular-nums">
            {formatTaka(summary.totalTourExpense)}
          </div>
          <div className="text-[11px] text-slate-500 mt-1">
            বাস: {formatTaka(summary.busCost)} • হোটেল: {formatTaka(summary.hotelCost)} • খাবার:{' '}
            {formatTaka(summary.foodCost)}
          </div>
        </div>

        <div className="rounded-2xl bg-emerald-50 border border-emerald-200 p-5">
          <div className="text-xs font-bold text-emerald-800">
            গ্রস প্রফিট (Gross Profit)
          </div>
          <div className="text-2xl font-black text-emerald-900 mt-1 tabular-nums">
            {formatTaka(summary.grossProfit)}
          </div>
          <div className="text-[11px] text-emerald-700 mt-1">
            ট্যুর ইনকাম থেকে ট্যুরের সব খরচ বাদে
          </div>
        </div>

        <div className="rounded-2xl bg-emerald-950 text-white p-5 shadow-md">
          <div className="text-xs font-bold text-amber-300">
            হাতে নিট প্রফিট (Net Profit)
          </div>
          <div className="text-3xl font-black text-amber-400 mt-1 tabular-nums">
            {formatTaka(summary.netProfit)}
          </div>
          <div className="text-[11px] text-emerald-200 mt-1">
            অফিস ভাড়া ও ওয়াইফাই ({formatTaka(summary.totalOfficeExpenses)}) বাদ দিয়ে
          </div>
        </div>
      </div>

      {/* Tour-by-Tour Breakdown Table */}
      <div className="rounded-3xl bg-white border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <div>
            <h4 className="font-extrabold text-base text-slate-900">
              {report.labelBn} — ট্যুরভিত্তিক আয় ও খরচের বিস্তারিত হিসাব
            </h4>
            <p className="text-xs text-slate-500">
              বাস ভাড়া, হোটেল বিল, খাবারের খরচ, গাইড সম্মানী, নৌকা/চাঁদের গাড়ি ও মার্কেটিং খরচ এডিট করতে পারবেন
            </p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-extrabold uppercase text-slate-500">
                <th className="py-3.5 px-4">ট্যুরের নাম ও তারিখ</th>
                <th className="py-3.5 px-3 text-right">মোট ইনকাম</th>
                <th className="py-3.5 px-3 text-right">বাস খরচ</th>
                <th className="py-3.5 px-3 text-right">হোটেল</th>
                <th className="py-3.5 px-3 text-right">খাবার</th>
                <th className="py-3.5 px-3 text-right">গাইড ও নৌকা</th>
                <th className="py-3.5 px-3 text-right">মার্কেটিং</th>
                <th className="py-3.5 px-4 text-right">গ্রস প্রফিট</th>
                <th className="py-3.5 px-3 text-right no-print">এডিট</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs tabular-nums">
              {tourRecords.map((tr) => (
                <tr key={tr.tourId} className="hover:bg-slate-50/80">
                  <td className="py-3.5 px-4">
                    <div className="font-extrabold text-slate-900">{tr.tourTitle}</div>
                    <div className="text-[11px] text-slate-500">
                      📅 {formatBnDate(tr.startDate)} • বাজেট প্ল্যান: {formatTaka(tr.plannedBudget)}
                    </div>
                  </td>
                  <td className="py-3.5 px-3 text-right font-black text-emerald-800">
                    {formatTaka(tr.totalIncome)}
                  </td>
                  <td className="py-3.5 px-3 text-right text-slate-700">
                    {formatTaka(tr.busCost)}
                  </td>
                  <td className="py-3.5 px-3 text-right text-slate-700">
                    {formatTaka(tr.hotelCost)}
                  </td>
                  <td className="py-3.5 px-3 text-right text-slate-700">
                    {formatTaka(tr.foodCost)}
                  </td>
                  <td className="py-3.5 px-3 text-right text-slate-700">
                    {formatTaka((tr.guideCost || 0) + (tr.boatAndLocalCost || 0))}
                  </td>
                  <td className="py-3.5 px-3 text-right text-slate-700">
                    {formatTaka(tr.marketingCost)}
                  </td>
                  <td className="py-3.5 px-4 text-right font-black text-emerald-900 text-sm">
                    {formatTaka(tr.grossProfit)}
                  </td>
                  <td className="py-3.5 px-3 text-right no-print">
                    <button
                      onClick={() => setEditingTour({ ...tr })}
                      className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-bold text-slate-700 hover:border-emerald-600"
                    >
                      এডিট
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Office Rent, WiFi & Marketing Overhead Expenses */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7 rounded-3xl bg-white border border-slate-200 p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="font-extrabold text-base text-slate-900">
                অফিস ভাড়া, ওয়াইফাই ও অন্যান্য ফিক্সড খরচ ({report.labelBn})
              </h4>
              <p className="text-xs text-slate-500">
                গ্রস প্রফিট ({formatTaka(summary.grossProfit)}) থেকে এই খরচগুলো ({formatTaka(summary.totalOfficeExpenses)}) বাদ দিয়ে নিট প্রফিট ({formatTaka(summary.netProfit)}) হিসাব করা হয়েছে
              </p>
            </div>
          </div>

          <div className="space-y-2.5">
            {officeExpenses.map((exp) => (
              <div
                key={exp.id}
                className="flex items-center justify-between rounded-2xl border border-slate-200 px-4 py-3 text-xs"
              >
                <div>
                  <div className="font-bold text-slate-900 text-sm">{exp.title}</div>
                  <div className="text-slate-500">
                    তারিখ: {formatBnDate(exp.date)} • ক্যাটাগরি: {exp.category}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-black text-rose-700 text-sm tabular-nums">
                    {formatTaka(exp.amount)}
                  </span>
                  <button
                    onClick={() => handleDeleteExpense(exp.id)}
                    className="text-slate-400 hover:text-rose-600 no-print"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <form
          onSubmit={handleAddExpense}
          className="lg:col-span-5 rounded-3xl bg-white border border-slate-200 p-5 shadow-sm space-y-4 no-print"
        >
          <h4 className="font-extrabold text-base text-slate-900">
            + অফিস বা মার্কেটিং খরচ যুক্ত করুন
          </h4>
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              খরচের বিবরণ (যেমন: অফিস ভাড়া / ওয়াইফাই বিল / ফেসবুক বুস্ট)
            </label>
            <input
              type="text"
              required
              value={newExpense.title}
              onChange={(e) => setNewExpense({ ...newExpense, title: e.target.value })}
              placeholder="যেমন: ফেসবুক মার্কেটিং বুস্ট খরচ"
              className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">ক্যাটাগরি</label>
              <select
                value={newExpense.category}
                onChange={(e) => setNewExpense({ ...newExpense, category: e.target.value })}
                className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-xs font-bold"
              >
                <option value="office_rent">অফিস ভাড়া (Office Rent)</option>
                <option value="wifi">ওয়াইফাই ও ইন্টারনেট (WiFi)</option>
                <option value="marketing">মার্কেটিং খরচ (Marketing)</option>
                <option value="other">অন্যান্য খরচ</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">টাকার পরিমাণ *</label>
              <input
                type="number"
                required
                value={newExpense.amount}
                onChange={(e) => setNewExpense({ ...newExpense, amount: e.target.value })}
                placeholder="1500"
                className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm font-bold"
              />
            </div>
          </div>
          <button
            type="submit"
            className="w-full rounded-xl bg-emerald-800 hover:bg-emerald-900 py-3 text-xs font-bold text-white shadow-sm transition"
          >
            খরচ সংরক্ষণ করুন
          </button>
        </form>
      </div>

      {/* Edit Tour Accounting Costs Modal */}
      {editingTour && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 p-4 backdrop-blur-sm">
          <form
            onSubmit={handleSaveTourCost}
            className="w-full max-w-lg rounded-3xl bg-white shadow-2xl border border-slate-200 p-6 space-y-4"
          >
            <h4 className="font-extrabold text-base text-slate-900">
              ট্যুরের আয় ও খরচ এডিট — {editingTour.tourTitle}
            </h4>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">মোট ইনকাম (টাকা)</label>
                <input
                  type="number"
                  value={editingTour.totalIncome}
                  onChange={(e) =>
                    setEditingTour({ ...editingTour, totalIncome: Number(e.target.value) || 0 })
                  }
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 font-bold"
                />
              </div>
              <div>
                <label className="block font-bold text-slate-700 mb-1">বাস ভাড়া (Bus Cost)</label>
                <input
                  type="number"
                  value={editingTour.busCost}
                  onChange={(e) =>
                    setEditingTour({ ...editingTour, busCost: Number(e.target.value) || 0 })
                  }
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 font-bold"
                />
              </div>
              <div>
                <label className="block font-bold text-slate-700 mb-1">হোটেল বিল (Hotel)</label>
                <input
                  type="number"
                  value={editingTour.hotelCost}
                  onChange={(e) =>
                    setEditingTour({ ...editingTour, hotelCost: Number(e.target.value) || 0 })
                  }
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 font-bold"
                />
              </div>
              <div>
                <label className="block font-bold text-slate-700 mb-1">খাবার খরচ (Food)</label>
                <input
                  type="number"
                  value={editingTour.foodCost}
                  onChange={(e) =>
                    setEditingTour({ ...editingTour, foodCost: Number(e.target.value) || 0 })
                  }
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 font-bold"
                />
              </div>
              <div>
                <label className="block font-bold text-slate-700 mb-1">গাইড সম্মানী (Guide)</label>
                <input
                  type="number"
                  value={editingTour.guideCost}
                  onChange={(e) =>
                    setEditingTour({ ...editingTour, guideCost: Number(e.target.value) || 0 })
                  }
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 font-bold"
                />
              </div>
              <div>
                <label className="block font-bold text-slate-700 mb-1">নৌকা / চাঁদের গাড়ি</label>
                <input
                  type="number"
                  value={editingTour.boatAndLocalCost}
                  onChange={(e) =>
                    setEditingTour({
                      ...editingTour,
                      boatAndLocalCost: Number(e.target.value) || 0,
                    })
                  }
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 font-bold"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setEditingTour(null)}
                className="rounded-xl border border-slate-300 px-4 py-2 text-xs font-bold"
              >
                বাতিল
              </button>
              <button
                type="submit"
                className="rounded-xl bg-emerald-800 px-5 py-2 text-xs font-bold text-white"
              >
                আপডেট করুন
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
