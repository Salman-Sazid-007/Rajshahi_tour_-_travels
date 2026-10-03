import React from 'react';
import mark from '../../../backend/public/media/agency-mark.svg';
import { useI18n } from '../lib/i18n';
import './transport.css';

// Reference-inspired vector mark; replace with the exact uploaded logo when mounted.
export default function AgencyLogo({ compact = false }) {
  const { t } = useI18n();
  return <span className={`rtt-agency-logo ${compact ? 'compact' : ''}`}><img src={mark} alt={t('Rajshahi Tours & Travels logo', 'রাজশাহী ট্যুরস এন্ড ট্রাভেলস লোগো')} width="52" height="52" /><span><strong>{t('Rajshahi', 'রাজশাহী')}</strong><small>{t('TOURS & TRAVELS', 'ট্যুরস এন্ড ট্রাভেলস')}</small></span></span>;
}
