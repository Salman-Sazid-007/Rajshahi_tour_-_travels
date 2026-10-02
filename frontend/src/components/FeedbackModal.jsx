import React, { useEffect, useState } from 'react';
import {
  CheckCircle2,
  Heart,
  MessageSquareHeart,
  Send,
  Sparkles,
  Star,
  X,
} from 'lucide-react';
import { apiFetch } from '../lib/api';

const VERDICT_OPTIONS = [
  { rating: 5, label: 'অসাধারণ, আবারও যাব!', emoji: '🤩' },
  { rating: 4, label: 'খুব ভালো লেগেছে', emoji: '😊' },
  { rating: 3, label: 'মোটামুটি ভালো', emoji: '🙂' },
  { rating: 2, label: 'আরও উন্নতি প্রয়োজন', emoji: '🛠️' },
];

const LIKED_TAG_OPTIONS = [
  'খাবার ভালো ছিল',
  'গাইড ভালো ছিল',
  'বাস ভালো ছিল',
  'রিসোর্ট/হোটেল ভালো ছিল',
  'সময়ানুবর্তিতা',
  'নিরাপত্তা ও ব্যবস্থাপনা',
];

export default function FeedbackModal({ bookingId, onClose, onSubmitted }) {
  const [loading, setLoading] = useState(true);
  const [booking, setBooking] = useState(null);
  const [tour, setTour] = useState(null);
  const [customerName, setCustomerName] = useState('ইসরাত জাহান');
  const [rating, setRating] = useState(5);
  const [verdictLabel, setVerdictLabel] = useState('অসাধারণ, আবারও যাব!');
  const [likedTags, setLikedTags] = useState(['খাবার ভালো ছিল', 'গাইড ভালো ছিল', 'বাস ভালো ছিল']);
  const [comment, setComment] = useState(
    'ভাই আপনাদের খাবার ও গাইড সার্ভিস অনেক ভালো ছিল, তবে হোটেলটা আরেকটু ভালো করতে পারতেন।'
  );
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    apiFetch(`/api/public/feedback/${bookingId || 'bk-run-1'}`)
      .then((res) => {
        if (!active) return;
        setBooking(res.booking);
        setTour(res.tour);
        if (res.booking?.customerName) {
          setCustomerName(res.booking.customerName);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [bookingId]);

  const toggleTag = (tag) => {
    setLikedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await apiFetch(`/api/public/feedback/${booking?.id || bookingId || 'bk-run-1'}`, {
        method: 'POST',
        body: JSON.stringify({
          customerName,
          tourTitle: tour?.title || 'সাজেক ভ্যালি ও খাগড়াছড়ি মেঘের রাজ্য ট্যুর',
          rating,
          verdictLabel,
          likedTags,
          comment,
        }),
      });
      setDone(true);
      if (onSubmitted) onSubmitted();
    } catch (err) {
      alert(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 p-4 backdrop-blur-sm overflow-y-auto">
      <div className="relative w-full max-w-xl rounded-3xl bg-white shadow-2xl border border-emerald-100 overflow-hidden my-8">
        {/* Header */}
        <div className="bg-gradient-to-r from-emerald-900 via-emerald-800 to-teal-900 px-6 py-6 text-white relative">
          <button
            onClick={onClose}
            className="absolute right-4 top-4 rounded-full bg-white/15 p-2 text-white hover:bg-white/25 transition"
          >
            <X className="h-5 w-5" />
          </button>
          <div className="inline-flex items-center gap-2 rounded-full bg-amber-400/20 border border-amber-300/40 px-3 py-1 text-xs font-semibold text-amber-300 mb-2">
            <MessageSquareHeart className="h-3.5 w-3.5" />
            ট্যুর পরবর্তী ট্রাভেলার ফিডব্যাক লিংক
          </div>
          <h3 className="text-xl sm:text-2xl font-bold leading-snug">
            প্রিয় {customerName}, আমরা এই ট্যুরটাতে গেছিলাম!
          </h3>
          <p className="mt-1 text-sm text-emerald-100">
            ট্যুর: <span className="font-semibold text-amber-300">{tour?.title || 'সাজেক ভ্যালি ও খাগড়াছড়ি মেঘের রাজ্য গ্রুপ ট্যুর'}</span> — এই ট্যুরটা আপনার কাছে কেমন লাগছে?
          </p>
        </div>

        {loading ? (
          <div className="p-8 text-center text-slate-500">লোড হচ্ছে...</div>
        ) : done ? (
          <div className="p-8 text-center space-y-4">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
              <CheckCircle2 className="h-9 w-9" />
            </div>
            <h4 className="text-2xl font-bold text-slate-900">
              আপনার মূল্যবান মতামতের জন্য ধন্যবাদ!
            </h4>
            <p className="text-slate-600 text-sm max-w-md mx-auto">
              আপনার ফিডব্যাকটি আমাদের রাজশাহী ট্যুরস এন্ড ট্রাভেলস প্যানেলে যুক্ত হয়েছে। মালিক ও টিম এটি দেখে পরবর্তী ট্যুরগুলো আরও উন্নত করবেন।
            </p>
            <button
              onClick={onClose}
              className="mt-2 inline-flex items-center justify-center rounded-xl bg-emerald-700 px-6 py-3 text-sm font-bold text-white hover:bg-emerald-800 transition"
            >
              বন্ধ করুন
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-6 space-y-5">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
                ১. সামগ্রিক রেটিং ও অভিজ্ঞতা কেমন ছিল?
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {VERDICT_OPTIONS.map((opt) => {
                  const active = verdictLabel === opt.label;
                  return (
                    <button
                      type="button"
                      key={opt.label}
                      onClick={() => {
                        setRating(opt.rating);
                        setVerdictLabel(opt.label);
                      }}
                      className={`flex items-center gap-3 rounded-2xl border p-3.5 text-left transition ${
                        active
                          ? 'border-emerald-600 bg-emerald-50/90 ring-2 ring-emerald-500/25'
                          : 'border-slate-200 hover:border-emerald-300 bg-white'
                      }`}
                    >
                      <span className="text-2xl">{opt.emoji}</span>
                      <div>
                        <div className="font-bold text-slate-900 text-sm">{opt.label}</div>
                        <div className="flex items-center gap-0.5 text-amber-500 mt-0.5">
                          {Array.from({ length: opt.rating }).map((_, i) => (
                            <Star key={i} className="h-3.5 w-3.5 fill-amber-400" />
                          ))}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
                ২. ট্যুরের কোন কোন বিষয়গুলো আপনার ভালো লেগেছে? (একাধিক সিলেক্ট করুন)
              </label>
              <div className="flex flex-wrap gap-2">
                {LIKED_TAG_OPTIONS.map((tag) => {
                  const selected = likedTags.includes(tag);
                  return (
                    <button
                      type="button"
                      key={tag}
                      onClick={() => toggleTag(tag)}
                      className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-bold transition ${
                        selected
                          ? 'bg-emerald-700 text-white shadow-sm'
                          : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                      }`}
                    >
                      <Heart className={`h-3.5 w-3.5 ${selected ? 'fill-amber-300 text-amber-300' : ''}`} />
                      {tag}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">
                ৩. আমাদের সম্পর্কে আর কিছু বলতে চান? (পরামর্শ বা মতামত)
              </label>
              <textarea
                rows={3}
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="যেমন: ভাই আপনাদের হোটেলটা আরেকটু ভালো করতে পারতেন..."
                className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm focus:border-emerald-600 focus:outline-none"
              />
            </div>

            <div className="flex items-center justify-between gap-3 pt-2 border-t border-slate-100">
              <div className="text-xs text-slate-500 flex items-center gap-1.5">
                <Sparkles className="h-4 w-4 text-amber-500" />
                মতামতটি সরাসরি মালিকের ড্যাশবোর্ডে জমা হবে
              </div>
              <button
                type="submit"
                disabled={submitting}
                className="inline-flex items-center gap-2 rounded-xl bg-amber-500 px-6 py-3 text-sm font-bold text-slate-950 shadow-md hover:bg-amber-400 transition disabled:opacity-50"
              >
                <Send className="h-4 w-4" />
                {submitting ? 'পাঠানো হচ্ছে...' : 'মতামত পাঠান'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
