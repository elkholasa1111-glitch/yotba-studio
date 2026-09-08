'use client';

import React from 'react';
import {
  Film,
  Layers,
  Radio,
  Users,
  TrendingUp,
  DollarSign,
  Activity,
  CheckCircle2,
  Clock,
  ShieldCheck,
} from 'lucide-react';
import type { AdminSeriesDTO } from '../cms/shared';

interface Totals {
  paidPurchases: number;
  activeSubs: number;
  totalUsers: number;
  totalRevenueUsd: number;
  periodDays: number;
}

interface FunnelStep {
  stage: string;
  count: number;
  percent: number;
}

interface AuditLogItem {
  _id: string;
  action: string;
  targetEntity: string;
  entityId: string;
  createdAt: string;
  actor: { displayName: string | null; email: string | null; role: string | null } | null;
}

interface Props {
  seriesList: AdminSeriesDTO[];
  totals: Totals | null;
  funnel: FunnelStep[];
  auditLogs: AuditLogItem[];
  onNavigate: (section: string) => void;
}

export const AdminDashboardOverview: React.FC<Props> = ({
  seriesList,
  totals,
  funnel,
  auditLogs,
  onNavigate,
}) => {
  // حساب إجمالي الحلقات والمواسم
  const totalSeasons = seriesList.reduce((acc, s) => acc + (s.seasons?.length || 0), 0);
  const totalEpisodes = seriesList.reduce(
    (acc, s) => acc + (s.seasons || []).reduce((eAcc, sz) => eAcc + (sz.episodes?.length || 0), 0),
    0
  );

  const kpis = [
    {
      label: 'إجمالي المسلسلات',
      value: seriesList.length,
      icon: Film,
      color: 'text-crimson',
      bg: 'bg-crimson/10 border-crimson/30',
      action: () => onNavigate('series'),
    },
    {
      label: 'المواسم المسجلة',
      value: totalSeasons,
      icon: Layers,
      color: 'text-amber-400',
      bg: 'bg-amber-500/10 border-amber-500/30',
      action: () => onNavigate('seasons'),
    },
    {
      label: 'الحلقات الصوتية',
      value: totalEpisodes,
      icon: Radio,
      color: 'text-emerald-400',
      bg: 'bg-emerald-500/10 border-emerald-500/30',
      action: () => onNavigate('episodes'),
    },
    {
      label: 'المستمعون المسجلون',
      value: totals?.totalUsers ?? 0,
      icon: Users,
      color: 'text-blue-400',
      bg: 'bg-blue-500/10 border-blue-500/30',
      action: () => onNavigate('users'),
    },
  ];

  return (
    <div className="space-y-6">
      {/* 1. بطاقات المؤشرات الرئيسية (KPI Cards) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map((kpi) => {
          const Icon = kpi.icon;
          return (
            <button
              type="button"
              key={kpi.label}
              onClick={kpi.action}
              className="p-5 rounded-2xl bg-surface border border-border-subtle hover:border-border-strong text-right transition-all hover:scale-[1.01] flex items-center justify-between group cursor-pointer shadow-sm"
            >
              <div className="space-y-1">
                <span className="text-xs text-editorial-muted font-medium">{kpi.label}</span>
                <p className="text-2xl sm:text-3xl font-black font-display text-editorial-ivory">
                  {kpi.value}
                </p>
              </div>
              <div className={`w-12 h-12 rounded-xl border flex items-center justify-center ${kpi.bg}`}>
                <Icon size={22} className={kpi.color} />
              </div>
            </button>
          );
        })}
      </div>

      {/* 2. قمع التحويل وأحدث النشاطات */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* قمع الاستماع والاشتراكات */}
        <div className="lg:col-span-6 p-6 rounded-2xl bg-surface border border-border-subtle space-y-4">
          <div className="flex items-center justify-between border-b border-border-subtle pb-3">
            <h3 className="text-sm font-bold text-editorial-ivory flex items-center gap-2">
              <TrendingUp size={16} className="text-crimson" />
              <span>قمع الاستماع والتحويل (Conversion Funnel)</span>
            </h3>
            <span className="text-xs text-editorial-muted">آخر 30 يوماً</span>
          </div>

          <div className="space-y-3 pt-2">
            {funnel.length > 0 ? (
              funnel.map((step) => (
                <div key={step.stage} className="space-y-1.5">
                  <div className="flex justify-between text-xs">
                    <span className="text-editorial-secondary font-medium">{step.stage}</span>
                    <span className="text-editorial-ivory font-bold font-mono">
                      {step.count} ({step.percent}%)
                    </span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-surface-elevated overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-crimson to-amber-500 rounded-full transition-all duration-500"
                      style={{ width: `${Math.max(4, step.percent)}%` }}
                    />
                  </div>
                </div>
              ))
            ) : (
              <p className="text-xs text-editorial-muted py-6 text-center">
                يتم تجميع بيانات القمع تلقائياً عند تفاعل المستمعين مع الحلقات
              </p>
            )}
          </div>
        </div>

        {/* سجل التدقيق الإداري السريع */}
        <div className="lg:col-span-6 p-6 rounded-2xl bg-surface border border-border-subtle space-y-4">
          <div className="flex items-center justify-between border-b border-border-subtle pb-3">
            <h3 className="text-sm font-bold text-editorial-ivory flex items-center gap-2">
              <Activity size={16} className="text-crimson" />
              <span>أحدث إجراءات الإشراف والتدقيق</span>
            </h3>
            <span className="text-xs text-editorial-muted">حماية وتتبع العمليات</span>
          </div>

          <div className="space-y-2 max-h-72 overflow-y-auto scrollbar-thin scrollbar-thumb-border-subtle">
            {auditLogs.length > 0 ? (
              auditLogs.slice(0, 8).map((log) => (
                <div
                  key={log._id}
                  className="p-2.5 rounded-xl bg-surface-elevated/50 border border-border-subtle/50 flex items-center justify-between text-xs"
                >
                  <div className="flex items-center gap-2">
                    <CheckCircle2 size={14} className="text-emerald-400 shrink-0" />
                    <div>
                      <span className="font-bold text-editorial-ivory block">{log.action}</span>
                      <span className="text-[11px] text-editorial-muted">
                        {log.actor?.email || 'النظام'} • {log.targetEntity}
                      </span>
                    </div>
                  </div>
                  <span className="text-[10px] text-editorial-muted font-mono shrink-0">
                    {new Date(log.createdAt).toLocaleDateString('ar-EG')}
                  </span>
                </div>
              ))
            ) : (
              <p className="text-xs text-editorial-muted py-6 text-center">
                لا توجد سجلات تدقيق سابقة
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
