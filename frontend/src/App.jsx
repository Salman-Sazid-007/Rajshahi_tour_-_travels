import React, { lazy, Suspense, useEffect, useState } from 'react';
import PublicWebsite from './components/PublicWebsite';
const AdminDashboard = lazy(() => import('./components/AdminDashboard'));
import StaffLoginModal from './components/StaffLoginModal';
import FeedbackModal from './components/FeedbackModal';
import { apiFetch } from './lib/api';
import { useI18n, localizeData } from './lib/i18n';
import PageLoader from './components/PageLoader';
import useScrollReveal from './lib/useScrollReveal';

export default function App() {
  const { language, t } = useI18n();
  useScrollReveal();
  const [viewMode, setViewMode] = useState(() => {
    if (window.location.pathname.startsWith('/admin')) return 'admin';
    return 'public';
  });
  const [publicPayload, setPublicPayload] = useState(null);
  const [publicLoadError, setPublicLoadError] = useState(false);
  const [loginModalOpen, setLoginModalOpen] = useState(() => new URLSearchParams(window.location.search).has('staff'));
  const [feedbackBookingId, setFeedbackBookingId] = useState(() => {
    const match = window.location.pathname.match(/^\/feedback\/([^/]+)/);
    return match ? match[1] : null;
  });
  const [currentUser, setCurrentUser] = useState(null);

  const loadPublicHome = () => {
    setPublicLoadError(false);
    apiFetch('/api/public/bootstrap')
      .then((res) => setPublicPayload(res))
      .catch((err) => {
        console.error('Failed to load public home:', err);
        setPublicLoadError(true);
      });
  };

  useEffect(() => {
    apiFetch('/api/auth/me').then((res) => { if (res.user) { setCurrentUser(res.user); if (new URLSearchParams(window.location.search).has('staff')) { setViewMode('admin'); setLoginModalOpen(false); } } }).catch(() => {});
    loadPublicHome();
  }, []);

  const handleLoginSuccess = (user) => {
    if (user) setCurrentUser(user);
    setLoginModalOpen(false);
    setViewMode('admin');
  };

  const handleQuickRoleSwitch = async (roleKey) => {
    try {
      const res = await apiFetch('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ phoneOrRole: roleKey, password: 'demo' }),
      });
      if (res.token) {
        localStorage.setItem('rtt_token', res.token);
      }
      if (res.user) {
        setCurrentUser(res.user);
      }
      setViewMode('admin');
    } catch (err) {
      console.error('Role switch failed:', err);
    }
  };

  return (
    <div className="min-h-screen flex flex-col">
      {viewMode === 'admin' && currentUser ? (
        <Suspense fallback={<PageLoader message={t("Loading staff dashboard…", "ড্যাশবোর্ড লোড হচ্ছে…")} fullScreen />}><AdminDashboard
          currentUser={currentUser}
          onSwitchRole={handleQuickRoleSwitch}
          onBackToWebsite={() => {
            loadPublicHome();
            setViewMode('public');
          }}
          onOpenFeedbackPreview={(bookingId) =>
            setFeedbackBookingId(bookingId || 'bkg-israt-sylhet')
          }
          onRefreshPublic={loadPublicHome}
        /></Suspense>
      ) : (
        <PublicWebsite
          data={localizeData(publicPayload, language)}
          loadError={publicLoadError}
          onRetryLoad={loadPublicHome}
          currentUser={currentUser}
          onRefresh={loadPublicHome}
          onOpenLogin={() => setLoginModalOpen(true)}
          onOpenDashboard={() => setViewMode('admin')}
          onOpenFeedback={(bookingId) =>
            setFeedbackBookingId(bookingId || 'bkg-israt-sylhet')
          }
        />
      )}

      {loginModalOpen && (
        <StaffLoginModal
          onClose={() => setLoginModalOpen(false)}
          onLoginSuccess={handleLoginSuccess}
        />
      )}

      {feedbackBookingId && (
        <FeedbackModal
          bookingId={feedbackBookingId}
          onClose={() => setFeedbackBookingId(null)}
          onSubmitted={() => {
            loadPublicHome();
          }}
        />
      )}
    </div>
  );
}
