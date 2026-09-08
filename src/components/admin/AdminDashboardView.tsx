'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  LayoutDashboard,
  Film,
  Layers,
  Radio,
  FolderUp,
  Subtitles,
  Users,
  MessageSquare,
  LayoutGrid,
  Settings,
  Shield,
  ExternalLink,
  CheckCircle2,
  AlertCircle,
  Menu,
  X,
  ChevronLeft,
  Loader2,
  KeyRound,
  ArrowRight,
  Sparkles,
  LogOut,
} from 'lucide-react';

import type { AdminSeriesDTO } from './cms/shared';
import { AdminDashboardOverview } from './views/AdminDashboardOverview';
import { AdminSeriesView } from './views/AdminSeriesView';
import { AdminSeasonsView } from './views/AdminSeasonsView';
import { AdminEpisodesView } from './views/AdminEpisodesView';
import { AdminMediaView } from './views/AdminMediaView';
import { AdminTranscriptsView } from './views/AdminTranscriptsView';
import { AdminCommentsView } from './views/AdminCommentsView';
import { AdminSettingsView } from './views/AdminSettingsView';
import { UsersPanel } from './operations/UsersPanel';
import { EntitlementsPanel } from './operations/EntitlementsPanel';
import { HomepagePanel } from './operations/HomepagePanel';
import { AdminUserDTO } from './operations/types';

export type AdminSection =
  | 'dashboard'
  | 'series'
  | 'seasons'
  | 'episodes'
  | 'media'
  | 'transcripts'
  | 'users'
  | 'entitlements'
  | 'comments'
  | 'homepage'
  | 'settings';

interface FunnelStep {
  stage: string;
  count: number;
  percent: number;
}

interface Totals {
  paidPurchases: number;
  activeSubs: number;
  totalUsers: number;
  totalRevenueUsd: number;
  periodDays: number;
}

interface AuditActor {
  displayName: string | null;
  email: string | null;
  role: string | null;
}

interface AuditLogItem {
  _id: string;
  action: string;
  targetEntity: string;
  entityId: string;
  createdAt: string;
  actor: AuditActor | null;
}

interface NavGroup {
  title: string;
  items: {
    id: AdminSection;
    label: string;
    icon: React.ElementType;
    badge?: string;
  }[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    title: 'مسار الإنتاج والمحتوى',
    items: [
      { id: 'series', label: 'المسلسلات (استوديو العمل)', icon: Film },
      { id: 'seasons', label: 'المواسم والتسعير', icon: Layers },
      { id: 'episodes', label: 'الحلقات والصوتيات', icon: Radio },
      { id: 'transcripts', label: 'النصوص المتزامنة', icon: Subtitles },
      { id: 'media', label: 'مستودع الوسائط (R2)', icon: FolderUp },
    ],
  },
  {
    title: 'المجتمع والعمليات',
    items: [
      { id: 'users', label: 'المستخدمون والاستحقاقات', icon: Users },
      { id: 'comments', label: 'إشراف التعليقات', icon: MessageSquare },
      { id: 'homepage', label: 'أقسام الواجهة الرئيسية', icon: LayoutGrid },
    ],
  },
  {
    title: 'المنظومة والنظام',
    items: [
      { id: 'dashboard', label: 'لوحة القيادة والتحليلات', icon: LayoutDashboard },
      { id: 'settings', label: 'الأسعار والبنية التحتية', icon: Settings },
    ],
  },
];

export const AdminDashboardView: React.FC = () => {
  const [activeSection, setActiveSection] = useState<AdminSection>('series');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Content Data
  const [seriesList, setSeriesList] = useState<AdminSeriesDTO[]>([]);
  const [totals, setTotals] = useState<Totals | null>(null);
  const [funnel, setFunnel] = useState<FunnelStep[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Selection state for cross-navigation (Flow: Series -> Seasons -> Episodes -> Transcripts)
  const [navSeriesId, setNavSeriesId] = useState<string | null>(null);
  const [navSeasonId, setNavSeasonId] = useState<string | null>(null);
  const [navEpisodeId, setNavEpisodeId] = useState<string | null>(null);
  const [selectedUserForEntitlements, setSelectedUserForEntitlements] =
    useState<AdminUserDTO | null>(null);

  // Toast / Notices
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

  const showNotice = useCallback((type: 'success' | 'error', msg: string) => {
    setNotice({ type, msg });
    setTimeout(() => setNotice(null), 4000);
  }, []);

  // Fetch initial admin data
  const fetchData = useCallback(async () => {
    try {
      const [contentRes, analyticsRes, auditRes] = await Promise.all([
        fetch('/api/v1/admin/content', { cache: 'no-store' }).then((r) => r.json()).catch(() => null),
        fetch('/api/v1/admin/analytics', { cache: 'no-store' }).then((r) => r.json()).catch(() => null),
        fetch('/api/v1/admin/audit-log?limit=50', { cache: 'no-store' }).then((r) => r.json()).catch(() => null),
      ]);

      if (contentRes?.series) setSeriesList(contentRes.series);
      if (analyticsRes?.totals) setTotals(analyticsRes.totals);
      if (analyticsRes?.funnel) setFunnel(analyticsRes.funnel);
      if (auditRes?.logs) setAuditLogs(auditRes.logs);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Seamless navigation handlers
  const handleManageSeasons = (seriesId: string) => {
    setNavSeriesId(seriesId);
    setActiveSection('seasons');
  };

  const handleManageEpisodes = (seriesId: string, seasonId: string) => {
    setNavSeriesId(seriesId);
    setNavSeasonId(seasonId);
    setActiveSection('episodes');
  };

  const handleManageTranscript = (seriesId: string, seasonId: string, episodeId: string) => {
    setNavSeriesId(seriesId);
    setNavSeasonId(seasonId);
    setNavEpisodeId(episodeId);
    setActiveSection('transcripts');
  };

  const handleSelectUserFromUsersList = (user: AdminUserDTO) => {
    setSelectedUserForEntitlements(user);
    setActiveSection('entitlements');
    showNotice('success', `تم تحديد المستخدم "${user.displayName}" لإدارة استحقاقاته`);
  };

  // Active Series helper for Pipeline breadcrumb
  const currentNavSeries = seriesList.find((s) => s._id === navSeriesId);
  const isContentPipelineSection = ['series', 'seasons', 'episodes', 'transcripts', 'media'].includes(
    activeSection
  );

  return (
    <div className="min-h-screen bg-obsidian text-editorial-ivory font-ui flex flex-col antialiased">
      {/* Top Navbar */}
      <header className="h-16 border-b border-border-subtle bg-surface/90 backdrop-blur-md sticky top-0 z-40 px-4 sm:px-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            className="lg:hidden p-2 text-editorial-secondary hover:text-editorial-ivory rounded-lg bg-surface-elevated"
            aria-label="القائمة"
          >
            {isMobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>

          <Link href="/admin" className="flex items-center gap-2">
            <span className="w-8 h-8 rounded-lg bg-crimson flex items-center justify-center text-white font-black font-display text-base shadow-halo">
              يـ
            </span>
            <div>
              <h1 className="text-sm font-black font-display text-editorial-ivory leading-tight">
                يُتبع... <span className="text-crimson font-ui text-[11px] font-bold">إدارة المحتوى</span>
              </h1>
              <p className="text-[10px] text-editorial-muted">لوحة التحكم والتوزيع المركزية</p>
            </div>
          </Link>
        </div>

        {/* Global Action / Notice */}
        <div className="flex items-center gap-3">
          {notice && (
            <div
              role="status"
              className={`hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-semibold animate-fade-in ${
                notice.type === 'success'
                  ? 'bg-crimson-subtle border-crimson/40 text-crimson'
                  : 'bg-red-950/50 border-red-800 text-red-300'
              }`}
            >
              {notice.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4" />
              ) : (
                <AlertCircle className="w-4 h-4" />
              )}
              <span>{notice.msg}</span>
            </div>
          )}

          <Link
            href="https://yotba.vercel.app"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-3 py-1.5 bg-surface-elevated hover:bg-border-subtle text-editorial-secondary hover:text-editorial-ivory text-xs rounded-lg transition-colors border border-border-subtle"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">المنصة العامة (yotba.vercel.app)</span>
          </Link>

          <button
            type="button"
            onClick={async () => {
              try {
                await fetch('/api/v1/admin/auth/logout', { method: 'POST' });
              } finally {
                window.location.href = '/login';
              }
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-red-950/40 hover:bg-red-900/60 text-red-300 hover:text-red-100 text-xs rounded-lg transition-colors border border-red-800/40"
            title="تسجيل الخروج من لوحة التحكم"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">خروج</span>
          </button>
        </div>
      </header>

      {/* Main Layout (Sidebar + Content Stage) */}
      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar Desktop */}
        <aside className="w-64 border-l border-border-subtle bg-surface/50 hidden lg:flex flex-col shrink-0 overflow-y-auto">
          <div className="p-4 border-b border-border-subtle/50 flex items-center gap-2 text-xs font-bold text-editorial-muted">
            <Shield className="w-4 h-4 text-crimson" />
            <span>نظام إدارة المحتوى CMS</span>
          </div>

          <div className="p-3 space-y-6">
            {NAV_GROUPS.map((group) => (
              <div key={group.title} className="space-y-1">
                <div className="px-3 text-[10px] font-bold uppercase tracking-wider text-editorial-muted">
                  {group.title}
                </div>
                <nav className="space-y-0.5" aria-label={group.title}>
                  {group.items.map((item) => {
                    const Icon = item.icon;
                    const isActive =
                      activeSection === item.id ||
                      (item.id === 'users' && activeSection === 'entitlements');

                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => setActiveSection(item.id)}
                        className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-semibold transition-all text-right ${
                          isActive
                            ? 'bg-crimson text-white shadow-halo font-bold'
                            : 'text-editorial-secondary hover:text-editorial-ivory hover:bg-surface-elevated'
                        }`}
                      >
                        <Icon
                          className={`w-4 h-4 shrink-0 ${
                            isActive ? 'text-white' : 'text-editorial-muted'
                          }`}
                        />
                        <span className="truncate flex-1">{item.label}</span>
                        {isActive && <ChevronLeft className="w-3.5 h-3.5 shrink-0 opacity-70" />}
                      </button>
                    );
                  })}
                </nav>
              </div>
            ))}
          </div>
        </aside>

        {/* Mobile Navigation Drawer */}
        {isMobileMenuOpen && (
          <div className="lg:hidden fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex">
            <div className="w-4/5 max-w-xs bg-surface border-l border-border-subtle h-full flex flex-col p-4 space-y-4 overflow-y-auto animate-fade-in text-right">
              <div className="flex items-center justify-between border-b border-border-subtle pb-3">
                <span className="text-xs font-bold text-editorial-ivory">أقسام لوحة التحكم</span>
                <button
                  type="button"
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="p-1 text-editorial-muted hover:text-editorial-ivory"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-5">
                {NAV_GROUPS.map((group) => (
                  <div key={group.title} className="space-y-1">
                    <div className="px-2 text-[10px] font-bold text-editorial-muted">
                      {group.title}
                    </div>
                    <nav className="space-y-1">
                      {group.items.map((item) => {
                        const Icon = item.icon;
                        const isActive =
                          activeSection === item.id ||
                          (item.id === 'users' && activeSection === 'entitlements');

                        return (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => {
                              setActiveSection(item.id);
                              setIsMobileMenuOpen(false);
                            }}
                            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-xs font-semibold text-right ${
                              isActive
                                ? 'bg-crimson text-white font-bold'
                                : 'text-editorial-secondary hover:text-editorial-ivory hover:bg-surface-elevated'
                            }`}
                          >
                            <Icon className="w-4 h-4 shrink-0" />
                            <span>{item.label}</span>
                          </button>
                        );
                      })}
                    </nav>
                  </div>
                ))}
              </div>
            </div>
            <div className="flex-1" onClick={() => setIsMobileMenuOpen(false)} />
          </div>
        )}

        {/* Main Content Workspace */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 bg-obsidian">
          <div className="max-w-7xl mx-auto space-y-6">
            {/* Step-by-step Content Pipeline Bar */}
            {isContentPipelineSection && (
              <div className="bg-surface/60 border border-border-subtle rounded-xl p-3.5 flex flex-col md:flex-row items-start md:items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-2 text-editorial-muted">
                  <span className="font-bold text-editorial-ivory">مسار النشر المتسلسل:</span>
                  {currentNavSeries && (
                    <span className="bg-crimson/15 text-crimson px-2 py-0.5 rounded font-bold">
                      {currentNavSeries.title}
                    </span>
                  )}
                </div>

                {/* Pipeline Steps Buttons */}
                <div className="flex items-center gap-1 overflow-x-auto w-full md:w-auto pb-1 md:pb-0">
                  <button
                    type="button"
                    onClick={() => setActiveSection('series')}
                    className={`px-2.5 py-1 rounded-lg transition-colors whitespace-nowrap ${
                      activeSection === 'series'
                        ? 'bg-crimson text-white font-bold'
                        : 'bg-surface-elevated text-editorial-secondary hover:text-editorial-ivory'
                    }`}
                  >
                    1. المسلسل والبوسترات
                  </button>
                  <span className="text-editorial-muted">➔</span>
                  <button
                    type="button"
                    onClick={() => setActiveSection('seasons')}
                    className={`px-2.5 py-1 rounded-lg transition-colors whitespace-nowrap ${
                      activeSection === 'seasons'
                        ? 'bg-crimson text-white font-bold'
                        : 'bg-surface-elevated text-editorial-secondary hover:text-editorial-ivory'
                    }`}
                  >
                    2. المواسم
                  </button>
                  <span className="text-editorial-muted">➔</span>
                  <button
                    type="button"
                    onClick={() => setActiveSection('episodes')}
                    className={`px-2.5 py-1 rounded-lg transition-colors whitespace-nowrap ${
                      activeSection === 'episodes'
                        ? 'bg-crimson text-white font-bold'
                        : 'bg-surface-elevated text-editorial-secondary hover:text-editorial-ivory'
                    }`}
                  >
                    3. الحلقات والصوتيات
                  </button>
                  <span className="text-editorial-muted">➔</span>
                  <button
                    type="button"
                    onClick={() => setActiveSection('transcripts')}
                    className={`px-2.5 py-1 rounded-lg transition-colors whitespace-nowrap ${
                      activeSection === 'transcripts'
                        ? 'bg-crimson text-white font-bold'
                        : 'bg-surface-elevated text-editorial-secondary hover:text-editorial-ivory'
                    }`}
                  >
                    4. النصوص المتزامنة
                  </button>
                </div>
              </div>
            )}

            {isLoading ? (
              <div className="py-32 flex flex-col items-center justify-center gap-3">
                <Loader2 className="w-8 h-8 animate-spin text-crimson" />
                <p className="text-xs text-editorial-muted">جارٍ تحميل بيانات لوحة الإدارة...</p>
              </div>
            ) : (
              <>
                {/* 1. Dashboard Overview */}
                {activeSection === 'dashboard' && (
                  <AdminDashboardOverview
                    seriesList={seriesList}
                    totals={totals}
                    funnel={funnel}
                    auditLogs={auditLogs}
                    onNavigate={(sec) => setActiveSection(sec as AdminSection)}
                  />
                )}

                {/* 2. Series Catalog */}
                {activeSection === 'series' && (
                  <AdminSeriesView
                    seriesList={seriesList}
                    initialSeriesId={navSeriesId}
                    initialSeasonId={navSeasonId}
                    initialEpisodeId={navEpisodeId}
                    onRefresh={fetchData}
                    showNotice={showNotice}
                    onManageSeasons={handleManageSeasons}
                  />
                )}

                {/* 3. Seasons Manager */}
                {activeSection === 'seasons' && (
                  <AdminSeasonsView
                    seriesList={seriesList}
                    initialSeriesId={navSeriesId}
                    onRefresh={fetchData}
                    showNotice={showNotice}
                    onManageEpisodes={handleManageEpisodes}
                  />
                )}

                {/* 4. Episodes & Audio Manager */}
                {activeSection === 'episodes' && (
                  <AdminEpisodesView
                    seriesList={seriesList}
                    initialSeriesId={navSeriesId}
                    initialSeasonId={navSeasonId}
                    onRefresh={fetchData}
                    showNotice={showNotice}
                    onManageTranscript={handleManageTranscript}
                  />
                )}

                {/* 5. Cloudflare R2 Media Stage */}
                {activeSection === 'media' && <AdminMediaView showNotice={showNotice} />}

                {/* 6. Transcripts Sync Editor */}
                {activeSection === 'transcripts' && (
                  <AdminTranscriptsView
                    seriesList={seriesList}
                    initialSeriesId={navSeriesId}
                    initialSeasonId={navSeasonId}
                    initialEpisodeId={navEpisodeId}
                    onRefresh={fetchData}
                    showNotice={showNotice}
                  />
                )}

                {/* 7. Users Lifecycle */}
                {activeSection === 'users' && (
                  <div className="space-y-6">
                    <UsersPanel
                      onSelectUserForEntitlements={handleSelectUserFromUsersList}
                      onNotice={showNotice}
                    />
                  </div>
                )}

                {/* 7b. User Entitlements */}
                {activeSection === 'entitlements' && (
                  <div className="space-y-6">
                    <div className="flex items-center justify-between border-b border-border-subtle pb-4">
                      <div className="flex items-center gap-2">
                        <KeyRound className="w-5 h-5 text-crimson" />
                        <h2 className="text-xl font-black font-display text-editorial-ivory">
                          إدارة استحقاقات المستخدمين
                        </h2>
                      </div>
                      <button
                        type="button"
                        onClick={() => setActiveSection('users')}
                        className="text-xs text-editorial-secondary hover:text-editorial-ivory underline"
                      >
                        العودة لقائمة المستخدمين
                      </button>
                    </div>
                    <EntitlementsPanel
                      selectedUser={selectedUserForEntitlements}
                      onNotice={showNotice}
                    />
                  </div>
                )}

                {/* 8. Comments Moderation */}
                {activeSection === 'comments' && <AdminCommentsView onNotice={showNotice} />}

                {/* 9. Homepage Sections */}
                {activeSection === 'homepage' && (
                  <div className="space-y-6">
                    <div className="border-b border-border-subtle pb-4">
                      <h2 className="text-xl font-black font-display text-editorial-ivory flex items-center gap-2">
                        <LayoutGrid className="w-5 h-5 text-crimson" />
                        أقسام الصفحة الرئيسية
                      </h2>
                      <p className="text-xs text-editorial-secondary mt-1">
                        ترتيب وجدولة أقسام الواجهة الرئيسية وضبط قواعد التغذية الذكية
                      </p>
                    </div>
                    <HomepagePanel onNotice={showNotice} />
                  </div>
                )}

                {/* 10. Platform Settings & Health */}
                {activeSection === 'settings' && <AdminSettingsView onNotice={showNotice} />}
              </>
            )}
          </div>
        </main>
      </div>
    </div>
  );
};
