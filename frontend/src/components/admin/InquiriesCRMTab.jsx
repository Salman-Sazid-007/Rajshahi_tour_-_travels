import DemoPhone from '../DemoPhone';
import { useI18n } from "../../lib/i18n";
import React, { useEffect, useState } from 'react';
import { Award, CheckCircle2, MessageSquare, Phone, Plus, RefreshCw, Search, Tag, UserCheck, Users } from 'lucide-react';
import { apiFetch, formatTaka } from '../../lib/api';
export function InquiriesView({
  onNavigateTab,
  showToast
}) {
  const {
    tr
  } = useI18n();
  const [inquiries, setInquiries] = useState([]);
  const [statusFilter, setStatusFilter] = useState('all');
  const loadInquiries = () => {
    apiFetch('/api/inquiries').then(res => setInquiries(res.inquiries || [])).catch(() => {});
  };
  useEffect(() => {
    loadInquiries();
  }, []);
  const handleStatusChange = async (id, status) => {
    try {
      await apiFetch(`/api/inquiries/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          status
        })
      });
      showToast(tr('কুয়েরি স্ট্যাটাস আপডেট হয়েছে!'));
      loadInquiries();
    } catch (err) {
      alert(err.message);
    }
  };
  const handleConvert = async inq => {
    if (!inq.seatRequestId) {
      onNavigateTab?.('bookings');
      showToast(tr('Select bus seats in the bookings tab / বুকিং ট্যাবে বাসের সিট বাছুন'));
      return;
    }
    try {
      const res = await apiFetch(`/api/inquiries/${inq.id}/convert`, {
        method: 'POST',
        body: JSON.stringify({
          advancePaid: 0
        })
      });
      showToast(res.message || 'কুয়েরিটি বুকিংয়ে রূপান্তরিত হয়েছে!');
      loadInquiries();
    } catch (err) {
      alert(err.message);
    }
  };
  const filtered = statusFilter === 'all' ? inquiries : inquiries.filter(i => i.status === statusFilter);
  return <div className="space-y-6">
      <div className="rounded-3xl bg-white border border-slate-200 p-5 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h3 className="text-xl font-black text-slate-900">{tr("ওয়েবসাইট কুয়েরি ও আগ্রহী ট্রাভেলার লিস্ট")}</h3>
          <p className="text-xs text-slate-500 mt-0.5">{tr("ওয়েবসাইটে ট্যুর দেখে যারা যেতে চেয়ে নাম ও ফোন নাম্বার দিয়েছে — ট্যাগ পরিবর্তন ও বুকিং কনভার্ট করুন")}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {[{
          id: 'all',
          label: 'সব কুয়েরি'
        }, {
          id: 'new',
          label: 'নতুন (New)'
        }, {
          id: 'contacted',
          label: 'কথা হয়েছে (Contacted)'
        }, {
          id: 'converted',
          label: 'কনভার্টেড (Converted)'
        }].map(tab => <button key={tab.id} onClick={() => setStatusFilter(tab.id)} className={`rounded-xl px-3.5 py-2 text-xs font-bold transition ${statusFilter === tab.id ? 'bg-emerald-800 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}>
              {tr(tab.label)}
            </button>)}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {filtered.map(inq => <div key={inq.id} className="rounded-3xl bg-white border border-slate-200 p-5 shadow-sm flex flex-col justify-between space-y-4">
            <div className="space-y-2.5">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h4 className="font-extrabold text-base text-slate-900">
                    {tr(inq.name)}{' '}
                    <span className="text-emerald-700 text-sm">({inq.pax}{tr(" জন যেতে চান)")}</span>
                  </h4>
                  <div className="text-xs font-mono font-bold text-emerald-800 mt-0.5">{tr("📞")}<DemoPhone value={inq.phone} />
                  </div>
                </div>
                <span className={`rounded-full px-3 py-1 text-xs font-extrabold ${inq.status === 'new' ? 'bg-amber-100 text-amber-900' : inq.status === 'contacted' ? 'bg-sky-100 text-sky-900' : 'bg-emerald-100 text-emerald-900'}`}>
                  {inq.status === 'new' ? '● নতুন (New)' : inq.status === 'contacted' ? '📞 কথা হয়েছে (Contacted)' : '✓ কনভার্টেড (Converted)'}
                </span>
              </div>

              <div className="rounded-xl bg-slate-50 border border-slate-200/80 p-3 text-xs space-y-1">
                <div className="font-bold text-slate-900">{tr("ট্যুর: ")}{tr(inq.tourTitle)}</div>
                {inq.preferredPackage && <div className="text-emerald-800 font-semibold">{tr("প্যাকেজ:")}{inq.preferredPackage}
                  </div>}
                {inq.seatAssignments?.length > 0 && <p className="text-cyan-800">{inq.seatAssignments.map(seat => `${seat.id} (${seat.gender === "female" ? "F" : "M"})`).join(", ")}</p>}
                {inq.message && <p className="text-slate-600">“{inq.message}”</p>}
              </div>
            </div>

            <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <a href={`tel:$<DemoPhone value={inq.phone} />`} className="inline-flex items-center gap-1 rounded-xl bg-slate-100 hover:bg-slate-200 px-3 py-2 text-xs font-bold text-slate-800">
                  <Phone className="h-3.5 w-3.5 text-emerald-700" />{tr("কল করুন")}</a>
                <select value={inq.status} onChange={e => handleStatusChange(inq.id, e.target.value)} className="rounded-xl border border-slate-300 px-2.5 py-1.5 text-xs font-bold">
                  <option value="new">{tr("নতুন (New)")}</option>
                  <option value="contacted">{tr("কথা হয়েছে (Contacted)")}</option>
                  <option value="converted">{tr("কনভার্টেড (Converted)")}</option>
                  <option value="closed">{tr("বাতিল (Closed)")}</option>
                </select>
              </div>

              {inq.status !== 'converted' && <button onClick={() => handleConvert(inq)} className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-800 hover:bg-emerald-900 px-3.5 py-2 text-xs font-bold text-white transition">
                  <CheckCircle2 className="h-3.5 w-3.5 text-amber-300" />{tr("১ ক্লিকে বুকিং কনফার্ম করুন")}</button>}
            </div>
          </div>)}
      </div>
    </div>;
}
export function CustomersCRMView({
  onNavigateTab,
  showToast
}) {
  const {
    tr
  } = useI18n();
  const [customers, setCustomers] = useState([]);
  const [tagFilter, setTagFilter] = useState('all');
  const [search, setSearch] = useState('');
  const loadCustomers = () => {
    apiFetch('/api/customers').then(res => setCustomers(res.customers || [])).catch(() => {});
  };
  useEffect(() => {
    loadCustomers();
  }, []);
  const handleToggleTag = async (custId, tagKey) => {
    try {
      await apiFetch(`/api/customers/${custId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          toggleTag: tagKey
        })
      });
      showToast(tr('কাস্টমার ট্যাগ আপডেট হয়েছে!'));
      loadCustomers();
    } catch (err) {
      alert(err.message);
    }
  };
  const filtered = customers.filter(c => {
    if (tagFilter !== 'all' && !(c.tags || []).includes(tagFilter)) return false;
    if (search && !c.name.toLowerCase().includes(search.toLowerCase()) && !c.phone.includes(search)) {
      return false;
    }
    return true;
  });
  return <div className="space-y-6">
      <div className="rounded-3xl bg-white border border-slate-200 p-5 shadow-sm flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h3 className="text-xl font-black text-slate-900">{tr("কাস্টমারস সিআরএম (Customers & Loyalty Tags)")}</h3>
          <p className="text-xs text-slate-500 mt-0.5">{tr("আপনাদের সাথে আগে ট্যুরে যাওয়া প্রতিটি কাস্টমারের লিস্ট, কোন কোন ট্যুরে গেছে এবং লয়াল/রিপিট কাস্টমার ট্যাগ ম্যানেজমেন্ট")}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {[{
          id: 'all',
          label: 'সব কাস্টমার'
        }, {
          id: 'loyal',
          label: '★ লয়াল কাস্টমার (Loyal)'
        }, {
          id: 'repeat',
          label: '↻ রিপিট কাস্টমার (Repeat)'
        }, {
          id: 'vip',
          label: '👑 VIP'
        }].map(t => <button key={t.id} onClick={() => setTagFilter(t.id)} className={`rounded-xl px-3.5 py-2 text-xs font-bold transition ${tagFilter === t.id ? 'bg-emerald-800 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}>
              {tr(t.label)}
            </button>)}
          <button onClick={() => onNavigateTab('sms')} className="inline-flex items-center gap-1.5 rounded-xl bg-amber-400 hover:bg-amber-300 px-4 py-2 text-xs font-black text-slate-950 transition">
            <MessageSquare className="h-3.5 w-3.5" />{tr("এদের সবাইকে অফার এসএমএস দিন →")}</button>
        </div>
      </div>

      <div className="rounded-3xl bg-white border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-200 flex items-center justify-between">
          <div className="relative w-full max-w-sm">
            <Search className="h-4 w-4 text-slate-400 absolute left-3 top-3" />
            <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder={tr("কাস্টমারের নাম বা ফোন নাম্বার দিয়ে খুঁজুন...")} className="w-full rounded-xl border border-slate-300 pl-9 pr-3.5 py-2 text-xs" />
          </div>
          <span className="text-xs font-bold text-slate-500">{tr("মোট কাস্টমার:")}{filtered.length}{tr("জন")}</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-extrabold uppercase text-slate-500">
                <th className="py-3.5 px-4">{tr("কাস্টমার ও ঠিকানা")}</th>
                <th className="py-3.5 px-4">{tr("পূর্বে যেসব ট্যুরে গেছেন")}</th>
                <th className="py-3.5 px-4">{tr("কাস্টমার ট্যাগ (ক্লিক করে টগল করুন)")}</th>
                <th className="py-3.5 px-4 text-right">{tr("মোট খরচ")}</th>
                <th className="py-3.5 px-4 text-right">{tr("বর্তমান বাকি")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {filtered.map(c => <tr key={c.id} className="hover:bg-slate-50/70 transition">
                  <td className="py-3.5 px-4">
                    <div className="font-extrabold text-sm text-slate-900">{tr(c.name)}</div>
                    <div className="text-slate-500 font-mono">{tr("📞")}<DemoPhone value={c.phone} />{tr(" • 📍 ")}{c.address}
                    </div>
                  </td>
                  <td className="py-3.5 px-4">
                    <div className="flex flex-wrap gap-1">
                      {(c.toursCompleted || []).map((tName, idx) => <span key={idx} className="rounded-lg bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-700">
                          ✓ {tName}
                        </span>)}
                    </div>
                  </td>
                  <td className="py-3.5 px-4">
                    <div className="flex flex-wrap gap-1.5">
                      {[{
                    key: 'loyal',
                    label: '★ লয়াল কাস্টমার',
                    activeCls: 'bg-amber-400 text-slate-950'
                  }, {
                    key: 'repeat',
                    label: '↻ রিপিট কাস্টমার',
                    activeCls: 'bg-emerald-700 text-white'
                  }, {
                    key: 'vip',
                    label: '👑 VIP',
                    activeCls: 'bg-purple-700 text-white'
                  }].map(t => {
                    const has = (c.tags || []).includes(t.key);
                    return <button key={t.key} onClick={() => handleToggleTag(c.id, t.key)} className={`rounded-full px-2.5 py-1 text-[11px] font-bold transition ${has ? t.activeCls : 'bg-slate-100 text-slate-400 hover:bg-slate-200 hover:text-slate-700'}`}>
                            {tr(t.label)}
                          </button>;
                  })}
                    </div>
                  </td>
                  <td className="py-3.5 px-4 text-right font-black text-slate-900 tabular-nums">
                    {formatTaka(c.totalSpent)}
                  </td>
                  <td className="py-3.5 px-4 text-right tabular-nums">
                    {c.totalDue > 0 ? <span className="rounded-lg bg-rose-100 text-rose-800 px-2.5 py-1 font-bold">
                        {formatTaka(c.totalDue)}
                      </span> : <span className="text-emerald-700 font-bold">{tr("৳০")}</span>}
                  </td>
                </tr>)}
            </tbody>
          </table>
        </div>
      </div>
    </div>;
}
