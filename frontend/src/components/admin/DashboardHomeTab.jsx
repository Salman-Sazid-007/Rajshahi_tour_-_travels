import React, { useEffect, useState } from 'react';
import {
  BellRing,
  Calendar,
  CheckCircle2,
  Compass,
  MapPin,
  MessageSquare,
  Phone,
  Plus,
  Send,
  Sparkles,
  TrendingUp,
  Users,
  X,
} from 'lucide-react';
import { apiFetch, formatBnDate, formatTaka, measureSmsClient } from '../../lib/api';

export default function DashboardHomeTab({
  currentUser,
  onNavigateTab,
  onSelectTourForBookings,
  showToast,
}) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [smsText, setSmsText] = useState(
    'দুপুরের খাবার রেডি, সবাই ডাইনিং এ চলে আসেন। - মনিরুল ভাই (রাজশাহী ট্যুরস এন্ড ট্রাভেলস)'
  );
  const [reviewModalOpen, setReviewModalOpen] = useState(false);
  const [sendingSms, setSendingSms] = useState(false);

  const loadOverview = () => {
    setLoading(true);
    apiFetch('/api/dashboard/overview')
      .then((res) => setData(res))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadOverview();
  }, []);

  if (loading || !data) {
    return (
      <div className="p-8 text-center text-slate-500">ড্যাশবোর্ড তথ্য লোড হচ্ছে...</div>
    );
  }

  const { kpis = {}, runningTour, upcomingTours = [], recentInquiries = [], quickBroadcastTemplates = [] } = data;
  const smsMeta = measureSmsClient(smsText);
  const runningBookings = runningTour?.bookings || [];
  const totalRunningPax = runningBookings.reduce((s, b) => s + (Number(b.pax) || 1), 0);

  const handleBroadcastSend = async () => {
    if (!runningTour) return;
    setSendingSms(true);
    try {
      const res = await apiFetch(`/api/tours/${runningTour.id}/broadcast-sms`, {
        method: 'POST',
        body: JSON.stringify({ message: smsText }),
      });
      setReviewModalOpen(false);
      showToast(res.message || 'সবার নাম্বারে এসএমএস পাঠানো হয়েছে!');
      loadOverview();
    } catch (err) {
      alert(err.message);
    } finally {
      setSendingSms(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* KPI Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-2xl bg-white border border-slate-200 p-4 shadow-sm">
          <div className="flex items-center justify-between text-xs font-bold text-slate-500">
            <span>চলমান ও আপকামিং ট্যুর</span>
            <Compass className="h-4 w-4 text-emerald-600" />
          </div>
          <div className="text-2xl font-black text-slate-900 mt-1.5">
            {kpis.runningToursCount} চলমান • {kpis.upcomingToursCount} আপকামিং
          </div>
          <div className="text-[11px] text-emerald-700 font-semibold mt-1">
            ওয়েবসাইটে অটোমেটিক শিডিউল সক্রিয়
          </div>
        </div>

        <div
          onClick={() => onNavigateTab('inquiries')}
          className="cursor-pointer rounded-2xl bg-white border border-slate-200 hover:border-amber-400 p-4 shadow-sm transition"
        >
          <div className="flex items-center justify-between text-xs font-bold text-slate-500">
            <span>ওয়েবসাইট নতুন কুয়েরি</span>
            <BellRing className="h-4 w-4 text-amber-500" />
          </div>
          <div className="text-2xl font-black text-amber-600 mt-1.5">
            {kpis.newInquiriesCount}টি নতুন আগ্রহী
          </div>
          <div className="text-[11px] text-slate-500 mt-1">ক্লিক করে ফোন নাম্বার দেখুন →</div>
        </div>

        <div
          onClick={() => onNavigateTab('customers')}
          className="cursor-pointer rounded-2xl bg-white border border-slate-200 hover:border-emerald-500 p-4 shadow-sm transition"
        >
          <div className="flex items-center justify-between text-xs font-bold text-slate-500">
            <span>মোট নিবন্ধিত কাস্টমার</span>
            <Users className="h-4 w-4 text-emerald-600" />
          </div>
          <div className="text-2xl font-black text-slate-900 mt-1.5">
            {kpis.totalCustomersCount} জন
          </div>
          <div className="text-[11px] text-slate-500 mt-1">
            লয়াল ও রিপিট কাস্টমার ট্যাগ সহ
          </div>
        </div>

        {currentUser?.role !== 'guide' ? (
          <div
            onClick={() => onNavigateTab('accounting')}
            className="cursor-pointer rounded-2xl bg-emerald-950 text-white p-4 shadow-sm transition"
          >
            <div className="flex items-center justify-between text-xs font-bold text-amber-300">
              <span>চলতি মাসের নিট প্রফিট</span>
              <TrendingUp className="h-4 w-4 text-amber-400" />
            </div>
            <div className="text-2xl font-black text-white mt-1.5">
              {formatTaka(kpis.octoberNetProfit)}
            </div>
            <div className="text-[11px] text-emerald-200 mt-1">
              গ্রস প্রফিট: {formatTaka(kpis.octoberGrossProfit)}
            </div>
          </div>
        ) : (
          <div
            onClick={() => onNavigateTab('network')}
            className="cursor-pointer rounded-2xl bg-emerald-950 text-white p-4 shadow-sm transition"
          >
            <div className="flex items-center justify-between text-xs font-bold text-amber-300">
              <span>নেটওয়ার্ক কন্টাক্টস</span>
              <Phone className="h-4 w-4 text-amber-400" />
            </div>
            <div className="text-xl font-black text-white mt-1.5">
              হোটেল ও গাড়ির নাম্বার
            </div>
            <div className="text-[11px] text-emerald-200 mt-1">
              ১ ক্লিকে কল করতে এখানে যান →
            </div>
          </div>
        )}
      </div>

      {/* Currently Running Tour + Instant Group SMS Broadcast (Core Video Highlight!) */}
      {runningTour && (
        <div className="rounded-3xl bg-white border-2 border-emerald-600 shadow-md overflow-hidden">
          <div className="bg-gradient-to-r from-emerald-950 via-emerald-900 to-teal-900 px-6 py-4 text-white flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="inline-flex h-3 w-3 rounded-full bg-amber-400 animate-ping" />
              <div>
                <div className="text-xs font-bold text-amber-300 uppercase tracking-wider">
                  বর্তমানে চলমান ট্যুর (Currently Running Tour)
                </div>
                <h3 className="text-lg sm:text-xl font-black">{runningTour.title}</h3>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="rounded-xl bg-white/10 px-3 py-1.5 font-semibold">
                📍 {runningTour.destination}
              </span>
              <span className="rounded-xl bg-white/10 px-3 py-1.5 font-semibold">
                🧭 গাইড: {runningTour.guides?.map((g) => g.name).join(', ') || 'মনিরুল ভাই'}
              </span>
              <span className="rounded-xl bg-amber-400 text-slate-950 px-3 py-1.5 font-black">
                👥 {runningBookings.length} বুকিং ({totalRunningPax} জন ট্রাভেলার)
              </span>
            </div>
          </div>

          <div className="p-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Left: Group SMS Broadcast Composer */}
            <div className="lg:col-span-7 space-y-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h4 className="font-extrabold text-slate-900 text-base flex items-center gap-2">
                    <MessageSquare className="h-5 w-5 text-emerald-700" />
                    চলমান ট্যুরের ট্রাভেলারদের ১ ক্লিকে গ্রুপ এসএমএস পাঠান
                  </h4>
                  <p className="text-xs text-slate-600 mt-0.5">
                    সাজেকে ২০ জনকে আলাদা করে কল দেওয়ার ঝামেলা নেই এবং কারো ওয়াইফাই/ডাটা অন না থাকলেও ফোনে সরাসরি এসএমএস পৌঁছে যাবে।
                  </p>
                </div>
              </div>

              {/* Quick Templates */}
              <div>
                <div className="text-[11px] font-bold text-slate-500 uppercase mb-2">
                  রেডিমেড কুইক মেসেজ টেমপ্লেট (ক্লিক করলেই বসবে):
                </div>
                <div className="flex flex-wrap gap-2">
                  {quickBroadcastTemplates.map((tpl) => (
                    <button
                      key={tpl.id}
                      type="button"
                      onClick={() => setSmsText(tpl.text)}
                      className={`rounded-xl px-3 py-1.5 text-xs font-bold border transition ${
                        smsText === tpl.text
                          ? 'bg-emerald-800 text-white border-emerald-800'
                          : 'bg-slate-50 text-slate-700 border-slate-200 hover:border-emerald-500'
                      }`}
                    >
                      {tpl.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Editable SMS Box */}
              <div>
                <div className="flex items-center justify-between text-xs mb-1.5">
                  <span className="font-bold text-slate-700">
                    এসএমএস বডি (প্রয়োজনে হালকা এডিট করুন):
                  </span>
                  <span className="text-slate-500 font-medium">
                    {smsMeta.encoding} • {smsMeta.chars} অক্ষর • {smsMeta.segments} সেগমেন্ট
                  </span>
                </div>
                <textarea
                  rows={3}
                  value={smsText}
                  onChange={(e) => setSmsText(e.target.value)}
                  className="w-full rounded-2xl border border-slate-300 bg-amber-50/30 px-4 py-3 text-sm font-medium text-slate-900 focus:border-emerald-600 focus:outline-none"
                />
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3">
                <span className="text-xs text-slate-500">
                  প্রাপক: এই ট্যুরের বুকিংকৃত সব ট্রাভেলার ({runningBookings.length}টি নাম্বার)
                </span>
                <button
                  type="button"
                  onClick={() => setReviewModalOpen(true)}
                  className="inline-flex items-center gap-2 rounded-xl bg-emerald-800 hover:bg-emerald-900 px-5 py-3 text-xs sm:text-sm font-bold text-white shadow-md transition"
                >
                  <Send className="h-4 w-4 text-amber-300" />
                  রিভিউ এন্ড সেন্ড (Review &amp; Send)
                </button>
              </div>
            </div>

            {/* Right: Booked Travelers on Running Tour */}
            <div className="lg:col-span-5 rounded-2xl bg-slate-50 border border-slate-200 p-4 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-extrabold uppercase text-slate-600">
                    চলমান ট্যুরের ট্রাভেলার বুকিং লিস্ট
                  </span>
                  <button
                    onClick={() => {
                      onSelectTourForBookings(runningTour.id);
                      onNavigateTab('bookings');
                    }}
                    className="text-xs font-bold text-emerald-700 hover:underline"
                  >
                    সব বুকিং পরিচালনা →
                  </button>
                </div>

                <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                  {runningBookings.map((b) => (
                    <div
                      key={b.id}
                      className="rounded-xl bg-white border border-slate-200 px-3.5 py-2.5 flex items-center justify-between text-xs"
                    >
                      <div>
                        <div className="font-bold text-slate-900">
                          {b.customerName}{' '}
                          <span className="text-emerald-700">({b.pax} জন)</span>
                        </div>
                        <div className="text-slate-500">
                          📞 {b.customerPhone} • সিট: {b.seatNumbers || 'নির্ধারিত'}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-bold text-slate-900">
                          {formatTaka(b.totalAmount)}
                        </div>
                        {b.dueAmount > 0 ? (
                          <span className="text-[11px] font-bold text-rose-600">
                            বাকি: {formatTaka(b.dueAmount)}
                          </span>
                        ) : (
                          <span className="text-[11px] font-bold text-emerald-600">
                            ✓ পরিশোধিত
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Bottom Two Columns: Upcoming Tours & Website Queries */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Upcoming Tours */}
        <div className="lg:col-span-7 rounded-3xl bg-white border border-slate-200 p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="font-extrabold text-slate-900 text-base">আপকামিং ট্যুরসমূহ</h4>
              <p className="text-xs text-slate-500">
                যেকোনো ট্যুরে ক্লিক করে ট্রাভেলার বুকিং ও হিসাব দেখুন
              </p>
            </div>
            <button
              onClick={() => onNavigateTab('tours')}
              className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-800 px-3.5 py-2 text-xs font-bold text-white hover:bg-emerald-900 transition"
            >
              <Plus className="h-3.5 w-3.5" />
              নতুন ট্যুর তৈরি
            </button>
          </div>

          <div className="space-y-3">
            {upcomingTours.map((tour) => (
              <div
                key={tour.id}
                className="rounded-2xl border border-slate-200 p-4 hover:border-emerald-500 transition flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                <div className="flex items-center gap-3.5">
                  <img
                    src={tour.coverImage || '/media/sylhet-1.jpg'}
                    alt=""
                    className="h-14 w-16 rounded-xl object-cover shrink-0"
                  />
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-900 text-sm">{tour.title}</span>
                      {tour.isFeatured && (
                        <span className="rounded-full bg-amber-100 text-amber-900 px-2 py-0.5 text-[10px] font-bold">
                          হাইলাইটেড
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5">
                      📅 {formatBnDate(tour.startDate)} ({tour.days} দিন {tour.nights} রাত) • 💺 বুকিং:{' '}
                      <strong>{tour.bookingsCount}টি ({tour.seatsBooked}/{tour.totalSeats} সিট)</strong>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => {
                      onSelectTourForBookings(tour.id);
                      onNavigateTab('bookings');
                    }}
                    className="rounded-xl bg-emerald-50 border border-emerald-200 px-3.5 py-2 text-xs font-bold text-emerald-900 hover:bg-emerald-100 transition"
                  >
                    বুকিং দেখুন ({tour.bookingsCount})
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Recent Website Inquiries */}
        <div className="lg:col-span-5 rounded-3xl bg-white border border-slate-200 p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="font-extrabold text-slate-900 text-base">
                ওয়েবসাইট কুয়েরি (আগ্রহী ট্রাভেলার)
              </h4>
              <p className="text-xs text-slate-500">
                ওয়েবসাইট থেকে যারা ট্যুরে যেতে আগ্রহ প্রকাশ করেছে
              </p>
            </div>
            <button
              onClick={() => onNavigateTab('inquiries')}
              className="text-xs font-bold text-emerald-700 hover:underline"
            >
              সব দেখুন →
            </button>
          </div>

          <div className="space-y-2.5">
            {recentInquiries.map((inq) => (
              <div
                key={inq.id}
                className="rounded-2xl border border-slate-200 p-3.5 space-y-1.5"
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-sm text-slate-900">
                    {inq.name} ({inq.pax} জন)
                  </span>
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${
                      inq.status === 'new'
                        ? 'bg-amber-100 text-amber-900'
                        : inq.status === 'contacted'
                        ? 'bg-sky-100 text-sky-900'
                        : 'bg-emerald-100 text-emerald-900'
                    }`}
                  >
                    {inq.status === 'new'
                      ? 'নতুন (New)'
                      : inq.status === 'contacted'
                      ? 'কথা হয়েছে (Contacted)'
                      : 'কনভার্টেড (Converted)'}
                  </span>
                </div>
                <div className="text-xs text-emerald-800 font-semibold">
                  📞 {inq.phone} • {inq.tourTitle}
                </div>
                {inq.message && (
                  <p className="text-xs text-slate-600 line-clamp-2">“{inq.message}”</p>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Review & Send Group SMS Modal (Exact Video Step!) */}
      {reviewModalOpen && runningTour && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-3xl bg-white shadow-2xl border border-slate-200 overflow-hidden">
            <div className="bg-emerald-950 text-white px-6 py-4 flex items-center justify-between">
              <div>
                <div className="text-xs text-amber-300 font-bold">রিভিউ এন্ড সেন্ড (Review &amp; Send)</div>
                <h4 className="font-bold text-base">{runningTour.title}</h4>
              </div>
              <button
                onClick={() => setReviewModalOpen(false)}
                className="rounded-full bg-white/10 p-1.5 text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="rounded-2xl bg-emerald-50 border border-emerald-200 p-4">
                <div className="text-xs font-bold text-emerald-800 mb-1">চূড়ান্ত মেসেজ প্রিভিউ:</div>
                <p className="text-sm font-semibold text-slate-900">{smsText}</p>
              </div>

              <div>
                <div className="text-xs font-bold text-slate-600 mb-2">
                  যাদের নাম্বারে এসএমএস যাবে ({runningBookings.length} জন বুকিং লিডার / মোট {totalRunningPax} জন ট্রাভেলার):
                </div>
                <div className="max-h-44 overflow-y-auto space-y-1.5 rounded-2xl border border-slate-200 p-3 bg-slate-50">
                  {runningBookings.map((b) => (
                    <div
                      key={b.id}
                      className="flex items-center justify-between text-xs bg-white px-3 py-2 rounded-xl border border-slate-100"
                    >
                      <span className="font-bold text-slate-800">
                        {b.customerName} ({b.pax} জন)
                      </span>
                      <span className="font-mono font-semibold text-emerald-700">
                        {b.customerPhone}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setReviewModalOpen(false)}
                  className="rounded-xl border border-slate-300 px-4 py-2.5 text-xs font-bold text-slate-700"
                >
                  বাতিল
                </button>
                <button
                  type="button"
                  disabled={sendingSms}
                  onClick={handleBroadcastSend}
                  className="inline-flex items-center gap-2 rounded-xl bg-emerald-800 hover:bg-emerald-900 px-6 py-2.5 text-xs font-bold text-white shadow-md transition"
                >
                  <Send className="h-4 w-4 text-amber-300" />
                  {sendingSms ? 'এসএমএস পাঠানো হচ্ছে...' : 'এখনই সবার কাছে পাঠান'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
