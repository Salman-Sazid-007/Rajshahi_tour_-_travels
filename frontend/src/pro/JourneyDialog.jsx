import React, { useEffect, useRef, useState } from 'react';
import { ArrowRight, BusFront, CalendarDays, Check, CheckCircle2, Clock3, Mail, MapPin, MessageCircle, ShieldCheck, Users, X } from 'lucide-react';
import { apiFetch } from '../lib/api';
import { useI18n } from '../lib/i18n';
import TourSeatPicker from '../components/TourSeatPicker';
import { destinations, formatDate, formatPrice, packageLabel } from './catalog';
export default function JourneyDialog({
  tour,
  currency,
  guests = 2,
  destination = 'all',
  siteSettings,
  demoMode,
  onClose
}) {
  const {
    t,
    tr,
    language
  } = useI18n();
  const [selectedSeats, setSelectedSeats] = useState([]);
  const dialogRef = useRef(null);
  const [tab, setTab] = useState(tour ? 'overview' : 'request');
  const tabs = ['overview', 'itinerary', 'request'];
  const tabRefs = useRef([]);
  const cheapest = [...(tour?.packages || [])].sort((a, b) => a.price / (a.personsPerUnit || 1) - b.price / (b.personsPerUnit || 1))[0];
  const capacity = tour ? Number(tour.seatsLeft) || 0 : 40;
  const [form, setForm] = useState({
    name: '',
    phone: '',
    email: '',
    pax: Math.min(Math.max(1, capacity), Number(guests) || 2),
    packageId: cheapest?.id || '',
    destination,
    preferredDate: '',
    message: '',
    consent: false
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  useEffect(() => {
    const dialog = dialogRef.current;
    const previousOverflow = document.body.style.overflow;
    if (!dialog.open) dialog.showModal();
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
      if (dialog.open) dialog.close();
    };
  }, []);
  const selectedPackage = tour?.packages?.find(pkg => pkg.id === form.packageId);
  const packageUnits = selectedPackage ? Math.ceil(Number(form.pax) / Math.max(1, Number(selectedPackage.personsPerUnit) || 1)) : 0;
  const estimatedTotal = selectedPackage ? packageUnits * Number(selectedPackage.price) : null;
  const contactPhone = String(siteSettings.whatsapp || '8801782250709').replace(/\D/g, '');
  const destinationName = destinations.find(item => item.id === form.destination)?.name || 'Help me choose';
  const whatsappText = ['Hello Rajshahi Tours & Travels! I’d like to plan a trip.', `Journey: ${tour?.displayTitle || destinationName}`, tour ? `Departure: ${formatDate(tour.startDate)}` : form.preferredDate ? `Preferred date: ${formatDate(form.preferredDate)}` : '', `Guests: ${form.pax}`, selectedPackage ? `Package: ${packageLabel(selectedPackage)}` : '', form.name ? `Name: ${form.name.trim()}` : '', form.phone ? `Phone: ${form.phone.trim()}` : '', form.email ? `Email: ${form.email.trim()}` : '', selectedSeats.length ? `Bus seats: ${selectedSeats.map(seat => `${seat.id} (${seat.gender})`).join(', ')}` : '', form.message.trim(), 'Sent from the International Pro Edition.'].filter(Boolean).join('\n');
  const whatsappUrl = `https://wa.me/${contactPhone}?text=${encodeURIComponent(whatsappText)}`;
  const update = (key, value) => {
    setForm(current => ({
      ...current,
      [key]: value
    }));
    setError(tr(''));
  };
  const submit = async event => {
    event.preventDefault();
    if (submitting) return;
    const digits = form.phone.replace(/\D/g, '');
    if (!form.name.trim()) {
      setError(tr('Please enter your name.'));
      return;
    }
    if (digits.length < 7 || digits.length > 15 || !/^[+\d() .-]+$/.test(form.phone)) {
      setError(tr('Please enter a valid phone number, including your country code if you are outside Bangladesh.'));
      return;
    }
    if (!Number.isInteger(Number(form.pax)) || Number(form.pax) < 1 || Number(form.pax) > capacity) {
      setError(t(`Please choose between 1 and ${capacity} guests.`, `১ থেকে ${capacity} জন যাত্রী নির্বাচন করুন।`));
      return;
    }
    if (!form.consent) {
      setError(tr('Please acknowledge that this is an inquiry, not a confirmed booking.'));
      return;
    }
    if (tour?.busId && (selectedSeats.length !== Number(form.pax) || selectedSeats.some(seat => !seat.gender))) {
      setError(t('Select one bus seat and male/female for each traveler.', 'প্রত্যেক যাত্রীর জন্য বাসের সিট ও নারী / পুরুষ নির্বাচন করুন।'));
      return;
    }
    setSubmitting(true);
    setError(tr(''));
    try {
      const response = await apiFetch(tour?.busId ? '/api/public/tour-seat-requests' : '/api/public/inquiries', {
        method: 'POST',
        body: JSON.stringify({
          tourId: tour?.id || '',
          packageId: selectedPackage?.id || '',
          seats: selectedSeats,
          tourTitle: tour?.title || `Custom journey · ${destinationName}`,
          name: form.name.trim(),
          phone: form.phone.trim(),
          pax: Number(form.pax),
          preferredPackage: selectedPackage?.name || '',
          message: ['[International Pro Edition]', !tour ? `Destination: ${destinationName}` : '', form.preferredDate ? `Preferred date: ${form.preferredDate}` : '', form.email.trim() ? `Email: ${form.email.trim()}` : '', form.message.trim()].filter(Boolean).join('\n')
        })
      });
      setResult({
        demo: response.mode === 'browser-demo',
        persisted: response.persisted !== false,
        id: response.request?.id || response.inquiry?.id
      });
    } catch {
      setError(tr('We couldn’t submit your request. Please try again, or send it directly to our team on WhatsApp.'));
    } finally {
      setSubmitting(false);
    }
  };
  const switchTabWithKeyboard = (event, index) => {
    let next;
    if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
    if (event.key === 'ArrowLeft') next = (index + tabs.length - 1) % tabs.length;
    if (event.key === 'Home') next = 0;
    if (event.key === 'End') next = tabs.length - 1;
    if (next === undefined) return;
    event.preventDefault();
    setTab(tabs[next]);
    tabRefs.current[next]?.focus();
  };
  const requestForm = <form className="pro-inquiry-form" onSubmit={submit}>
      <div className="pro-form-intro">
        <span className="pro-eyebrow">{tr("A REAL CONVERSATION. NOT A CHECKOUT.")}</span>
        <h3>{tr(tour ? 'Let’s save you a little adventure.' : 'Your kind of trip starts here.')}</h3>
        <p>{tr("Tell us a little about your plans. Availability, the final price and payment details are confirmed by our team before booking.")}</p>
      </div>
      {demoMode && <div className="pro-demo-notice" role="note">
          <ShieldCheck size={20} aria-hidden="true" />
          <p><strong>{tr("Static preview mode.")}</strong>{tr(" This form saves a demo inquiry only in this browser. It does not contact our team. Use WhatsApp for a real request.")}</p>
        </div>}
      {tr(tour && capacity === 0 ? <div className="pro-empty-small">
          <h4>{tr("This departure is fully booked.")}</h4>
          <p>{tr("Ask our team about a waiting list or the next available dates.")}</p>
          <a className="pro-button" href={whatsappUrl} target="_blank" rel="noopener noreferrer">{tr("Ask about next dates ")}<MessageCircle size={17} /></a>
        </div> : <>
          <div className="pro-form-grid">
            <label>{tr("Full name ")}<span aria-hidden="true">*</span><input name="name" autoComplete="name" required maxLength={100} value={form.name} onChange={event => update('name', event.target.value)} placeholder={tr("How should we call you?")} /></label>
            <label>{tr("Phone / WhatsApp ")}<span aria-hidden="true">*</span><input name="phone" type="tel" autoComplete="tel" required minLength={7} maxLength={25} value={form.phone} onChange={event => update('phone', event.target.value)} placeholder={tr("+880 17… or your country code")} /></label>
            <label>{tr("Email ")}<span className="pro-optional">{tr("(optional)")}</span><input name="email" type="email" autoComplete="email" maxLength={150} value={form.email} onChange={event => update('email', event.target.value)} placeholder={tr("you@example.com")} /></label>
            <label>{tr("Number of guests ")}<span aria-hidden="true">*</span><input name="pax" type="number" min="1" max={capacity} step="1" required value={form.pax} onChange={event => update('pax', event.target.value)} /></label>
            {tour && tour.packages?.length > 0 ? <label className="pro-full-width">{tr("Room package")}<select name="package" value={form.packageId} onChange={event => update('packageId', event.target.value)}>{tour.packages.map(pkg => <option key={pkg.id} value={pkg.id}>{packageLabel(pkg)} — {formatPrice(pkg.price, currency)} {Number(pkg.personsPerUnit) > 1 ? t(`for ${pkg.personsPerUnit} guests`, `${pkg.personsPerUnit} জনের জন্য`) : tr("/ person")}</option>)}</select></label> : !tour ? <>
                <label>{tr("Where would you like to go?")}<select name="destination" value={form.destination} onChange={event => update('destination', event.target.value)}><option value="all">{tr("Help me choose")}</option>{destinations.map(item => <option value={item.id} key={item.id}>{tr(item.name)}</option>)}</select></label>
                <label>{tr("Preferred departure ")}<span className="pro-optional">{tr("(optional)")}</span><input name="date" type="date" min={new Date().toISOString().slice(0, 10)} value={form.preferredDate} onChange={event => update('preferredDate', event.target.value)} /></label>
              </> : null}
            <label className="pro-full-width">{tr("Anything we should know? ")}<span className="pro-optional">{tr("(optional)")}</span><textarea name="message" rows="3" maxLength={600} value={form.message} onChange={event => update('message', event.target.value)} placeholder={tr("Travel dates, room preferences, pickup questions…")} /></label>
          </div>
          {tour?.busId && <TourSeatPicker tourId={tour.id} pax={form.pax} selected={selectedSeats} onChange={setSelectedSeats} />}
          {estimatedTotal !== null && <div className="pro-estimate">
              <div><span>{tr("Estimated package total")}</span><small>{form.pax || 0}{tr(" guest")}{language === 'en' && Number(form.pax) !== 1 ? 's' : ''}{Number(selectedPackage.personsPerUnit) > 1 ? t(` · ${packageUnits} private room${packageUnits === 1 ? "" : "s"}`, ` · ${packageUnits}টি প্রাইভেট রুম`) : ""}{tr(" · Optional add-ons excluded")}</small></div>
              <strong>{formatPrice(estimatedTotal, currency)}</strong>
            </div>}
          {currency === 'USD' && <p className="pro-fine-print">{tr("USD is an estimate at ৳120 = US$1, not a live rate. Final quotes and payments are in BDT.")}</p>}
          <div className="rtt-bkash-info"><strong>{tr("bKash / বিকাশ: 01782250709")}</strong><p>{t("Confirm with the team before sending money. Seat requests expire after 30 minutes unless the operator confirms them.", "টাকা পাঠানোর আগে আমাদের সঙ্গে নিশ্চিত করুন। অপারেটর নিশ্চিত না করলে সিটের অনুরোধ ৩০ মিনিট পর শেষ হবে।")}</p></div>
          <label className="pro-consent"><input name="consent" type="checkbox" required checked={form.consent} onChange={event => update('consent', event.target.checked)} /><span>{tr("I understand this is an inquiry, not a confirmed booking. No payment is taken here.")}</span></label>
          {error && <p className="pro-form-error" role="alert">{error}</p>}
          <div className="pro-form-actions">
            <button className="pro-button" type="submit" disabled={submitting}>{submitting ? 'Submitting…' : demoMode ? 'Save demo inquiry' : 'Send my trip request'} <ArrowRight size={18} /></button>
            <a className="pro-text-link" href={whatsappUrl} target="_blank" rel="noopener noreferrer"><MessageCircle size={17} />{tr(" Send directly on WhatsApp")}</a>
          </div>
          <p className="pro-fine-print">{tr(demoMode ? 'Demo details are stored on this device and may be visible to others using this browser.' : 'Your contact details are used to respond to this trip inquiry.')}</p>
        </>)}
    </form>;
  return <dialog className="pro-dialog" ref={dialogRef} aria-labelledby="pro-dialog-title" onCancel={onClose} onClick={event => {
    if (event.target === event.currentTarget) onClose();
  }}>
      <div className="pro-dialog-shell">
        <div className={`pro-dialog-heading ${tour ? 'has-image' : ''}`} style={tour ? {
        backgroundImage: `linear-gradient(0deg, rgba(13,39,32,.9), rgba(13,39,32,.18)), url("${tour.image}")`
      } : undefined}>
          <button className="pro-icon-button pro-dialog-close" onClick={onClose} aria-label={tr("Close trip planner")} autoFocus><X size={20} /></button>
          <span className="pro-eyebrow">{tr(tour ? tour.destinationInfo.region : 'LET’S MAKE IT PERSONAL')}</span>
          <h2 id="pro-dialog-title">{tr(tour?.displayTitle || 'A trip that feels like you.')}</h2>
          <p>{tr(tour ? t(`${formatDate(tour.startDate)} · ${tour.days} days / ${tour.nights} nights · Departing Rajshahi`, `${formatDate(tour.startDate)} · ${tour.days} দিন / ${tour.nights} রাত · রাজশাহী থেকে যাত্রা`) : tr("Good journeys start with a little curiosity."))}</p>
        </div>
        {!result && tour && <div className="pro-dialog-tabs" role="tablist" aria-label={tr("Journey information")}>
            {tabs.map((item, index) => <button key={item} id={`pro-tab-${item}`} ref={element => {
          tabRefs.current[index] = element;
        }} role="tab" aria-selected={tab === item} aria-controls={`pro-panel-${item}`} tabIndex={tab === item ? 0 : -1} onClick={() => setTab(item)} onKeyDown={event => switchTabWithKeyboard(event, index)}>{tr(item === 'overview' ? 'The experience' : item === 'itinerary' ? 'Day by day' : 'Plan this trip')}</button>)}
          </div>}
        <div className="pro-dialog-content">
          {tr(result ? <div className="pro-success" role="status">
              <span className="pro-success-icon"><CheckCircle2 size={32} /></span>
              <span className="pro-eyebrow">{tr("ONE STEP CLOSER")}</span>
              <h3>{result.demo ? result.persisted ? 'Your demo inquiry is saved.' : 'Your inquiry wasn’t saved.' : 'Your request is with our team.'}</h3>
              <p>{result.demo ? result.persisted ? 'This is a local preview, so nothing has been sent to our team. Send the same details on WhatsApp to start a real conversation.' : 'Browser storage is unavailable. Nothing has been sent to our team. You can still send your request directly on WhatsApp.' : 'We’ll use the contact details you provided to discuss availability and the final package. Your booking is not confirmed yet.'}</p>
              {result.id && result.persisted && <p className="pro-fine-print">{tr("Reference: ")}{result.id}</p>}
              <a className="pro-button" href={whatsappUrl} target="_blank" rel="noopener noreferrer">{tr("Send this request on WhatsApp ")}<MessageCircle size={18} /></a>
              <button className="pro-text-link" onClick={onClose}>{tr("Back to exploring ")}<ArrowRight size={16} /></button>
            </div> : !tour ? requestForm : <section role="tabpanel" id={`pro-panel-${tab}`} aria-labelledby={`pro-tab-${tab}`} tabIndex={0}>
              {tab === 'overview' && <div className="pro-tour-overview">
                  <p className="pro-tour-description">{tr(tour.description)}</p>
                  <div className="pro-tour-facts">
                    <div><CalendarDays size={20} /><span>{tr("Departure")}<strong>{formatDate(tour.startDate)}</strong></span></div>
                    <div><Clock3 size={20} /><span>{tr("Duration")}<strong>{tour.days}{tr(" days / ")}{tour.nights}{tr(" nights")}</strong></span></div>
                    <div><MapPin size={20} /><span>{tr("Meeting point")}<strong lang="bn">{tr(tour.departureLocation || 'Rajshahi')}</strong></span></div>
                    <div><Users size={20} /><span>{tr("Availability")}<strong>{capacity > 0 ? t(`${capacity} seats remaining`, `${capacity}টি সিট খালি`) : tr("Fully booked")}</strong></span></div>
                  </div>
                  <p className="pro-fine-print">{tr("Duration includes the scheduled overnight travel. Pickup time and final logistics are confirmed by the team.")}</p>
                  <h3>{tr("Find your room, find your rhythm.")}</h3>
                  <div className="pro-package-grid">
                    {(tour.packages || []).map(pkg => <div className="pro-package" key={pkg.id}><span>{packageLabel(pkg)}</span><strong>{formatPrice(pkg.price, currency)}</strong><small>{Number(pkg.personsPerUnit) > 1 ? t(`Package total for ${pkg.personsPerUnit} guests`, `${pkg.personsPerUnit} জনের মোট প্যাকেজ`) : tr("Per person")}{tr(" · ")}{tr(pkg.roomType === 'ac' ? 'Air-conditioned' : 'Non-air-conditioned')}</small></div>)}
                  </div>
                  <div className="pro-inclusions">
                    <div><BusFront size={19} /><span>{tr("Scheduled transport")}</span><Check size={15} /></div>
                    <div><Users size={19} /><span>{tr("Assigned local guides")}</span><Check size={15} /></div>
                    <div><Clock3 size={19} /><span>{tr(tour.mealPlan?.length ? 'Meals as listed in the tour plan' : 'Ask about meal inclusions')}</span><Check size={15} /></div>
                  </div>
                  {tour.addons?.length > 0 && <div className="pro-addon-list"><h4>{tr("Optional & additional costs")}</h4>{tour.addons.map(addon => <p key={addon.id}><span lang="bn">{tr(addon.name)}{tr(addon.mandatory ? ' (required)' : '')}</span><strong>{formatPrice(addon.price, currency)}</strong></p>)}</div>}
                  <button className="pro-button" onClick={() => setTab('request')}>{tr("Plan this trip ")}<ArrowRight size={18} /></button>
                </div>}
              {tab === 'itinerary' && <div className="pro-itinerary">
                  <span className="pro-eyebrow">{tr("ROOM FOR DISCOVERY")}</span><h3>{tr("A few days. So many moments.")}</h3>
                  <p>{tr("Here’s the planned route. Timings may change with weather, road conditions and local access.")}</p>
                  {tour.displayItinerary.length ? tour.displayItinerary.map((day, index) => <article className="pro-itinerary-day" key={index}><span className="pro-day-number">{String(index + 1).padStart(2, '0')}</span><div lang={day.original ? 'bn' : 'en'}><span className="pro-eyebrow">{tr("DAY ")}{index + 1}</span><h4>{tr(day.title)}</h4><p>{tr(day.details)}</p><small><MapPin size={14} />{tr(day.spots)}</small></div></article>) : <p>{tr("The detailed itinerary is being finalized. Please ask our team for the latest plan.")}</p>}
                  <button className="pro-button" onClick={() => setTab('request')}>{tr("This feels like my kind of trip ")}<ArrowRight size={18} /></button>
                </div>}
              {tab === 'request' && requestForm}
            </section>)}
          <div className="pro-dialog-contact"><Mail size={15} /><span>{tr("Prefer email? ")}<a href={`mailto:${siteSettings.email || 'info@rajshahitours.com'}`}>{siteSettings.email || 'info@rajshahitours.com'}</a></span></div>
        </div>
      </div>
    </dialog>;
}
