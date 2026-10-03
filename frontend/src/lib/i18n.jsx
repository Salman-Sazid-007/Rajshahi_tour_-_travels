import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import adminTranslations from './adminTranslations';
import { englishToBangla, banglaToEnglish, dataTranslations } from './translations';

const LanguageContext = createContext(null);
const normalize = (text) => String(text).replace(/\s+/g, ' ').trim();
const bnToEn = { ...Object.fromEntries(Object.entries(englishToBangla).map(([en, bn]) => [bn, en])), ...banglaToEnglish, ...adminTranslations, ...dataTranslations };
const enToBn = { ...Object.fromEntries(Object.entries(adminTranslations).map(([bn, en]) => [en, bn])), ...Object.fromEntries(Object.entries(banglaToEnglish).map(([bn, en]) => [en, bn])), ...Object.fromEntries(Object.entries(dataTranslations).map(([bn, en]) => [en, bn])), ...englishToBangla };
export const currentLanguage = () => document.documentElement.lang === 'bn' ? 'bn' : 'en';

export function translateText(text, language = currentLanguage()) {
  if (typeof text !== 'string') return text;
  const key = normalize(text);
  const output = (language === 'bn' ? enToBn : bnToEn)[key] || text;
  const translated = language === 'en' ? output.replace(/[০-৯]/g, (digit) => '০১২৩৪৫৬৭৮৯'.indexOf(digit)) : output;
  if (output === text) return translated;
  return `${/^\s/.test(text) ? ' ' : ''}${translated}${/\s$/.test(text) ? ' ' : ''}`;
}

const displayFields = new Set(['title', 'titleEn', 'name', 'nameBn', 'description', 'destination', 'tagline', 'heroTitle', 'heroSubtitle', 'officeAddress', 'officeHours', 'agencyNameBn', 'agencyNameEn', 'departureLocation', 'primary', 'local', 'notes', 'dateLabel', 'spots', 'details', 'verdictLabel', 'likedTags', 'comment', 'customerLocation', 'tourTitle']);
export function localizeData(value, language, field = '') {
  if (typeof value === 'string') return displayFields.has(field) ? translateText(value, language) : value;
  if (Array.isArray(value)) return value.map((item) => localizeData(item, language, field));
  if (value && typeof value === 'object') {
    const output = Object.fromEntries(Object.entries(value).map(([key, item]) => [key, localizeData(item, language, key)]));
    if (language === 'en' && value.titleEn) output.title = value.titleEn;
    if (language === 'en' && value.destinationEn) output.destination = value.destinationEn;
    return output;
  }
  return value;
}

export function LanguageProvider({ children, defaultLanguage = 'bn' }) {
  const [language, setLanguage] = useState(() => {
    try { const saved = localStorage.getItem('rtt_language'); return ['bn','en'].includes(saved) ? saved : defaultLanguage; } catch { return defaultLanguage; }
  });
  // Update immediately as pure formatters also read the document locale during render.
  document.documentElement.lang = language;
  useEffect(() => {
    try { localStorage.setItem('rtt_language', language); } catch { /* private browsing */ }
  }, [language]);
  const context = useMemo(() => ({ language, setLanguage, tr: (text) => translateText(text, language), t: (en, bn) => language === 'bn' ? bn : en }), [language]);
  return <LanguageContext.Provider value={context}>{children}</LanguageContext.Provider>;
}
export function useI18n() {
  const context = useContext(LanguageContext);
  if (!context) throw new Error('LanguageProvider is required');
  return context;
}
export function LanguageSwitcher() {
  const { language, setLanguage, t } = useI18n();
  return <div className="rtt-language-switch" role="group" aria-label={t('Website language', 'ওয়েবসাইটের ভাষা')}><button type="button" aria-pressed={language === 'bn'} onClick={() => setLanguage('bn')} lang="bn">বাংলা</button><button type="button" aria-pressed={language === 'en'} onClick={() => setLanguage('en')} lang="en">EN</button></div>;
}
