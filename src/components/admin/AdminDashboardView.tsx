'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
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
  RefreshCw,
  KeyRound,
  LogOut,
  Tags,
} from 'lucide-react';

import type { AdminSeriesDTO } from './cms/shared';
import { AdminDashboardOverview } from './views/AdminDashboardOverview';
import { AdminSeriesView } from './views/AdminSeriesView';
import AdminCategoriesView from './views/AdminCategoriesView';
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
import { resolvePublicPlatformUrl } from '@/lib/config/public-platform';

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
  | 'settings'
  | 'categories';

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
    title: 'المحتوى',
    items: [
      { id: 'series', label: 'المسلسلات', icon: Film },
      { id: 'seasons', label: 'المواسم', icon: Layers },
      { id: 'episodes', label: 'الحلقات والصوت', icon: Radio },
      { id: 'transcripts', label: 'النصوص', icon: Subtitles },
      { id: 'media', label: 'الوسائط', icon: FolderUp },
      { id: 'categories', label: 'التصنيفات', icon: Tags },
    ],
  },
  {
    title: 'التشغيل',
    items: [
      { id: 'users', label: 'المستخدمون', icon: Users },
      { id: 'comments', label: 'التعليقات', icon: MessageSquare },
      { id: 'homepage', label: 'الصفحة الرئيسية', icon: LayoutGrid },
    ],
  },
  {
    title: 'النظام',
    items: [
      { id: 'dashboard', label: 'نظرة عامة', icon: LayoutDashboard },
      { id: 'settings', label: 'الإعدادات', icon: Settings },
    ],
  },
];

export const AdminDashboardView: React.FC = () => {
  const router = useRouter();
  const [activeSection, setActiveSection] = useState<AdminSection>('series');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Content Data
  const [seriesList, setSeriesList] = useState<AdminSeriesDTO[]>([]);
  const [totals, setTotals] = useState<Totals | null>(null);
  const [funnel, setFunnel] = useState<FunnelStep[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [dataError, setDataError] = useState<string | null>(null);

  // Selection state for cross-navigation (Flow: Series -> Seasons -> Episodes -> Transcripts)
  const [navSeriesId, setNavSeriesId] = useState<string | null>(null);
  const [navSeasonId, setNavSeasonId] = useState<string | null>(null);
  const [navEpisodeId, setNavEpisodeId] = useState<string | null>(null);
  const [selectedUserForEntitlements, setSelectedUserForEntitlements] =
    useState<AdminUserDTO | null>(null);

  // Toast / Notices
  const [notice, setNotice] = useState<{
    type: 'success' | 'error';
    msg: string;
  } | null>(null);

  const showNotice = useCallback((type: 'success' | 'error', msg: string) => {
    setNotice({ type, msg });
    setTimeout(() => setNotice(null), 4000);
  }, []);

  useEffect(() => {
    if (!isMobileMenuOpen) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;
    const drawer = document.getElementById('admin-mobile-navigation');
    const focusableSelector =
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
    const focusable = drawer
      ? Array.from(drawer.querySelectorAll<HTMLElement>(focusableSelector))
      : [];
    const focusTimer = window.setTimeout(() => focusable[0]?.focus(), 0);

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setIsMobileMenuOpen(false);
        return;
      }
      if (event.key === 'Tab' && focusable.length > 0) {
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.clearTimeout(focusTimer);
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
      previouslyFocused?.focus?.();
    };
  }, [isMobileMenuOpen]);

  // Fetch initial admin data
  const fetchData = useCallback(async () => {
    setIsRefreshing(true);
    setDataError(null);

    const readJson = async (
      url: string,
    ): Promise<{
      ok: boolean;
      data: Record<string, unknown> | null;
    }> => {
      try {
        const response = await fetch(url, { cache: 'no-store' });
        const payload = await response.json().catch(() => null);
        return {
          ok: response.ok,
          data:
            payload && typeof payload === 'object' && !Array.isArray(payload)
              ? (payload as Record<string, unknown>)
              : null,
        };
      } catch {
        return { ok: false, data: null };
      }
    };

    try {
      const [contentRes, analyticsRes, auditRes] = await Promise.all([
        readJson('/api/v1/admin/content'),
        readJson('/api/v1/admin/analytics'),
        readJson('/api/v1/admin/audit-log?limit=50'),
      ]);

      const failedSources: string[] = [];

      if (contentRes.ok && Array.isArray(contentRes.data?.series)) {
        setSeriesList(contentRes.data.series as AdminSeriesDTO[]);
      } else {
        failedSources.push('المحتوى');
      }

      if (
        analyticsRes.ok &&
        analyticsRes.data?.totals &&
        Array.isArray(analyticsRes.data.funnel)
      ) {
        setTotals(analyticsRes.data.totals as unknown as Totals);
        setFunnel(analyticsRes.data.funnel as unknown as FunnelStep[]);
      } else {
        failedSources.push('التحليلات');
      }

      if (auditRes.ok && Array.isArray(auditRes.data?.logs)) {
        setAuditLogs(auditRes.data.logs as unknown as AuditLogItem[]);
      } else {
        failedSources.push('سجل التدقيق');
      }

      if (failedSources.length > 0) {
        setDataError(
          failedSources.length === 3
            ? 'تعذر تحميل بيانات لوحة التحكم حالياً. تحقق من الجلسة واتصال الخدمات ثم أعد المحاولة.'
            : `تعذر تحميل بعض البيانات (${failedSources.join('، ')}). يمكنك إعادة المحاولة دون فقد التعديلات.`,
        );
      }
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const navigateToSection = useCallback(
    (section: AdminSection, preserveContext = false) => {
      setActiveSection(section);
      if (!preserveContext) {
        setNavSeriesId(null);
        setNavSeasonId(null);
        setNavEpisodeId(null);
      }
    },
    [],
  );

  // Seamless navigation handlers
  const handleManageSeasons = (seriesId: string) => {
    setNavSeriesId(seriesId);
    setNavSeasonId(null);
    setNavEpisodeId(null);
    navigateToSection('seasons', true);
  };

  const handleManageEpisodes = (seriesId: string, seasonId: string) => {
    setNavSeriesId(seriesId);
    setNavSeasonId(seasonId);
    setNavEpisodeId(null);
    navigateToSection('episodes', true);
  };

  const handleManageTranscript = (
    seriesId: string,
    seasonId: string,
    episodeId: string,
  ) => {
    setNavSeriesId(seriesId);
    setNavSeasonId(seasonId);
    setNavEpisodeId(episodeId);
    navigateToSection('transcripts', true);
  };

  const handleSelectUserFromUsersList = (user: AdminUserDTO) => {
    setSelectedUserForEntitlements(user);
    navigateToSection('entitlements');
    showNotice(
      'success',
      `تم تحديد المستخدم "${user.displayName}" لإدارة استحقاقاته`,
    );
  };

  // Active Series helper for Pipeline breadcrumb
  const currentNavSeries = seriesList.find((s) => s._id === navSeriesId);
  const isContentPipelineSection = [
    'series',
    'seasons',
    'episodes',
    'transcripts',
  ].includes(activeSection);

  return (
    <div className="min-h-screen bg-obsidian text-editorial-ivory font-ui flex flex-col antialiased">
      {/* Top Navbar */}
      <header className="h-16 border-b border-border-subtle bg-surface/90 backdrop-blur-md sticky top-0 z-40 px-4 sm:px-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setIsMobileMenuOpen((open) => !open)}
            className="lg:hidden min-h-11 min-w-11 p-2 text-editorial-secondary hover:text-editorial-ivory rounded-lg bg-surface-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-crimson"
            aria-label="القائمة"
            aria-expanded={isMobileMenuOpen}
            aria-controls="admin-mobile-navigation"
          >
            {isMobileMenuOpen ? (
              <X className="w-5 h-5" />
            ) : (
              <Menu className="w-5 h-5" />
            )}
          </button>

          <Link
            href="/"
            className="flex items-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-crimson rounded-lg"
          >
            <span className="w-8 h-8 rounded-lg bg-crimson flex items-center justify-center text-white font-black font-display text-base shadow-halo">
              يـ
            </span>
            <div>
              <h1 className="text-sm font-black font-display text-editorial-ivory leading-tight">
                يُتبع...{' '}
                <span className="text-crimson font-ui text-[11px] font-bold">
                  الاستوديو
                </span>
              </h1>
              <p className="text-[10px] text-editorial-muted">إدارة المحتوى</p>
            </div>
          </Link>
        </div>

        {/* Global Action / Notice */}
        <div className="flex items-center gap-3">
          {notice && (
            <div
              role="status"
              aria-live="polite"
              className={`flex max-w-[48vw] sm:max-w-md items-center gap-2 px-2.5 sm:px-3 py-1.5 rounded-lg border text-xs font-semibold animate-fade-in ${
                notice.type === 'success'
                  ? 'bg-crimson-subtle border-crimson/40 text-[#E85A65]'
                  : 'bg-red-950/50 border-red-800 text-red-300'
              }`}
            >
              {notice.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 shrink-0" />
              )}
              <span className="truncate">{notice.msg}</span>
            </div>
          )}

          <Link
            href={resolvePublicPlatformUrl('/')}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="فتح منصة الاستماع العامة"
            className="min-h-11 min-w-11 flex items-center justify-center gap-1.5 px-3 py-1.5 bg-surface-elevated hover:bg-border-subtle text-editorial-secondary hover:text-editorial-ivory text-xs rounded-lg transition-colors border border-border-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-crimson"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">منصة الاستماع العامة</span>
          </Link>

          <button
            type="button"
            onClick={async () => {
              try {
                await fetch('/api/v1/admin/auth/logout', { method: 'POST' });
              } finally {
                router.push('/login');
              }
            }}
            className="min-h-11 min-w-11 flex items-center justify-center gap-1.5 px-3 py-1.5 bg-red-950/40 hover:bg-red-900/60 text-red-300 hover:text-red-100 text-xs rounded-lg transition-colors border border-red-800/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400"
            title="تسجيل الخروج من لوحة التحكم"
            aria-label="تسجيل الخروج"
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
            <span>إدارة المحتوى</span>
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
                        onClick={() => navigateToSection(item.id)}
                        aria-current={isActive ? 'page' : undefined}
                        className={`w-full min-h-10 flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-semibold transition-all text-right focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-crimson ${
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
                        {isActive && (
                          <ChevronLeft className="w-3.5 h-3.5 shrink-0 opacity-70" />
                        )}
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
          <div
            className="lg:hidden fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex"
            role="presentation"
          >
            <div
              id="admin-mobile-navigation"
              role="dialog"
              aria-modal="true"
              aria-labelledby="admin-mobile-navigation-title"
              className="w-4/5 max-w-xs bg-surface border-l border-border-subtle h-full flex flex-col p-4 space-y-4 overflow-y-auto animate-fade-in text-right"
            >
              <div className="flex items-center justify-between border-b border-border-subtle pb-3">
                <span
                  id="admin-mobile-navigation-title"
                  className="text-xs font-bold text-editorial-ivory"
                >
                  أقسام لوحة التحكم
                </span>
                <button
                  type="button"
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="min-h-11 min-w-11 p-1 text-editorial-muted hover:text-editorial-ivory rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-crimson"
                  aria-label="إغلاق القائمة"
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
                          (item.id === 'users' &&
                            activeSection === 'entitlements');

                        return (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => {
                              navigateToSection(item.id);
                              setIsMobileMenuOpen(false);
                            }}
                            aria-current={isActive ? 'page' : undefined}
                            className={`w-full min-h-11 flex items-center gap-3 px-3 py-2.5 rounded-lg text-xs font-semibold text-right focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-crimson ${
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
            <button
              type="button"
              className="flex-1 cursor-default"
              onClick={() => setIsMobileMenuOpen(false)}
              aria-label="إغلاق القائمة"
            />
          </div>
        )}

        {/* Main Content Workspace */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 bg-obsidian">
          <div className="max-w-7xl mx-auto space-y-6">
            {/* Step-by-step Content Pipeline Bar */}
            {isContentPipelineSection && (
              <div className="bg-surface/60 border border-border-subtle rounded-xl p-3.5 flex flex-col md:flex-row items-start md:items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-2 text-editorial-muted">
                  <span className="font-bold text-editorial-ivory">
                    مسار النشر
                  </span>
                  {currentNavSeries && (
                    <span
                      className="bg-crimson/15 text-crimson px-2 py-0.5 rounded font-bold truncate max-w-[160px] sm:max-w-xs"
                      title={currentNavSeries.title}
                    >
                      {currentNavSeries.title}
                    </span>
                  )}
                </div>

                {/* Pipeline Steps Buttons */}
                <div className="flex items-center gap-1.5 overflow-x-auto w-full md:w-auto pb-1 md:pb-0">
                  <button
                    type="button"
                    onClick={() => navigateToSection('series')}
                    className={`min-h-11 px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-crimson ${
                      activeSection === 'series'
                        ? 'bg-crimson text-white font-bold'
                        : 'bg-surface-elevated text-editorial-secondary hover:text-editorial-ivory'
                    }`}
                  >
                    1. المسلسلات
                  </button>
                  <ChevronLeft
                    className="w-3.5 h-3.5 text-editorial-muted shrink-0"
                    aria-hidden="true"
                  />
                  <button
                    type="button"
                    onClick={() => navigateToSection('seasons', true)}
                    className={`min-h-11 px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-crimson ${
                      activeSection === 'seasons'
                        ? 'bg-crimson text-white font-bold'
                        : 'bg-surface-elevated text-editorial-secondary hover:text-editorial-ivory'
                    }`}
                  >
                    2. المواسم
                  </button>
                  <ChevronLeft
                    className="w-3.5 h-3.5 text-editorial-muted shrink-0"
                    aria-hidden="true"
                  />
                  <button
                    type="button"
                    onClick={() => navigateToSection('episodes', true)}
                    className={`min-h-11 px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-crimson ${
                      activeSection === 'episodes'
                        ? 'bg-crimson text-white font-bold'
                        : 'bg-surface-elevated text-editorial-secondary hover:text-editorial-ivory'
                    }`}
                  >
                    3. الحلقات
                  </button>
                  <ChevronLeft
                    className="w-3.5 h-3.5 text-editorial-muted shrink-0"
                    aria-hidden="true"
                  />
                  <button
                    type="button"
                    onClick={() => navigateToSection('transcripts', true)}
                    className={`min-h-11 px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-crimson ${
                      activeSection === 'transcripts'
                        ? 'bg-crimson text-white font-bold'
                        : 'bg-surface-elevated text-editorial-secondary hover:text-editorial-ivory'
                    }`}
                  >
                    4. النصوص
                  </button>
                </div>
              </div>
            )}

            {dataError && !isLoading && (
              <div
                role="alert"
                className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-amber-700/50 bg-amber-950/30 p-4 text-xs text-amber-100"
              >
                <div className="flex items-start gap-2.5">
                  <AlertCircle
                    className="w-4 h-4 shrink-0 text-amber-300 mt-0.5"
                    aria-hidden="true"
                  />
                  <div className="space-y-0.5">
                    <p className="font-bold">البيانات غير مكتملة</p>
                    <p className="text-amber-200/80">{dataError}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={fetchData}
                  disabled={isRefreshing}
                  className="min-h-11 px-3 rounded-lg border border-amber-600/50 bg-amber-950/40 hover:bg-amber-900/50 text-amber-100 font-semibold inline-flex items-center justify-center gap-1.5 disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
                >
                  <RefreshCw
                    className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`}
                    aria-hidden="true"
                  />
                  <span>
                    {isRefreshing ? 'جارٍ التحديث...' : 'إعادة المحاولة'}
                  </span>
                </button>
              </div>
            )}

            {isLoading ? (
              <div className="py-32 flex flex-col items-center justify-center gap-3">
                <Loader2 className="w-8 h-8 animate-spin text-crimson" />
                <p className="text-xs text-editorial-muted">
                  جارٍ تحميل بيانات لوحة الإدارة...
                </p>
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
                    onNavigate={(sec) => navigateToSection(sec as AdminSection)}
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

                {/* Categories Manager */}

                {activeSection === 'categories' && (
                  <AdminCategoriesView showNotice={showNotice} />
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
                {activeSection === 'media' && (
                  <AdminMediaView showNotice={showNotice} />
                )}

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
                      onSelectUserForEntitlements={
                        handleSelectUserFromUsersList
                      }
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
                        onClick={() => navigateToSection('users')}
                        className="min-h-11 px-2 text-xs text-editorial-secondary hover:text-editorial-ivory underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-crimson rounded flex items-center"
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
                {activeSection === 'comments' && (
                  <AdminCommentsView onNotice={showNotice} />
                )}

                {/* 9. Homepage Sections */}
                {activeSection === 'homepage' && (
                  <div className="space-y-6">
                    <div className="border-b border-border-subtle pb-4">
                      <h2 className="text-xl font-black font-display text-editorial-ivory flex items-center gap-2">
                        <LayoutGrid className="w-5 h-5 text-crimson" />
                        الصفحة الرئيسية
                      </h2>
                      <p className="text-xs text-editorial-secondary mt-1">
                        رتّب الأقسام واختر محتوى كل قسم.
                      </p>
                    </div>
                    <HomepagePanel onNotice={showNotice} />
                  </div>
                )}

                {/* 10. Platform Settings & Health */}
                {activeSection === 'settings' && (
                  <AdminSettingsView onNotice={showNotice} />
                )}
              </>
            )}
          </div>
        </main>
      </div>
    </div>
  );
};
