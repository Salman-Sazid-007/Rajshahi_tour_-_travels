import React from 'react';
import { ArrowRight, BusFront, MapPin, Sparkles } from 'lucide-react';
import AgencyLogo from './AgencyLogo';
import './page-loader.css';

export default function PageLoader({
  message,
  fullScreen = true,
  errorMessage = '',
  onRetry,
  retryLabel = 'Try again',
  linkHref,
  linkLabel,
  className = '',
}) {
  return (
    <main
      className={`rtt-page-loader ${fullScreen ? 'is-fullscreen' : 'is-inline'} ${className}`.trim()}
      role="status"
      aria-live="polite"
    >
      <div className="rtt-loader-brand">
        <AgencyLogo compact />
      </div>
      <div className="rtt-loader-scene" aria-hidden="true">
        <span className="rtt-loader-route" />
        <span className="rtt-loader-pin rtt-loader-pin-start"><MapPin size={18} /></span>
        <span className="rtt-loader-pin rtt-loader-pin-end"><Sparkles size={17} /></span>
        <span className="rtt-loader-bus"><BusFront size={26} /></span>
        <span className="rtt-loader-wheel rtt-loader-wheel-one" />
        <span className="rtt-loader-wheel rtt-loader-wheel-two" />
      </div>
      <p className="rtt-loader-message">{message || 'Getting your next journey ready…'}</p>
      {errorMessage && <p className="rtt-loader-error" role="alert">{errorMessage}</p>}
      {onRetry && (
        <button type="button" className="rtt-loader-retry" onClick={onRetry}>
          {retryLabel}<ArrowRight size={16} aria-hidden="true" />
        </button>
      )}
      {linkHref && linkLabel && (
        <a className="rtt-loader-link" href={linkHref}>
          {linkLabel}<ArrowRight size={15} aria-hidden="true" />
        </a>
      )}
    </main>
  );
}
