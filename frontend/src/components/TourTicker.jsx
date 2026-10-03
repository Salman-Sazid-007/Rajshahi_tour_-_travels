import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, CalendarDays, Pause, Play, Radio } from 'lucide-react';
import { formatBnDate } from '../lib/api';
import { useI18n } from '../lib/i18n';
import './transport.css';

export default function TourTicker({ runningTours = [], upcomingTours = [], onOpenTour }) {
  const { t, tr } = useI18n();
  const trackRef = useRef(null);
  const touchTimerRef = useRef(null);
  const [manuallyPaused, setManuallyPaused] = useState(false);
  const [interacting, setInteracting] = useState(false);
  const items = useMemo(() => [
    ...runningTours.map((tour) => ({ tour, status: 'live' })),
    ...upcomingTours.map((tour) => ({ tour, status: 'upcoming' })),
  ], [runningTours, upcomingTours]);

  const move = useCallback((direction = 1) => {
    const track = trackRef.current;
    if (!track) return;
    const cards = [...track.querySelectorAll('[data-tour-ticker-card]')];
    if (cards.length < 2) return;
    const current = cards.reduce((closest, card, index) => {
      const distance = Math.abs(card.getBoundingClientRect().left - track.getBoundingClientRect().left);
      return distance < closest.distance ? { index, distance } : closest;
    }, { index: 0, distance: Infinity }).index;
    const next = (current + direction + cards.length) % cards.length;
    const offset = cards[next].getBoundingClientRect().left - track.getBoundingClientRect().left + track.scrollLeft;
    track.scrollTo({ left: offset, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  }, []);

  useEffect(() => {
    if (manuallyPaused || interacting || items.length < 2 || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return undefined;
    const timer = window.setInterval(() => move(1), 5200);
    return () => window.clearInterval(timer);
  }, [interacting, items.length, manuallyPaused, move]);

  useEffect(() => () => window.clearTimeout(touchTimerRef.current), []);

  if (!items.length) return null;

  const handleTouch = () => {
    setInteracting(true);
    window.clearTimeout(touchTimerRef.current);
    touchTimerRef.current = window.setTimeout(() => setInteracting(false), 4500);
  };

  return <section className="rtt-tour-ticker" aria-label={t('Live and upcoming tours', 'চলমান ও আসন্ন ট্যুর')}>
    <div className="rtt-tour-ticker-inner">
      <div className="rtt-tour-ticker-heading">
        <div className="rtt-tour-ticker-title">
          <span className="rtt-tour-ticker-eyebrow"><Radio size={14} aria-hidden="true" />{t('ON THE ROAD & NEXT UP', 'চলমান ও আসন্ন ট্যুর')}</span>
          <div><strong>{t('Live and upcoming tours', 'চলমান ও আসন্ন ট্যুর')}</strong><small>{t('Swipe or use the arrows to explore', 'স্ক্রল করে বা তীর চিহ্নে ট্যুর দেখুন')}</small></div>
        </div>
        {items.length > 1 && <div className="rtt-tour-ticker-controls" aria-label={t('Tour carousel controls', 'ট্যুর দেখার নিয়ন্ত্রণ')}>
          <button type="button" aria-label={t('Previous tours', 'আগের ট্যুর')} onClick={() => move(-1)}><ArrowLeft size={16} /></button>
          <button type="button" aria-label={manuallyPaused ? t('Resume tour carousel', 'ট্যুর স্ক্রল চালু করুন') : t('Pause tour carousel', 'ট্যুর স্ক্রল থামান')} aria-pressed={manuallyPaused} onClick={() => { setManuallyPaused((paused) => !paused); setInteracting(false); }}>{manuallyPaused ? <Play size={14} /> : <Pause size={14} />}</button>
          <button type="button" aria-label={t('Next tours', 'পরের ট্যুর')} onClick={() => move(1)}><ArrowRight size={16} /></button>
        </div>}
      </div>

      <div
        className="rtt-tour-ticker-track"
        ref={trackRef}
        role="group"
        aria-label={t('Tour updates', 'ট্যুর আপডেট')}
        onMouseEnter={() => setInteracting(true)}
        onMouseLeave={() => setInteracting(false)}
        onFocusCapture={() => setInteracting(true)}
        onBlurCapture={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setInteracting(false); }}
        onTouchStart={handleTouch}
        onTouchEnd={handleTouch}
      >
        {items.map(({ tour, status }) => {
          const seats = Number(tour.seatsRemaining ?? tour.seatsLeft ?? 0);
          return <button
            type="button"
            data-tour-ticker-card
            className="rtt-tour-ticker-card"
            key={`${status}-${tour.id}`}
            onClick={() => onOpenTour?.(tour)}
            aria-label={`${t('View details', 'বিস্তারিত দেখুন')}: ${tr(tour.title)}`}
          >
            <span className={`rtt-tour-ticker-status ${status}`}><i />{status === 'live' ? t('LIVE NOW', 'চলমান') : t('UPCOMING', 'আসন্ন')}</span>
            <span className="rtt-tour-ticker-card-main"><strong>{tr(tour.title)}</strong><small>{tr(tour.destination || tour.departureLocation || '')}</small></span>
            <span className="rtt-tour-ticker-card-meta"><span><CalendarDays size={13} aria-hidden="true" />{formatBnDate(tour.startDate)}</span><small>{seats} {t('seats left', 'টি সিট খালি')}</small></span>
          </button>;
        })}
      </div>
    </div>
  </section>;
}
