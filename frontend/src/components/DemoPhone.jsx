import React from 'react';
import { useI18n } from '../lib/i18n';

export default function DemoPhone({ value }) {
  const { t } = useI18n();
  return <span className="rtt-phone-value">{value}{String(value || '').startsWith('000') && <small className="rtt-demo-phone">{t('Fictional demo contact', 'কাল্পনিক ডেমো নম্বর')}</small>}</span>;
}
