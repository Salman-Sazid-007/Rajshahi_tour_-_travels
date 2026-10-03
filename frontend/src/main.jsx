import './lib/fonts.css';
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './index.css';
import { LanguageProvider } from './lib/i18n';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <LanguageProvider defaultLanguage="bn"><App /></LanguageProvider>
  </React.StrictMode>
);
