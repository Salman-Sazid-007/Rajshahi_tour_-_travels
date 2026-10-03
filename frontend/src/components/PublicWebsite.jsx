import React, { useEffect, useRef, useState } from 'react';
import { ArrowRight, Bus, Calendar, Camera, CheckCircle2, Clock, Compass, Image as ImageIcon, LayoutDashboard, LogIn, MapPin, Menu, MessageCircle, MessageSquareHeart, Phone, ShieldCheck, Sparkles, Star, Ticket, Users, Utensils, X } from 'lucide-react';
import { apiFetch, formatBnDate, formatTaka } from '../lib/api';
import { useI18n, LanguageSwitcher } from '../lib/i18n';
import AgencyLogo from './AgencyLogo';
import BusTicketSection from './BusTicketSection';
import TourSeatPicker from './TourSeatPicker';
import PageLoader from './PageLoader';
export default function PublicWebsite({
  data,
  currentUser,
  onOpenLogin,
  onOpenDashboard,
  onOpenFeedback,
  onRefresh,
  loadError = false,
  onRetryLoad
}) {
  const {
    t,
    tr,
    language
  } = useI18n();
  const [selectedSeats, setSelectedSeats] = useState([]);
  const [inquiryError, setInquiryError] = useState('');
  const [selectedTour, setSelectedTour] = useState(null);
  const [activeModalTab, setActiveModalTab] = useState('details'); // 'details' | 'poster' | 'book'
  const [galleryFilter, setGalleryFilter] = useState('সব');
  const [inquiryForm, setInquiryForm] = useState({
    name: '',
    phone: '',
    pax: 2,
    preferredPackage: '',
    message: ''
  });
  const [submittingInquiry, setSubmittingInquiry] = useState(false);
  const [inquirySuccess, setInquirySuccess] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const menuButtonRef = useRef(null);

  useEffect(() => {
    if (!menuOpen) return undefined;
    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') {
        setMenuOpen(false);
        menuButtonRef.current?.focus();
      }
    };
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [menuOpen]);

  useEffect(() => {
    if (!selectedTour) return undefined;
    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') setSelectedTour(null);
    };
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [selectedTour]);

  const homeBase = (() => {
    const path = window.location.pathname;
    const feedbackIndex = path.indexOf('/feedback/');
    if (feedbackIndex >= 0) return `${path.slice(0, feedbackIndex)}/`;
    const withoutIndex = path.replace(/index\.html?$/, '');
    if (withoutIndex.endsWith('/')) return withoutIndex;
    return withoutIndex.slice(0, withoutIndex.lastIndexOf('/') + 1) || '/';
  })();
  const homeHref = `${homeBase}#top`;
  const closeMenu = () => setMenuOpen(false);

  if (!data) {
    return <PageLoader
      fullScreen
      message={loadError ? t('We are having trouble loading the site.', 'ওয়েবসাইট লোড করতে সমস্যা হচ্ছে।') : tr("রাজশাহী ট্যুরস এন্ড ট্রাভেলস লোড হচ্ছে...")}
      errorMessage={loadError ? t('Please try again or contact the team on WhatsApp.', 'আবার চেষ্টা করুন অথবা হোয়াটসঅ্যাপে যোগাযোগ করুন।') : ''}
      onRetry={loadError ? onRetryLoad : undefined}
      retryLabel={t('Try again', 'আবার চেষ্টা করুন')}
    />;
  }
  const {
    siteSettings = {},
    highlightedTour,
    runningTours = [],
    upcomingTours = [],
    completedTours = [],
    reviews = [],
    gallery = []
  } = data;
  const openTourModal = (tour, tab = 'details') => {
    setMenuOpen(false);
    setSelectedTour(tour);
    setSelectedSeats([]);
    setInquiryError('');
    setActiveModalTab(tab);
    setInquirySuccess(tr(''));
    setInquiryForm({
      name: '',
      phone: '',
      pax: 2,
      preferredPackage: tour?.packages?.[0]?.id || '',
      message: `আমি "${tour?.title}" ট্যুরে যেতে আগ্রহী।`
    });
  };
  const handleInquirySubmit = async e => {
    e.preventDefault();
    setInquiryError('');
    if (selectedTour?.busId && (selectedSeats.length !== Number(inquiryForm.pax) || selectedSeats.some(seat => !seat.gender))) {
      setInquiryError(t('Choose one seat and passenger gender per traveler.', 'প্রত্যেক যাত্রীর জন্য সিট ও নারী / পুরুষ বেছে নিন।'));
      return;
    }
    setSubmittingInquiry(true);
    try {
      const res = await apiFetch(selectedTour?.busId ? '/api/public/tour-seat-requests' : '/api/public/inquiries', {
        method: 'POST',
        body: JSON.stringify({
          tourId: selectedTour?.id || highlightedTour?.id || '',
          tourTitle: selectedTour?.title || highlightedTour?.title || '',
          ...inquiryForm,
          packageId: inquiryForm.preferredPackage,
          preferredPackage: selectedTour?.packages?.find(p => p.id === inquiryForm.preferredPackage)?.name || inquiryForm.preferredPackage,
          seats: selectedSeats
        })
      });
      setInquirySuccess(res.persisted === false ? t('Demo request could not be saved. Contact us on WhatsApp.', 'ডেমো সেভ হয়নি। হোয়াটসঅ্যাপে যোগাযোগ করুন।') : res.mode === 'browser-demo' ? t('Demo request saved only in this browser — not a real booking.', 'ডেমো অনুরোধ শুধু এই ব্রাউজারে সেভ হয়েছে — আসল বুকিং নয়।') : t('Seat request received. Awaiting operator confirmation within 30 minutes.', 'সিটের অনুরোধ এসেছে। ৩০ মিনিটের মধ্যে অপারেটরের অনুমোদন প্রয়োজন।'));
      if (onRefresh) onRefresh();
    } catch (err) {
      setInquiryError(err.message);
    } finally {
      setSubmittingInquiry(false);
    }
  };
  const galleryDestinations = ['সব', ...new Set(gallery.map(g => g.destination))];
  const filteredGallery = galleryFilter === 'সব' ? gallery : gallery.filter(g => g.destination === galleryFilter);
  const selectedDescription = selectedTour
    ? language === 'en'
      ? selectedTour.descriptionEn || selectedTour.description || ''
      : selectedTour.description || selectedTour.descriptionEn || ''
    : '';
  return <div className="min-h-screen bg-slate-50 text-slate-900">
      {/* Running Tour Live Ticker Banner */}
      {runningTours.length > 0 && <div className="bg-gradient-to-r from-amber-500 via-amber-400 to-amber-500 text-slate-950 px-4 py-2 text-xs sm:text-sm font-bold">
          <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="inline-flex h-2.5 w-2.5 rounded-full bg-emerald-900 animate-ping" />
              <span>{tr("চলমান ট্যুর (Live):")}<strong>{tr(runningTours[0].title)}</strong>{tr(" — গাইড:")}{' '}
                {tr(runningTours[0].guides?.[0]?.name || 'মনিরুল ভাই')}
              </span>
            </div>
            <button onClick={() => openTourModal(runningTours[0], 'details')} className="underline font-extrabold hover:text-emerald-950">{tr("চলমান ট্যুরের বিস্তারিত দেখুন →")}</button>
          </div>
        </div>}

      {/* Top Sticky Navbar */}
      <header className="rtt-public-header sticky top-0 z-40 bg-emerald-950/95 backdrop-blur-md border-b border-emerald-800/60 text-white">
        <div className="rtt-public-header-inner max-w-7xl mx-auto px-4 sm:px-6 h-18 flex items-center justify-between gap-4 py-3">
          <a href={homeHref} aria-label={t('Go to the home page', 'হোম পেজে যান')} className="rtt-public-brand flex items-center gap-3" onClick={closeMenu}><AgencyLogo compact /></a>

          <nav className="rtt-desktop-navigation hidden xl:flex items-center gap-5 text-sm font-semibold text-emerald-100" aria-label={t('Main navigation', 'প্রধান নেভিগেশন')}>
            <a href={`${homeBase}#bus-tickets`} className="hover:text-amber-400 transition">{t("Bus tickets", "বাসের টিকিট")}</a>
            <a href={`${homeBase}pro/`} className="hover:text-amber-400 transition">{tr("Pro Edition ↗")}</a>
            <a href={`${homeBase}#upcoming`} className="hover:text-amber-400 transition">{tr("আপকামিং ট্যুর")}</a>
            <a href={`${homeBase}#past-tours`} className="hover:text-amber-400 transition">{tr("আগের ট্যুরসমূহ")}</a>
            <a href={`${homeBase}#reviews`} className="hover:text-amber-400 transition">{tr("ট্রাভেলার রিভিউ")}</a>
            <a href={`${homeBase}#gallery`} className="hover:text-amber-400 transition">{tr("গ্যালারি")}</a>
            <a href={`${homeBase}#office`} className="hover:text-amber-400 transition">{tr("অফিস লোকেশন")}</a>
          </nav>

          <div className="rtt-header-actions flex items-center gap-2 sm:gap-2.5"><LanguageSwitcher />
            <a href={`https://wa.me/${siteSettings.whatsapp || '8801782250709'}`} target="_blank" rel="noreferrer" className="hidden sm:inline-flex items-center gap-1.5 rounded-xl bg-emerald-700/80 hover:bg-emerald-600 border border-emerald-500/40 px-3 py-2 text-xs font-bold text-white transition">
              <MessageCircle className="h-4 w-4 text-emerald-300" />{tr("WhatsApp")}</a>
            <a href={`tel:${siteSettings.phone || '01782250709'}`} className="hidden md:inline-flex items-center gap-1.5 rounded-xl bg-white/10 hover:bg-white/20 px-3 py-2 text-xs font-bold text-amber-300 transition">
              <Phone className="h-3.5 w-3.5" />{siteSettings.phone || '01782250709'}
            </a>

            {currentUser ? <button onClick={onOpenDashboard} aria-label={t("Staff dashboard", "স্টাফ ড্যাশবোর্ড")} className="inline-flex items-center gap-2 rounded-xl bg-amber-400 hover:bg-amber-300 px-4 py-2.5 text-xs sm:text-sm font-extrabold text-slate-950 shadow-md transition">
                <LayoutDashboard className="h-4 w-4" />
                <span className="hidden sm:inline">{tr("ড্যাশবোর্ড (")}{currentUser.role === 'owner' ? 'মালিক' : currentUser.role === 'accountant' ? 'একাউন্ট্যান্ট' : 'গাইড'})</span>
              </button> : <button onClick={onOpenLogin} aria-label={t("Staff login", "স্টাফ লগইন")} className="inline-flex items-center gap-1.5 rounded-xl bg-amber-400 hover:bg-amber-300 px-3.5 sm:px-4 py-2.5 text-xs sm:text-sm font-extrabold text-slate-950 shadow-md transition">
                <LogIn className="h-4 w-4" /><span className="hidden sm:inline">{tr("স্টাফ লগইন")}</span>
              </button>}
            <button
              ref={menuButtonRef}
              type="button"
              className="rtt-mobile-menu-trigger"
              aria-label={menuOpen ? t('Close navigation menu', 'নেভিগেশন মেনু বন্ধ করুন') : t('Open navigation menu', 'নেভিগেশন মেনু খুলুন')}
              aria-expanded={menuOpen}
              aria-controls="rtt-mobile-navigation"
              onClick={() => setMenuOpen((open) => !open)}
            >{menuOpen ? <X size={21} /> : <Menu size={21} />}</button>
          </div>
        </div>
      </header>
      {menuOpen && <button className="rtt-mobile-menu-backdrop" aria-label={t('Close navigation menu', 'নেভিগেশন মেনু বন্ধ করুন')} onClick={closeMenu} />}
      <aside id="rtt-mobile-navigation" className={`rtt-mobile-menu ${menuOpen ? 'is-open' : ''}`} aria-label={t('Mobile navigation', 'মোবাইল নেভিগেশন')} aria-hidden={!menuOpen}>
        <div className="rtt-mobile-menu-header">
          <a href={homeHref} onClick={closeMenu}><AgencyLogo compact /></a>
          <button type="button" className="rtt-mobile-menu-close" aria-label={t('Close navigation menu', 'নেভিগেশন মেনু বন্ধ করুন')} onClick={closeMenu}><X size={21} /></button>
        </div>
        <nav className="rtt-mobile-menu-links" aria-label={t('Main navigation', 'প্রধান নেভিগেশন')}>
          <a href={`${homeBase}#top`} onClick={closeMenu}>{t('Home', 'হোম')}</a>
          <a href={`${homeBase}#upcoming`} onClick={closeMenu}>{tr('আপকামিং ট্যুর')}</a>
          <a href={`${homeBase}#bus-tickets`} onClick={closeMenu}>{t('Bus tickets', 'বাসের টিকিট')}</a>
          <a href={`${homeBase}#past-tours`} onClick={closeMenu}>{tr('আগের ট্যুরসমূহ')}</a>
          <a href={`${homeBase}#reviews`} onClick={closeMenu}>{tr('ট্রাভেলার রিভিউ')}</a>
          <a href={`${homeBase}#gallery`} onClick={closeMenu}>{tr('গ্যালারি')}</a>
          <a href={`${homeBase}#office`} onClick={closeMenu}>{tr('অফিস লোকেশন')}</a>
          <a className="rtt-mobile-pro-link" href={`${homeBase}pro/`} onClick={closeMenu}>{tr('International Pro Edition ↗')}</a>
        </nav>
        <div className="rtt-mobile-menu-contact">
          <a href={`tel:${siteSettings.phone || '01782250709'}`}><Phone size={16} />{t('Call the team', 'টিমকে কল করুন')}</a>
          <a href={`https://wa.me/${siteSettings.whatsapp || '8801782250709'}`} target="_blank" rel="noreferrer"><MessageCircle size={16} />{t('Chat on WhatsApp', 'হোয়াটসঅ্যাপে কথা বলুন')}</a>
        </div>
      </aside>

      {/* Hero Section + Next Tour Highlight */}
      <section id="top" data-reveal className="relative overflow-hidden bg-emerald-950 text-white py-12 sm:py-18 lg:py-22">
        {/* Background Cover Image with Dark Emerald Overlay */}
        <div className="absolute inset-0 bg-cover bg-center opacity-35 transition-all duration-700" style={{
        backgroundImage: `url(${siteSettings.heroBackgroundImage || '/media/sajek-2.jpg'})`
      }} />
        <div className="absolute inset-0 bg-gradient-to-r from-emerald-950 via-emerald-950/90 to-emerald-950/75" />

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-10 items-center">
          {/* Left Hero Pitch */}
          <div className="lg:col-span-7 space-y-6">
            <div className="inline-flex items-center gap-2 rounded-full bg-amber-400/15 border border-amber-400/40 px-4 py-1.5 text-xs sm:text-sm font-bold text-amber-300">
              <Sparkles className="h-4 w-4" />
              {tr(siteSettings.tagline || 'রাজশাহী থেকে সারা বাংলাদেশ')}{tr("• অফিশিয়াল অনলাইন অফিস")}</div>

            <h1 className="text-3xl sm:text-5xl lg:text-6xl font-black leading-[1.15] tracking-tight">
              {tr(siteSettings.heroTitle || 'রাজশাহী থেকে সারা বাংলাদেশ — নিরাপদ ও আনন্দময় গ্রুপ ট্যুর')}
            </h1>

            <p className="text-base sm:text-lg text-emerald-100/90 max-w-2xl leading-relaxed">
              {tr(siteSettings.heroSubtitle)}
            </p>

            <div className="flex flex-wrap items-center gap-3 pt-1">
              <a href="#upcoming" className="inline-flex items-center gap-2 rounded-2xl bg-amber-400 hover:bg-amber-300 px-6 py-3.5 text-sm sm:text-base font-extrabold text-slate-950 shadow-lg transition">{tr("আপকামিং ট্যুর ও বুকিং")}<ArrowRight className="h-4 w-4" />
              </a>
              <a href={`https://wa.me/${siteSettings.whatsapp || '8801782250709'}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-2xl bg-emerald-700/90 hover:bg-emerald-600 border border-emerald-400/30 px-5 py-3.5 text-sm font-bold text-white transition">
                <MessageCircle className="h-4 w-4 text-amber-300" />{tr("হোয়াটসঅ্যাপে কথা বলুন")}</a>
              <a href={`tel:${siteSettings.phone || '01782250709'}`} className="inline-flex items-center gap-2 rounded-2xl bg-white/10 hover:bg-white/20 border border-white/15 px-5 py-3.5 text-sm font-bold text-white transition">
                <Phone className="h-4 w-4 text-amber-300" />{tr("সরাসরি কল করুন")}</a>
            </div>

            {/* Agency Trust Stats */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-4">
              <div className="rounded-2xl bg-white/10 backdrop-blur-sm border border-white/10 p-3.5">
                <div className="text-2xl font-black text-amber-400">
                  {siteSettings.stats?.completedTours || '১২০+'}
                </div>
                <div className="text-xs text-emerald-100 mt-0.5">{tr("সফল গ্রুপ ট্যুর")}</div>
              </div>
              <div className="rounded-2xl bg-white/10 backdrop-blur-sm border border-white/10 p-3.5">
                <div className="text-2xl font-black text-amber-400">
                  {siteSettings.stats?.happyTravelers || '৪,৫০০+'}
                </div>
                <div className="text-xs text-emerald-100 mt-0.5">{tr("হ্যাপি ট্রাভেলার")}</div>
              </div>
              <div className="rounded-2xl bg-white/10 backdrop-blur-sm border border-white/10 p-3.5">
                <div className="text-2xl font-black text-amber-400">
                  {siteSettings.stats?.destinations || '২৫+'}
                </div>
                <div className="text-xs text-emerald-100 mt-0.5">{tr("ট্যুরিস্ট গন্তব্য")}</div>
              </div>
              <div className="rounded-2xl bg-white/10 backdrop-blur-sm border border-white/10 p-3.5">
                <div className="text-2xl font-black text-amber-400">
                  {siteSettings.stats?.averageRating || '৪.৯★'}
                </div>
                <div className="text-xs text-emerald-100 mt-0.5">{tr("ট্রাভেলার রেটিং")}</div>
              </div>
            </div>
          </div>

          {/* Right Highlighted Next Tour Card (exact video feature!) */}
          {highlightedTour && <div className="lg:col-span-5">
              <div className="rounded-3xl bg-white text-slate-900 shadow-2xl border-2 border-amber-400 overflow-hidden">
                <div className="bg-amber-400 px-5 py-2.5 flex items-center justify-between text-slate-950">
                  <span className="text-xs font-black uppercase tracking-wider flex items-center gap-1.5">
                    <Sparkles className="h-4 w-4" />{tr("নেক্সট হাইলাইটেড ট্যুর — বুকিং চলছে!")}</span>
                  <span className="rounded-full bg-slate-950 text-amber-300 px-2.5 py-0.5 text-[11px] font-bold">
                    {highlightedTour.seatsRemaining > 0 && highlightedTour.seatsRemaining <= 10 ? <span className="rtt-low-seats">{t(`Only ${highlightedTour.seatsRemaining} seats left!`, `আর মাত্র ${highlightedTour.seatsRemaining}টি সিট!`)}</span> : <>{highlightedTour.seatsRemaining} {t("seats available", "টি সিট খালি")}</>}
                  </span>
                </div>

                <div className="relative h-52 overflow-hidden">
                  <img src={highlightedTour.coverImage || '/media/sylhet-1.jpg'} alt={highlightedTour.title} className="w-full h-full object-cover" />
                  <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-transparent to-transparent" />
                  <div className="absolute bottom-3 left-4 right-4 text-white flex items-end justify-between">
                    <div>
                      <span className="inline-block rounded-lg bg-emerald-600 px-2.5 py-0.5 text-xs font-bold mb-1">
                        {tr(highlightedTour.destination)}
                      </span>
                      <h2 className="text-lg font-extrabold leading-snug">
                        {tr(highlightedTour.title)}
                      </h2>
                    </div>
                  </div>
                </div>

                <div className="p-5 space-y-4">
                  <div className="grid grid-cols-2 gap-2.5 text-xs">
                    <div className="rounded-xl bg-slate-100 p-2.5 flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-emerald-700 shrink-0" />
                      <div>
                        <div className="text-slate-500">{tr("যাত্রার তারিখ")}</div>
                        <div className="font-bold text-slate-900">
                          {formatBnDate(highlightedTour.startDate)}
                        </div>
                      </div>
                    </div>
                    <div className="rounded-xl bg-slate-100 p-2.5 flex items-center gap-2">
                      <Clock className="h-4 w-4 text-emerald-700 shrink-0" />
                      <div>
                        <div className="text-slate-500">{tr("সময়কাল")}</div>
                        <div className="font-bold text-slate-900">
                          {highlightedTour.days}{tr(" দিন ")}{highlightedTour.nights}{tr("রাত")}</div>
                      </div>
                    </div>
                    <div className="rounded-xl bg-slate-100 p-2.5 flex items-center gap-2">
                      <MapPin className="h-4 w-4 text-emerald-700 shrink-0" />
                      <div>
                        <div className="text-slate-500">{tr("যাত্রা শুরুর স্থান")}</div>
                        <div className="font-bold text-slate-900">
                          {tr(highlightedTour.departureLocation)}
                        </div>
                      </div>
                    </div>
                    <div className="rounded-xl bg-slate-100 p-2.5 flex items-center gap-2">
                      <Users className="h-4 w-4 text-emerald-700 shrink-0" />
                      <div>
                        <div className="text-slate-500">{tr("বুকিং স্ট্যাটাস")}</div>
                        <div className="font-bold text-emerald-700">
                          {highlightedTour.seatsBooked}/{highlightedTour.totalSeats}{tr("সিট বুকড")}</div>
                      </div>
                    </div>
                  </div>

                  {/* Packages Quick Row */}
                  <div className="flex items-center justify-between rounded-2xl bg-emerald-50 border border-emerald-200 px-4 py-3">
                    <div>
                      <div className="text-xs text-emerald-800 font-semibold">{tr("প্যাকেজ শুরু (জনপ্রতি)")}</div>
                      <div className="text-2xl font-black text-emerald-950">
                        {formatTaka(highlightedTour.startingPrice)}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => openTourModal(highlightedTour, 'details')} className="rounded-xl border border-emerald-700 px-3.5 py-2.5 text-xs font-bold text-emerald-900 hover:bg-emerald-100 transition">{tr("বিস্তারিত")}</button>
                      <button onClick={() => openTourModal(highlightedTour, 'book')} className="rounded-xl bg-emerald-800 hover:bg-emerald-900 px-4 py-2.5 text-xs font-bold text-white shadow-sm transition">{tr("বুকিং করুন")}</button>
                    </div>
                  </div>
                </div>
              </div>
            </div>}
        </div>
      </section>

      {/* Upcoming Monthly Schedule Section */}
      <section id="upcoming" data-reveal className="rtt-upcoming-section py-16 max-w-7xl mx-auto px-4 sm:px-6">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-10">
          <div>
            <div className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-3.5 py-1 text-xs font-bold text-emerald-800 mb-2">
              <Calendar className="h-3.5 w-3.5" />{tr("মাসিক আপকামিং শিডিউল (স্বয়ংক্রিয় আপডেট)")}</div>
            <h2 className="text-2xl sm:text-4xl font-black text-slate-900">{tr("আমাদের আপকামিং ট্যুরসমূহ")}</h2>
            <p className="text-sm sm:text-base text-slate-600 mt-1 max-w-2xl">{tr("ফেসবুকে পোস্ট হারিয়ে গেলেও ওয়েবসাইটে সবসময় আমাদের পরবর্তী ট্যুরের শিডিউল সাজানো থাকে। কোনো ট্যুরের তারিখ পার হয়ে গেলে তা স্বয়ংক্রিয়ভাবে এখান থেকে সরে যায়।")}</p>
          </div>
          <div className="flex items-center gap-2 text-xs font-bold text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-2.5">
            <ShieldCheck className="h-4 w-4 text-emerald-600" />{tr("পছন্দের ট্যুর সিলেক্ট করে বিস্তারিত প্ল্যান দেখুন ও বুকিং কুয়েরি পাঠান")}</div>
        </div>

        <div className="rtt-tour-grid grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {upcomingTours.map((tour, index) => <article key={tour.id} data-reveal style={{ '--reveal-delay': `${Math.min(index, 4) * 90}ms` }} className="rtt-public-tour-card group rounded-3xl bg-white border border-slate-200 shadow-sm overflow-hidden flex flex-col">
              <button type="button" className="rtt-tour-image-button relative h-52 overflow-hidden" onClick={() => openTourModal(tour, 'details')} aria-label={`${t('View details', 'বিস্তারিত দেখুন')}: ${tr(tour.title)}`}>
                <img src={tour.coverImage || '/media/sajek-1.webp'} alt={tour.title} className="w-full h-full object-cover group-hover:scale-105 transition duration-500" />
                <span className="rtt-tour-image-tags absolute top-3 left-3 flex items-center gap-2">
                  <span className="rounded-full bg-emerald-900/90 backdrop-blur-sm text-white px-3 py-1 text-xs font-bold">{tr(tour.destination)}</span>
                  {tour.isFeatured && <span className="rounded-full bg-amber-400 text-slate-950 px-3 py-1 text-xs font-black">{tr("হাইলাইটেড ট্যুর")}</span>}
                </span>
                <span className="absolute bottom-3 right-3 rounded-xl bg-slate-950/85 backdrop-blur-sm text-amber-300 px-3 py-1 text-xs font-bold">{tour.days}{tr(" দিন • ")}{tour.nights}{tr("রাত")}</span>
              </button>

              <div className="rtt-tour-card-content p-5 flex-1 flex flex-col justify-between gap-4">
                <div className="space-y-3">
                  <h3 className="text-lg font-extrabold text-slate-900 leading-snug">
                    <button type="button" className="rtt-tour-title-button" onClick={() => openTourModal(tour, 'details')}>{tr(tour.title)}</button>
                  </h3>
                  <div className="rtt-tour-facts space-y-2 text-xs text-slate-600">
                    <div className="flex items-center gap-2"><Calendar className="h-4 w-4 text-emerald-600 shrink-0" /><span>{tr("যাত্রা:")} <strong>{formatBnDate(tour.startDate)}</strong>{tr(" → ফেরা:")} <strong>{formatBnDate(tour.returnDate)}</strong></span></div>
                    <div className="flex items-center gap-2"><MapPin className="h-4 w-4 text-emerald-600 shrink-0" /><span>{tr("ছাড়ার স্থান: ")}{tr(tour.departureLocation)}</span></div>
                  </div>
                </div>

                <div className="rtt-tour-price-row">
                  <div><small>{t('Packages from', 'প্যাকেজ শুরু')}</small><strong>{formatTaka(tour.startingPrice)}</strong></div>
                  <span className={tour.seatsRemaining > 0 && tour.seatsRemaining <= 10 ? "rtt-low-seats" : "rtt-tour-seats-available"}>
                    {tour.seatsRemaining > 0 && tour.seatsRemaining <= 10 ? t(`Only ${tour.seatsRemaining} seats left!`, `আর মাত্র ${tour.seatsRemaining}টি সিট!`) : tour.seatsRemaining === 0 ? t('Fully booked', 'সব সিট বুকড') : `${tour.seatsRemaining} ${t("seats left", "টি সিট খালি")}`}
                  </span>
                </div>

                <div className="rtt-tour-card-actions">
                  <button type="button" className="rtt-tour-detail-btn" onClick={() => openTourModal(tour, 'details')}>{t('Full details', 'সব বিস্তারিত')}<ArrowRight size={15} /></button>
                  <button type="button" className="rtt-tour-book-btn" onClick={() => openTourModal(tour, 'book')}>{t('Ask to book', 'বুকিং জিজ্ঞাসা')}<ArrowRight size={15} /></button>
                </div>
              </div>
            </article>)}
        </div>
      </section>

      <BusTicketSection />

      {/* Previous Tours / Destinations Visited Section */}
      <section id="past-tours" data-reveal className="py-16 bg-emerald-950 text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-10">
            <div>
              <div className="inline-flex items-center gap-1.5 rounded-full bg-amber-400/20 px-3.5 py-1 text-xs font-bold text-amber-300 mb-2">
                <Compass className="h-3.5 w-3.5" />{tr("আমাদের পূর্ববর্তী ভ্রমণ অভিজ্ঞতা")}</div>
              <h2 className="text-2xl sm:text-4xl font-black">{tr("আমরা এর আগে যেখানে ভ্রমণ করেছি")}</h2>
              <p className="text-sm sm:text-base text-emerald-200 mt-1 max-w-2xl">{tr("সাজেক ভ্যালি, সিলেট, টাঙ্গুয়ার হাওর ও সুন্দরবনে আমাদের সফলভাবে সম্পন্ন হওয়া ট্যুরগুলোর ঝলক। পরবর্তী ব্যাচে যেতে আজই যোগাযোগ করুন!")}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {completedTours.map(tour => <div key={tour.id} className="rounded-3xl bg-emerald-900/60 border border-emerald-800 overflow-hidden flex flex-col justify-between">
                <div className="relative h-48">
                  <img src={tour.coverImage || '/media/sajek-3.jpg'} alt={tour.title} className="w-full h-full object-cover" />
                  <div className="absolute top-3 left-3 rounded-full bg-emerald-950/85 px-3 py-1 text-xs font-bold text-amber-300">{tr("✓ সফলভাবে সম্পন্ন (")}{formatBnDate(tour.startDate)})
                  </div>
                </div>
                <div className="p-5 space-y-3">
                  <div className="text-xs font-bold text-amber-300">{tr(tour.destination)}</div>
                  <h3 className="text-lg font-bold text-white">{tr(tour.title)}</h3>
                  <p className="text-xs text-emerald-200">{tr(tour.transport?.notes)}</p>
                  <div className="pt-2 flex items-center justify-between">
                    <span className="text-xs text-emerald-300">{tr("গাইড:")}{tour.guides?.map(g => g.name.split('(')[0]).join(', ') || 'মনিরুল ভাই'}
                    </span>
                    <button onClick={() => openTourModal(tour, 'book')} className="rounded-xl bg-amber-400 hover:bg-amber-300 px-3.5 py-2 text-xs font-extrabold text-slate-950 transition">{tr("পরবর্তী ব্যাচে যাবেন?")}</button>
                  </div>
                </div>
              </div>)}
          </div>
        </div>
      </section>

      {/* Traveler Reviews / Feedback Section */}
      <section id="reviews" data-reveal className="py-16 max-w-7xl mx-auto px-4 sm:px-6">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-10">
          <div>
            <div className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-3.5 py-1 text-xs font-bold text-amber-900 mb-2">
              <Star className="h-3.5 w-3.5 fill-amber-500 text-amber-500" />{tr("ভেরিফাইড ট্রাভেলার রিভিউ")}</div>
            <h2 className="text-2xl sm:text-4xl font-black text-slate-900">{tr("আমাদের সাথে ঘুরে আসা ট্রাভেলারদের মতামত")}</h2>
            <p className="text-sm sm:text-base text-slate-600 mt-1 max-w-2xl">{tr("প্রতিটি ট্যুর শেষে ট্রাভেলারদের ফোনে পাঠানো ফিডব্যাক লিংক থেকে সংগৃহীত বাস্তব অভিজ্ঞতা ও রেটিং।")}</p>
          </div>
          <button onClick={() => onOpenFeedback('bk-run-1')} className="inline-flex items-center gap-2 rounded-2xl bg-emerald-800 hover:bg-emerald-900 px-5 py-3 text-xs sm:text-sm font-bold text-white shadow-sm transition">
            <MessageSquareHeart className="h-4 w-4 text-amber-300" />{tr("ট্যুর পরবর্তী ফিডব্যাক লিংক ডেমো দেখুন")}</button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {reviews.map(rev => <div key={rev.id} className="rounded-3xl bg-white border border-slate-200 p-6 shadow-sm flex flex-col justify-between space-y-4">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1 text-amber-500">
                    {Array.from({
                  length: rev.rating || 5
                }).map((_, i) => <Star key={i} className="h-4 w-4 fill-amber-400" />)}
                  </div>
                  <span className="rounded-full bg-emerald-50 border border-emerald-200 px-3 py-0.5 text-xs font-bold text-emerald-800">
                    {tr(rev.verdictLabel || 'অসাধারণ, আবারও যাব!')}
                  </span>
                </div>

                <p className="text-sm text-slate-700 leading-relaxed">“{tr(rev.comment)}”</p>

                <div className="flex flex-wrap gap-1.5 pt-1">
                  {(rev.likedTags || []).map(tag => <span key={tag} className="rounded-lg bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-700">
                      ✓ {tag}
                    </span>)}
                </div>
              </div>

              <div className="pt-4 border-t border-slate-100 flex items-center justify-between">
                <div>
                  <div className="font-bold text-slate-900 text-sm">{rev.customerName}</div>
                  <div className="text-xs text-slate-500">
                    {tr(rev.customerLocation)} • {tr(rev.tourTitle)}
                  </div>
                </div>
                <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
              </div>
            </div>)}
        </div>
      </section>

      {/* Tour Guide Photo Gallery Section */}
      <section id="gallery" data-reveal className="py-16 bg-slate-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8">
            <div>
              <div className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-3.5 py-1 text-xs font-bold text-emerald-800 mb-2">
                <Camera className="h-3.5 w-3.5" />{tr("গাইড ও ট্রাভেলারদের ক্যামেরায়")}</div>
              <h2 className="text-2xl sm:text-4xl font-black text-slate-900">{tr("ট্যুর ফটো ও ভিডিও গ্যালারি")}</h2>
              <p className="text-sm text-slate-600 mt-1">{tr("ট্যুরে যাওয়া আমাদের গাইড ও ট্রাভেলারদের তোলা সেরা মুহূর্তগুলো")}</p>
            </div>

            <div className="flex flex-wrap gap-2">
              {galleryDestinations.map(dest => <button key={dest} onClick={() => setGalleryFilter(dest)} className={`rounded-xl px-4 py-2 text-xs font-bold transition ${galleryFilter === dest ? 'bg-emerald-800 text-white shadow-sm' : 'bg-white text-slate-700 border border-slate-200 hover:border-emerald-500'}`}>
                  {dest}
                </button>)}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {filteredGallery.map(item => <div key={item.id} className="group relative rounded-3xl overflow-hidden bg-slate-900 h-64 shadow-sm">
                <img src={item.imageUrl} alt={item.title} className="w-full h-full object-cover group-hover:scale-105 transition duration-500" />
                <div className="absolute inset-0 bg-gradient-to-t from-slate-950/90 via-slate-950/20 to-transparent" />
                <div className="absolute bottom-4 left-4 right-4 text-white">
                  <span className="inline-block rounded-md bg-amber-400 text-slate-950 px-2 py-0.5 text-[10px] font-extrabold mb-1">
                    {tr(item.destination)}
                  </span>
                  <h4 className="font-bold text-base">{tr(item.title)}</h4>
                  <p className="text-xs text-emerald-200 mt-0.5">
                    📸 {item.capturedBy} • {item.date}
                  </p>
                </div>
              </div>)}
          </div>
        </div>
      </section>

      {/* Office Location & Direct Contact Footer */}
      <footer id="office" data-reveal className="bg-slate-950 text-white pt-16 pb-24 border-t border-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 grid grid-cols-1 lg:grid-cols-12 gap-8">
          <div className="lg:col-span-5 space-y-4">
            <AgencyLogo />
            <p className="text-sm text-slate-400 leading-relaxed">{tr("রাজশাহীর সবচেয়ে বিশ্বস্ত ও সুশৃঙ্খল ট্যুর ট্রাভেল এজেন্সি। ফেসবুক পোস্টের ভিড়ে হারিয়ে না গিয়ে আমাদের এই অফিশিয়াল ওয়েবসাইট থেকে যেকোনো সময় আপকামিং ট্যুর শিডিউল দেখুন এবং সরাসরি যোগাযোগ করুন।")}</p>
          </div>

          <div className="lg:col-span-4 space-y-3">
            <h4 className="text-sm font-bold uppercase tracking-wider text-amber-400">{tr("অফিশিয়াল লোকেশন ও যোগাযোগ")}</h4>
            <div className="space-y-2.5 text-sm text-slate-300">
              <div className="flex items-start gap-2.5">
                <MapPin className="h-4 w-4 text-amber-400 shrink-0 mt-1" />
                <span>{tr(siteSettings.officeAddress)}</span>
              </div>
              <div className="flex items-center gap-2.5">
                <Phone className="h-4 w-4 text-amber-400 shrink-0" />
                <span>{tr("হটলাইন: ")}{siteSettings.phone}</span>
              </div>
              <div className="flex items-center gap-2.5">
                <Clock className="h-4 w-4 text-amber-400 shrink-0" />
                <span>{tr(siteSettings.officeHours)}</span>
              </div>
            </div>
          </div>

          <div className="lg:col-span-3 space-y-3">
            <h4 className="text-sm font-bold uppercase tracking-wider text-amber-400">{tr("দ্রুত অ্যাকশন")}</h4>
            <div className="flex flex-col gap-2.5"><a href={`${homeBase}pro/`} className="rounded-xl border border-amber-400/50 px-4 py-3 text-xs font-bold text-amber-300">{tr("International Pro Edition ↗")}</a>
              <a href={`https://wa.me/${siteSettings.whatsapp || '8801782250709'}`} target="_blank" rel="noreferrer" className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 px-4 py-3 text-xs font-bold text-white transition">
                <MessageCircle className="h-4 w-4" />{tr("হোয়াটসঅ্যাপে মেসেজ দিন")}</a>
              <button onClick={currentUser ? onOpenDashboard : onOpenLogin} className="inline-flex items-center justify-center gap-2 rounded-xl bg-white/10 hover:bg-white/15 px-4 py-3 text-xs font-bold text-amber-300 transition">
                <LayoutDashboard className="h-4 w-4" />{tr("স্টাফ ও মালিক ড্যাশবোর্ড")}</button>
            </div>
          </div>
        </div>
      </footer>

      {/* Floating Quick WhatsApp & Call Bar */}
      <div className="rtt-floating-contact fixed bottom-4 right-4 z-30 flex items-center gap-2">
        <a href={`tel:${siteSettings.phone || '01782250709'}`} className="inline-flex items-center gap-2 rounded-full bg-slate-900 hover:bg-slate-800 text-amber-300 border border-amber-400/40 px-4 py-3 text-xs font-bold shadow-xl transition">
          <Phone className="h-4 w-4" />{tr("কল করুন")}</a>
        <a href={`https://wa.me/${siteSettings.whatsapp || '8801782250709'}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-full bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-3 text-xs font-bold shadow-xl transition">
          <MessageCircle className="h-4 w-4" />{tr("WhatsApp চ্যাট")}</a>
      </div>

      {/* Tour Details / Poster / Booking Inquiry Modal */}
      {selectedTour && <div className="rtt-tour-modal-backdrop fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm overflow-y-auto" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelectedTour(null); }}>
          <div className="rtt-tour-modal-shell relative w-full max-w-4xl rounded-3xl bg-white shadow-2xl border border-slate-200 overflow-hidden my-8 max-h-[90vh] flex flex-col" role="dialog" aria-modal="true" aria-labelledby="rtt-tour-modal-title">
            {/* Modal Top Header */}
            <div className="bg-emerald-950 text-white px-6 py-4 flex items-center justify-between shrink-0">
              <div>
                <span className="text-xs font-bold text-amber-300">
                  {tr(selectedTour.destination)} • {formatBnDate(selectedTour.startDate)} ({selectedTour.days}{tr(" দিন ")}{selectedTour.nights}{tr("রাত)")}</span>
                <h3 id="rtt-tour-modal-title" className="text-lg sm:text-xl font-bold">{tr(selectedTour.title)}</h3>
              </div>
              <button autoFocus type="button" aria-label={t('Close tour details', 'ট্যুরের বিস্তারিত বন্ধ করুন')} onClick={() => setSelectedTour(null)} className="rounded-full bg-white/10 p-2 text-white hover:bg-white/20">
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Modal Sub-Tabs */}
            <div className="rtt-tour-modal-tabs flex border-b border-slate-200 bg-slate-50 px-6 gap-2 pt-2 shrink-0">
              {[{
            id: 'details',
            label: '📋 বিস্তারিত ও ডে-বাই-ডে প্ল্যান'
          }, {
            id: 'poster',
            label: '🖼️ প্রমোশনাল পোস্টার ও ছবি'
          }, {
            id: 'book',
            label: '✅ বুকিং কুয়েরি পাঠান'
          }].map(t => <button key={t.id} onClick={() => setActiveModalTab(t.id)} className={`px-4 py-2.5 text-xs sm:text-sm font-bold rounded-t-xl border-b-2 transition ${activeModalTab === t.id ? 'border-emerald-700 bg-white text-emerald-900' : 'border-transparent text-slate-600 hover:text-slate-900'}`}>
                  {tr(t.label)}
                </button>)}
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto space-y-6 flex-1">
              {activeModalTab === 'details' && <div className="rtt-tour-details-content space-y-6">
                  {selectedDescription && <section className="rtt-tour-description-panel">
                    <div className="rtt-tour-description-heading"><span><Sparkles size={17} /></span><div><small>{t('TOUR OVERVIEW', 'ট্যুরের বিবরণ')}</small><h4>{t('A little more about this journey', 'এই ভ্রমণ সম্পর্কে বিস্তারিত')}</h4></div></div>
                    <p lang={language === 'en' ? 'en' : 'bn'}>{selectedDescription}</p>
                  </section>}
                  {/* Packages Grid */}
                  <div>
                    <h4 className="text-sm font-black uppercase tracking-wider text-slate-500 mb-3">{tr("প্যাকেজ ও রুম ক্যাটাগরি")}</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {(selectedTour.packages || []).map(pkg => <div key={pkg.id} className="rounded-2xl border border-emerald-200 bg-emerald-50/50 p-4 flex items-center justify-between">
                          <div>
                            <div className="font-bold text-slate-900 text-sm">{tr(pkg.name)}</div>
                            <div className="text-xs text-slate-600 mt-0.5">
                              {tr(pkg.roomType === 'ac' ? '❄️ এসি রুম' : '🌿 নন-এসি রুম')} •{' '}
                              {tr(pkg.description)}
                            </div>
                          </div>
                          <div className="text-xl font-black text-emerald-900">
                            {formatTaka(pkg.price)}
                          </div>
                        </div>)}
                    </div>
                  </div>

                  {/* Extra Addons & Transport */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="rounded-2xl border border-slate-200 p-4">
                      <div className="text-xs font-bold text-slate-500 uppercase mb-1 flex items-center gap-1.5">
                        <Bus className="h-4 w-4 text-emerald-700" />{tr("ট্রান্সপোর্ট ও যাত্রা")}</div>
                      <div className="font-bold text-sm text-slate-900">
                        {tr(selectedTour.transport?.primary)} + {tr(selectedTour.transport?.local)}
                      </div>
                      <div className="text-xs text-slate-600 mt-1">{tr("ছাড়ার স্থান:")}{tr(selectedTour.departureLocation)}
                      </div>
                    </div>

                    <div className="rounded-2xl border border-slate-200 p-4">
                      <div className="text-xs font-bold text-slate-500 uppercase mb-1 flex items-center gap-1.5">
                        <Ticket className="h-4 w-4 text-amber-600" />{tr("অতিরিক্ত সুবিধা / প্রবেশ টিকিট")}</div>
                      {(selectedTour.addons || []).length > 0 ? selectedTour.addons.map(ad => <div key={ad.id} className="text-sm font-bold text-slate-900">
                            {tr(ad.name)}: <span className="text-emerald-700">{formatTaka(ad.price)}</span>
                          </div>) : <div className="text-xs text-slate-500">{tr("প্যাকেজের ভেতরেই সব অন্তর্ভুক্ত")}</div>}
                    </div>
                  </div>

                  {/* Day by Day Itinerary */}
                  {(selectedTour.itinerary || []).length > 0 && <div>
                      <h4 className="text-sm font-black uppercase tracking-wider text-slate-500 mb-3">{tr("ডে-বাই-ডে ভ্রমণ প্ল্যান (Itinerary)")}</h4>
                      <div className="space-y-3">
                        {selectedTour.itinerary.map(item => <div key={item.day} className="rounded-2xl border border-slate-200 p-4 bg-slate-50/70">
                            <div className="font-bold text-emerald-900 text-sm">
                              {tr(item.dateLabel || `দিন ${item.day}`)}
                            </div>
                            <div className="text-xs font-semibold text-amber-800 mt-1">{tr("📍 স্পটসমূহ:")}{tr(item.spots)}
                            </div>
                            <p className="text-xs text-slate-600 mt-1.5 leading-relaxed">
                              {tr(item.details)}
                            </p>
                          </div>)}
                      </div>
                    </div>}

                  <div className="flex justify-end pt-2">
                    <button onClick={() => setActiveModalTab('book')} className="inline-flex items-center gap-2 rounded-xl bg-emerald-800 hover:bg-emerald-900 px-6 py-3 text-sm font-bold text-white shadow-md transition">{tr("এই ট্যুরে বুকিং কুয়েরি পাঠান")}<ArrowRight className="h-4 w-4" />
                    </button>
                  </div>
                </div>}

              {activeModalTab === 'poster' && <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
                  <div>
                    <h4 className="text-xs font-bold uppercase text-slate-500 mb-2">{tr("ফেসবুক ও প্রমোশনাল ট্যুর পোস্টার")}</h4>
                    <img src={selectedTour.posterImage || '/media/sajek-poster.svg'} alt={tr("Tour Poster")} className="w-full rounded-2xl border border-slate-200 shadow-md" />
                  </div>
                  <div className="space-y-4">
                    <h4 className="text-xs font-bold uppercase text-slate-500">{tr("গন্তব্যের রিলেটেড ছবিসমূহ")}</h4>
                    <div className="grid grid-cols-2 gap-3">
                      {(selectedTour.galleryImages || [selectedTour.coverImage]).map((img, i) => <img key={i} src={img} alt="" className="h-36 w-full object-cover rounded-2xl border border-slate-200" />)}
                    </div>
                    {selectedTour.marketingCaption && <div className="rounded-2xl bg-slate-100 p-4 text-xs whitespace-pre-line text-slate-700">
                        <div className="font-bold text-slate-900 mb-1">{tr("ফেসবুক পোস্ট ক্যাপশন:")}</div>
                        {selectedTour.marketingCaption}
                      </div>}
                  </div>
                </div>}

              {activeModalTab === 'book' && <div>
                  {inquirySuccess ? <div className="p-8 text-center space-y-4">
                      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
                        <CheckCircle2 className="h-8 w-8" />
                      </div>
                      <h4 className="text-xl font-bold text-slate-900">{inquirySuccess}</h4>
                      <p className="text-xs text-slate-600 max-w-md mx-auto">{tr("আপনার নাম ও ফোন নাম্বার আমাদের অ্যাডমিন প্যানেলের “ওয়েবসাইট কুয়েরি” লিস্টে \"নতুন (New)\" ট্যাগ সহ যুক্ত হয়েছে।")}</p>
                      <button onClick={() => setSelectedTour(null)} className="rounded-xl bg-emerald-800 px-6 py-2.5 text-xs font-bold text-white">{tr("ঠিক আছে")}</button>
                    </div> : <form onSubmit={handleInquirySubmit} className="space-y-4 max-w-xl mx-auto">
                      <div className="rounded-2xl bg-emerald-50 border border-emerald-200 p-4 text-xs text-emerald-900">
                        <strong>{tr(selectedTour.title)}</strong>{tr("ট্যুরে যেতে আপনার তথ্য দিন। আমাদের প্রতিনিধি আপনার নাম্বারে কল করে সিট কনফার্ম করবেন।")}</div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-xs font-bold text-slate-700 mb-1">{tr("আপনার নাম *")}</label>
                          <input type="text" required value={inquiryForm.name} onChange={e => setInquiryForm({
                    ...inquiryForm,
                    name: e.target.value
                  })} placeholder={tr("যেমন: রাকিবুল ইসলাম")} className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm" />
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-slate-700 mb-1">{tr("মোবাইল নাম্বার *")}</label>
                          <input type="text" required value={inquiryForm.phone} onChange={e => setInquiryForm({
                    ...inquiryForm,
                    phone: e.target.value
                  })} placeholder={tr("017XXXXXXXX")} className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm" />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-xs font-bold text-slate-700 mb-1">{tr("কতজন যেতে চান? (Pax)")}</label>
                          <input type="number" min={1} max={selectedTour.seatsLeft ?? selectedTour.seatsRemaining ?? selectedTour.totalSeats} value={inquiryForm.pax} onChange={e => setInquiryForm({
                    ...inquiryForm,
                    pax: Number(e.target.value) || 1
                  })} className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm" />
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-slate-700 mb-1">{tr("পছন্দের প্যাকেজ")}</label>
                          <select value={inquiryForm.preferredPackage} onChange={e => setInquiryForm({
                    ...inquiryForm,
                    preferredPackage: e.target.value
                  })} className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm">
                            {(selectedTour.packages || []).map(p => <option key={p.id} value={p.id}>
                                {tr(p.name)} — {formatTaka(p.price)}
                              </option>)}
                          </select>
                        </div>
                      </div>

                      {selectedTour.busId && <TourSeatPicker tourId={selectedTour.id} pax={inquiryForm.pax} selected={selectedSeats} onChange={setSelectedSeats} />}
                      <div className="rtt-bkash-info"><strong>{tr("bKash / বিকাশ: 01782250709")}</strong><p>{t("Confirm with our team before sending money. Seat requests expire after 30 minutes unless approved.", "টাকা পাঠানোর আগে আমাদের সঙ্গে নিশ্চিত করুন। অনুমোদন না হলে সিটের অনুরোধ ৩০ মিনিট পর শেষ হবে।")}</p></div>
                      {data.mode === "browser-demo" && <p className="rtt-demo-notice">{t("Demo only: your request stays in this browser and is not sent to our team.", "এটি ডেমো: অনুরোধ শুধু এই ব্রাউজারে থাকে, আমাদের কাছে পাঠানো হয় না।")}</p>}
                      {inquiryError && <p className="rtt-error" role="alert">{inquiryError}</p>}
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">{tr("বিশেষ কোনো প্রশ্ন বা রুমের চাহিদা থাকলে লিখুন")}</label>
                        <textarea rows={3} value={inquiryForm.message} onChange={e => setInquiryForm({
                  ...inquiryForm,
                  message: e.target.value
                })} className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm" />
                      </div>

                      <button type="submit" disabled={submittingInquiry || (selectedTour.seatsLeft ?? selectedTour.seatsRemaining) === 0} className="w-full rounded-xl bg-emerald-800 hover:bg-emerald-900 py-3 text-sm font-bold text-white shadow-md transition">
                        {tr(submittingInquiry ? 'পাঠানো হচ্ছে...' : 'বুকিং কুয়েরি জমা দিন')}
                      </button>
                    </form>}
                </div>}
            </div>
          </div>
        </div>}
    </div>;
}
