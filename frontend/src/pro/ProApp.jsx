import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown, ArrowRight, ArrowUpRight, CalendarDays, Check, ChevronDown, Compass, Globe2, Heart, Leaf, MapPin, Menu, MessageCircle, Mountain, Phone, ShieldCheck, SlidersHorizontal, Sparkles, Star, Sun, Users, Waves, X } from 'lucide-react';
import { apiFetch } from '../lib/api';
import JourneyDialog from './JourneyDialog';
import { LanguageSwitcher, useI18n } from '../lib/i18n';
import AgencyLogo from '../components/AgencyLogo';
import BusTicketSection from '../components/BusTicketSection';
import { classicUrl, destinations, filterJourneys, formatDate, formatPrice, heroImage, presentReview, presentTour, readPreference, savePreference, storyImage, toEnglishNumerals } from './catalog';
const initialFilters = {
  destination: 'all',
  month: 'all',
  guests: 1,
  category: 'all',
  savedOnly: false,
  sort: 'recommended'
};
const categories = [{
  id: 'all',
  label: 'All journeys',
  icon: Compass
}, {
  id: 'hills',
  label: 'Hill escapes',
  icon: Mountain
}, {
  id: 'nature',
  label: 'Nature & rivers',
  icon: Leaf
}, {
  id: 'beach',
  label: 'Coastal days',
  icon: Waves
}];
const faqs = [{
  question: 'How do I book a journey?',
  answer: 'Choose a journey and send an inquiry, or contact us directly on WhatsApp. The team will confirm your room package, seat availability, pickup details and payment instructions. An inquiry alone does not confirm a booking.'
}, {
  question: 'Where do the trips depart from?',
  answer: 'Our scheduled group journeys depart from Rajshahi, Bangladesh. The meeting point is listed in each tour. If you are traveling from another city, ask us about joining arrangements before making your plans.'
}, {
  question: 'What should international travelers know?',
  answer: 'Please speak with the team before arranging international travel. Confirm the pickup point, guide language, visa requirements and any destination-specific permits for your nationality. Flights, visas and airport transfers are not included unless explicitly agreed.'
}, {
  question: 'What is included in the price?',
  answer: 'Each journey has its own room packages, transport arrangements and meal plan. Check the journey details and ask for the final inclusions before paying. Optional activities and add-ons are listed separately. USD prices are illustrative estimates; final quotes and payments are in BDT.'
}, {
  question: 'Can I change or cancel my booking?',
  answer: 'Change and cancellation terms depend on the departure, transport and accommodation arrangements. Ask the team for the applicable policy before paying an advance. We do not promise a refund or a free change through this inquiry form.'
}];
function Brand() {
  return <AgencyLogo compact />;
}
function Stars({
  rating = 5
}) {
  const {
    tr
  } = useI18n();
  return <span className="pro-stars" aria-label={`${rating} out of 5 stars`}>{Array.from({
      length: 5
    }, (_, index) => <Star key={index} size={14} fill={index < Math.round(rating) ? 'currentColor' : 'none'} aria-hidden="true" />)}</span>;
}
function TourCard({
  tour,
  currency,
  saved,
  onSave,
  onOpen
}) {
  const {
    t,
    tr
  } = useI18n();
  return <article className="pro-tour-card">
      <div className="pro-tour-photo">
        <img src={tour.image} alt={tour.destinationInfo.name} loading="lazy" decoding="async" />
        <span className={`pro-tour-badge ${tour.isFeatured ? 'featured' : ''}`}>{tr(tour.isFeatured ? <><Sparkles size={12} />{tr(" THE NEXT GREAT ESCAPE")}</> : tour.destinationInfo.category === 'hills' ? 'A HIGHER KIND OF HAPPY' : 'A LITTLE VITAMIN SEA')}</span>
        <button className="pro-save-button" onClick={() => onSave(tour.id)} aria-label={`${saved ? 'Remove' : 'Save'} ${tour.displayTitle}${saved ? ' from' : ' to'} your shortlist`} aria-pressed={saved}><Heart size={19} fill={saved ? 'currentColor' : 'none'} /></button>
      </div>
      <div className="pro-tour-card-content">
        <span className="pro-card-location"><MapPin size={13} aria-hidden="true" />{tr(tour.destinationInfo.name)}{tr(", Bangladesh")}</span>
        <h3><button onClick={() => onOpen(tour)}>{tr(tour.displayTitle)}</button></h3>
        <p className="pro-card-description">{tr(tour.description)}</p>
        <div className="pro-card-meta"><span><ClockIcon />{tour.days}{tr(" days / ")}{tour.nights}{tr(" nights")}</span><span><CalendarDays size={14} aria-hidden="true" />{formatDate(tour.startDate, {
            day: 'numeric',
            month: 'short'
          })}</span></div>
        <div className={`pro-seats ${tour.seatsLeft > 0 && tour.seatsLeft <= 10 ? "rtt-low-seats" : ""}`}><span className={`pro-status-dot ${tour.seatsLeft <= 0 ? 'sold-out' : ''}`} />{tr(tour.seatsLeft > 0 ? tour.seatsLeft <= 10 ? t(`Only ${tour.seatsLeft} seats left!`, `আর মাত্র ${tour.seatsLeft}টি সিট!`) : t(`${tour.seatsLeft} seats available`, `${tour.seatsLeft}টি সিট খালি`) : 'Fully booked · ask about next dates')}</div>
        <div className="pro-card-bottom"><div><small>{tr("From / person")}</small><strong>{formatPrice(tour.pricePerPerson, currency)}</strong></div><button className="pro-card-link" onClick={() => onOpen(tour)} aria-label={`View journey: ${tour.displayTitle}`}>{tr("View journey ")}<ArrowUpRight size={17} aria-hidden="true" /></button></div>
      </div>
    </article>;
}
function ClockIcon() {
  return <Sun size={14} aria-hidden="true" />;
}
export default function ProApp() {
  const {
    language,
    t,
    tr
  } = useI18n();
  const [payload, setPayload] = useState(null);
  const [loadError, setLoadError] = useState(false);
  const [loadVersion, setLoadVersion] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuButton = useRef(null);
  const [filters, setFilters] = useState(initialFilters);
  const [search, setSearch] = useState({
    destination: 'all',
    month: 'all',
    guests: 2
  });
  const [currency, setCurrency] = useState(() => readPreference('currency', 'BDT') === 'USD' ? 'USD' : 'BDT');
  const [saved, setSaved] = useState(() => {
    const value = readPreference('shortlist', []);
    return Array.isArray(value) ? value.filter(id => typeof id === 'string').slice(0, 200) : [];
  });
  const [dialog, setDialog] = useState(null);
  const [announcement, setAnnouncement] = useState('');
  useEffect(() => {
    let cancelled = false;
    setLoadError(false);
    apiFetch('/api/public/bootstrap').then(data => {
      if (!cancelled) setPayload(data);
    }).catch(() => {
      if (!cancelled) setLoadError(true);
    });
    return () => {
      cancelled = true;
    };
  }, [loadVersion]);
  useEffect(() => {
    savePreference('currency', currency);
  }, [currency]);
  useEffect(() => {
    savePreference('shortlist', saved);
  }, [saved]);
  useEffect(() => {
    if (!menuOpen) return;
    const closeOnEscape = event => {
      if (event.key === 'Escape') {
        setMenuOpen(false);
        menuButton.current?.focus();
      }
    };
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [menuOpen]);
  const tours = useMemo(() => (payload?.upcomingTours || []).map(presentTour), [payload, language]);
  const visibleTours = useMemo(() => filterJourneys(tours, filters, saved), [tours, filters, saved]);
  const months = useMemo(() => [...new Set(tours.map(tour => String(tour.startDate).slice(0, 7)))].sort(), [tours]);
  const featured = tours.find(tour => tour.isFeatured) || tours[0];
  const settings = payload?.siteSettings || {};
  const demoMode = payload?.mode === 'browser-demo';
  const reviews = (payload?.reviews || []).filter(review => review.comment).slice(0, 3).map(presentReview);
  const whatsapp = `https://wa.me/${String(settings.whatsapp || '8801782250709').replace(/\D/g, '')}`;
  const phoneDigits = String(settings.phone || '01782250709').replace(/\D/g, '');
  const telephone = phoneDigits.startsWith('0') ? `+880${phoneDigits.slice(1)}` : `+${phoneDigits}`;
  const validSavedCount = tours.filter(tour => saved.includes(tour.id)).length;
  const scrollToJourneys = useCallback(() => {
    setMenuOpen(false);
    requestAnimationFrame(() => document.getElementById('journeys')?.scrollIntoView({
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
      block: 'start'
    }));
  }, []);
  const openPlanner = (destination = 'all') => {
    setMenuOpen(false);
    setDialog({
      tour: null,
      destination
    });
  };
  const openTour = tour => setDialog({
    tour,
    destination: tour.destinationInfo.id
  });
  const toggleSave = id => {
    const wasSaved = saved.includes(id);
    setSaved(current => wasSaved ? current.filter(item => item !== id) : [...current, id]);
    const tour = tours.find(item => item.id === id);
    setAnnouncement(`${tour?.displayTitle || 'Journey'} ${wasSaved ? 'removed from' : 'added to'} your shortlist.`);
  };
  const runSearch = event => {
    event.preventDefault();
    setFilters({
      ...initialFilters,
      destination: search.destination,
      month: search.month,
      guests: Number(search.guests)
    });
    scrollToJourneys();
  };
  const exploreDestination = destination => {
    if (!tours.some(tour => tour.destinationInfo.id === destination.id)) {
      openPlanner(destination.id);
      return;
    }
    setSearch({
      destination: destination.id,
      month: 'all',
      guests: 2
    });
    setFilters({
      ...initialFilters,
      destination: destination.id
    });
    scrollToJourneys();
  };
  const resetFilters = () => {
    setFilters(initialFilters);
    setSearch({
      destination: 'all',
      month: 'all',
      guests: 2
    });
  };
  if (!payload) {
    return <main className="pro-loading"><Brand /><Compass size={42} className={loadError ? '' : 'pro-loading-compass'} aria-hidden="true" /><h1>{tr(loadError ? 'A small detour.' : 'A little wonder is on its way.')}</h1><p>{tr(loadError ? 'We couldn’t load the journeys. Please try again or speak with our team.' : 'Getting your next adventure ready…')}</p>{loadError && <div className="pro-loading-actions"><button className="pro-button" onClick={() => setLoadVersion(value => value + 1)}>{tr("Try again ")}<ArrowRight size={17} /></button><a className="pro-text-link" href={whatsapp} target="_blank" rel="noopener noreferrer">{tr("Contact on WhatsApp")}</a></div>}<a className="pro-text-link" href={classicUrl}>{tr("Visit the Classic Edition ")}<ArrowUpRight size={16} /></a></main>;
  }
  return <div className="pro-site" id="top">
      <a className="pro-skip-link" href="#main-content">{tr("Skip to main content")}</a>
      <div className="pro-topline"><div className="pro-container"><span><Globe2 size={12} aria-hidden="true" />{tr(" INTERNATIONAL PRO EDITION ")}<span className="pro-topline-separator">/</span> <span className="pro-topline-note">{tr("Local roots. Extraordinary journeys.")}</span></span><a href={`${classicUrl}?staff=1`}>{t("Staff dashboard", "স্টাফ ড্যাশবোর্ড")}</a><a href={classicUrl}>{tr("Classic Edition ")}<span lang="bn">{tr("বাংলা")}</span> <ArrowUpRight size={13} aria-hidden="true" /></a></div></div>
      <header className="pro-header">
        <div className="pro-container pro-header-inner">
          <a href="#top" className="pro-brand-link" aria-label={tr("Rajshahi Tours and Travels home")}><Brand /></a>
          <nav className={`pro-navigation ${menuOpen ? 'is-open' : ''}`} id="pro-navigation" aria-label={tr("Main navigation")}>
            <a href="#destinations" onClick={() => setMenuOpen(false)}>{tr("Destinations")}</a>
            <a href="#bus-tickets" onClick={() => setMenuOpen(false)}>{t("Bus tickets", "বাসের টিকিট")}</a>
            <a href="#journeys" onClick={() => setMenuOpen(false)}>{tr("Our journeys")}</a>
            <a href="#our-story" onClick={() => setMenuOpen(false)}>{tr("Why Rajshahi")}</a>
            <a href="#faqs" onClick={() => setMenuOpen(false)}>{tr("Good to know")}</a>
            <button className="pro-mobile-plan pro-button" onClick={() => openPlanner()}>{tr("Plan my trip ")}<ArrowUpRight size={17} /></button>
          </nav>
          <div className="pro-header-actions"><LanguageSwitcher />
            <label className="pro-currency-control"><Globe2 size={15} aria-hidden="true" /><span className="pro-sr-only">{tr("Display currency")}</span><select value={currency} onChange={event => setCurrency(event.target.value)} aria-describedby={currency === 'USD' ? 'pro-currency-note' : undefined}><option value="BDT">{tr("BDT ৳")}</option><option value="USD">{tr("USD (est.)")}</option></select><ChevronDown size={12} aria-hidden="true" /></label>
            <button className="pro-button pro-header-cta" onClick={() => openPlanner()}>{tr("Plan my trip ")}<ArrowUpRight size={16} aria-hidden="true" /></button>
            <button className="pro-menu-button pro-icon-button" aria-label={menuOpen ? 'Close navigation menu' : 'Open navigation menu'} aria-expanded={menuOpen} aria-controls="pro-navigation" ref={menuButton} onClick={() => setMenuOpen(value => !value)}>{tr(menuOpen ? <X size={22} /> : <Menu size={22} />)}</button>
          </div>
        </div>
      </header>

      <main id="main-content">
        <section className="pro-hero pro-container" aria-labelledby="pro-hero-title">
          <div className="pro-hero-frame">
            <img className="pro-hero-image" src={heroImage} alt={tr("Travelers overlooking the cloud-covered hills of Sajek Valley")} loading="eager" />
            <div className="pro-hero-overlay" />
            <div className="pro-hero-content">
              <span className="pro-hero-eyebrow"><span />{tr(" BANGLADESH, BEYOND THE EXPECTED")}</span>
              <h1 id="pro-hero-title">{tr("Make room")}<br />{tr("for ")}<em>{tr("wonder.")}</em></h1>
              <p>{tr("Trade the everyday for a story worth telling.")}<br className="pro-desktop-break" />{tr(" Thoughtfully planned journeys. Beautifully local experiences.")}</p>
              <a className="pro-button pro-hero-button" href="#journeys">{tr("Find my next adventure ")}<ArrowUpRight size={19} aria-hidden="true" /></a>
              <div className="pro-hero-trust"><span className="pro-trust-icon"><ShieldCheck size={22} aria-hidden="true" /></span><div><strong>{tr("Good people. Great journeys.")}</strong><span><Stars />{toEnglishNumerals(settings.stats?.averageRating || '৪.৯/৫.০')} <span className="pro-rating-source">{tr("agency-reported")}</span></span></div></div>
            </div>
            <span className="pro-hero-location"><MapPin size={14} aria-hidden="true" />{tr(" A morning in Sajek Valley")}</span>
            {featured && <button className="pro-next-journey" onClick={() => openTour(featured)}><span className="pro-eyebrow">{tr("YOUR NEXT GREAT ESCAPE")}</span><strong>{tr(featured.destinationInfo.name)}<ArrowUpRight size={23} aria-hidden="true" /></strong><span><CalendarDays size={13} aria-hidden="true" /> {formatDate(featured.startDate, {
                day: 'numeric',
                month: 'short'
              })} <span className="pro-next-divider">{tr("·")}</span>{tr(" from ")}{formatPrice(featured.pricePerPerson, currency)}</span></button>}
          </div>
          <form className="pro-search" onSubmit={runSearch} aria-label={tr("Find a journey")}>
            <label className="pro-search-field"><MapPin size={21} aria-hidden="true" /><span><span>{tr("WHERE TO?")}</span><select aria-label={tr("Destination")} value={search.destination} onChange={event => setSearch(current => ({
                ...current,
                destination: event.target.value
              }))}><option value="all">{tr("Somewhere extraordinary")}</option>{destinations.map(destination => <option value={destination.id} key={destination.id}>{tr(destination.name)}</option>)}</select></span><ChevronDown size={15} aria-hidden="true" /></label>
            <label className="pro-search-field"><CalendarDays size={21} aria-hidden="true" /><span><span>{tr("WHEN?")}</span><select aria-label={tr("Departure month")} value={search.month} onChange={event => setSearch(current => ({
                ...current,
                month: event.target.value
              }))}><option value="all">{tr("I’m flexible")}</option>{months.map(month => <option value={month} key={month}>{formatDate(`${month}-01`, {
                    month: 'long',
                    year: 'numeric'
                  })}</option>)}</select></span><ChevronDown size={15} aria-hidden="true" /></label>
            <label className="pro-search-field"><Users size={21} aria-hidden="true" /><span><span>{tr("WITH WHO?")}</span><select aria-label={tr("Travelers")} value={search.guests} onChange={event => setSearch(current => ({
                ...current,
                guests: Number(event.target.value)
              }))}>{[1, 2, 3, 4, 5, 6, 8, 10, 20].map(count => <option value={count} key={count}>{tr(count === 1 ? t("Just me", "শুধু আমি") : t(`${count} travelers`, `${count} জন`))}</option>)}</select></span><ChevronDown size={15} aria-hidden="true" /></label>
            <button className="pro-button pro-search-button" type="submit">{tr("Let’s explore ")}<ArrowRight size={18} aria-hidden="true" /></button>
          </form>
        </section>

        <div className="pro-promise-strip pro-container"><span><MapPin size={17} aria-hidden="true" />{tr(" Departures from Rajshahi")}</span><span><Users size={17} aria-hidden="true" />{tr(" Real local guides")}</span><span><ShieldCheck size={17} aria-hidden="true" />{tr(" Thoughtfully organized")}</span><span><Heart size={17} aria-hidden="true" />{tr(" Made for making memories")}</span></div>

        <section className="pro-section pro-container pro-destinations" id="destinations" aria-labelledby="pro-destinations-title">
          <div className="pro-section-heading"><div><span className="pro-eyebrow">{tr("A WORLD OF WONDER, CLOSE TO HOME")}</span><h2 id="pro-destinations-title">{tr("Find your ")}<em>{tr("somewhere.")}</em></h2></div><p>{tr("Cloud-kissed hills. Wild waterways. Salt in the air.")}<br />{tr("There’s a different side of Bangladesh waiting for you.")}</p></div>
          <div className="pro-destination-grid">{destinations.map((destination, index) => {
            const count = tours.filter(tour => tour.destinationInfo.id === destination.id).length;
            return <button key={destination.id} className="pro-destination-card" onClick={() => exploreDestination(destination)} aria-label={`${count ? 'Explore' : 'Plan a trip to'} ${destination.name}`}><img src={destination.image} alt="" loading="lazy" decoding="async" /><span className="pro-destination-number">{tr("0")}{index + 1}</span><span className="pro-destination-count">{tr(count ? t(`${count} upcoming journey${count === 1 ? "" : "s"}`, `${count}টি আপকামিং ট্যুর`) : tr("Plan your next visit"))}</span><span className="pro-destination-text"><small>{tr(destination.line)}</small><strong>{tr(destination.name)}</strong></span><span className="pro-destination-arrow"><ArrowUpRight size={19} aria-hidden="true" /></span></button>;
          })}</div>
        </section>

        <section className="pro-section pro-container pro-journeys" id="journeys" aria-labelledby="pro-journeys-title">
          <div className="pro-section-heading"><div><span className="pro-eyebrow">{tr("THE DATES ARE SET. THE MEMORIES ARE YOURS.")}</span><h2 id="pro-journeys-title">{tr("Your next chapter")}<br className="pro-mobile-break" />{tr(" starts ")}<em>{tr("here.")}</em></h2></div><a className="pro-text-link" href={whatsapp} target="_blank" rel="noopener noreferrer">{tr("Need a little guidance? ")}<ArrowUpRight size={17} aria-hidden="true" /></a></div>
          <div className="pro-journey-tools"><div className="pro-category-filters" role="group" aria-label={tr("Journey style")}>{categories.map(({
              id,
              label,
              icon: Icon
            }) => <button className={filters.category === id ? 'active' : ''} key={id} aria-pressed={filters.category === id} onClick={() => setFilters(current => ({
              ...current,
              category: id
            }))}><Icon size={15} aria-hidden="true" />{tr(label)}</button>)}</div><button className={`pro-shortlist ${filters.savedOnly ? 'active' : ''}`} aria-pressed={filters.savedOnly} onClick={() => setFilters(current => ({
            ...initialFilters,
            savedOnly: !current.savedOnly
          }))}><Heart size={15} fill={filters.savedOnly ? 'currentColor' : 'none'} aria-hidden="true" />{tr(" My shortlist ")}<span>{validSavedCount}</span></button></div>
          <div className="pro-result-info"><p role="status">{visibleTours.length}{tr(" journey")}{tr(language === 'en' && visibleTours.length !== 1 ? 's' : '')} {tr(filters.savedOnly ? 'in your shortlist' : 'for your next adventure')}{tr(filters.destination !== 'all' ? ` · ${destinations.find(destination => destination.id === filters.destination)?.name || filters.destination}` : '')}{tr(filters.month !== 'all' ? ` · ${formatDate(`${filters.month}-01`, {
              month: 'long'
            })}` : '')}</p><label><SlidersHorizontal size={13} aria-hidden="true" /><span className="pro-sr-only">{tr("Sort journeys")}</span><select aria-label={tr("Sort journeys")} value={filters.sort} onChange={event => setFilters(current => ({
              ...current,
              sort: event.target.value
            }))}><option value="recommended">{tr("Recommended")}</option><option value="soonest">{tr("Soonest departure")}</option><option value="price">{tr("Price: low to high")}</option></select></label></div>
          {currency === 'USD' && <p className="pro-currency-note" id="pro-currency-note" role="status">{tr("USD prices are estimates at ৳120 = US$1, not a live rate. Final quotes and payments are in BDT.")}</p>}
          {tr(visibleTours.length ? <div className="pro-tour-grid">{visibleTours.map(tour => <TourCard tour={tour} key={tour.id} currency={currency} saved={saved.includes(tour.id)} onSave={toggleSave} onOpen={openTour} />)}</div> : <div className="pro-empty"><Compass size={36} strokeWidth={1.3} aria-hidden="true" /><h3>{tr(filters.savedOnly ? 'A little room for your favorites.' : 'A different adventure is calling.')}</h3><p>{tr(filters.savedOnly ? 'Tap the heart on a journey to save it here for later.' : 'No scheduled journeys match these plans just yet. Try another date or let us help you find your somewhere.')}</p><div><button className="pro-button" onClick={resetFilters}>{tr("Explore all journeys ")}<ArrowRight size={17} /></button><button className="pro-text-link" onClick={() => openPlanner(filters.destination)}>{tr("Help me plan a trip")}</button></div></div>)}
          {(filters.destination !== 'all' || filters.month !== 'all' || filters.guests > 1) && <button className="pro-clear-filters" onClick={resetFilters}><X size={13} aria-hidden="true" />{tr("Clear search filters")}</button>}
          <p className="pro-pricing-footnote">{tr("Starting prices are per person in the lowest-priced available room package. Package details, add-ons and pickup arrangements are listed in each journey.")}</p>
        </section>

        <BusTicketSection theme="pro" />

        <section className="pro-story-wrap" id="our-story" aria-labelledby="pro-story-title">
          <div className="pro-container pro-story">
            <div className="pro-story-photo"><img src={storyImage} alt={tr("Travelers watching the sunrise over a sea of clouds in Sajek")} loading="lazy" decoding="async" /><span className="pro-story-caption"><Compass size={18} aria-hidden="true" />{tr(" Moments, not just miles.")}</span><div className="pro-story-stamp"><Sun size={28} strokeWidth={1.3} aria-hidden="true" /><span>{tr("GO A LITTLE")}<br /><strong>{tr("further.")}</strong></span></div></div>
            <div className="pro-story-content"><span className="pro-eyebrow">{tr("THE RAJSHAHI WAY")}</span><h2 id="pro-story-title">{tr("Big on experience.")}<br /><em>{tr("Thoughtful on details.")}</em></h2><p>{tr("We believe the best trips leave you with more than photos. A new friend. A favorite flavor. A story you’ll tell for years.")}</p><div className="pro-story-features"><div><span><Users size={19} aria-hidden="true" /></span><div><h3>{tr("People, not just passengers.")}</h3><p>{tr("From solo explorers to families, our group journeys bring good company along for the ride.")}</p></div></div><div><span><MapPin size={19} aria-hidden="true" /></span><div><h3>{tr("Local roots. A different perspective.")}</h3><p>{tr("Travel with local guides and discover the places that make Bangladesh feel like nowhere else.")}</p></div></div><div><span><Check size={19} aria-hidden="true" /></span><div><h3>{tr("Less guesswork. More going.")}</h3><p>{tr("Room options, transport, dates and day-by-day plans, all in one place. Know your trip before you book.")}</p></div></div></div><a className="pro-text-link" href={whatsapp} target="_blank" rel="noopener noreferrer">{tr("Meet your next adventure ")}<ArrowUpRight size={17} aria-hidden="true" /></a></div>
          </div>
          <div className="pro-container pro-stat-row"><div><strong>{toEnglishNumerals(settings.stats?.completedTours || '১২০+')}</strong><span>{tr("journeys brought to life")}</span></div><div><strong>{toEnglishNumerals(settings.stats?.happyTravelers || '৪,৫০০+')}</strong><span>{tr("travelers, countless stories")}</span></div><div><strong>{toEnglishNumerals(settings.stats?.destinations || '২৫+')}</strong><span>{tr("destinations to discover")}</span></div><div><strong>{toEnglishNumerals(settings.stats?.averageRating || '৪.৯/৫.০').split('/')[0]}<Star size={24} fill="currentColor" aria-hidden="true" /></strong><span>{tr("agency-reported traveler rating")}</span></div></div>
        </section>

        {reviews.length > 0 && <section className="pro-section pro-container pro-reviews" id="traveler-stories" aria-labelledby="pro-reviews-title"><div className="pro-section-heading"><div><span className="pro-eyebrow">{tr("GOOD TRIPS. EVEN BETTER STORIES.")}</span><h2 id="pro-reviews-title">{tr("Don’t just take ")}<em>{tr("our word.")}</em></h2></div><span className="pro-review-note">{tr("A few words from our traveler reviews.")}</span></div><div className="pro-review-grid">{reviews.map(review => <figure className="pro-review-card" key={review.id}><Stars rating={Number(review.rating) || 5} /><blockquote lang={review.translated ? 'en' : 'bn'}>“{tr(review.quote)}”</blockquote><figcaption><span className="pro-review-avatar" aria-hidden="true">{review.name.split(' ').map(part => part[0]).slice(0, 2).join('')}</span><span><strong>{tr(review.name)}</strong><small>{tr(review.location)}</small></span></figcaption>{review.translated && <small className="pro-translation-note">{tr("Translated from Bangla")}</small>}</figure>)}</div></section>}

        <section className="pro-section pro-container pro-faq-section" id="faqs" aria-labelledby="pro-faq-title"><div><span className="pro-eyebrow">{tr("A LITTLE CLARITY BEFORE YOU GO")}</span><h2 id="pro-faq-title">{tr("Curious?")}<br /><em>{tr("Good.")}</em></h2><p>{tr("Every great journey starts with a question.")}<br />{tr("Here are a few answers to get you going.")}</p><a className="pro-text-link" href={whatsapp} target="_blank" rel="noopener noreferrer">{tr("Ask us anything ")}<MessageCircle size={17} aria-hidden="true" /></a></div><div className="pro-faq-list">{faqs.map((faq, index) => <details key={faq.question}><summary><span><small>{tr("0")}{index + 1}</small>{tr(faq.question)}</span><span className="pro-faq-plus" aria-hidden="true">+</span></summary><p>{tr(faq.answer)}</p></details>)}</div></section>

        <section className="pro-container pro-final-cta" aria-labelledby="pro-cta-title"><div className="pro-cta-inner"><Compass className="pro-cta-compass" size={200} strokeWidth={.5} aria-hidden="true" /><div><span className="pro-eyebrow">{tr("LESS SCROLLING. MORE STORIES.")}</span><h2 id="pro-cta-title">{tr("Your next “remember when”")}<br />{tr("is ")}<em>{tr("waiting.")}</em></h2><p>{tr("You bring the curiosity. We’ll help with the rest.")}</p></div><button className="pro-button" onClick={() => openPlanner()}>{tr("Let’s plan a trip ")}<ArrowUpRight size={20} aria-hidden="true" /></button></div></section>
      </main>

      <footer className="pro-footer" id="contact"><div className="pro-container pro-footer-main"><div className="pro-footer-brand"><a href="#top" aria-label={tr("Rajshahi Tours and Travels home")}><Brand /></a><p>{tr("Local roots. Extraordinary journeys.")}<br />{tr("From Rajshahi, with a little more wonder.")}</p><a className="pro-footer-social" href={settings.facebookUrl || 'https://facebook.com/rajshahitoursandtravels'} target="_blank" rel="noopener noreferrer">{tr("Find our stories on Facebook ")}<ArrowUpRight size={14} aria-hidden="true" /></a></div><div><h3>{tr("A little exploring")}</h3><a href="#destinations">{tr("Destinations")}</a><a href="#journeys">{tr("Upcoming journeys")}</a><a href="#our-story">{tr("Our story")}</a><a href="#faqs">{tr("Good to know")}</a><a href={classicUrl}>{tr("Classic Edition ")}<span lang="bn">{tr("বাংলা")}</span> <ArrowUpRight size={12} aria-hidden="true" /></a></div><div><h3>{tr("Let’s talk travel")}</h3><a href={`tel:${telephone}`}><Phone size={14} aria-hidden="true" />{settings.phone || '01782250709'}</a><a href={`mailto:${settings.email || 'info@rajshahitours.com'}`}>{settings.email || 'info@rajshahitours.com'}</a><a href={whatsapp} target="_blank" rel="noopener noreferrer"><MessageCircle size={14} aria-hidden="true" />{tr("Say hello on WhatsApp")}</a><span className="pro-office-hours" lang="bn">{tr(settings.officeHours)}</span></div><div className="pro-footer-office"><h3>{tr("Come say hello")}</h3><p>{tr("Sopura Mor, Rajshahi")}<br />{tr("Bangladesh")}</p><p className="pro-footer-address" lang="bn">{tr(settings.officeAddress)}</p><a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(settings.googleMapLocation || 'Sopura Mor, Rajshahi, Bangladesh')}`} target="_blank" rel="noopener noreferrer">{tr("Find us on the map ")}<ArrowUpRight size={14} aria-hidden="true" /></a></div></div><div className="pro-container pro-footer-bottom"><span>© {new Date().getFullYear()}{tr(" Rajshahi Tours & Travels")}</span><span>{tr(demoMode ? 'Static preview · Demo inquiries stay in this browser' : 'No online payment · Booking confirmed by our team')}</span><a href="#top">{tr("Back to top ")}<ArrowDown className="pro-up-arrow" size={13} aria-hidden="true" /></a></div></footer>
      <div className="pro-sr-only" role="status" aria-live="polite">{announcement}</div>
      {dialog && <JourneyDialog key={dialog.tour?.id || `planner-${dialog.destination}`} tour={dialog.tour} destination={dialog.destination} currency={currency} guests={search.guests} siteSettings={settings} demoMode={demoMode} onClose={() => {
      setDialog(null);
      setLoadVersion(value => value + 1);
    }} />}
    </div>;
}
