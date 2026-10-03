import '../lib/fonts.css';
import React from 'react';
import ReactDOM from 'react-dom/client';
import ProApp from './ProApp.jsx';
import './pro.css';
import { LanguageProvider } from '../lib/i18n';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <LanguageProvider defaultLanguage="en"><ProApp /></LanguageProvider>
  </React.StrictMode>
);
