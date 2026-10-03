import React, { useEffect, useState } from 'react';
import { apiFetch } from '../lib/api';
import { useI18n } from '../lib/i18n';
import SeatMap from './SeatMap';
import PageLoader from './PageLoader';

export default function TourSeatPicker({ tourId, pax, selected, onChange }) {
  const { t, language } = useI18n();
  const [info, setInfo] = useState(null);
  const [error, setError] = useState(false);
  const [version, setVersion] = useState(0);
  useEffect(() => {
    let active = true;
    const load = () => apiFetch(`/api/public/tours/${tourId}/seats`).then((data) => { if (active) { setInfo(data); setError(false); } }).catch(() => { if (active) setError(true); });
    load();
    const interval = setInterval(load, 15000);
    return () => { active = false; clearInterval(interval); };
  }, [tourId, version]);
  return <div className="rtt-tour-seat-field"><h4>{t('Choose your bus seats', 'আপনার বাসের সিট বেছে নিন')}</h4>{error ? <div className="rtt-error" role="alert">{t('Could not refresh the seat map.', 'সিট ম্যাপ লোড হয়নি।')} <button type="button" onClick={() => setVersion((v) => v + 1)}>{t('Try again', 'আবার চেষ্টা করুন')}</button></div> : !info ? <PageLoader fullScreen={false} message={t('Loading your seat map…', 'আপনার সিটের ম্যাপ লোড হচ্ছে…')} /> : !info.bus ? <p>{t('The bus is not assigned yet. Ask the team for a seat plan before booking.', 'এই ট্যুরে এখনো বাস যুক্ত হয়নি। বুকিংয়ের আগে সিটের প্ল্যান জানতে আমাদের সঙ্গে কথা বলুন।')}</p> : <><p>{t(`Choose ${pax} seat${Number(pax) === 1 ? '' : 's'} and select male/female for each passenger.`, `${pax}টি সিট বেছে প্রত্যেক যাত্রীর নারী / পুরুষ নির্বাচন করুন।`)}</p><SeatMap busName={language === 'bn' ? info.bus.nameBn || info.bus.name : info.bus.name} layout={info.bus.layout} occupied={info.occupied} selected={selected} onChange={onChange} maxSeats={Math.min(Number(pax) || 1, info.seatsLeft)} /><p className="rtt-selected-summary">{t('Selected', 'নির্বাচিত')}: {selected.map((seat) => seat.id).join(', ') || '—'} ({selected.length}/{pax})</p></> }</div>;
}
