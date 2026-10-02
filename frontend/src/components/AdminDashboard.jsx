import React, { useState } from 'react';
import {
  Briefcase,
  Calculator,
  Calendar,
  Compass,
  Globe,
  HelpCircle,
  LayoutDashboard,
  LogOut,
  MessageSquare,
  PhoneCall,
  Shield,
  Users,
  Utensils,
} from 'lucide-react';
import DashboardHomeTab from './admin/DashboardHomeTab';
import ToursBuilderTab from './admin/ToursBuilderTab';
import BookingsTab from './admin/BookingsTab';
import { CustomersCRMView, InquiriesView } from './admin/InquiriesCRMTab';
import { AccountingView, SmsPanelView } from './admin/SmsAccountingTab';
import {
  MealMenusView,
  NetworkContactsView,
  TeamGuidesView,
  WebsiteControlView,
} from './admin/OperationsCmsTab';

const NAV_ITEMS = [
  { id: 'dashboard', label: 'ড্যাশবোর্ড ও রানিং ট্যুর', icon: LayoutDashboard, roles: ['owner', 'accountant', 'guide'] },
  { id: 'tours', label: 'ট্যুর ও বাজেট প্ল্যানার', icon: Compass, roles: ['owner', 'accountant', 'guide'] },
  { id: 'bookings', label: 'যাত্রী বুকিং ও পেমেন্ট', icon: Calendar, roles: ['owner', 'accountant', 'guide'] },
  { id: 'inquiries', label: 'বুকিং কুয়েরি (ওয়েবসাইট)', icon: HelpCircle, roles: ['owner', 'accountant', 'guide'] },
  { id: 'customers', label: 'কাস্টমারস সিআরএম (CRM)', icon: Users, roles: ['owner', 'accountant'] },
  { id: 'sms', label: 'এসএমএস প্যানেল (SMS)', icon: MessageSquare, roles: ['owner', 'accountant', 'guide'] },
  { id: 'accounting', label: 'একাউন্টিং ও মাসিক হিসাব', icon: Calculator, roles: ['owner', 'accountant'] },
  { id: 'meals', label: 'মিল মেনুস (খাবার খরচ)', icon: Utensils, roles: ['owner', 'accountant', 'guide'] },
  { id: 'network', label: 'নেটওয়ার্ক কন্টাক্টস', icon: PhoneCall, roles: ['owner', 'accountant', 'guide'] },
  { id: 'cms', label: 'ওয়েবসাইট কন্ট্রোল (CMS)', icon: Globe, roles: ['owner'] },
  { id: 'team', label: 'টিম ও গাইড হিস্ট্রি', icon: Shield, roles: ['owner', 'accountant'] },
];

export default function AdminDashboard({
  currentUser,
  onSwitchRole,
  onBackToWebsite,
  onOpenFeedbackPreview,
  onRefreshPublic,
}) {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [selectedTourId, setSelectedTourId] = useState('tour-sylhet-oct');
  const [toast, setToast] = useState(null);

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 4000);
  };

  const handleOpenTourBookings = (tourId) => {
    setSelectedTourId(tourId);
    setActiveTab('bookings');
  };

  const userRole = currentUser?.role || 'owner';

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900 flex flex-col lg:flex-row">
      {/* Left Sidebar Navigation */}
      <aside className="w-full lg:w-72 bg-emerald-950 text-white shrink-0 flex flex-col justify-between no-print">
        <div>
          {/* Brand Header */}
          <div className="p-5 border-b border-emerald-900 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-amber-400 text-slate-950 font-black text-lg shadow">
                রা
              </div>
              <div>
                <div className="font-black text-base text-white leading-tight">
                  রাজশাহী ট্যুরস
                </div>
                <div className="text-[11px] text-amber-300 font-semibold">
                  ম্যানেজমেন্ট সিস্টেম v2.5
                </div>
              </div>
            </div>
            <button
              onClick={onBackToWebsite}
              className="lg:hidden rounded-xl bg-emerald-800 px-3 py-1.5 text-xs font-bold text-amber-300"
            >
              ওয়েবসাইট →
            </button>
          </div>

          {/* Active Staff Role Switcher (Demo & RBAC) */}
          <div className="px-4 py-3.5 bg-emerald-900/60 border-b border-emerald-900">
            <div className="text-[11px] font-bold text-emerald-300 uppercase tracking-wider mb-1.5">
              লগইনকৃত স্টাফ একাউন্ট:
            </div>
            <div className="font-extrabold text-sm text-white">
              {currentUser?.name || 'সালমান সাজিদ (মালিক)'}
            </div>
            <div className="text-xs text-amber-300 font-bold mt-0.5">
              রোল: {currentUser?.roleLabelBn || 'মালিক / এডমিন'}
            </div>

            <div className="mt-2.5 flex gap-1">
              {[
                { role: 'owner', label: 'মালিক' },
                { role: 'accountant', label: 'একাউন্ট্যান্ট' },
                { role: 'guide', label: 'ট্যুর গাইড' },
              ].map((r) => (
                <button
                  key={r.role}
                  onClick={() => onSwitchRole(r.role)}
                  className={`flex-1 rounded-lg py-1 text-[11px] font-bold transition ${
                    userRole === r.role
                      ? 'bg-amber-400 text-slate-950 shadow'
                      : 'bg-emerald-950/60 text-emerald-200 hover:bg-emerald-800'
                  }`}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>

          {/* Navigation Menu */}
          <nav className="p-3 flex lg:flex-col gap-1 overflow-x-auto">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const isAllowed = item.roles.includes(userRole);
              const active = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id)}
                  className={`flex items-center justify-between gap-2.5 rounded-2xl px-3.5 py-2.5 text-xs font-bold whitespace-nowrap transition ${
                    active
                      ? 'bg-amber-400 text-slate-950 shadow-md font-black'
                      : 'text-emerald-100 hover:bg-emerald-900/80'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <Icon className={`h-4 w-4 shrink-0 ${active ? 'text-slate-950' : 'text-amber-300'}`} />
                    <span>{item.label}</span>
                  </div>
                  {!isAllowed && (
                    <span className="rounded bg-emerald-900 px-1.5 py-0.5 text-[9px] text-amber-300">
                      মালিক
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Bottom Back to Public Website */}
        <div className="hidden lg:block p-4 border-t border-emerald-900 space-y-2">
          <button
            onClick={onBackToWebsite}
            className="w-full flex items-center justify-center gap-2 rounded-2xl bg-emerald-800 hover:bg-emerald-700 py-3 text-xs font-extrabold text-white transition shadow"
          >
            <Globe className="h-4 w-4 text-amber-300" />
            পাবলিক ওয়েবসাইটে ফিরে যান
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Bar */}
        <header className="bg-white border-b border-slate-200 px-6 py-3.5 flex flex-wrap items-center justify-between gap-3 no-print">
          <div>
            <h2 className="text-lg font-black text-slate-900">
              {NAV_ITEMS.find((i) => i.id === activeTab)?.label}
            </h2>
            <p className="text-xs text-slate-500">
              রাজশাহী ট্যুরস এন্ড ট্রাভেলস • সাহেব বাজার জিরো পয়েন্ট ও সপুরা মোড়, রাজশাহী
            </p>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              onClick={() => onOpenFeedbackPreview('bkg-israt-sylhet')}
              className="rounded-xl bg-amber-50 hover:bg-amber-100 border border-amber-200 px-3.5 py-2 text-xs font-bold text-amber-950 transition"
            >
              ★ কাস্টমার ফিডব্যাক পেজ প্রিভিউ
            </button>
            <button
              onClick={onBackToWebsite}
              className="rounded-xl bg-slate-900 hover:bg-slate-800 px-4 py-2 text-xs font-bold text-white transition"
            >
              পাবলিক ওয়েবসাইট দেখুন
            </button>
          </div>
        </header>

        {/* Toast Notification */}
        {toast && (
          <div className="mx-6 mt-4 rounded-2xl bg-emerald-900 text-white px-5 py-3 text-xs sm:text-sm font-bold shadow-lg flex items-center justify-between no-print">
            <span>✅ {toast}</span>
            <button onClick={() => setToast(null)} className="text-amber-300 font-black ml-4">
              ✕
            </button>
          </div>
        )}

        {/* Active Module Content */}
        <main className="p-4 sm:p-6 flex-1 overflow-y-auto">
          {activeTab === 'dashboard' && (
            <DashboardHomeTab
              onNavigateTab={setActiveTab}
              onOpenTourBookings={handleOpenTourBookings}
              showToast={showToast}
            />
          )}
          {activeTab === 'tours' && (
            <ToursBuilderTab
              onOpenTourBookings={handleOpenTourBookings}
              showToast={showToast}
            />
          )}
          {activeTab === 'bookings' && (
            <BookingsTab
              initialTourId={selectedTourId}
              onOpenFeedbackPreview={onOpenFeedbackPreview}
              showToast={showToast}
            />
          )}
          {activeTab === 'inquiries' && (
            <InquiriesView
              onNavigateTab={setActiveTab}
              showToast={showToast}
            />
          )}
          {activeTab === 'customers' && (
            <CustomersCRMView onNavigateTab={setActiveTab} showToast={showToast} />
          )}
          {activeTab === 'sms' && <SmsPanelView showToast={showToast} />}
          {activeTab === 'accounting' && <AccountingView showToast={showToast} />}
          {activeTab === 'meals' && <MealMenusView showToast={showToast} />}
          {activeTab === 'network' && <NetworkContactsView showToast={showToast} />}
          {activeTab === 'cms' && (
            <WebsiteControlView showToast={showToast} onRefreshPublic={onRefreshPublic} />
          )}
          {activeTab === 'team' && <TeamGuidesView showToast={showToast} />}
        </main>
      </div>
    </div>
  );
}
