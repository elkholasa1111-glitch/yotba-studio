'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  Settings,
  DollarSign,
  Activity,
  Database,
  Cloud,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Loader2,
  Zap,
} from 'lucide-react';

interface HealthData {
  status: string;
  timestamp: string;
  mongodb?: {
    connected: boolean;
    latencyMs?: number;
    error?: string;
  };
  r2?: {
    connected: boolean;
    latencyMs?: number;
    error?: string;
  };
  environment?: string;
}

interface PricingConfig {
  seasonUsd: number;
  monthlyUsd: number;
  annualUsd: number;
}

interface AdminSettingsViewProps {
  onNotice?: (type: 'success' | 'error', msg: string) => void;
}

export const AdminSettingsView: React.FC<AdminSettingsViewProps> = ({ onNotice }) => {
  const [pricing, setPricing] = useState<PricingConfig>({
    seasonUsd: 0.5,
    monthlyUsd: 1,
    annualUsd: 10,
  });
  const [isLoadingPricing, setIsLoadingPricing] = useState(true);
  const [isSavingPricing, setIsSavingPricing] = useState(false);

  const [health, setHealth] = useState<HealthData | null>(null);
  const [isLoadingHealth, setIsLoadingHealth] = useState(true);

  // Fetch Pricing
  const fetchPricing = useCallback(async () => {
    try {
      const res = await fetch('/api/v1/pricing');
      if (res.ok) {
        const data = await res.json();
        setPricing({
          seasonUsd: data.seasonUsd ?? 0.5,
          monthlyUsd: data.monthlyUsd ?? 1,
          annualUsd: data.annualUsd ?? 10,
        });
      }
    } catch (e) {
      console.error('Failed to fetch pricing:', e);
    } finally {
      setIsLoadingPricing(false);
    }
  }, []);

  // Fetch Health
  const fetchHealth = useCallback(async () => {
    setIsLoadingHealth(true);
    try {
      const res = await fetch('/api/v1/health');
      if (res.ok) {
        const data = await res.json();
        setHealth(data);
      }
    } catch (e) {
      console.error('Failed to fetch health:', e);
    } finally {
      setIsLoadingHealth(false);
    }
  }, []);

  useEffect(() => {
    fetchPricing();
    fetchHealth();
  }, [fetchPricing, fetchHealth]);

  const handleSavePricing = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingPricing(true);
    try {
      const res = await fetch('/api/v1/pricing', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(pricing),
      });
      if (res.ok) {
        onNotice?.('success', 'تم حفظ وتحديث الأسعار بنجاح في جميع صفحات المنصة');
      } else {
        const err = await res.json().catch(() => ({}));
        onNotice?.('error', err.error || 'فشل حفظ الأسعار');
      }
    } catch {
      onNotice?.('error', 'تعذر الاتصال بالخادم لحفظ الأسعار');
    } finally {
      setIsSavingPricing(false);
    }
  };

  return (
    <div className="space-y-8 animate-fade-in text-right">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border-subtle pb-4">
        <div>
          <h2 className="text-xl font-black font-display text-editorial-ivory flex items-center gap-2">
            <Settings className="w-5 h-5 text-crimson" />
            إعدادات المنصة والبنية التحتية
          </h2>
          <p className="text-xs text-editorial-secondary mt-1">
            إدارة الأسعار المركزية، مراقبة صحة قواعد البيانات، والتحقق من موثوقية التخزين السحابي
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Pricing Form */}
        <div className="bg-surface border border-border-subtle rounded-xl p-6 space-y-6">
          <div className="flex items-center gap-2 text-editorial-ivory border-b border-border-subtle pb-3">
            <DollarSign className="w-4 h-4 text-crimson" />
            <h3 className="font-bold text-sm">تسعير الاشتراكات والمواسم (USD)</h3>
          </div>

          {isLoadingPricing ? (
            <div className="py-12 flex justify-center">
              <Loader2 className="w-6 h-6 animate-spin text-crimson" />
            </div>
          ) : (
            <form onSubmit={handleSavePricing} className="space-y-5">
              <div className="space-y-2">
                <label className="text-xs text-editorial-secondary block font-medium">
                  سعر شراء الموسم الكامل (دولار):
                </label>
                <div className="relative">
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    value={pricing.seasonUsd}
                    onChange={(e) =>
                      setPricing({ ...pricing, seasonUsd: parseFloat(e.target.value) || 0 })
                    }
                    className="w-full bg-surface-elevated border border-border-subtle rounded-lg px-3 py-2.5 text-xs text-editorial-ivory focus:outline-none focus:border-crimson pl-8"
                  />
                  <span className="absolute left-3 top-2.5 text-xs text-editorial-muted">$</span>
                </div>
                <p className="text-[11px] text-editorial-muted">
                  المستخدمون يدفعون هذا السعر لفتح جميع حلقات موسم محدد مدى الحياة.
                </p>
              </div>

              <div className="space-y-2">
                <label className="text-xs text-editorial-secondary block font-medium">
                  سعر الاشتراك الشهري (دولار):
                </label>
                <div className="relative">
                  <input
                    type="number"
                    step="0.5"
                    min="0"
                    value={pricing.monthlyUsd}
                    onChange={(e) =>
                      setPricing({ ...pricing, monthlyUsd: parseFloat(e.target.value) || 0 })
                    }
                    className="w-full bg-surface-elevated border border-border-subtle rounded-lg px-3 py-2.5 text-xs text-editorial-ivory focus:outline-none focus:border-crimson pl-8"
                  />
                  <span className="absolute left-3 top-2.5 text-xs text-editorial-muted">$</span>
                </div>
                <p className="text-[11px] text-editorial-muted">
                  يتيح الوصول لجميع مسلسلات ومواسم المنصة دون قيود لمدة شهر.
                </p>
              </div>

              <div className="space-y-2">
                <label className="text-xs text-editorial-secondary block font-medium">
                  سعر الاشتراك السنوي (دولار):
                </label>
                <div className="relative">
                  <input
                    type="number"
                    step="1"
                    min="0"
                    value={pricing.annualUsd}
                    onChange={(e) =>
                      setPricing({ ...pricing, annualUsd: parseFloat(e.target.value) || 0 })
                    }
                    className="w-full bg-surface-elevated border border-border-subtle rounded-lg px-3 py-2.5 text-xs text-editorial-ivory focus:outline-none focus:border-crimson pl-8"
                  />
                  <span className="absolute left-3 top-2.5 text-xs text-editorial-muted">$</span>
                </div>
                <p className="text-[11px] text-editorial-muted">
                  اشتراك عام كامل مع خصم مشجع للاحتفاظ بالمشتركين.
                </p>
              </div>

              <button
                type="submit"
                disabled={isSavingPricing}
                className="w-full min-h-11 bg-crimson hover:bg-crimson-bright text-white text-xs font-bold rounded-lg shadow-halo transition-all flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {isSavingPricing ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>جارٍ الحفظ...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    <span>حفظ وتطبيق الأسعار الجديدة</span>
                  </>
                )}
              </button>
            </form>
          )}
        </div>

        {/* Infrastructure & Health Status */}
        <div className="bg-surface border border-border-subtle rounded-xl p-6 space-y-6">
          <div className="flex items-center justify-between border-b border-border-subtle pb-3">
            <div className="flex items-center gap-2 text-editorial-ivory">
              <Activity className="w-4 h-4 text-emerald-400" />
              <h3 className="font-bold text-sm">مراقبة صحة الخوادم والبنية التحتية</h3>
            </div>
            <button
              type="button"
              onClick={fetchHealth}
              disabled={isLoadingHealth}
              className="p-1.5 hover:bg-surface-elevated text-editorial-secondary hover:text-editorial-ivory rounded-md transition-colors"
              title="تحديث البيانات"
            >
              <RefreshCw className={`w-4 h-4 ${isLoadingHealth ? 'animate-spin text-crimson' : ''}`} />
            </button>
          </div>

          {isLoadingHealth ? (
            <div className="py-12 flex justify-center">
              <Loader2 className="w-6 h-6 animate-spin text-crimson" />
            </div>
          ) : (
            <div className="space-y-4">
              {/* Overall Status */}
              <div className="flex items-center justify-between p-3.5 bg-surface-elevated rounded-lg border border-border-subtle">
                <div className="flex items-center gap-2.5">
                  <span
                    className={`w-3 h-3 rounded-full ${
                      health?.status === 'ok' ? 'bg-emerald-500 shadow-emerald-500/50 shadow-sm' : 'bg-red-500'
                    }`}
                  />
                  <div>
                    <div className="text-xs font-bold text-editorial-ivory">
                      {health?.status === 'ok' ? 'المنظومة تعمل بكفاءة تامة' : 'تنبيه: خلل في بعض الخدمات'}
                    </div>
                    <div className="text-[11px] text-editorial-muted">
                      بيئة العمل: {health?.environment || 'production'}
                    </div>
                  </div>
                </div>
                <span className="text-[11px] text-editorial-muted font-mono">
                  {health?.timestamp ? new Date(health.timestamp).toLocaleTimeString('ar-EG') : ''}
                </span>
              </div>

              {/* MongoDB Card */}
              <div className="p-4 bg-surface-elevated rounded-lg border border-border-subtle space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Database className="w-4 h-4 text-emerald-400" />
                    <span className="text-xs font-bold text-editorial-ivory">قاعدة بيانات MongoDB</span>
                  </div>
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                      health?.mongodb?.connected
                        ? 'bg-emerald-950/60 text-emerald-400 border border-emerald-800/40'
                        : 'bg-red-950/60 text-red-400 border border-red-800/40'
                    }`}
                  >
                    {health?.mongodb?.connected ? 'متصل' : 'غير متصل'}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs text-editorial-secondary">
                  <span>زمن الاستجابة (Latency):</span>
                  <span className="font-mono text-editorial-ivory">
                    {health?.mongodb?.latencyMs !== undefined ? `${health.mongodb.latencyMs} ms` : '—'}
                  </span>
                </div>
                {health?.mongodb?.error && (
                  <p className="text-[11px] text-red-400 bg-red-950/30 p-2 rounded">
                    خطأ: {health.mongodb.error}
                  </p>
                )}
              </div>

              {/* Cloudflare R2 Card */}
              <div className="p-4 bg-surface-elevated rounded-lg border border-border-subtle space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Cloud className="w-4 h-4 text-sky-400" />
                    <span className="text-xs font-bold text-editorial-ivory">سحابة التخزين Cloudflare R2</span>
                  </div>
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                      health?.r2?.connected
                        ? 'bg-emerald-950/60 text-emerald-400 border border-emerald-800/40'
                        : 'bg-red-950/60 text-red-400 border border-red-800/40'
                    }`}
                  >
                    {health?.r2?.connected ? 'متصل وجاهز' : 'فحص الاتصال'}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs text-editorial-secondary">
                  <span>زمن الاتصال (Latency):</span>
                  <span className="font-mono text-editorial-ivory">
                    {health?.r2?.latencyMs !== undefined ? `${health.r2.latencyMs} ms` : '—'}
                  </span>
                </div>
                <div className="text-[11px] text-editorial-muted pt-1 border-t border-border-subtle/50 flex items-center gap-1.5">
                  <Zap className="w-3.5 h-3.5 text-amber-400" />
                  <span>الرفع المباشر مفعل (Presigned PUT) لتوفير البث السريع دون وسطاء.</span>
                </div>
              </div>

              {/* Audio Security Card */}
              <div className="p-4 bg-surface-elevated rounded-lg border border-border-subtle space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-crimson" />
                    <span className="text-xs font-bold text-editorial-ivory">حماية الملفات الصوتية الأصلية</span>
                  </div>
                  <span className="bg-crimson-subtle border border-crimson/40 text-crimson px-2 py-0.5 rounded text-[10px] font-bold">
                    مشددة ومحمية
                  </span>
                </div>
                <p className="text-[11px] text-editorial-secondary leading-relaxed">
                  تم قفل الروابط العامة لمنع تسريب الماستر الصوتي. يتم تسليم الصوتيات فقط عبر تدفق موثق (Authenticated Range Streaming) يتحقق من تسجيل الدخول والاستحقاق.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
