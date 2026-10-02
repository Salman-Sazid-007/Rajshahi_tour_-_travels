import DemoPhone from '../DemoPhone';
import React, { useEffect, useState } from 'react';
import { CheckCircle2, CreditCard, MessageSquare, MessageSquareHeart, Phone, Plus, Search, Send, Sparkles, UserCheck, Users, X } from 'lucide-react';
import { apiFetch, formatBnDate, formatTaka } from '../../lib/api';
import { useI18n } from '../../lib/i18n';
import TourSeatPicker from '../TourSeatPicker';
export default function BookingsTab({
  selectedTourId,
  onChangeTourId,
  onOpenFeedbackModal,
  showToast
}) {
  const {
    t,
    tr
  } = useI18n();
  const [seatAssignments, setSeatAssignments] = useState([]);
  const [tours, setTours] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [activeTour, setActiveTour] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');

  // New Booking Modal State
  const [newModalOpen, setNewModalOpen] = useState(false);
  const [phoneInput, setPhoneInput] = useState('00000000116');
  const [customerName, setCustomerName] = useState('ইসরাত জাহান');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [pax, setPax] = useState(1);
  const [packageId, setPackageId] = useState('');
  const [includeEntryTicket, setIncludeEntryTicket] = useState(false);
  const [extraCharge, setExtraCharge] = useState(0);
  const [discount, setDiscount] = useState(200);
  const [discountReason, setDiscountReason] = useState('বার্গেন করেছে / স্পেশাল অফার');
  const [advancePaid, setAdvancePaid] = useState(2000);
  const [paymentMethod, setPaymentMethod] = useState('bkash');
  const [source, setSource] = useState('phone');
  const [savingBooking, setSavingBooking] = useState(false);

  // Step 2 after saving booking: Review & Send Confirmation SMS
  const [confirmSmsStep, setConfirmSmsStep] = useState(null); // { booking, smsText }
  const [sendingConfirmSms, setSendingConfirmSms] = useState(false);

  // Collect Due Modal
  const [dueModalBooking, setDueModalBooking] = useState(null);
  const [collectAmount, setCollectAmount] = useState(0);
  const loadAll = (targetTourId = selectedTourId) => {
    Promise.all([apiFetch('/api/tours'), apiFetch('/api/customers')]).then(([tRes, cRes]) => {
      const list = tRes.tours || [];
      setTours(list);
      setCustomers(cRes.customers || []);
      const chosen = list.find(t => t.id === targetTourId) || list.find(t => t.id === 'tour-sylhet-oct') || list[0];
      if (chosen) {
        setActiveTour(chosen);
        if (chosen.packages?.[0]) {
          setPackageId(chosen.packages[0].id);
        }
      }
    }).catch(() => {});
  };
  useEffect(() => {
    loadAll(selectedTourId);
  }, [selectedTourId]);
  const handleTourSelect = id => {
    onChangeTourId(id);
    const found = tours.find(t => t.id === id);
    if (found) {
      setActiveTour(found);
      if (found.packages?.[0]) setPackageId(found.packages[0].id);
    }
  };
  const openNewBookingModal = () => {
    setConfirmSmsStep(null);
    setPhoneInput('');
    setCustomerName('');
    setShowSuggestions(true);
    setPax(1);
    setSeatAssignments([]);
    if (activeTour?.packages?.[0]) {
      setPackageId(activeTour.packages[0].id);
    }
    setIncludeEntryTicket(false);
    setExtraCharge(0);
    setDiscount(0);
    setDiscountReason('বার্গেন করেছে / অফার');
    setAdvancePaid(0);
    setPaymentMethod('bkash');
    setSource('phone');
    setNewModalOpen(true);
  };
  const selectedPkg = (activeTour?.packages || []).find(p => p.id === packageId) || (activeTour?.packages || [])[0] || {
    price: 3800,
    personsPerUnit: 1,
    type: 'shared_4'
  };
  const units = selectedPkg.type === 'couple' ? Math.max(1, Math.ceil(pax / 2)) : Math.max(1, pax);
  const basePackageAmount = (Number(selectedPkg.price) || 3800) * units;
  const addonTicketUnit = Number(activeTour?.addons?.[0]?.price) || 200;
  const computedExtra = (includeEntryTicket ? addonTicketUnit * pax : 0) + (Number(extraCharge) || 0);
  const netTotal = Math.max(0, basePackageAmount + computedExtra - (Number(discount) || 0));
  const computedDue = Math.max(0, netTotal - (Number(advancePaid) || 0));
  const matchingCustomers = customers.filter(c => !phoneInput || c.phone.includes(phoneInput.replace(/\D/g, '')) || c.name.toLowerCase().includes(phoneInput.toLowerCase()));
  const handleSaveNewBooking = async e => {
    e.preventDefault();
    if (!activeTour) return;
    if (activeTour.busId && (seatAssignments.length !== Number(pax) || seatAssignments.some(seat => !seat.gender))) {
      showToast(t('Choose seats and passenger gender before saving.', 'সেভ করার আগে সিট ও নারী / পুরুষ নির্বাচন করুন।'));
      return;
    }
    setSavingBooking(true);
    try {
      const res = await apiFetch('/api/bookings', {
        method: 'POST',
        body: JSON.stringify({
          tourId: activeTour.id,
          customerName: customerName || 'ইসরাত জাহান',
          customerPhone: phoneInput || '00000000116',
          pax,
          seatAssignments,
          seatNumbers: seatAssignments.map(seat => seat.id).join(", "),
          packageId: selectedPkg.id,
          packageUnitPrice: selectedPkg.price,
          baseAmount: basePackageAmount,
          extraCharge: computedExtra,
          discount: Number(discount) || 0,
          discountReason,
          totalAmount: netTotal,
          advancePaid: Number(advancePaid) || 0,
          paymentMethod,
          source
        })
      });
      setConfirmSmsStep({
        booking: res.booking,
        smsText: res.smsPreview
      });
      loadAll(activeTour.id);
    } catch (err) {
      alert(err.message);
    } finally {
      setSavingBooking(false);
    }
  };
  const handleSendBookingSms = async () => {
    if (!confirmSmsStep?.booking) return;
    setSendingConfirmSms(true);
    try {
      const res = await apiFetch(`/api/bookings/${confirmSmsStep.booking.id}/send-confirmation-sms`, {
        method: 'POST',
        body: JSON.stringify({
          message: confirmSmsStep.smsText
        })
      });
      showToast(res.message || 'বুকিং কনফার্মেশন এসএমএস পাঠানো হয়েছে!');
      setNewModalOpen(false);
      setConfirmSmsStep(null);
    } catch (err) {
      alert(err.message);
    } finally {
      setSendingConfirmSms(false);
    }
  };
  const handleSendFeedbackLink = async booking => {
    try {
      const res = await apiFetch(`/api/bookings/${booking.id}/send-feedback-sms`, {
        method: 'POST',
        body: JSON.stringify({
          origin: window.location.origin
        })
      });
      showToast(res.message || 'ফিডব্যাক লিংক এসএমএস পাঠানো হয়েছে!');
    } catch (err) {
      alert(err.message);
    }
  };
  const handleCollectDue = async e => {
    e.preventDefault();
    if (!dueModalBooking) return;
    try {
      await apiFetch(`/api/bookings/${dueModalBooking.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          collectDueAmount: Number(collectAmount) || 0
        })
      });
      showToast(tr('বাকি টাকা জমা হয়েছে এবং হিসাব আপডেট করা হয়েছে!'));
      setDueModalBooking(null);
      loadAll(activeTour?.id);
    } catch (err) {
      alert(err.message);
    }
  };
  const bookings = (activeTour?.bookings || []).filter(b => !searchQuery || b.customerName.toLowerCase().includes(searchQuery.toLowerCase()) || b.customerPhone.includes(searchQuery) || b.bookingCode.toLowerCase().includes(searchQuery.toLowerCase()));
  return <div className="space-y-6">
      {/* Top Tour Selector & New Booking Action */}
      <div className="rounded-3xl bg-white border border-slate-200 p-5 shadow-sm flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex-1 space-y-1.5">
          <label className="block text-xs font-bold uppercase tracking-wider text-emerald-800">{tr("কোন ট্যুরের ট্রাভেলার বুকিং দেখতে ও যুক্ত করতে চান?")}</label>
          <select value={activeTour?.id || ''} onChange={e => handleTourSelect(e.target.value)} className="w-full max-w-xl rounded-2xl border-2 border-emerald-600 bg-emerald-50/40 px-4 py-2.5 text-sm font-extrabold text-slate-900 focus:outline-none">
            {tours.map(t => <option key={t.id} value={t.id}>
                {tr(t.title)} — ({formatBnDate(t.startDate)}{tr(") [")}{t.bookingsCount}{tr("টি বুকিং]")}</option>)}
          </select>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <div className="relative">
            <Search className="h-4 w-4 text-slate-400 absolute left-3 top-3" />
            <input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder={tr("নাম বা ফোন নাম্বার খুঁজুন...")} className="rounded-xl border border-slate-300 pl-9 pr-3.5 py-2 text-xs font-medium" />
          </div>
          <button onClick={openNewBookingModal} className="inline-flex items-center gap-2 rounded-xl bg-emerald-800 hover:bg-emerald-900 px-4 py-2.5 text-xs sm:text-sm font-bold text-white shadow-md transition">
            <Plus className="h-4 w-4 text-amber-300" />{tr("নতুন বুকিং যুক্ত করুন")}</button>
        </div>
      </div>

      {/* Tour Booking Summary Strip */}
      {activeTour && <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="rounded-2xl bg-white border border-slate-200 p-4">
            <div className="text-xs font-bold text-slate-500">{tr("মোট বুকিং ও সিট")}</div>
            <div className="text-2xl font-black text-slate-900 mt-1">
              {activeTour.bookingsCount}{tr("টি বুকিং (")}{activeTour.seatsBooked}/{activeTour.totalSeats}{tr("সিট)")}</div>
            <div className="text-[11px] text-emerald-700 font-semibold mt-0.5">{tr("খালি আছে:")}{activeTour.seatsRemaining}{tr("টি সিট")}</div>
          </div>

          <div className="rounded-2xl bg-white border border-slate-200 p-4">
            <div className="text-xs font-bold text-slate-500">{tr("মোট বিল (Total Bill)")}</div>
            <div className="text-2xl font-black text-slate-900 mt-1">
              {formatTaka(activeTour.totalBillAmount)}
            </div>
            <div className="text-[11px] text-slate-500 mt-0.5">{tr("ডিসকাউন্ট বাদে নিট বিল")}</div>
          </div>

          <div className="rounded-2xl bg-emerald-50 border border-emerald-200 p-4">
            <div className="text-xs font-bold text-emerald-800">{tr("মোট জমা (Collected)")}</div>
            <div className="text-2xl font-black text-emerald-900 mt-1">
              {formatTaka(activeTour.totalCollected)}
            </div>
            <div className="text-[11px] text-emerald-700 mt-0.5">{tr("বিকাশ, নগদ ও ক্যাশ এডভান্স")}</div>
          </div>

          <div className="rounded-2xl bg-rose-50 border border-rose-200 p-4">
            <div className="text-xs font-bold text-rose-800">{tr("মোট বাকি (Total Due)")}</div>
            <div className="text-2xl font-black text-rose-700 mt-1">
              {formatTaka(activeTour.totalDue)}
            </div>
            <div className="text-[11px] text-rose-600 mt-0.5">{tr("ট্রাভেলারদের কাছে বকেয়া")}</div>
          </div>
        </div>}

      {/* Booked Travelers Table */}
      <div className="rounded-3xl bg-white border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h4 className="font-extrabold text-base text-slate-900">{tr("বুকিংকৃত ট্রাভেলারদের তালিকা (")}{bookings.length}{tr("টি বুকিং)")}</h4>
            <p className="text-xs text-slate-500">{tr("যেমন ভিডিওতে দেখানো হয়েছে: তানিয়া পারভেজ (৫ জন) — বিল ৳১৯,৯৯৫ | জমা ৳৭,৫০০ | বাকি ৳১২,৪৯৫")}</p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-extrabold uppercase text-slate-500">
                <th className="py-3.5 px-4">{tr("ট্রাভেলার ও ফোন")}</th>
                <th className="py-3.5 px-4">{tr("জনসংখ্যা ও সিট")}</th>
                <th className="py-3.5 px-4">{tr("প্যাকেজ ও সোর্স")}</th>
                <th className="py-3.5 px-4 text-right">{tr("মোট বিল")}</th>
                <th className="py-3.5 px-4 text-right">{tr("জমা (Paid)")}</th>
                <th className="py-3.5 px-4 text-right">{tr("বাকি (Due)")}</th>
                <th className="py-3.5 px-4 text-right">{tr("অ্যাকশন (SMS / ফিডব্যাক / ডিউ)")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {bookings.map(b => <tr key={b.id} className="hover:bg-slate-50/80 transition">
                  <td className="py-3.5 px-4">
                    <div className="font-extrabold text-slate-900 text-sm">{b.customerName}</div>
                    <div className="text-slate-500 font-mono">{tr("📞")}<DemoPhone value={b.customerPhone} /> • <span className="text-emerald-700 font-semibold">{b.bookingCode}</span>
                    </div>
                  </td>
                  <td className="py-3.5 px-4">
                    <span className="inline-flex items-center rounded-lg bg-emerald-100 text-emerald-900 px-2.5 py-1 font-extrabold">
                      {b.pax}{tr("জন")}</span>
                    {b.seatNumbers && <div className="text-[11px] text-slate-500 mt-1">{tr("সিট: ")}{b.seatNumbers}</div>}
                  </td>
                  <td className="py-3.5 px-4">
                    <div className="font-bold text-slate-800">{b.packageName}</div>
                    <div className="text-[11px] text-slate-500">{tr("মাধ্যম:")}<strong className="uppercase">{b.paymentMethod}</strong>{tr(" • সোর্স:")}{' '}
                      <strong>
                        {b.source === 'phone' ? 'ফোন কল' : b.source === 'facebook' ? 'ফেসবুক' : b.source === 'website' ? 'ওয়েবসাইট' : 'অফিস'}
                      </strong>
                      {b.discount > 0 && <span className="text-amber-700 ml-1">{tr("(ছাড়:")}{formatTaka(b.discount)})
                        </span>}
                    </div>
                  </td>
                  <td className="py-3.5 px-4 text-right font-black text-slate-900 tabular-nums text-sm">
                    {formatTaka(b.totalAmount)}
                  </td>
                  <td className="py-3.5 px-4 text-right font-black text-emerald-700 tabular-nums text-sm">
                    {formatTaka(b.advancePaid)}
                  </td>
                  <td className="py-3.5 px-4 text-right tabular-nums">
                    {b.dueAmount > 0 ? <span className="inline-block rounded-lg bg-rose-100 text-rose-800 px-2.5 py-1 font-black text-sm">
                        {formatTaka(b.dueAmount)}
                      </span> : <span className="inline-block rounded-lg bg-emerald-100 text-emerald-800 px-2.5 py-1 font-bold">{tr("পরিশোধিত")}</span>}
                  </td>
                  <td className="py-3.5 px-4 text-right">
                    <div className="flex flex-wrap items-center justify-end gap-1.5">
                      {b.dueAmount > 0 && <button onClick={() => {
                    setDueModalBooking(b);
                    setCollectAmount(b.dueAmount);
                  }} className="rounded-lg bg-amber-100 hover:bg-amber-200 text-amber-950 px-2.5 py-1.5 font-bold transition">{tr("ডিউ জমা নিন")}</button>}
                      <button onClick={() => handleSendFeedbackLink(b)} title={tr("ট্রাভেলারের ফোনে ফিডব্যাক লিংক এসএমএস পাঠান")} className="inline-flex items-center gap-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-900 px-2.5 py-1.5 font-bold transition">
                        <Send className="h-3 w-3" />{tr("ফিডব্যাক SMS")}</button>
                      <button onClick={() => onOpenFeedbackModal(b.id)} title={tr("ট্রাভেলার যে ফিডব্যাক পেজ দেখবে তা ওপেন করুন")} className="inline-flex items-center gap-1 rounded-lg bg-slate-900 hover:bg-slate-800 text-amber-300 px-2.5 py-1.5 font-bold transition">
                        <MessageSquareHeart className="h-3 w-3" />{tr("ফিডব্যাক লিংক ভিউ")}</button>
                    </div>
                  </td>
                </tr>)}
            </tbody>
          </table>
        </div>
      </div>

      {/* New Booking Modal + Auto-Suggest Customer + Immediate Confirmation SMS Review */}
      {newModalOpen && activeTour && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm overflow-y-auto">
          <div className="w-full max-w-2xl rounded-3xl bg-white shadow-2xl border border-slate-200 overflow-hidden my-8">
            <div className="bg-emerald-950 text-white px-6 py-4 flex items-center justify-between">
              <div>
                <div className="text-xs text-amber-300 font-bold">
                  {tr(confirmSmsStep ? 'ধাপ ২/২: বুকিং কনফার্মেশন এসএমএস রিভিউ ও সেন্ড' : 'ধাপ ১/২: নতুন ট্রাভেলার বুকিং এন্ট্রি')}
                </div>
                <h3 className="text-lg font-bold">{tr(activeTour.title)}</h3>
              </div>
              <button onClick={() => setNewModalOpen(false)} className="rounded-full bg-white/10 p-2 text-white">
                <X className="h-4 w-4" />
              </button>
            </div>

            {confirmSmsStep ? <div className="p-6 space-y-5">
                <div className="rounded-2xl bg-emerald-50 border border-emerald-200 p-4 flex items-start gap-3">
                  <CheckCircle2 className="h-6 w-6 text-emerald-700 shrink-0 mt-0.5" />
                  <div className="text-xs text-emerald-950 space-y-1">
                    <div className="font-bold text-sm">{tr("বুকিং সেভ হয়েছে! (কোড:")}{confirmSmsStep.booking.bookingCode})
                    </div>
                    <div>{tr("ট্রাভেলার:")}<strong>{confirmSmsStep.booking.customerName}</strong>{tr(" • মোট বিল:")}{' '}
                      <strong>{formatTaka(confirmSmsStep.booking.totalAmount)}</strong>{tr(" • জমা:")}{' '}
                      <strong>{formatTaka(confirmSmsStep.booking.advancePaid)}</strong>{tr(" • বাকি:")}{' '}
                      <strong>{formatTaka(confirmSmsStep.booking.dueAmount)}</strong>
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">{tr("কাস্টমারকে পাঠানোর জন্য অটোমেটিক তৈরি কনফার্মেশন মেসেজ (এডিটেবল):")}</label>
                  <textarea rows={4} value={confirmSmsStep.smsText} onChange={e => setConfirmSmsStep({
              ...confirmSmsStep,
              smsText: e.target.value
            })} className="w-full rounded-2xl border-2 border-emerald-600 bg-amber-50/30 p-4 text-sm font-semibold text-slate-900" />
                </div>

                <div className="flex items-center justify-end gap-3">
                  <button type="button" onClick={() => {
              setNewModalOpen(false);
              setConfirmSmsStep(null);
            }} className="rounded-xl border border-slate-300 px-4 py-2.5 text-xs font-bold text-slate-600">{tr("পরে পাঠাবো")}</button>
                  <button type="button" disabled={sendingConfirmSms} onClick={handleSendBookingSms} className="inline-flex items-center gap-2 rounded-xl bg-emerald-800 hover:bg-emerald-900 px-6 py-3 text-xs sm:text-sm font-bold text-white shadow-lg transition">
                    <Send className="h-4 w-4 text-amber-300" />
                    {tr(sendingConfirmSms ? 'পাঠানো হচ্ছে...' : 'সেন্ড এসএমএস (Send SMS)')}
                  </button>
                </div>
              </div> : <form onSubmit={handleSaveNewBooking} className="p-6 space-y-4">
                {/* Phone Number with Auto-Suggest Dropdown (Video Highlight: 01757950...) */}
                <div className="relative">
                  <label className="block text-xs font-bold text-slate-700 mb-1">{tr("১. ট্রাভেলারের ফোন নাম্বার (টাইপ করলে আগের কাস্টমার অটো সাজেশনে আসবে) *")}</label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="relative">
                      <input type="text" required value={phoneInput} onFocus={() => setShowSuggestions(true)} onChange={e => {
                  setPhoneInput(e.target.value);
                  setShowSuggestions(true);
                }} placeholder={tr("যেমন: 00000000116")} className="w-full rounded-xl border-2 border-emerald-600 px-3.5 py-2.5 text-sm font-bold" />
                      {showSuggestions && matchingCustomers.length > 0 && <div className="absolute left-0 right-0 top-full mt-1 z-20 rounded-2xl bg-white border border-emerald-300 shadow-xl max-h-48 overflow-y-auto">
                          <div className="px-3 py-1.5 bg-emerald-50 text-[10px] font-bold text-emerald-800 flex items-center justify-between">
                            <span>{tr("পূর্ববর্তী কাস্টমার সাজেশন (ক্লিক করলে অটো-ফিল হবে)")}</span>
                            <button type="button" onClick={() => setShowSuggestions(false)} className="text-slate-500">
                              ✕
                            </button>
                          </div>
                          {matchingCustomers.map(c => <button type="button" key={c.id} onClick={() => {
                    setPhoneInput(c.phone);
                    setCustomerName(c.name);
                    setShowSuggestions(false);
                  }} className="w-full text-left px-3.5 py-2 hover:bg-emerald-50 text-xs flex items-center justify-between border-t border-slate-100">
                              <div>
                                <div className="font-bold text-slate-900">{tr(c.name)}</div>
                                <div className="text-slate-500 font-mono"><DemoPhone value={c.phone} /></div>
                              </div>
                              <span className="rounded-full bg-emerald-100 text-emerald-800 px-2 py-0.5 text-[10px] font-bold">{tr("অটো-ফিল করুন")}</span>
                            </button>)}
                        </div>}
                    </div>

                    <div>
                      <input type="text" required value={customerName} onChange={e => setCustomerName(e.target.value)} placeholder={tr("কাস্টমারের নাম (যেমন: ইসরাত জাহান)")} className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm font-bold" />
                    </div>
                  </div>
                </div>

                {/* Package, Pax & Seat Numbers */}
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-bold text-slate-700 mb-1">{tr("২. প্যাকেজ নির্বাচন করুন")}</label>
                    <select value={packageId} onChange={e => setPackageId(e.target.value)} className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-xs font-bold">
                      {(activeTour.packages || []).map(p => <option key={p.id} value={p.id}>
                          {tr(p.name)} — {formatTaka(p.price)}
                        </option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">{tr("কতজন যাবেন (Pax)")}</label>
                    <input type="number" min={1} max={activeTour.seatsRemaining ?? activeTour.seatsLeft ?? activeTour.totalSeats} value={pax} onChange={e => setPax(Math.max(1, Number(e.target.value) || 1))} className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm font-bold" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      {t("Selected bus seats", "নির্বাচিত বাসের সিট")}
                    </label>
                    <input type="text" value={seatAssignments.map(seat => seat.id).join(", ")} readOnly placeholder={tr("B2 / A1-A4")} className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm font-semibold" />
                  </div>
                </div>

                {activeTour.busId && <TourSeatPicker tourId={activeTour.id} pax={pax} selected={seatAssignments} onChange={setSeatAssignments} />}
                <div className="rtt-bkash-info"><strong>{tr("bKash / বিকাশ: 01782250709")}</strong><p>{t("Record only money actually received. Payment references must be verified manually.", "শুধু পাওয়া টাকা জমা হিসেবে লিখুন। পেমেন্টের রেফারেন্স হাতে যাচাই করতে হবে।")}</p></div>
                {/* Extra Charges (Entry Tickets 200) & Discount (e.g. 399 for bargaining) */}
                <div className="rounded-2xl bg-slate-50 border border-slate-200 p-4 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <label className="flex items-center gap-2 text-xs font-bold text-slate-800 cursor-pointer">
                      <input type="checkbox" checked={includeEntryTicket} onChange={e => setIncludeEntryTicket(e.target.checked)} className="h-4 w-4 accent-emerald-700" />{tr("প্রবেশ টিকিট / অতিরিক্ত চার্জ যুক্ত করুন (")}{formatTaka(addonTicketUnit)}{tr(" × ")}{pax}{tr(" জন =")}{' '}
                      {formatTaka(addonTicketUnit * pax)})
                    </label>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">{tr("ডিসকাউন্ট (টাকা — যেমন ৩৯৯ বা ২০০)")}</label>
                      <input type="number" min={0} value={discount} onChange={e => setDiscount(Number(e.target.value) || 0)} className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-amber-800" />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">{tr("ডিসকাউন্টের কারণ (বার্গেন করেছে / অফার)")}</label>
                      <input type="text" value={discountReason} onChange={e => setDiscountReason(e.target.value)} placeholder={tr("বার্গেন করেছে / অফার")} className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold" />
                    </div>
                  </div>
                </div>

                {/* Advance Payment, Auto Due, Payment Method & Source */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-emerald-800 mb-1">{tr("এডভান্স জমা (Advance)")}</label>
                    <input type="number" min={0} value={advancePaid} onChange={e => setAdvancePaid(Number(e.target.value) || 0)} className="w-full rounded-xl border-2 border-emerald-600 px-3 py-2 text-sm font-black text-emerald-900" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-rose-700 mb-1">{tr("অটোমেটিক বাকি (Due)")}</label>
                    <div className="rounded-xl bg-rose-50 border border-rose-200 px-3 py-2 text-sm font-black text-rose-700">
                      {formatTaka(computedDue)}
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">{tr("পেমেন্ট মাধ্যম")}</label>
                    <select value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)} className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs font-bold">
                      <option value="bkash">{tr("বিকাশ (bKash)")}</option>
                      <option value="cash">{tr("ক্যাশ (Cash)")}</option>
                      <option value="nagad">{tr("নগদ (Nagad)")}</option>
                      <option value="bank">{tr("ব্যাংক (Bank)")}</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">{tr("বুকিং সোর্স")}</label>
                    <select value={source} onChange={e => setSource(e.target.value)} className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs font-bold">
                      <option value="phone">{tr("ফোন কল (Phone Call)")}</option>
                      <option value="facebook">{tr("ফেসবুক (Facebook)")}</option>
                      <option value="website">{tr("ওয়েবসাইট (Website)")}</option>
                      <option value="walkin">{tr("অফিস (Walk-in)")}</option>
                    </select>
                  </div>
                </div>

                {/* Live Calculation Bar */}
                <div className="rounded-2xl bg-emerald-950 text-white px-5 py-3.5 flex flex-wrap items-center justify-between gap-3">
                  <div className="text-xs space-x-3">
                    <span>{tr("প্যাকেজ: ")}{formatTaka(basePackageAmount)}</span>
                    {computedExtra > 0 && <span>{tr("+ অতিরিক্ত: ")}{formatTaka(computedExtra)}</span>}
                    {discount > 0 && <span className="text-amber-300">{tr("- ছাড়: ")}{formatTaka(discount)}</span>}
                  </div>
                  <div className="text-sm font-black">{tr("নিট বিল:")}<span className="text-amber-400 text-lg">{formatTaka(netTotal)}</span>
                  </div>
                </div>

                <div className="flex items-center justify-end gap-3 pt-2">
                  <button type="button" onClick={() => setNewModalOpen(false)} className="rounded-xl border border-slate-300 px-4 py-2.5 text-xs font-bold text-slate-700">{tr("বাতিল")}</button>
                  <button type="submit" disabled={savingBooking} className="inline-flex items-center gap-2 rounded-xl bg-emerald-800 hover:bg-emerald-900 px-6 py-2.5 text-xs sm:text-sm font-bold text-white shadow-md transition">
                    {tr(savingBooking ? 'সেভ হচ্ছে...' : 'সেভ বুকিং ও মেসেজ প্রিভিউ →')}
                  </button>
                </div>
              </form>}
          </div>
        </div>}

      {/* Collect Due Modal */}
      {dueModalBooking && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 p-4 backdrop-blur-sm">
          <form onSubmit={handleCollectDue} className="w-full max-w-md rounded-3xl bg-white shadow-2xl border border-slate-200 p-6 space-y-4">
            <h4 className="font-extrabold text-base text-slate-900">{tr("বাকি টাকা আদায় —")}{dueModalBooking.customerName}
            </h4>
            <p className="text-xs text-slate-600">{tr("মোট বিল:")}{formatTaka(dueModalBooking.totalAmount)}{tr(" • বর্তমান বাকি:")}{' '}
              <strong className="text-rose-600">{formatTaka(dueModalBooking.dueAmount)}</strong>
            </p>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">{tr("আজ কত টাকা জমা নিচ্ছেন?")}</label>
              <input type="number" min={1} max={dueModalBooking.dueAmount} value={collectAmount} onChange={e => setCollectAmount(Number(e.target.value) || 0)} className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm font-bold" />
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setDueModalBooking(null)} className="rounded-xl border border-slate-300 px-4 py-2 text-xs font-bold">{tr("বাতিল")}</button>
              <button type="submit" className="rounded-xl bg-emerald-800 px-5 py-2 text-xs font-bold text-white">{tr("জমা নিশ্চিত করুন")}</button>
            </div>
          </form>
        </div>}
    </div>;
}
