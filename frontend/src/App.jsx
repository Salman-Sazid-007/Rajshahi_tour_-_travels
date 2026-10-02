import React, { useEffect, useState } from 'react';
import PublicWebsite from './components/PublicWebsite';
import AdminDashboard from './components/AdminDashboard';
import StaffLoginModal from './components/StaffLoginModal';
import FeedbackModal from './components/FeedbackModal';
import { apiFetch } from './lib/api';

export default function App() {
  const [viewMode, setViewMode] = useState(() => {
    if (window.location.pathname.startsWith('/admin')) return 'admin';
    return 'public';
  });
  const [publicPayload, setPublicPayload] = useState(null);
  const [loginModalOpen, setLoginModalOpen] = useState(false);
  const [feedbackBookingId, setFeedbackBookingId] = useState(() => {
    const match = window.location.pathname.match(/^\/feedback\/([^/]+)/);
    return match ? match[1] : null;
  });
  const [currentUser, setCurrentUser] = useState({
    id: 'usr-owner-1',
    name: 'সালমান সাজিদ (মালিক)',
    role: 'owner',
    roleLabelBn: 'মালিক / এডমিন',
    phone: '01711000001',
  });

  const loadPublicHome = () => {
    apiFetch('/api/public/bootstrap')
      .then((res) => setPublicPayload(res))
      .catch((err) => console.error('Failed to load public home:', err));
  };

  useEffect(() => {
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
      {viewMode === 'admin' ? (
        <AdminDashboard
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
        />
      ) : (
        <PublicWebsite
          data={publicPayload}
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
