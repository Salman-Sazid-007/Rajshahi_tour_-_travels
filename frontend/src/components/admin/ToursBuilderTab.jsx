import React, { useEffect, useState } from 'react';
import { AlertTriangle, Bus, Calculator, Calendar, Check, Edit3, Image as ImageIcon, MapPin, Plus, Save, Sparkles, Trash2, Users, Utensils, X } from 'lucide-react';
import transport from '@rtt/transport';
import SeatMap from '../SeatMap';
import { useI18n } from '../../lib/i18n';
import { apiFetch, calculateReturnDateClient, formatBnDate, formatTaka } from '../../lib/api';
function buildInitialDraft(tour = null) {
  if (tour) {
    return {
      ...tour,
      packages: tour.packages?.length ? tour.packages : [{
        id: 'pkg-1',
        name: 'কাপল প্যাকেজ (২ জন এক রুমে)',
        type: 'couple',
        roomType: 'non_ac',
        personsPerUnit: 2,
        price: 15000,
        description: 'কাপলদের জন্য সেপারেট রুম'
      }, {
        id: 'pkg-2',
        name: 'সিঙ্গেল পারসন (৪ জন এক রুমে)',
        type: 'shared_4',
        roomType: 'non_ac',
        personsPerUnit: 1,
        price: 3800,
        description: '৪ জন এক রুমে (জনপ্রতি)'
      }],
      addons: tour.addons || [{
        id: 'addon-1',
        name: 'প্রবেশ টিকিট (Entry Tickets)',
        price: 200,
        mandatory: false
      }],
      budget: tour.budget || {
        foodCostPerPerson: 90,
        foodTotal: 40000,
        busCost: 48000,
        hotelCost: 24000,
        localTransportCost: 10000,
        guideCost: 4000,
        marketingCost: 4000,
        otherCost: 0,
        totalBudget: 130000,
        minTravelersToBreakEven: 35
      }
    };
  }
  const startDate = transport.todayDhaka();
  const days = 2;
  const nights = 3;
  return {
    title: 'সাজেক ভ্যালি ও খাগড়াছড়ি স্পেশাল গ্রুপ ট্যুর',
    destination: 'সাজেক ভ্যালি',
    status: 'upcoming',
    isPublished: true,
    isFeatured: false,
    startDate,
    days,
    nights,
    returnDate: calculateReturnDateClient(startDate, days, nights),
    departureLocation: 'সপুরা মোড়, রাজশাহী',
    totalSeats: 46,
    busId: 'bus-rajshahi-express',
    titleEn: '',
    destinationEn: '',
    coverImage: '/media/sajek-1.webp',
    posterImage: '/media/sajek-poster.svg',
    galleryImages: ['/media/sajek-1.webp', '/media/sajek-2.jpg', '/media/sajek-3.jpg'],
    packages: [{
      id: 'pkg-couple',
      name: 'কাপল প্যাকেজ (২ জন এক রুমে)',
      type: 'couple',
      roomType: 'non_ac',
      personsPerUnit: 2,
      price: 15000,
      description: 'কাপলদের জন্য সেপারেট রুম (২ জন)'
    }, {
      id: 'pkg-4share',
      name: 'সিঙ্গেল পারসন (৪ জন এক রুমে)',
      type: 'shared_4',
      roomType: 'non_ac',
      personsPerUnit: 1,
      price: 3800,
      description: '৪ জন থাকবে এক রুমে (জনপ্রতি)'
    }],
    addons: [{
      id: 'addon-ticket',
      name: 'প্রবেশ টিকিট (সাজেক ও আলুটিলা গুহা)',
      price: 200,
      mandatory: false
    }],
    transport: {
      primary: 'নন-এসি বাস (Non-AC Bus)',
      local: 'চাঁদের গাড়ি (Chander Gari)',
      notes: 'সপুরা মোড় থেকে রিজার্ভ বাস + খাগড়াছড়ি থেকে চাঁদের গাড়ি'
    },
    guideIds: ['staff-guide-1'],
    mealPlan: [{
      day: 1,
      title: '১ম দিন (১৬ অক্টোবর)',
      breakfast: 'ডিম খিচুড়ি ও আচার (৳৯০/জন)',
      snacks: 'স্ন্যাক্স দিব না / পাহাড়ি চা',
      lunch: 'পাহাড়ি ব্যাম্বু চিকেন স্পেশাল লাঞ্চ',
      dinner: 'ব্যাম্বু বিরিয়ানি স্পেশাল ডিনার'
    }, {
      day: 2,
      title: '২য় দিন (১৭ অক্টোবর)',
      breakfast: 'পরোটা, ডিম ভাজি ও ডাল ভুনা (৳৮৫/জন)',
      snacks: 'সিঙ্গারা ও মালাই চা',
      lunch: 'দেশি মুরগি ও ভর্তা-ভাত লাঞ্চ',
      dinner: 'চিকেন বারবিকিউ ও পরোটা নাইট'
    }],
    itinerary: [{
      day: 1,
      dateLabel: '১ম দিন (১৬ তারিখ) — সাজেক ভ্যালি, রুইলুই পাড়া ও হেলিপ্যাড',
      spots: 'সাজেক ভ্যালি, রুইলুই পাড়া, স্টোন গার্ডেন, হেলিপ্যাড ও লুসাই গ্রাম',
      details: '১৬ তারিখে খাগড়াছড়ি পৌঁছে চাঁদের গাড়িতে সাজেক যাবো এবং এই জায়গাগুলো ঘুরবো।'
    }, {
      day: 2,
      dateLabel: '২য় দিন (১৭ তারিখ) — কংলাক পাহাড়, আলুটিলা গুহা ও ঝুলন্ত ব্রিজ',
      spots: 'কংলাক পাহাড় সূর্যোদয়, রিসাং ঝর্ণা, আলুটিলা গুহা ও ঝুলন্ত ব্রিজ',
      details: '২য় দিনে কংলাক পাহাড় ও খাগড়াছড়ির স্পটগুলো ঘুরে রাতের বাসে রাজশাহী ফিরবো।'
    }],
    marketingCaption: '🏔️ ১৫ অক্টোবর সাজেক ভ্যালি স্পেশাল গ্রুপ ট্যুর!\n📍 যাত্রা শুরু: সপুরা মোড়, রাজশাহী\n💑 কাপল প্যাকেজ: ৳১৫,০০০ | 👤 জনপ্রতি (৪ জন এক রুমে): ৳৩,৮০০\n🍛 ব্যাম্বু বিরিয়ানি ও ৫ বেলা খাবার সহ!',
    budget: {
      foodCostPerPerson: 90,
      foodTotal: 40000,
      busCost: 48000,
      hotelCost: 24000,
      localTransportCost: 10000,
      guideCost: 4000,
      marketingCost: 4000,
      otherCost: 0,
      totalBudget: 130000,
      minTravelersToBreakEven: 35
    }
  };
}
export default function ToursBuilderTab({
  onSelectTourForBookings,
  onNavigateTab,
  onRefreshPublic,
  showToast
}) {
  const {
    t,
    language,
    tr
  } = useI18n();
  const [buses, setBuses] = useState([]);
  const [tours, setTours] = useState([]);
  const [statusFilter, setStatusFilter] = useState('all');
  const [staffList, setStaffList] = useState([]);
  const [mealMenus, setMealMenus] = useState([]);
  const [mediaLibrary, setMediaLibrary] = useState([]);
  const [builderOpen, setBuilderOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [draft, setDraft] = useState(() => buildInitialDraft());
  const [saving, setSaving] = useState(false);
  const loadData = () => {
    Promise.all([apiFetch('/api/tours'), apiFetch('/api/staff'), apiFetch('/api/meal-menus'), apiFetch('/api/cms'), apiFetch('/api/buses')]).then(([tRes, sRes, mRes, cRes, bRes]) => {
      setTours(tRes.tours || []);
      setBuses(bRes.buses || []);
      setStaffList((sRes.staff || []).filter(s => s.role === 'guide'));
      setMealMenus(mRes.mealMenus || []);
      setMediaLibrary(cRes.mediaLibrary || []);
    }).catch(() => {});
  };
  useEffect(() => {
    loadData();
  }, []);
  const openCreateBuilder = () => {
    setEditingId(null);
    setDraft(buildInitialDraft(null));
    setBuilderOpen(true);
  };
  const openEditBuilder = tour => {
    setEditingId(tour.id);
    setDraft(buildInitialDraft(tour));
    setBuilderOpen(true);
  };

  // Auto-calculate returnDate & sync mealPlan/itinerary rows when days/nights/startDate change!
  const handleScheduleChange = (field, value) => {
    const next = {
      ...draft,
      [field]: value
    };
    const days = Number(field === 'days' ? value : next.days) || 2;
    const nights = Number(field === 'nights' ? value : next.nights) || 3;
    const startDate = field === 'startDate' ? value : next.startDate;
    next.returnDate = calculateReturnDateClient(startDate, days, nights);

    // Sync mealPlan length to days
    const currentMeals = [...(next.mealPlan || [])];
    while (currentMeals.length < days) {
      const dNum = currentMeals.length + 1;
      currentMeals.push({
        day: dNum,
        title: `${dNum}ম দিন`,
        breakfast: 'পরোটা, ডিম ভাজি ও ডাল ভুনা (৳৮৫/জন)',
        snacks: 'বিকালের চা ও স্ন্যাক্স',
        lunch: 'দেশি মুরগি ও ভর্তা-ভাত লাঞ্চ',
        dinner: 'ব্যাম্বু বিরিয়ানি স্পেশাল ডিনার'
      });
    }
    next.mealPlan = currentMeals.slice(0, days);
    const currentItin = [...(next.itinerary || [])];
    while (currentItin.length < days) {
      const dNum = currentItin.length + 1;
      currentItin.push({
        day: dNum,
        dateLabel: `দিন ${dNum} — দর্শনীয় স্থান ভ্রমণ`,
        spots: 'প্রধান পর্যটন স্পটসমূহ',
        details: 'সকালের নাস্তা শেষে নির্ধারিত স্পটগুলো ভ্রমণ।'
      });
    }
    next.itinerary = currentItin.slice(0, days);
    setDraft(next);
  };

  // Live Break-Even Calculation
  const sharedPkg = (draft.packages || []).find(p => Number(p.personsPerUnit) === 1) || (draft.packages || [])[0] || {
    price: 3800,
    personsPerUnit: 1
  };
  const perPersonPrice = (Number(sharedPkg.price) || 3800) / Math.max(1, Number(sharedPkg.personsPerUnit) || 1);
  const totalBudget = Number(draft.budget?.totalBudget) || 130000;
  const breakEvenTravelers = perPersonPrice > 0 ? Math.ceil(totalBudget / perPersonPrice) : 35;
  const handleSaveTour = async e => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        ...draft,
        budget: {
          ...draft.budget,
          minTravelersToBreakEven: breakEvenTravelers
        }
      };
      if (editingId) {
        await apiFetch(`/api/tours/${editingId}`, {
          method: 'PUT',
          body: JSON.stringify(payload)
        });
        showToast(tr('ট্যুরটি সফলভাবে আপডেট করা হয়েছে!'));
      } else {
        await apiFetch('/api/tours', {
          method: 'POST',
          body: JSON.stringify(payload)
        });
        showToast(tr('নতুন ট্যুর তৈরি ও ওয়েবসাইটে পাবলিশ করা হয়েছে!'));
      }
      setBuilderOpen(false);
      loadData();
      if (onRefreshPublic) onRefreshPublic();
    } catch (err) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  };
  const filteredTours = statusFilter === 'all' ? tours : tours.filter(t => t.status === statusFilter);
  return <div className="space-y-6">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white rounded-3xl border border-slate-200 p-5 shadow-sm">
        <div>
          <h3 className="text-xl font-black text-slate-900">{tr("ট্যুর সমূহ ও স্মার্ট ট্যুর বিল্ডার")}</h3>
          <p className="text-xs text-slate-500 mt-0.5">{tr("নতুন ট্যুর তৈরি করুন, দিন-রাত অনুযায়ী অটোমেটিক রিটার্ন ডেট, প্যাকেজ, মিল প্ল্যান ও ব্রেক-ইভেন বাজেট হিসাব করুন")}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {[{
          id: 'all',
          label: 'সব ট্যুর'
        }, {
          id: 'running',
          label: 'চলমান (Running)'
        }, {
          id: 'upcoming',
          label: 'আপকামিং (Upcoming)'
        }, {
          id: 'completed',
          label: 'সম্পন্ন (Completed)'
        }].map(tab => <button key={tab.id} onClick={() => setStatusFilter(tab.id)} className={`rounded-xl px-3.5 py-2 text-xs font-bold transition ${statusFilter === tab.id ? 'bg-emerald-800 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}>
              {tr(tab.label)}
            </button>)}
          <button onClick={openCreateBuilder} className="inline-flex items-center gap-1.5 rounded-xl bg-amber-400 hover:bg-amber-300 px-4 py-2.5 text-xs font-black text-slate-950 shadow-sm transition">
            <Plus className="h-4 w-4" />{tr("নতুন ট্যুর তৈরি করুন")}</button>
        </div>
      </div>

      {/* Tours Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {filteredTours.map(tour => <div key={tour.id} className="rounded-3xl bg-white border border-slate-200 shadow-sm overflow-hidden flex flex-col justify-between">
            <div className="p-5 space-y-4">
              <div className="flex items-start gap-4">
                <img src={tour.coverImage || '/media/sajek-1.webp'} alt={tour.title} className="h-24 w-28 rounded-2xl object-cover shrink-0 border border-slate-200" />
                <div className="space-y-1 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${tour.status === 'running' ? 'bg-amber-400 text-slate-950' : tour.status === 'upcoming' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-700'}`}>
                      {tour.status === 'running' ? '● চলমান' : tour.status === 'upcoming' ? 'আপকামিং' : 'সম্পন্ন'}
                    </span>
                    <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[10px] font-bold text-slate-700">
                      {tr(tour.destination)}
                    </span>
                    {tour.isFeatured && <span className="rounded-full bg-amber-100 text-amber-900 px-2.5 py-0.5 text-[10px] font-bold">{tr("★ ওয়েবসাইট হাইলাইট")}</span>}
                  </div>
                  <h4 className="font-extrabold text-base text-slate-900 leading-snug">
                    {tr(tour.title)}
                  </h4>
                  <div className="text-xs text-slate-600">{tr("📅 যাত্রা:")}<strong>{formatBnDate(tour.startDate)}</strong>{tr(" → রিটার্ন:")}{' '}
                    <strong>{formatBnDate(tour.returnDate)}</strong> ({tour.days}{tr(" দিন ")}{tour.nights}{' '}{tr("রাত)")}</div>
                  <div className="text-xs text-slate-500">{tr("📍")}{tr(tour.departureLocation)}{tr(" • 🧭 গাইড:")}{' '}
                    {tour.guides?.map(g => g.name.split('(')[0]).join(', ') || 'মনিরুল ভাই'}
                  </div>
                </div>
              </div>

              {/* Financial & Seat Summary Strip */}
              <div className="grid grid-cols-3 gap-2 rounded-2xl bg-slate-50 border border-slate-200/80 p-3 text-xs">
                <div>
                  <div className="text-slate-500">{tr("বুকিং ও সিট")}</div>
                  <div className="font-black text-slate-900 mt-0.5">
                    {tour.bookingsCount}{tr("টি (")}{tour.seatsBooked}/{tour.totalSeats}{tr("সিট)")}</div>
                </div>
                <div>
                  <div className="text-slate-500">{tr("মোট বিল / জমা")}</div>
                  <div className="font-black text-emerald-700 mt-0.5">
                    {formatTaka(tour.totalCollected)} / {formatTaka(tour.totalBillAmount)}
                  </div>
                </div>
                <div>
                  <div className="text-slate-500">{tr("বাজেট (ব্রেক-ইভেন)")}</div>
                  <div className="font-black text-amber-800 mt-0.5">
                    {formatTaka(tour.budget?.totalBudget || 120000)} ({tour.budget?.minTravelersToBreakEven || 33}{tr("জন)")}</div>
                </div>
              </div>
            </div>

            <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-100 flex items-center justify-between gap-2">
              <button onClick={() => openEditBuilder(tour)} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 hover:border-emerald-600 transition">
                <Edit3 className="h-3.5 w-3.5" />{tr("এডিট / বাজেট ও প্ল্যান")}</button>
              <button onClick={() => {
            onSelectTourForBookings(tour.id);
            onNavigateTab('bookings');
          }} className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-800 hover:bg-emerald-900 px-4 py-2 text-xs font-bold text-white transition">
                <Users className="h-3.5 w-3.5" />{tr("ট্রাভেলার বুকিং (")}{tour.bookingsCount}) →
              </button>
            </div>
          </div>)}
      </div>

      {/* Smart Tour Builder Full Modal (Exact Video Walkthrough!) */}
      {builderOpen && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-3 sm:p-6 backdrop-blur-sm overflow-y-auto">
          <div className="w-full max-w-5xl rounded-3xl bg-white shadow-2xl border border-slate-200 overflow-hidden my-6 max-h-[92vh] flex flex-col">
            <div className="bg-emerald-950 text-white px-6 py-4 flex items-center justify-between shrink-0">
              <div>
                <span className="text-xs font-bold text-amber-300">{tr("স্মার্ট ট্যুর প্ল্যানার ও বাজেট ক্যালকুলেটর")}</span>
                <h3 className="text-lg sm:text-xl font-bold">
                  {tr(editingId ? 'ট্যুর এডিট করুন' : 'নতুন ট্যুর তৈরি করুন (সাজেক / সিলেট / কক্সবাজার)')}
                </h3>
              </div>
              <button onClick={() => setBuilderOpen(false)} className="rounded-full bg-white/10 p-2 text-white hover:bg-white/20">
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSaveTour} className="p-6 overflow-y-auto space-y-8 flex-1">
              {/* Section 1: Basic Info & Website Visibility */}
              <div className="rounded-2xl border border-slate-200 p-5 space-y-4 bg-slate-50/50">
                <h4 className="text-sm font-black uppercase tracking-wider text-emerald-900 flex items-center gap-2">{tr("১. ট্যুরের নাম, গন্তব্য ও ওয়েবসাইট স্ট্যাটাস")}</h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="md:col-span-2">
                    <label className="block text-xs font-bold text-slate-700 mb-1">{tr("ওয়েবসাইটে প্রদর্শনের জন্য ট্যুরের নাম *")}</label>
                    <input type="text" required value={draft.title} onChange={e => setDraft({
                  ...draft,
                  title: e.target.value
                })} placeholder={tr("যেমন: সাজেক ভ্যালি ও খাগড়াছড়ি স্পেশাল গ্রুপ ট্যুর")} className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm font-semibold" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">{tr("গন্তব্য (Destination) *")}</label>
                    <input type="text" required value={draft.destination} onChange={e => setDraft({
                  ...draft,
                  destination: e.target.value
                })} placeholder={tr("যেমন: সাজেক ভ্যালি")} className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm font-semibold" />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <label className="block text-xs font-bold text-slate-700">{t('Tour title in English', 'ট্যুরের নাম ইংরেজিতে')}<input required aria-label={tr("Tour title in English")} className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm mt-1" value={draft.titleEn || ''} onChange={event => setDraft({
                  ...draft,
                  titleEn: event.target.value
                })} /></label>
                  <label className="block text-xs font-bold text-slate-700">{t('Destination in English', 'গন্তব্য ইংরেজিতে')}<input required aria-label={tr("Destination in English")} className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm mt-1" value={draft.destinationEn || ''} onChange={event => setDraft({
                  ...draft,
                  destinationEn: event.target.value
                })} /></label>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-1">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">{tr("ট্যুর স্ট্যাটাস")}</label>
                    <select value={draft.status} onChange={e => setDraft({
                  ...draft,
                  status: e.target.value
                })} className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm font-semibold">
                      <option value="upcoming">{tr("আপকামিং (ওয়েবসাইটে দেখাবে)")}</option>
                      <option value="running">{tr("চলমান (Running Tour)")}</option>
                      <option value="completed">{tr("সম্পন্ন (আগের ট্যুর সেকশনে যাবে)")}</option>
                      <option value="draft">{tr("ড্রাফট (লুকানো)")}</option>
                    </select>
                  </div>
                  <label className="flex items-center gap-2.5 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-bold text-slate-800 cursor-pointer">
                    <input type="checkbox" checked={draft.isPublished !== false} onChange={e => setDraft({
                  ...draft,
                  isPublished: e.target.checked
                })} className="h-4 w-4 accent-emerald-700" />{tr("পাবলিশড (ওয়েবসাইটে সরাসরি দেখাবে)")}</label>
                  <label className="flex items-center gap-2.5 rounded-xl border border-amber-300 bg-amber-50 px-4 py-2.5 text-xs font-bold text-amber-950 cursor-pointer">
                    <input type="checkbox" checked={Boolean(draft.isFeatured)} onChange={e => setDraft({
                  ...draft,
                  isFeatured: e.target.checked
                })} className="h-4 w-4 accent-amber-600" />{tr("★ নেক্সট ট্যুর হিসেবে হিরোতে হাইলাইট করুন")}</label>
                </div>
              </div>

              {/* Section 2: Schedule & Auto Return Date Calculation */}
              <div className="rounded-2xl border border-emerald-200 p-5 space-y-4 bg-emerald-50/40">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h4 className="text-sm font-black uppercase tracking-wider text-emerald-950 flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-emerald-700" />{tr("২. শিডিউল, অটোমেটিক রিটার্ন ডেট ও সিট লিমিট")}</h4>
                  <span className="rounded-full bg-emerald-800 text-amber-300 px-3 py-0.5 text-[11px] font-bold">{tr("✨ কত দিন ও কত রাত দিলে রিটার্ন ডেট অটোমেটিক হিসাব হবে!")}</span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-6 gap-3">
                  <div className="col-span-2 sm:col-span-1">
                    <label className="block text-xs font-bold text-slate-700 mb-1">{tr("যাত্রা শুরুর তারিখ")}</label>
                    <input type="date" value={draft.startDate} onChange={e => handleScheduleChange('startDate', e.target.value)} className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-bold" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">{tr("কত দিন (Days)")}</label>
                    <input type="number" min={1} max={15} value={draft.days} onChange={e => handleScheduleChange('days', Number(e.target.value) || 1)} className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-bold" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">{tr("কত রাত (Nights)")}</label>
                    <input type="number" min={1} max={15} value={draft.nights} onChange={e => handleScheduleChange('nights', Number(e.target.value) || 1)} className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-bold" />
                  </div>
                  <div className="col-span-2 sm:col-span-1">
                    <label className="block text-xs font-bold text-emerald-800 mb-1">{tr("অটো রিটার্ন ডেট")}</label>
                    <input type="date" value={draft.returnDate} onChange={e => setDraft({
                  ...draft,
                  returnDate: e.target.value
                })} className="w-full rounded-xl border-2 border-emerald-600 bg-emerald-100/70 px-3 py-2 text-sm font-black text-emerald-950" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">{tr("ছাড়ার স্থান")}</label>
                    <input type="text" value={draft.departureLocation} onChange={e => setDraft({
                  ...draft,
                  departureLocation: e.target.value
                })} placeholder={tr("সপুরা মোড়, রাজশাহী")} className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">{tr("মোট সিট (বাস)")}</label>
                    <input type="number" min={1} max={transport.seatIds(buses.find(bus => bus.id === draft.busId)?.layout || "express46").length} value={draft.totalSeats} onChange={e => setDraft({
                  ...draft,
                  totalSeats: Number(e.target.value) || 40
                })} className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-bold" />
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-cyan-200 p-5 bg-cyan-50/40 space-y-4">
                <h4 className="text-sm font-bold">{t('Assign a bus profile & seat layout', 'বাস প্রোফাইল ও সিটের বিন্যাস যুক্ত করুন')}</h4>
                <label className="block text-xs font-bold">{t('Tour bus', 'ট্যুরের বাস')}<select required aria-label={tr("Tour bus profile")} value={draft.busId || ''} onChange={event => {
                const bus = buses.find(item => item.id === event.target.value);
                setDraft({
                  ...draft,
                  busId: event.target.value,
                  totalSeats: bus ? transport.seatIds(bus.layout).length : draft.totalSeats
                });
              }} className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm mt-2"><option value="">{t('Select a bus profile', 'বাস প্রোফাইল নির্বাচন করুন')}</option>{buses.map(bus => <option value={bus.id} key={bus.id}>{language === 'bn' ? bus.nameBn || bus.name : bus.name}{tr(" · ")}{transport.seatIds(bus.layout).length} {t('seats', 'সিট')}</option>)}</select></label>
                <p className="text-xs text-cyan-900">{t('Regular Rajshahi–Dhaka services pause automatically from departure through the return date. Passengers must choose seats and male/female when booking this tour.', 'যাত্রা থেকে ফেরার দিন পর্যন্ত রেগুলার রাজশাহী–ঢাকা সার্ভিস নিজে থেকেই বন্ধ হবে। এই ট্যুরের যাত্রীরা বুকিংয়ের সময় সিট ও নারী / পুরুষ বেছে নেবেন।')}</p>
                {buses.find(bus => bus.id === draft.busId) && <SeatMap readOnly layout={buses.find(bus => bus.id === draft.busId).layout} busName={language === 'bn' ? buses.find(bus => bus.id === draft.busId).nameBn : buses.find(bus => bus.id === draft.busId).name} />}
              </div>

              {/* Section 3: Cover Image, Poster & Destination Photos */}
              <div className="rounded-2xl border border-slate-200 p-5 space-y-4">
                <h4 className="text-sm font-black uppercase tracking-wider text-slate-800 flex items-center gap-2">
                  <ImageIcon className="h-4 w-4 text-emerald-700" />{tr("৩. কভার ইমেজ, প্রমোশনাল পোস্টার ও রিলেটেড ছবি নির্বাচন")}</h4>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-2">{tr("কভার ইমেজ (কাস্টমার ওয়েবসাইটে দেখবে) — ক্লিক করে সিলেক্ট করুন:")}</label>
                    <div className="grid grid-cols-4 gap-2">
                      {mediaLibrary.filter(m => m.kind === 'cover').slice(0, 8).map(m => <button type="button" key={m.id} onClick={() => setDraft({
                    ...draft,
                    coverImage: m.url
                  })} className={`relative h-16 rounded-xl overflow-hidden border-2 transition ${draft.coverImage === m.url ? 'border-emerald-600 ring-2 ring-emerald-500/40' : 'border-transparent opacity-75 hover:opacity-100'}`}>
                            <img src={m.url} alt={m.label} className="w-full h-full object-cover" />
                          </button>)}
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-2">{tr("ফেসবুক পেজের পোস্টার ইমেজ (Poster):")}</label>
                    <div className="grid grid-cols-4 gap-2">
                      {mediaLibrary.filter(m => m.kind === 'poster').map(m => <button type="button" key={m.id} onClick={() => setDraft({
                    ...draft,
                    posterImage: m.url
                  })} className={`relative h-20 rounded-xl overflow-hidden border-2 transition ${draft.posterImage === m.url ? 'border-amber-500 ring-2 ring-amber-400/50' : 'border-slate-200 opacity-75 hover:opacity-100'}`}>
                            <img src={m.url} alt={m.label} className="w-full h-full object-cover" />
                          </button>)}
                    </div>
                  </div>
                </div>
              </div>

              {/* Section 4: Packages & Extra Add-ons (Couple 15,000 / 4-Share 3,800 / Entry Ticket 200) */}
              <div className="rounded-2xl border border-slate-200 p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-black uppercase tracking-wider text-slate-800">{tr("৪. প্যাকেজ সমূহ (কাপল / ৪ জন এক রুমে / এসি বা নন-এসি) ও প্রবেশ টিকিট")}</h4>
                  <button type="button" onClick={() => setDraft({
                ...draft,
                packages: [...(draft.packages || []), {
                  id: `pkg-${Date.now()}`,
                  name: '৩ জন এক রুমে (জনপ্রতি)',
                  type: 'shared_3',
                  roomType: 'non_ac',
                  personsPerUnit: 1,
                  price: 4200,
                  description: '৩ জন শেয়ারিং রুম'
                }]
              })} className="inline-flex items-center gap-1 rounded-xl bg-emerald-50 border border-emerald-200 px-3 py-1.5 text-xs font-bold text-emerald-800">
                    <Plus className="h-3.5 w-3.5" />{tr("আরও প্যাকেজ যোগ করুন")}</button>
                </div>

                <div className="space-y-3">
                  {(draft.packages || []).map((pkg, idx) => <div key={pkg.id || idx} className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-center rounded-xl bg-slate-50 border border-slate-200 p-3">
                      <div className="sm:col-span-5">
                        <label className="block text-[10px] font-bold text-slate-500">{tr("প্যাকেজের নাম (যেমন: কাপল / ৪ জন এক রুমে)")}</label>
                        <input type="text" value={pkg.name} onChange={e => {
                    const next = [...draft.packages];
                    next[idx] = {
                      ...pkg,
                      name: e.target.value
                    };
                    setDraft({
                      ...draft,
                      packages: next
                    });
                  }} className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-bold" />
                      </div>
                      <div className="sm:col-span-3">
                        <label className="block text-[10px] font-bold text-slate-500">{tr("রুমের ধরন (AC / Non-AC)")}</label>
                        <select value={pkg.roomType} onChange={e => {
                    const next = [...draft.packages];
                    next[idx] = {
                      ...pkg,
                      roomType: e.target.value
                    };
                    setDraft({
                      ...draft,
                      packages: next
                    });
                  }} className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-bold">
                          <option value="non_ac">{tr("নন-এসি রুম (Non-AC)")}</option>
                          <option value="ac">{tr("এসি রুম (AC Room)")}</option>
                        </select>
                      </div>
                      <div className="sm:col-span-3">
                        <label className="block text-[10px] font-bold text-slate-500">{tr("প্যাকেজ চার্জ (টাকা)")}</label>
                        <input type="number" value={pkg.price} onChange={e => {
                    const next = [...draft.packages];
                    next[idx] = {
                      ...pkg,
                      price: Number(e.target.value) || 0
                    };
                    setDraft({
                      ...draft,
                      packages: next
                    });
                  }} className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-black text-emerald-800" />
                      </div>
                      <div className="sm:col-span-1 flex justify-end pt-3">
                        <button type="button" onClick={() => setDraft({
                    ...draft,
                    packages: draft.packages.filter((_, i) => i !== idx)
                  })} className="text-rose-500 hover:text-rose-700 p-1">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>)}
                </div>

                {/* Extra Addons / Entry Tickets */}
                <div className="pt-2 border-t border-slate-100">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-slate-700">{tr("প্যাকেজের বাইরে প্রবেশ টিকিট / অতিরিক্ত চার্জ (যেমন: প্রবেশ টিকিট ২০০ টাকা):")}</span>
                    <button type="button" onClick={() => setDraft({
                  ...draft,
                  addons: [...(draft.addons || []), {
                    id: `addon-${Date.now()}`,
                    name: 'প্রবেশ টিকিট',
                    price: 200,
                    mandatory: false
                  }]
                })} className="text-xs font-bold text-emerald-700 hover:underline">{tr("+ এড-অন যুক্ত করুন")}</button>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {(draft.addons || []).map((addon, idx) => <div key={addon.id || idx} className="flex items-center gap-2 rounded-xl bg-amber-50/60 border border-amber-200 p-2.5">
                        <input type="text" value={addon.name} onChange={e => {
                    const next = [...draft.addons];
                    next[idx] = {
                      ...addon,
                      name: e.target.value
                    };
                    setDraft({
                      ...draft,
                      addons: next
                    });
                  }} className="flex-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold" />
                        <input type="number" value={addon.price} onChange={e => {
                    const next = [...draft.addons];
                    next[idx] = {
                      ...addon,
                      price: Number(e.target.value) || 0
                    };
                    setDraft({
                      ...draft,
                      addons: next
                    });
                  }} className="w-24 rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-bold" />
                      </div>)}
                  </div>
                </div>
              </div>

              {/* Section 5: Transport & Tour Guides */}
              <div className="rounded-2xl border border-slate-200 p-5 space-y-4">
                <h4 className="text-sm font-black uppercase tracking-wider text-slate-800 flex items-center gap-2">
                  <Bus className="h-4 w-4 text-emerald-700" />{tr("৫. বাস / ট্রান্সপোর্ট ও ট্যুর গাইড নির্বাচন")}</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">{tr("প্রধান বাস (Primary Transport)")}</label>
                    <input type="text" value={draft.transport?.primary || ''} onChange={e => setDraft({
                  ...draft,
                  transport: {
                    ...draft.transport,
                    primary: e.target.value
                  }
                })} placeholder={tr("নন-এসি বাস (Non-AC Bus)")} className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">{tr("লোকাল ট্রান্সপোর্ট (চাঁদের গাড়ি / নৌকা)")}</label>
                    <input type="text" value={draft.transport?.local || ''} onChange={e => setDraft({
                  ...draft,
                  transport: {
                    ...draft.transport,
                    local: e.target.value
                  }
                })} placeholder={tr("চাঁদের গাড়ি (Chander Gari)")} className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm" />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-2">{tr("এই ট্যুরে গাইড হিসেবে কে কে যাবেন? (এক বা একাধিক সিলেক্ট করুন):")}</label>
                  <div className="flex flex-wrap gap-2.5">
                    {staffList.map(g => {
                  const active = (draft.guideIds || []).includes(g.id);
                  return <button type="button" key={g.id} onClick={() => {
                    const cur = draft.guideIds || [];
                    setDraft({
                      ...draft,
                      guideIds: active ? cur.filter(x => x !== g.id) : [...cur, g.id]
                    });
                  }} className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold border transition ${active ? 'bg-emerald-800 text-white border-emerald-800' : 'bg-white text-slate-700 border-slate-300'}`}>
                          {active && <Check className="h-3.5 w-3.5 text-amber-300" />}
                          {tr(g.name)}
                        </button>;
                })}
                  </div>
                </div>
              </div>

              {/* Section 6: Day-by-Day Meal Plan & Sightseeing Itinerary */}
              <div className="rounded-2xl border border-slate-200 p-5 space-y-4">
                <h4 className="text-sm font-black uppercase tracking-wider text-slate-800 flex items-center gap-2">
                  <Utensils className="h-4 w-4 text-emerald-700" />{tr("৬. দিনভিত্তিক খাবারের মেনু (ইন্টারনাল) ও ডে-বাই-ডে ভ্রমণ প্ল্যান (")}{draft.days}{tr("দিন)")}</h4>

                <div className="space-y-4">
                  {(draft.mealPlan || []).map((mp, idx) => <div key={idx} className="rounded-2xl bg-slate-50 border border-slate-200 p-4 space-y-3">
                      <div className="font-bold text-xs text-emerald-900 uppercase">{tr("দিন")}{mp.day}{tr("— খাবারের তালিকা (কাস্টমার দেখবে না, ইন্টারনাল হিসাবের জন্য)")}</div>
                      <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5">
                        <div>
                          <label className="block text-[10px] font-bold text-slate-500">{tr("সকালের নাস্তা (Breakfast)")}</label>
                          <input type="text" list="meal-options" value={mp.breakfast} onChange={e => {
                      const next = [...draft.mealPlan];
                      next[idx] = {
                        ...mp,
                        breakfast: e.target.value
                      };
                      setDraft({
                        ...draft,
                        mealPlan: next
                      });
                    }} className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs" />
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold text-slate-500">{tr("স্ন্যাক্স (Snacks)")}</label>
                          <input type="text" value={mp.snacks} onChange={e => {
                      const next = [...draft.mealPlan];
                      next[idx] = {
                        ...mp,
                        snacks: e.target.value
                      };
                      setDraft({
                        ...draft,
                        mealPlan: next
                      });
                    }} className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs" />
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold text-slate-500">{tr("দুপুরের খাবার (Lunch)")}</label>
                          <input type="text" list="meal-options" value={mp.lunch} onChange={e => {
                      const next = [...draft.mealPlan];
                      next[idx] = {
                        ...mp,
                        lunch: e.target.value
                      };
                      setDraft({
                        ...draft,
                        mealPlan: next
                      });
                    }} className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs" />
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold text-slate-500">{tr("রাতের খাবার (Dinner)")}</label>
                          <input type="text" list="meal-options" value={mp.dinner} onChange={e => {
                      const next = [...draft.mealPlan];
                      next[idx] = {
                        ...mp,
                        dinner: e.target.value
                      };
                      setDraft({
                        ...draft,
                        mealPlan: next
                      });
                    }} className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs" />
                        </div>
                      </div>
                    </div>)}
                  <datalist id="meal-options">
                    {mealMenus.map(m => <option key={m.id} value={`${m.name} (৳${m.costPerPerson}/জন)`} />)}
                  </datalist>
                </div>

                {/* Day by Day Itinerary */}
                <div className="space-y-3 pt-2">
                  {(draft.itinerary || []).map((it, idx) => <div key={idx} className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 rounded-xl border border-slate-200 p-3">
                      <div className="sm:col-span-4">
                        <label className="block text-[10px] font-bold text-slate-500">{tr("দিন")}{it.day}{tr("শিরোনাম")}</label>
                        <input type="text" value={it.dateLabel} onChange={e => {
                    const next = [...draft.itinerary];
                    next[idx] = {
                      ...it,
                      dateLabel: e.target.value
                    };
                    setDraft({
                      ...draft,
                      itinerary: next
                    });
                  }} className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-bold" />
                      </div>
                      <div className="sm:col-span-4">
                        <label className="block text-[10px] font-bold text-slate-500">{tr("কোন কোন জায়গায় ঘুরবেন (Spots)")}</label>
                        <input type="text" value={it.spots} onChange={e => {
                    const next = [...draft.itinerary];
                    next[idx] = {
                      ...it,
                      spots: e.target.value
                    };
                    setDraft({
                      ...draft,
                      itinerary: next
                    });
                  }} className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs" />
                      </div>
                      <div className="sm:col-span-4">
                        <label className="block text-[10px] font-bold text-slate-500">{tr("বিবরণ (ওয়েবসাইটে ও ফেসবুক পোস্টে যাবে)")}</label>
                        <input type="text" value={it.details} onChange={e => {
                    const next = [...draft.itinerary];
                    next[idx] = {
                      ...it,
                      details: e.target.value
                    };
                    setDraft({
                      ...draft,
                      itinerary: next
                    });
                  }} className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs" />
                      </div>
                    </div>)}
                </div>
              </div>

              {/* Section 7: Budget & Break-Even Calculator (Exact Video Feature: 1,30,000 budget -> 35 pax break-even!) */}
              <div className="rounded-2xl border-2 border-amber-400 bg-amber-50/50 p-5 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h4 className="text-sm font-black uppercase tracking-wider text-slate-900 flex items-center gap-2">
                    <Calculator className="h-4 w-4 text-amber-600" />{tr("৭. ট্যুর বাজেট ও ব্রেক-ইভেন (লস এড়ানোর হিসাব)")}</h4>
                  <span className="rounded-full bg-amber-400 text-slate-950 px-3 py-0.5 text-xs font-black">{tr("কমপক্ষে")}{breakEvenTravelers}{tr("জন ট্রাভেলার না হলে লস হবে!")}</span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">{tr("নাস্তা/খাবার জনপ্রতি (এডিটেবল)")}</label>
                    <input type="number" value={draft.budget?.foodCostPerPerson || 90} onChange={e => setDraft({
                  ...draft,
                  budget: {
                    ...draft.budget,
                    foodCostPerPerson: Number(e.target.value) || 0
                  }
                })} className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-bold" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">{tr("মোট খাবারের বাজেট (Food Cost)")}</label>
                    <input type="number" value={draft.budget?.foodTotal || 40000} onChange={e => {
                  const foodTotal = Number(e.target.value) || 0;
                  setDraft({
                    ...draft,
                    budget: {
                      ...draft.budget,
                      foodTotal
                    }
                  });
                }} className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-bold" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">{tr("বাস ও হোটেল বাজেট")}</label>
                    <input type="number" value={(Number(draft.budget?.busCost) || 48000) + (Number(draft.budget?.hotelCost) || 24000)} onChange={e => {
                  const combined = Number(e.target.value) || 0;
                  setDraft({
                    ...draft,
                    budget: {
                      ...draft.budget,
                      busCost: Math.round(combined * 0.65),
                      hotelCost: Math.round(combined * 0.35)
                    }
                  });
                }} className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-bold" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-emerald-900 mb-1">{tr("মোট প্ল্যানড বাজেট (Total Budget)")}</label>
                    <input type="number" value={draft.budget?.totalBudget || 130000} onChange={e => setDraft({
                  ...draft,
                  budget: {
                    ...draft.budget,
                    totalBudget: Number(e.target.value) || 0
                  }
                })} className="w-full rounded-xl border-2 border-emerald-600 bg-white px-3 py-2 text-sm font-black text-emerald-900" />
                  </div>
                </div>

                <div className="rounded-xl bg-amber-100/90 border border-amber-300 p-3.5 flex items-center gap-3 text-xs text-amber-950">
                  <AlertTriangle className="h-5 w-5 text-amber-700 shrink-0" />
                  <div>{tr("আপনি যদি")}<strong>{formatTaka(totalBudget)}</strong>{tr(" বাজেট ধরে কাজ করেন এবং জনপ্রতি প্যাকেজ")}{' '}
                    <strong>{formatTaka(perPersonPrice)}</strong>{tr(" হয়, তবে খাবার ও বাসের বিল মিলিয়ে অন্তত")}{' '}
                    <strong className="underline text-sm">{breakEvenTravelers}{tr(" জন ট্রাভেলার")}</strong>{tr("না হলে আপনি লসে যাবেন।")}</div>
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-200">
                <button type="button" onClick={() => setBuilderOpen(false)} className="rounded-xl border border-slate-300 px-5 py-3 text-xs font-bold text-slate-700">{tr("বাতিল")}</button>
                <button type="submit" disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-emerald-800 hover:bg-emerald-900 px-6 py-3 text-xs sm:text-sm font-bold text-white shadow-lg transition">
                  <Save className="h-4 w-4 text-amber-300" />
                  {tr(saving ? 'সেভ হচ্ছে...' : 'ট্যুর পাবলিশ ও সেভ করুন')}
                </button>
              </div>
            </form>
          </div>
        </div>}
    </div>;
}
