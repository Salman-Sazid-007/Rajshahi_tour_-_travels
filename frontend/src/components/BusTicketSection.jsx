import React, { useEffect, useRef, useState } from 'react';
import { ArrowRight, BusFront, CalendarDays, CheckCircle2, MapPin, MessageCircle, ShieldCheck, X } from 'lucide-react';
import transport from '@rtt/transport';
import { apiFetch, formatBnDate, formatTaka } from '../lib/api';
import { useI18n } from '../lib/i18n';
import SeatMap from './SeatMap';
import PageLoader from './PageLoader';
import './transport.css';

function reasonFor(service, language) {
  const parts = String(service.reason || '').split(' / ');
  return language === 'bn' ? parts[1] || parts[0] : parts[0];
}
function BusBookingDialog({ service, demoMode, onClose, onRefresh }) {
  const { t, language } = useI18n();
  const dialog = useRef(null);
  const [seats, setSeats] = useState([]);
  const [form, setForm] = useState({ name: '', phone: '', transactionId: '', note: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  useEffect(() => {
    const element = dialog.current;
    const previous = document.body.style.overflow;
    element.showModal(); document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previous; if (element.open) element.close(); };
  }, []);
  const total = seats.length * Number(service.fare);
  const route = `${service.from} → ${service.to}`;
  const requestText = [
    'Rajshahi Express bus reservation', route, `${service.date} · ${service.departureTime}`,
    `Name: ${form.name}`, `Phone: ${form.phone}`,
    `Seats: ${seats.map((seat) => `${seat.id} (${seat.gender})`).join(', ')}`,
    `Total: ৳${total}`, result?.ticket?.code ? `Reference: ${result.ticket.code}` : '',
    form.transactionId ? `bKash reference: ${form.transactionId}` : '', form.note,
  ].filter(Boolean).join('\n');
  const whatsapp = `https://wa.me/${transport.WHATSAPP}?text=${encodeURIComponent(requestText)}`;
  const submit = async (event) => {
    event.preventDefault();
    if (!seats.length || seats.some((seat) => !['male','female'].includes(seat.gender))) { setError(t('Select seats and passenger gender first.', 'আগে সিট ও যাত্রীর নারী / পুরুষ নির্বাচন করুন।')); return; }
    if (saving) return;
    setSaving(true); setError('');
    try {
      const response = await apiFetch('/api/public/bus-tickets', { method: 'POST', body: JSON.stringify({ ...form, seats, busId: service.busId, serviceId: service.id, date: service.date }) });
      setResult(response);
      onRefresh();
    } catch (failure) {
      const parts = String(failure.message).split(' / ');
      setError(language === 'bn' ? parts[1] || t('Could not reserve these seats. Refresh and try again.', 'এই সিট বুক হয়নি। রিফ্রেশ করে আবার চেষ্টা করুন।') : parts[0]);
      onRefresh();
    } finally { setSaving(false); }
  };
  return <dialog ref={dialog} className="rtt-ticket-dialog" aria-labelledby="rtt-ticket-title" onCancel={onClose} onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}><div className="rtt-ticket-shell"><header><div><small>{t('RAJSHAHI EXPRESS · BUS TICKETING', 'রাজশাহী এক্সপ্রেস · বাস টিকিট')}</small><h2 id="rtt-ticket-title">{t(service.from, service.from === 'Rajshahi' ? 'রাজশাহী' : 'ঢাকা')} → {t(service.to, service.to === 'Rajshahi' ? 'রাজশাহী' : 'ঢাকা')}</h2><p>{formatBnDate(service.date)} · {service.departureTime} · {formatTaka(service.fare)} {t('/ seat', '/ সিট')}</p></div><button type="button" className="rtt-close" autoFocus aria-label={t('Close bus booking', 'বাস বুকিং বন্ধ করুন')} onClick={onClose}><X size={20} /></button></header><div className="rtt-ticket-body">{result ? <div className="rtt-ticket-success" role="status"><CheckCircle2 size={40} /><h3>{result.persisted === false ? t('Demo could not be saved', 'ডেমো সেভ হয়নি') : result.mode === 'browser-demo' ? t('Demo reservation saved in this browser', 'এই ব্রাউজারে ডেমো সেভ হয়েছে') : t('Reservation received — awaiting approval', 'অনুরোধ এসেছে — অনুমোদনের অপেক্ষায়')}</h3><p>{result.mode === 'browser-demo' ? t('This is not a real ticket. No request or payment was sent to the operator. Contact us on WhatsApp to book.', 'এটি আসল টিকিট নয়। অপারেটরের কাছে কোনো অনুরোধ বা পেমেন্ট যায়নি। বুকিং করতে হোয়াটসঅ্যাপে যোগাযোগ করুন।') : t('Seats are held for 30 minutes. Your ticket is not confirmed until the operator approves it. Payment is checked manually.', 'সিট ৩০ মিনিটের জন্য রাখা হয়েছে। অপারেটর অনুমোদন না দেওয়া পর্যন্ত টিকিট নিশ্চিত নয়। পেমেন্ট হাতে যাচাই হবে।')}</p><div className="rtt-ticket-receipt"><strong>{result.ticket?.code}</strong><span>{formatBnDate(service.date)} · {service.departureTime}</span><span>{seats.map((seat) => seat.id).join(', ')}</span><strong>{formatTaka(result.ticket?.totalAmount ?? total)}</strong></div><a className="rtt-button" href={whatsapp} target="_blank" rel="noopener noreferrer">{t('Send to WhatsApp', 'হোয়াটসঅ্যাপে পাঠান')} <MessageCircle size={18} /></a><button type="button" className="rtt-text-button" onClick={onClose}>{t('Done', 'ঠিক আছে')}</button></div> : <form onSubmit={submit} className="rtt-ticket-form"><div><h3>{t('A seat that suits you', 'আপনার পছন্দের সিট')}</h3><SeatMap busName={language === 'bn' ? service.busNameBn || service.busName : service.busName} layout={service.layout} occupied={service.occupied} selected={seats} onChange={setSeats} maxSeats={service.seatsLeft} readOnly={!service.bookable} /></div><div className="rtt-ticket-details">{demoMode && <p className="rtt-demo-notice"><ShieldCheck size={18} />{t('Static demo: reservations stay only in this browser. They are not real tickets.', 'স্ট্যাটিক ডেমো: বুকিং শুধু এই ব্রাউজারে থাকে; এটি আসল টিকিট নয়।')}</p>}<label>{t('Passenger name', 'যাত্রীর নাম')}<input required name="name" autoComplete="name" maxLength={100} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label><label>{t('Phone / WhatsApp', 'মোবাইল / হোয়াটসঅ্যাপ')}<input required name="phone" type="tel" autoComplete="tel" minLength={7} maxLength={25} value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} /></label><div className="rtt-bkash-info"><strong>bKash / বিকাশ: {transport.CONTACT}</strong><p>{t('Confirm with the team before sending money. There is no automatic bKash payment or verification here.', 'টাকা পাঠানোর আগে আমাদের সঙ্গে নিশ্চিত করুন। এখানে স্বয়ংক্রিয় বিকাশ পেমেন্ট বা যাচাই নেই।')}</p></div><label>{t('bKash transaction reference (if already paid)', 'বিকাশ ট্রানজেকশন নম্বর (আগে দেওয়া থাকলে)')}<input maxLength={60} value={form.transactionId} onChange={(event) => setForm({ ...form, transactionId: event.target.value })} /></label><label>{t('Note (optional)', 'মন্তব্য (ঐচ্ছিক)')}<textarea rows={2} maxLength={600} value={form.note} onChange={(event) => setForm({ ...form, note: event.target.value })} /></label><div className="rtt-ticket-total"><span>{seats.length} {t('seats selected', 'টি সিট নির্বাচিত')}</span><strong>{formatTaka(total)}</strong></div><p className="rtt-seat-note">{t('Your seat hold lasts 30 minutes. The operator must approve your reservation; payment alone does not confirm a ticket.', 'সিট ৩০ মিনিটের জন্য রাখা হয়। অপারেটর অনুরোধ অনুমোদন করবেন; শুধু টাকা দিলে টিকিট নিশ্চিত হয় না।')}</p>{error && <p className="rtt-error" role="alert">{error}</p>}<button className="rtt-button" type="submit" disabled={saving || !seats.length || !service.bookable}>{saving ? t('Reserving…', 'সেভ হচ্ছে…') : demoMode ? t('Save demo reservation', 'ডেমো বুকিং সেভ করুন') : t('Request these seats', 'এই সিটের অনুরোধ করুন')}<ArrowRight size={17} /></button></div></form>}</div></div></dialog>;
}

export default function BusTicketSection({ theme = 'classic' }) {
  const { t, language } = useI18n();
  const [date, setDate] = useState(transport.todayDhaka());
  const [route, setRoute] = useState('all');
  const [payload, setPayload] = useState(null);
  const [error, setError] = useState(false);
  const [version, setVersion] = useState(0);
  const [selected, setSelected] = useState(null);
  const refresh = () => setVersion((current) => current + 1);
  useEffect(() => {
    let active = true;
    setError(false);
    setPayload(null);
    const load = () => apiFetch(`/api/public/bus-services?date=${encodeURIComponent(date)}&route=${encodeURIComponent(route)}`).then((data) => { if (active) setPayload(data); }).catch(() => { if (active) setError(true); });
    load();
    const interval = setInterval(load, 15000);
    return () => { active = false; clearInterval(interval); };
  }, [date, route, version]);
  const currentService = selected ? payload?.services?.find((service) => service.busId === selected.busId && service.id === selected.id) || selected : null;
  return <section className={`rtt-bus-section rtt-theme-${theme}`} data-reveal id="bus-tickets" aria-labelledby="rtt-bus-heading"><div className="rtt-bus-container"><div className="rtt-bus-section-heading"><div><span className="rtt-eyebrow"><BusFront size={15} />{t('YOUR CITY-TO-CITY CONNECTION', 'আপনার শহর থেকে শহরের সঙ্গী')}</span><h2 id="rtt-bus-heading">{t('Rajshahi ↔ Dhaka, your seat awaits.', 'রাজশাহী ↔ ঢাকা, আপনার সিট বেছে নিন।')}</h2><p>{t('Our own Rajshahi Express bus runs regular services when it is not on tour. The current service status is always shown below.', 'আমাদের নিজস্ব রাজশাহী এক্সপ্রেস ট্যুর না থাকলে রেগুলার সার্ভিসে চলে। সার্ভিসের বর্তমান অবস্থা নিচে দেখানো আছে।')}</p></div><a href={`https://wa.me/${transport.WHATSAPP}`} className="rtt-text-button" target="_blank" rel="noopener noreferrer"><MessageCircle size={17} />{t('Ask about a departure', 'যাত্রা সম্পর্কে জানুন')}</a></div><div className="rtt-bus-search"><label>{t('Route', 'রুট')}<select aria-label={t('Bus route', 'বাসের রুট')} value={route} onChange={(event) => setRoute(event.target.value)}><option value="all">{t('Both directions', 'দুই রুট')}</option><option value="rajshahi-dhaka">{t('Rajshahi → Dhaka', 'রাজশাহী → ঢাকা')}</option><option value="dhaka-rajshahi">{t('Dhaka → Rajshahi', 'ঢাকা → রাজশাহী')}</option></select></label><label>{t('Journey date', 'যাত্রার তারিখ')}<input aria-label={t('Bus journey date', 'বাসের যাত্রার তারিখ')} type="date" required min={transport.todayDhaka()} value={date} onChange={(event) => setDate(event.target.value)} /></label><button className="rtt-text-button" type="button" onClick={refresh}>{t('Refresh availability', 'সিটের অবস্থা রিফ্রেশ')}</button></div>{payload?.mode === 'browser-demo' && <p className="rtt-demo-caption">{t('Static preview: seat availability and bookings are demo data in this browser, not live inventory.', 'স্ট্যাটিক প্রিভিউ: সিট ও বুকিং এই ব্রাউজারের ডেমো তথ্য; লাইভ সিটের তালিকা নয়।')}</p>}{error ? <p className="rtt-error" role="alert">{t('Could not load bus services. Please refresh or contact us.', 'বাসের তথ্য লোড হয়নি। রিফ্রেশ করুন বা যোগাযোগ করুন।')}</p> : !payload ? <PageLoader fullScreen={false} message={t('Checking your bus seats…', 'বাসের সিটের তথ্য লোড হচ্ছে…')} /> : <div className="rtt-service-grid">{payload.services?.map((service) => <article className="rtt-service-card" key={`${service.busId}-${service.id}`}><div className="rtt-service-card-top"><span className="rtt-bus-profile-label"><BusFront size={17} /><span>{language === 'bn' ? service.busNameBn || service.busName : service.busName}</span><small>{service.totalSeats || 40} {t('seats', 'টি সিট')}</small></span><span className={`rtt-availability ${service.bookable ? 'available' : service.status}`}>{service.bookable ? t('Booking open', 'বুকিং চালু') : reasonFor(service, language)}</span></div><h3>{service.from === 'Rajshahi' ? t('Rajshahi', 'রাজশাহী') : t('Dhaka', 'ঢাকা')} <ArrowRight size={22} /> {service.to === 'Rajshahi' ? t('Rajshahi', 'রাজশাহী') : t('Dhaka', 'ঢাকা')}</h3><div className="rtt-service-meta"><span><CalendarDays size={15} />{formatBnDate(date)} {service.departureTime ? `· ${service.departureTime}` : ''}</span>{service.boardingPoint && <span><MapPin size={15} />{service.boardingPoint}</span>}</div>{!service.bookable && <p className="rtt-service-reason">{service.status === 'on_tour' ? t('Regular service pauses automatically for the full tour period. An admin can reopen this departure when appropriate.', 'ট্যুরের পুরো সময়ে রেগুলার সার্ভিস নিজে থেকেই বন্ধ থাকে। প্রয়োজন হলে অ্যাডমিন এই যাত্রা চালু করতে পারেন।') : service.status === 'maintenance' ? t('The bus is under repair. Regular tickets cannot be booked until it is available again.', 'বাস মেরামতে আছে। বাস প্রস্তুত না হওয়া পর্যন্ত রেগুলার টিকিট বুক করা যাবে না।') : t('The operator will announce the schedule and fare. Please check again or contact us for details.', 'অপারেটর সময়সূচি ও ভাড়া জানাবেন। পরে দেখুন বা বিস্তারিত জানতে যোগাযোগ করুন।')}</p>}<div className="rtt-service-bottom"><div><small>{t('Fare / seat', 'জনপ্রতি ভাড়া')}</small><strong>{service.fare > 0 ? formatTaka(service.fare) : t('To be announced', 'শিগগির জানানো হবে')}</strong>{service.bookable && <span className={service.seatsLeft > 0 && service.seatsLeft <= 10 ? 'rtt-low-seats' : ''}>{service.seatsLeft > 0 && service.seatsLeft <= 10 ? t(`Only ${service.seatsLeft} seats left!`, `আর মাত্র ${service.seatsLeft}টি সিট!`) : `${service.seatsLeft} ${t('seats available', 'টি সিট খালি')}`}</span>}</div><button type="button" className="rtt-button" disabled={!service.bookable || service.seatsLeft === 0} onClick={() => setSelected(service)}>{service.bookable ? service.seatsLeft === 0 ? t('Sold out', 'সব বুক হয়েছে') : t('Choose seats', 'সিট বেছে নিন') : t('Unavailable', 'অনুপলব্ধ')}<ArrowRight size={16} /></button></div></article>)}</div>}<p className="rtt-bus-policy">{t('Tour days automatically pause regular services. Maintenance always blocks ticket sales, even when an admin tour-day override is active.', 'ট্যুরের দিনে রেগুলার সার্ভিস অটোমেটিক বন্ধ হয়। ট্যুরের দিনের ওভাররাইড থাকলেও মেরামতের সময়ে টিকিট বিক্রি বন্ধ থাকে।')}</p></div>{currentService && <BusBookingDialog key={`${currentService.busId}-${currentService.id}-${currentService.date}`} service={currentService} demoMode={payload?.mode === 'browser-demo'} onClose={() => setSelected(null)} onRefresh={refresh} />}</section>;
}
