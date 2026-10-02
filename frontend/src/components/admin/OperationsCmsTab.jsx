import React, { useEffect, useState } from 'react';
import {
  Eye,
  EyeOff,
  Phone,
  Save,
  Star,
  Trash2,
  Utensils,
} from 'lucide-react';
import { apiFetch } from '../../lib/api';

export function MealMenusView({ showToast }) {
  const [menus, setMenus] = useState([]);
  const [form, setForm] = useState({
    category: 'breakfast',
    name: '',
    items: '',
    costPerPerson: '',
  });

  const loadMenus = () => {
    apiFetch('/api/meal-menus')
      .then((res) => setMenus(res.mealMenus || []))
      .catch(() => {});
  };

  useEffect(() => {
    loadMenus();
  }, []);

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!form.name || !form.costPerPerson) return;
    try {
      await apiFetch('/api/meal-menus', {
        method: 'POST',
        body: JSON.stringify({
          ...form,
          costPerPerson: Number(form.costPerPerson) || 0,
        }),
      });
      loadMenus();
      setForm({ category: 'breakfast', name: '', items: '', costPerPerson: '' });
      showToast('নতুন খাবার মেনু যুক্ত হয়েছে!');
    } catch (err) {
      alert(err.message);
    }
  };

  const handleUpdatePrice = async (item, newPrice) => {
    try {
      await apiFetch(`/api/meal-menus/${item.id}`, {
        method: 'PUT',
        body: JSON.stringify({ costPerPerson: Number(newPrice) || 0 }),
      });
      loadMenus();
      showToast(`${item.name}-এর দাম আপডেট হয়েছে`);
    } catch (err) {
      alert(err.message);
    }
  };

  const handleDelete = async (id) => {
    try {
      await apiFetch(`/api/meal-menus/${id}`, { method: 'DELETE' });
      loadMenus();
      showToast('মেনু আইটেম মুছে ফেলা হয়েছে');
    } catch (err) {
      alert(err.message);
    }
  };

  const categories = [
    { id: 'breakfast', label: 'সকালের নাস্তা (Breakfast)' },
    { id: 'snacks', label: 'স্ন্যাকস ও চা (Snacks)' },
    { id: 'lunch', label: 'দুপুরের খাবার (Lunch)' },
    { id: 'dinner', label: 'রাতের খাবার / বারবিকিউ (Dinner)' },
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-8 space-y-4">
          <div className="rounded-3xl bg-white border border-slate-200 p-5 shadow-sm">
            <h3 className="text-xl font-black text-slate-900">
              মিল মেনুস ক্যাটালগ (ট্যুর বাজেট প্ল্যানিংয়ের জন্য)
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              এখানে সেট করা খাবারের মেনু ও জনপ্রতি খরচ সরাসরি ট্যুর তৈরির সময় ডে-বাই-ডে খাবার প্ল্যানে সিলেক্ট করা যায়
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {categories.map((cat) => (
              <div
                key={cat.id}
                className="rounded-3xl bg-white border border-slate-200 p-5 shadow-sm space-y-3"
              >
                <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
                  <span className="font-extrabold text-sm text-emerald-950 flex items-center gap-2">
                    <Utensils className="h-4 w-4 text-emerald-700" />
                    {cat.label}
                  </span>
                </div>

                <div className="space-y-2.5">
                  {menus
                    .filter((m) => m.category === cat.id)
                    .map((item) => (
                      <div
                        key={item.id}
                        className="rounded-2xl bg-slate-50 border border-slate-200/80 p-3 flex items-center justify-between gap-2 text-xs"
                      >
                        <div>
                          <div className="font-bold text-slate-900 text-sm">{item.name}</div>
                          <div className="text-slate-500 text-[11px]">{item.items}</div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <div className="flex items-center rounded-xl bg-white border border-slate-300 px-2 py-1">
                            <span className="text-slate-400 mr-1">৳</span>
                            <input
                              type="number"
                              defaultValue={item.costPerPerson}
                              onBlur={(e) => {
                                if (Number(e.target.value) !== item.costPerPerson) {
                                  handleUpdatePrice(item, e.target.value);
                                }
                              }}
                              className="w-14 font-black text-emerald-800 text-xs focus:outline-none"
                            />
                          </div>
                          <button
                            onClick={() => handleDelete(item.id)}
                            className="text-slate-400 hover:text-rose-600 p-1"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        <form
          onSubmit={handleAdd}
          className="lg:col-span-4 rounded-3xl bg-white border border-slate-200 p-5 shadow-sm h-fit space-y-4"
        >
          <h4 className="font-extrabold text-base text-slate-900">
            + নতুন খাবার মেনু যুক্ত করুন
          </h4>
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">খাবারের বেলা</label>
            <select
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
              className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-xs font-bold"
            >
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              মেনুর নাম * (যেমন: ডিম খিচুড়ি / ব্যাম্বু বিরিয়ানি)
            </label>
            <input
              type="text"
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="যেমন: ডিম খিচুড়ি ও আচার"
              className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              খাবারের আইটেম বিবরণ
            </label>
            <input
              type="text"
              value={form.items}
              onChange={(e) => setForm({ ...form, items: e.target.value })}
              placeholder="ভুনা খিচুড়ি, ডিম ভুনা, সালাদ, পানি"
              className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-xs"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              জনপ্রতি আনুমানিক খরচ (টাকা) * (কাস্টমার দেখবে না)
            </label>
            <input
              type="number"
              required
              value={form.costPerPerson}
              onChange={(e) => setForm({ ...form, costPerPerson: e.target.value })}
              placeholder="90"
              className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm font-bold"
            />
          </div>
          <button
            type="submit"
            className="w-full rounded-xl bg-emerald-800 hover:bg-emerald-900 py-3 text-xs font-bold text-white shadow-sm transition"
          >
            মেনু সংরক্ষণ করুন
          </button>
        </form>
      </div>
    </div>
  );
}

export function NetworkContactsView({ showToast }) {
  const [contacts, setContacts] = useState([]);
  const [destFilter, setDestFilter] = useState('all');
  const [form, setForm] = useState({
    category: 'hotel',
    destination: 'সাজেক ভ্যালি',
    name: '',
    contactPerson: '',
    phone: '',
    rateNote: '',
  });

  const loadContacts = () => {
    apiFetch('/api/network-contacts')
      .then((res) => setContacts(res.contacts || res.networkContacts || []))
      .catch(() => {});
  };

  useEffect(() => {
    loadContacts();
  }, []);

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!form.name || !form.phone) return;
    try {
      await apiFetch('/api/network-contacts', {
        method: 'POST',
        body: JSON.stringify(form),
      });
      loadContacts();
      setForm({
        category: 'hotel',
        destination: 'সাজেক ভ্যালি',
        name: '',
        contactPerson: '',
        phone: '',
        rateNote: '',
      });
      showToast('নতুন নেটওয়ার্ক কন্টাক্ট যুক্ত হয়েছে!');
    } catch (err) {
      alert(err.message);
    }
  };

  const handleDelete = async (id) => {
    try {
      await apiFetch(`/api/network-contacts/${id}`, { method: 'DELETE' });
      loadContacts();
      showToast('কন্টাক্ট মুছে ফেলা হয়েছে');
    } catch (err) {
      alert(err.message);
    }
  };

  const destinations = ['all', ...new Set(contacts.map((c) => c.destination))];
  const filtered = contacts.filter(
    (c) => destFilter === 'all' || c.destination === destFilter
  );

  return (
    <div className="space-y-6">
      <div className="rounded-3xl bg-white border border-slate-200 p-5 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h3 className="text-xl font-black text-slate-900">
            নেটওয়ার্ক কন্টাক্টস (হোটেল, বাস কাউন্টার, চাঁদের গাড়ি ও ট্রলার)
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            ট্যুর গাইড ও অপারেশনস টিম যেকোনো গন্তব্যে গিয়ে এক ক্লিকেই পার্টনার হোটেল বা গাড়ি ড্রাইভারকে কল করতে পারবেন
          </p>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {destinations.map((d) => (
            <button
              key={d}
              onClick={() => setDestFilter(d)}
              className={`rounded-xl px-3 py-1.5 text-xs font-bold transition ${
                destFilter === d
                  ? 'bg-emerald-800 text-white'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              {d === 'all' ? 'সব গন্তব্য' : d}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-8 grid grid-cols-1 md:grid-cols-2 gap-4">
          {filtered.map((c) => (
            <div
              key={c.id}
              className="rounded-3xl bg-white border border-slate-200 p-5 shadow-sm flex flex-col justify-between gap-3"
            >
              <div>
                <div className="flex items-center justify-between gap-2 mb-2">
                  <span className="rounded-full bg-emerald-100 text-emerald-900 px-2.5 py-0.5 text-[11px] font-bold">
                    📍 {c.destination}
                  </span>
                  <button
                    onClick={() => handleDelete(c.id)}
                    className="text-slate-400 hover:text-rose-600"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
                <h4 className="font-extrabold text-base text-slate-900">{c.name}</h4>
                <p className="text-xs text-slate-600 font-semibold mt-0.5">
                  দায়িত্বপ্রাপ্ত: {c.contactPerson}
                </p>
                {(c.rateNote || c.notes) && (
                  <p className="text-xs text-emerald-800 bg-emerald-50 rounded-xl px-3 py-1.5 mt-2 font-medium">
                    💡 {c.rateNote || c.notes}
                  </p>
                )}
              </div>

              <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                <span className="font-mono text-xs font-black text-slate-900">{c.phone}</span>
                <a
                  href={`tel:${c.phone}`}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-800 hover:bg-emerald-900 px-3.5 py-2 text-xs font-bold text-white transition"
                >
                  <Phone className="h-3.5 w-3.5 text-amber-300" />
                  কল করুন
                </a>
              </div>
            </div>
          ))}
        </div>

        <form
          onSubmit={handleAdd}
          className="lg:col-span-4 rounded-3xl bg-white border border-slate-200 p-5 shadow-sm h-fit space-y-3.5"
        >
          <h4 className="font-extrabold text-base text-slate-900">
            + নতুন হোটেল / গাড়ি / বোট কন্টাক্ট
          </h4>
          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">ক্যাটাগরি</label>
              <select
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs font-bold"
              >
                <option value="hotel">হোটেল / রিসোর্ট</option>
                <option value="local_transport">চাঁদের গাড়ি / জিপ</option>
                <option value="boat">নৌকা / হাউসবোট</option>
                <option value="bus">বাস কাউন্টার</option>
                <option value="restaurant">রেস্টুরেন্ট</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">গন্তব্য</label>
              <input
                type="text"
                value={form.destination}
                onChange={(e) => setForm({ ...form, destination: e.target.value })}
                placeholder="সাজেক ভ্যালি"
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs font-bold"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              প্রতিষ্ঠান বা সার্ভিসের নাম *
            </label>
            <input
              type="text"
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="মেঘপুঞ্জি রিসোর্ট / খাগড়াছড়ি জিপ সমিতি"
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">যোগাযোগকারী</label>
              <input
                type="text"
                value={form.contactPerson}
                onChange={(e) => setForm({ ...form, contactPerson: e.target.value })}
                placeholder="নাম"
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">ফোন নাম্বার *</label>
              <input
                type="text"
                required
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                placeholder="018..."
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs font-mono"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">ভাড়া ও নোট</label>
            <input
              type="text"
              value={form.rateNote}
              onChange={(e) => setForm({ ...form, rateNote: e.target.value })}
              placeholder="কাপল রুম ৩,৫০০ টাকা"
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs"
            />
          </div>
          <button
            type="submit"
            className="w-full rounded-xl bg-emerald-800 hover:bg-emerald-900 py-2.5 text-xs font-bold text-white"
          >
            কন্টাক্ট সংরক্ষণ করুন
          </button>
        </form>
      </div>
    </div>
  );
}

export function WebsiteControlView({ showToast, onRefreshPublic }) {
  const [cms, setCms] = useState(null);
  const [reviews, setReviews] = useState([]);
  const [gallery, setGallery] = useState([]);
  const [mediaLibrary, setMediaLibrary] = useState([]);
  const [newGallery, setNewGallery] = useState({
    title: '',
    location: 'সাজেক ভ্যালি',
    image: '/media/sajek-2.jpg',
    capturedBy: 'ট্যুর গাইড মনিরুল ভাই',
  });

  const loadAll = () => {
    apiFetch('/api/cms')
      .then((res) => {
        setCms(res.siteSettings || {});
        setReviews(res.reviews || []);
        setGallery(res.gallery || []);
        setMediaLibrary(res.mediaLibrary || []);
      })
      .catch(() => {});
  };

  useEffect(() => {
    loadAll();
  }, []);

  const handleSaveCms = async (e) => {
    e.preventDefault();
    try {
      const res = await apiFetch('/api/cms/settings', {
        method: 'PUT',
        body: JSON.stringify(cms),
      });
      setCms(res.siteSettings || cms);
      showToast('ওয়েবসাইট হিরো ব্যানার ও কন্ট্রোল আপডেট হয়েছে!');
      if (onRefreshPublic) onRefreshPublic();
    } catch (err) {
      alert(err.message);
    }
  };

  const handleToggleReview = async (rev) => {
    const currentVisible = rev.isVisibleOnWebsite !== false;
    try {
      await apiFetch(`/api/cms/reviews/${rev.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ isVisibleOnWebsite: !currentVisible }),
      });
      loadAll();
      showToast(
        !currentVisible
          ? 'রিভিউটি ওয়েবসাইটে এক্টিভ করা হয়েছে'
          : 'রিভিউটি ওয়েবসাইট থেকে হাইড করা হয়েছে'
      );
      if (onRefreshPublic) onRefreshPublic();
    } catch (err) {
      alert(err.message);
    }
  };

  const handleEditReviewComment = async (rev, newComment) => {
    try {
      await apiFetch(`/api/cms/reviews/${rev.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ comment: newComment }),
      });
      loadAll();
      showToast('রিভিউ টেক্সট আপডেট হয়েছে');
      if (onRefreshPublic) onRefreshPublic();
    } catch (err) {
      alert(err.message);
    }
  };

  const handleAddGallery = async (e) => {
    e.preventDefault();
    if (!newGallery.title) return;
    try {
      await apiFetch('/api/cms/gallery', {
        method: 'POST',
        body: JSON.stringify({
          title: newGallery.title,
          destination: newGallery.location,
          url: newGallery.image,
          capturedBy: newGallery.capturedBy,
        }),
      });
      loadAll();
      setNewGallery({ ...newGallery, title: '' });
      showToast('গ্যালারিতে নতুন ছবি যুক্ত হয়েছে!');
      if (onRefreshPublic) onRefreshPublic();
    } catch (err) {
      alert(err.message);
    }
  };

  const handleDeleteGallery = async (id) => {
    try {
      await apiFetch(`/api/cms/gallery/${id}`, { method: 'DELETE' });
      loadAll();
      showToast('গ্যালারি আইটেম মুছে ফেলা হয়েছে');
      if (onRefreshPublic) onRefreshPublic();
    } catch (err) {
      alert(err.message);
    }
  };

  if (!cms) return null;

  return (
    <div className="space-y-6">
      {/* 1. Hero Section & Brand CMS */}
      <form
        onSubmit={handleSaveCms}
        className="rounded-3xl bg-white border border-slate-200 p-6 shadow-sm space-y-4"
      >
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div>
            <h3 className="text-lg font-black text-slate-900">
              ১. ওয়েবসাইট হিরো সেকশন ও ব্র্যান্ড কন্ট্রোল
            </h3>
            <p className="text-xs text-slate-500">
              হিরো ব্যানারের ছবি, বড় লেখা (যেমন: "রাজশাহী থেকে সারা বাংলাদেশ") ও অফিস ঠিকানা পরিবর্তন করুন
            </p>
          </div>
          <button
            type="submit"
            className="inline-flex items-center gap-2 rounded-xl bg-emerald-800 hover:bg-emerald-900 px-5 py-2.5 text-xs font-bold text-white shadow-sm"
          >
            <Save className="h-4 w-4 text-amber-300" />
            ওয়েবসাইট আপডেট করুন
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              হিরো ব্যানার হেডলাইন (বড় লেখা)
            </label>
            <input
              type="text"
              value={cms.heroHeadline || ''}
              onChange={(e) => setCms({ ...cms, heroHeadline: e.target.value })}
              className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm font-extrabold"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              হিরো ব্যানার ছবি নির্বাচন করুন
            </label>
            <select
              value={cms.heroBannerImage || '/media/sajek-1.webp'}
              onChange={(e) => setCms({ ...cms, heroBannerImage: e.target.value })}
              className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-xs font-bold"
            >
              {mediaLibrary.map((m) => (
                <option key={m.id} value={m.url}>
                  {m.title} ({m.url})
                </option>
              ))}
            </select>
          </div>
          <div className="md:col-span-2">
            <label className="block text-xs font-bold text-slate-700 mb-1">
              সাব-হেডলাইন বিবরণ
            </label>
            <input
              type="text"
              value={cms.heroSubheadline || ''}
              onChange={(e) => setCms({ ...cms, heroSubheadline: e.target.value })}
              className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-xs"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">অফিস ঠিকানা</label>
            <input
              type="text"
              value={cms.officeAddress || ''}
              onChange={(e) => setCms({ ...cms, officeAddress: e.target.value })}
              className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-xs"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">হটলাইন নাম্বার</label>
            <input
              type="text"
              value={cms.primaryPhone || ''}
              onChange={(e) => setCms({ ...cms, primaryPhone: e.target.value })}
              className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-xs font-mono"
            />
          </div>
        </div>
      </form>

      {/* 2. Traveler Reviews Moderation (Active / Inactive + Edit Comment) */}
      <div className="rounded-3xl bg-white border border-slate-200 p-6 shadow-sm space-y-4">
        <div>
          <h3 className="text-lg font-black text-slate-900">
            ২. ভ্রমণকারীদের ফিডব্যাক ও রিভিউ কন্ট্রোল (Active / Inactive)
          </h3>
          <p className="text-xs text-slate-500">
            ট্যুর শেষে কাস্টমাররা ফিডব্যাক লিংকে যা লিখেছেন তা এখানে জমা হয়। কোনটা ওয়েবসাইটে দেখাবেন আর কোনটা হাইড রাখবেন তা নিয়ন্ত্রণ করুন
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {reviews.map((rev) => {
            const visible = rev.isVisibleOnWebsite !== false;
            return (
              <div
                key={rev.id}
                className={`rounded-2xl border p-4 space-y-2.5 ${
                  visible
                    ? 'border-emerald-200 bg-emerald-50/30'
                    : 'border-slate-200 bg-slate-50 opacity-75'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-extrabold text-sm text-slate-900">
                      {rev.customerName}
                    </div>
                    <div className="text-[11px] text-emerald-700 font-bold">
                      {rev.tourTitle}
                    </div>
                  </div>
                  <button
                    onClick={() => handleToggleReview(rev)}
                    className={`inline-flex items-center gap-1 rounded-xl px-3 py-1.5 text-xs font-bold transition ${
                      visible
                        ? 'bg-emerald-800 text-white'
                        : 'bg-slate-200 text-slate-700 hover:bg-slate-300'
                    }`}
                  >
                    {visible ? (
                      <>
                        <Eye className="h-3.5 w-3.5" /> ওয়েবসাইটে এক্টিভ
                      </>
                    ) : (
                      <>
                        <EyeOff className="h-3.5 w-3.5" /> হাইড করা
                      </>
                    )}
                  </button>
                </div>

                <div className="flex flex-wrap gap-1">
                  {(rev.likedTags || rev.quickTags || []).map((t, i) => (
                    <span
                      key={i}
                      className="rounded-full bg-white border border-slate-200 px-2 py-0.5 text-[10px] font-bold text-slate-700"
                    >
                      ✓ {t}
                    </span>
                  ))}
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-500 mb-1">
                    রিভিউ কমেন্ট (প্রয়োজনে এডিট করে বাইরে গেলে সেভ হবে):
                  </label>
                  <textarea
                    rows={2}
                    defaultValue={rev.comment}
                    onBlur={(e) => {
                      if (e.target.value !== rev.comment) {
                        handleEditReviewComment(rev, e.target.value);
                      }
                    }}
                    className="w-full rounded-xl border border-slate-200 bg-white p-2.5 text-xs text-slate-700"
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 3. Photo & Video Gallery Manager */}
      <div className="rounded-3xl bg-white border border-slate-200 p-6 shadow-sm space-y-4">
        <h3 className="text-lg font-black text-slate-900">
          ৩. ফটো ও ভিডিও গ্যালারি (ট্যুর গাইডের তোলা মুহূর্ত)
        </h3>

        <form onSubmit={handleAddGallery} className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          <input
            type="text"
            required
            value={newGallery.title}
            onChange={(e) => setNewGallery({ ...newGallery, title: e.target.value })}
            placeholder="ছবির ক্যাপশন লিখুন..."
            className="rounded-xl border border-slate-300 px-3 py-2 text-xs"
          />
          <input
            type="text"
            value={newGallery.location}
            onChange={(e) => setNewGallery({ ...newGallery, location: e.target.value })}
            placeholder="লোকেশন (সাজেক / সিলেট)"
            className="rounded-xl border border-slate-300 px-3 py-2 text-xs"
          />
          <select
            value={newGallery.image}
            onChange={(e) => setNewGallery({ ...newGallery, image: e.target.value })}
            className="rounded-xl border border-slate-300 px-3 py-2 text-xs font-bold"
          >
            {mediaLibrary.map((m) => (
              <option key={m.id} value={m.url}>
                {m.title}
              </option>
            ))}
          </select>
          <button
            type="submit"
            className="rounded-xl bg-emerald-800 hover:bg-emerald-900 px-4 py-2 text-xs font-bold text-white"
          >
            + গ্যালারিতে যোগ করুন
          </button>
        </form>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {gallery.map((g) => (
            <div
              key={g.id}
              className="group relative rounded-2xl overflow-hidden border border-slate-200 aspect-4/3"
            >
              <img
                src={g.url || g.image}
                alt={g.title}
                className="h-full w-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-slate-950/85 via-transparent to-transparent p-3 flex flex-col justify-end">
                <div className="text-[11px] font-bold text-white line-clamp-1">{g.title}</div>
                <div className="text-[10px] text-amber-300">{g.destination || g.location}</div>
              </div>
              <button
                onClick={() => handleDeleteGallery(g.id)}
                className="absolute top-2 right-2 rounded-full bg-rose-600 text-white p-1.5 opacity-85 hover:opacity-100"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function TeamGuidesView({ showToast }) {
  const [users, setUsers] = useState([]);
  const [form, setForm] = useState({
    name: '',
    role: 'guide',
    phone: '',
    specialty: '',
  });

  const loadUsers = () => {
    apiFetch('/api/staff')
      .then((res) => setUsers(res.staff || []))
      .catch(() => {});
  };

  useEffect(() => {
    loadUsers();
  }, []);

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!form.name || !form.phone) return;
    try {
      await apiFetch('/api/staff', {
        method: 'POST',
        body: JSON.stringify(form),
      });
      loadUsers();
      setForm({ name: '', role: 'guide', phone: '', specialty: '' });
      showToast('নতুন টিম মেম্বার / ট্যুর গাইড যুক্ত হয়েছে!');
    } catch (err) {
      alert(err.message);
    }
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-8 grid grid-cols-1 sm:grid-cols-2 gap-4">
          {users.map((u) => (
            <div
              key={u.id}
              className="rounded-3xl bg-white border border-slate-200 p-5 shadow-sm flex flex-col justify-between gap-3"
            >
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="rounded-full bg-emerald-100 text-emerald-900 px-3 py-0.5 text-xs font-extrabold">
                    {u.roleLabelBn}
                  </span>
                  {u.role === 'guide' && (
                    <span className="inline-flex items-center gap-1 text-xs font-black text-amber-600">
                      <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                      {u.rating || 4.9} ({u.completedToursCount || 0}টি ট্যুর)
                    </span>
                  )}
                </div>
                <h4 className="font-extrabold text-base text-slate-900">{u.name}</h4>
                <p className="text-xs font-mono text-slate-600 mt-0.5">📞 {u.phone}</p>
                {u.specialty && (
                  <p className="text-xs text-slate-500 mt-1.5">বিশেষত্ব: {u.specialty}</p>
                )}
              </div>

              {u.assignedTours && u.assignedTours.length > 0 && (
                <div className="pt-2.5 border-t border-slate-100 space-y-1">
                  <div className="text-[11px] font-bold text-slate-500">সাম্প্রতিক গাইড হিস্ট্রি:</div>
                  {u.assignedTours.slice(0, 3).map((h, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between text-[11px] bg-slate-50 rounded-lg px-2.5 py-1"
                    >
                      <span className="font-semibold text-slate-800 line-clamp-1">
                        {h.title}
                      </span>
                      <span className="text-emerald-700 font-bold shrink-0 ml-2">
                        {h.bookedSeats || 0} জন
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>

        <form
          onSubmit={handleAdd}
          className="lg:col-span-4 rounded-3xl bg-white border border-slate-200 p-5 shadow-sm h-fit space-y-3.5"
        >
          <h4 className="font-extrabold text-base text-slate-900">
            + নতুন স্টাফ / ট্যুর গাইড যুক্ত করুন
          </h4>
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">নাম *</label>
            <input
              type="text"
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="যেমন: সাব্বির আহমেদ"
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">পদবি / রোল</label>
            <select
              value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value })}
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs font-bold"
            >
              <option value="guide">ট্যুর গাইড (Tour Guide)</option>
              <option value="accountant">একাউন্ট্যান্ট (Accountant)</option>
              <option value="owner">মালিক / এডমিন (Owner)</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">মোবাইল নাম্বার *</label>
            <input
              type="text"
              required
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              placeholder="017..."
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs font-mono"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              বিশেষ অভিজ্ঞতা (গন্তব্য)
            </label>
            <input
              type="text"
              value={form.specialty}
              onChange={(e) => setForm({ ...form, specialty: e.target.value })}
              placeholder="সাজেক ও বান্দরবান এক্সপার্ট"
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs"
            />
          </div>
          <button
            type="submit"
            className="w-full rounded-xl bg-emerald-800 hover:bg-emerald-900 py-2.5 text-xs font-bold text-white"
          >
            টিমে যুক্ত করুন
          </button>
        </form>
      </div>
    </div>
  );
}
