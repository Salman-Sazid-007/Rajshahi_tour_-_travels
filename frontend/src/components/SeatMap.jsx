import React from 'react';
import { Armchair, BusFront, CircleUserRound } from 'lucide-react';
import { useI18n } from '../lib/i18n';
import './transport.css';

export default function SeatMap({ layout = 'express46', occupied = [], selected = [], onChange, maxSeats = 46, readOnly = false, busName = 'Rajshahi Express' }) {
  const { t } = useI18n();
  const selectedSeat = (id) => selected.find((seat) => seat.id === id);
  const toggleSeat = (id) => {
    if (readOnly || occupied.some((seat) => seat.id === id)) return;
    if (selectedSeat(id)) onChange(selected.filter((seat) => seat.id !== id));
    else if (selected.length < maxSeats) onChange([...selected, { id, gender: '' }]);
  };
  const renderSeat = (id) => {
    const taken = occupied.find((seat) => seat.id === id);
    const active = selectedSeat(id);
    const occupiedLabel = taken?.status === 'reserved' ? t('Held', 'সাময়িক রাখা') : t('Booked', 'বুকড');
    const genderLabel = taken?.gender === 'male' ? t('male', 'পুরুষ') : taken?.gender === 'female' ? t('female', 'নারী') : '';
    const label = taken ? `${occupiedLabel}${genderLabel ? ` · ${genderLabel}` : ''}` : active ? t('Selected', 'নির্বাচিত') : t('Available', 'খালি');
    return <button key={id} type="button" className={`rtt-seat ${taken ? `taken ${taken.gender}` : active ? 'selected' : 'available'}`} onClick={() => toggleSeat(id)} disabled={Boolean(taken) || readOnly || (!active && selected.length >= maxSeats)} aria-label={`${t('Seat', 'সিট')} ${id}: ${label}`} aria-pressed={Boolean(active)}><Armchair size={15} aria-hidden="true" /><strong>{id}</strong>{taken?.gender === 'male' ? <small>M</small> : taken?.gender === 'female' ? <small>F</small> : taken ? <small>×</small> : null}</button>;
  };
  return <div className="rtt-seat-picker"><div className="rtt-seat-map"><div className="rtt-bus-title"><BusFront size={18} aria-hidden="true" />{busName}</div><div className="rtt-bus-front"><span className="rtt-bus-door">{t('DOOR →', 'দরজা →')}</span><span className="rtt-bus-driver"><CircleUserRound size={25} aria-hidden="true" />{t('Driver', 'ড্রাইভার')}</span></div>{layout === 'express46' && <div className="rtt-front-seat">{renderSeat('1')}</div>}<div className="rtt-seat-rows">{'ABCDEFGHIJ'.split('').map((row) => <div className="rtt-seat-row" key={row}>{renderSeat(`${row}-1`)}{renderSeat(`${row}-2`)}<span className="rtt-seat-aisle" aria-hidden="true">{row}</span>{renderSeat(`${row}-3`)}{renderSeat(`${row}-4`)}</div>)}{layout === 'express46' && <div className="rtt-seat-back-row">{[1,2,3,4,5].map((n) => renderSeat(`K-${n}`))}</div>}</div></div><div className="rtt-seat-legend"><span><i className="available" />{t('Available', 'খালি')}</span><span><i className="selected" />{t('Selected', 'নির্বাচিত')}</span><span><i className="male" />{t('Male (M)', 'পুরুষ (M)')}</span><span><i className="female" />{t('Female (F)', 'নারী (F)')}</span><span><i className="unspecified" />{t('Booked / legacy', 'বুকড / পূর্বের')}</span></div>{!readOnly && selected.length > 0 && <div className="rtt-passenger-genders"><h4>{t('Passenger gender for each selected seat', 'নির্বাচিত প্রতিটি সিটের যাত্রীর লিঙ্গ')}</h4>{selected.map((seat) => <label key={seat.id}><strong>{t('Seat', 'সিট')} {seat.id}</strong><select required aria-label={`${t('Passenger gender for seat', 'সিটের যাত্রীর লিঙ্গ')} ${seat.id}`} value={seat.gender} onChange={(event) => onChange(selected.map((item) => item.id === seat.id ? { ...item, gender: event.target.value } : item))}><option value="">{t('Select male / female', 'পুরুষ / নারী নির্বাচন')}</option><option value="male">{t('Male', 'পুরুষ')}</option><option value="female">{t('Female', 'নারী')}</option></select><button type="button" onClick={() => toggleSeat(seat.id)} aria-label={`${t('Remove seat', 'সিট বাদ দিন')} ${seat.id}`}>×</button></label>)}</div>}<p className="rtt-seat-note">{t('Select one seat per passenger. Names and phone numbers are never shown on the public seat map.', 'প্রত্যেক যাত্রীর জন্য একটি সিট বাছুন। প্রকাশ্য সিট ম্যাপে নাম বা ফোন নম্বর দেখানো হয় না।')}</p></div>;
}
