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
  Link2,
} from 'lucide-react';
import {
  emptySocialLinks,
  sanitizeSocialLinks,
  SOCIAL_PLATFORMS,
  SOCIAL_PLATFORM_LABELS,
  SocialLinks,
} from '@/lib/config/social';

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
  const [pricingError, setPricingError] = useState<string | null>(null);

  const [health, setHealth] = useState<HealthData | null>(null);
  const [isLoadingHealth, setIsLoadingHealth] = useState(true);
  const [healthError, setHealthError] = useState<string | null>(null);

  const [socialLinks, setSocialLinks] = useState<SocialLinks>(emptySocialLinks);
  const [isLoadingSocialLinks, setIsLoadingSocialLinks] = useState(true);
  const [isSavingSocialLinks, setIsSavingSocialLinks] = useState(false);
  const [socialLinksError, setSocialLinksError] = useState<string | null>(null);

  // Fetch Pricing
  const fetchPricing = useCallback(async () => {
    setIsLoadingPricing(true);
    setPricingError(null);
    try {
      const res = await fetch('/api/v1/admin/pricing');
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(data?.error || 'تعذر تحميل الأسعار الحالية');
      }
      setPricing({
        seasonUsd: data?.seasonUsd ?? 0.5,
        monthlyUsd: data?.monthlyUsd ?? 1,
        annualUsd: data?.annualUsd ?? 10,
      });
    } catch (error) {
      console.error('Failed to fetch pricing:', error);
      setPricingError(error instanceof Error ? error.message : 'تعذر تحميل الأسعار الحالية');
    } finally {
      setIsLoadingPricing(false);
    }
  }, []);

  // Fetch Health
  const fetchHealth = useCallback(async () => {
    setIsLoadingHealth(true);
    setHealthError(null);
    try {
      const res = await fetch('/api/v1/admin/health');
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(data?.error || 'تعذر فحص الخدمات المتصلة');
      }
      setHealth(data);
    } catch (error) {
      console.error('Failed to fetch health:', error);
      setHealthError(error instanceof Error ? error.message : 'تعذر فحص الخدمات المتصلة');
    } finally {
      setIsLoadingHealth(false);
    }
  }, []);

  // Fetch Social Links
  const fetchSocialLinks = useCallback(async () => {
    setIsLoadingSocialLinks(true);
    setSocialLinksError(null);
    try {
      const res = await fetch('/api/v1/admin/social-links', { cache: 'no-store' });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(data?.error || 'تعذر تحميل روابط السوشيال ميديا');
      }
      setSocialLinks(sanitizeSocialLinks(data?.links));
    } catch (error) {
      console.error('Failed to fetch social links:', error);
      setSocialLinksError(error instanceof Error ? error.message : 'تعذر تحميل روابط السوشيال ميديا');
    } finally {
      setIsLoadingSocialLinks(false);
    }
  }, []);

  useEffect(() => {
    fetchPricing();
    fetchHealth();
    fetchSocialLinks();
  }, [fetchPricing, fetchHealth, fetchSocialLinks]);

  const handleSavePricing = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pricing.seasonUsd <= 0 || pricing.monthlyUsd <= 0 || pricing.annualUsd <= 0) {
      onNotice?.('error', 'يجب أن تكون جميع الأسعار أرقاماً موجبة أكبر من الصفر (0.01 فأكثر)');
      return;
    }
    if (pricing.seasonUsd > 10000 || pricing.monthlyUsd > 10000 || pricing.annualUsd > 10000) {
      onNotice?.('error', 'الحد الأقصى لأي سعر هو 10,000 دولار');
      return;
    }
    setIsSavingPricing(true);
    try {
      const res = await fetch('/api/v1/admin/pricing', {
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

  const handleSaveSocialLinks = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingSocialLinks(true);
    try {
      const res = await fetch('/api/v1/admin/social-links', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(socialLinks),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setSocialLinks(sanitizeSocialLinks(data?.links));
        onNotice?.('success', 'تم حفظ روابط السوشيال ميديا وتطبيقها في الفوتر');
      } else {
        onNotice?.('error', data?.error || 'فشل حفظ روابط السوشيال ميديا');
      }
    } catch {
      onNotice?.('error', 'تعذر الاتصال بالخادم لحفظ روابط السوشيال ميديا');
    } finally {
      setIsSavingSocialLinks(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in text-right">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border-subtle pb-4">
        <div>
          <h2 className="text-xl font-black font-display text-editorial-ivory flex items-center gap-2">
            <Settings className="w-5 h-5 text-crimson" />
            الإعدادات
          </h2>
          <p className="text-xs text-editorial-secondary mt-1">
            الأسعار وحالة الخدمات
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Pricing Form */}
        <div className="bg-surface border border-border-subtle rounded-xl p-5 space-y-5">
          <div className="flex items-center gap-2 text-editorial-ivory border-b border-border-subtle pb-3">
            <DollarSign className="w-4 h-4 text-crimson" />
            <h3 className="font-bold text-sm">الأسعار (USD)</h3>
          </div>

          {isLoadingPricing ? (
            <div className="py-12 flex justify-center">
              <Loader2 className="w-6 h-6 animate-spin text-crimson" />
            </div>
          ) : pricingError ? (
            <div className="py-10 text-center space-y-3" role="alert">
              <AlertCircle className="w-8 h-8 mx-auto text-amber-300" aria-hidden="true" />
              <p className="text-sm text-amber-100 font-semibold">تعذر تحميل الأسعار</p>
              <p className="text-xs text-editorial-muted">{pricingError}</p>
              <button
                type="button"
                onClick={fetchPricing}
                className="min-h-11 px-4 rounded-lg bg-surface-elevated hover:bg-border-subtle border border-border-subtle text-editorial-ivory text-xs font-bold inline-flex items-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-crimson"
              >
                <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
                إعادة المحاولة
              </button>
            </div>
          ) : (
            <form onSubmit={handleSavePricing} className="space-y-5">
              <div className="space-y-2">
                <label className="text-xs text-editorial-secondary block font-medium">
                  سعر الموسم الكامل:
                </label>
                <div className="relative">
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    max="10000"
                    value={pricing.seasonUsd}
                    onChange={(e) =>
                      setPricing({ ...pricing, seasonUsd: parseFloat(e.target.value) || 0 })
                    }
                    className="w-full min-h-11 bg-surface-elevated border border-border-subtle rounded-lg px-3 py-2.5 text-xs text-editorial-ivory focus:outline-none focus:border-crimson focus-visible:ring-2 focus-visible:ring-crimson pl-8"
                  />
                  <span className="absolute left-3 top-3 text-xs text-editorial-muted">$</span>
                </div>
                <p className="text-[11px] text-editorial-muted">
                  فتح موسم كامل مدى الحياة.
                </p>
              </div>

              <div className="space-y-2">
                <label className="text-xs text-editorial-secondary block font-medium">
                  الاشتراك الشهري:
                </label>
                <div className="relative">
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    max="10000"
                    value={pricing.monthlyUsd}
                    onChange={(e) =>
                      setPricing({ ...pricing, monthlyUsd: parseFloat(e.target.value) || 0 })
                    }
                    className="w-full min-h-11 bg-surface-elevated border border-border-subtle rounded-lg px-3 py-2.5 text-xs text-editorial-ivory focus:outline-none focus:border-crimson focus-visible:ring-2 focus-visible:ring-crimson pl-8"
                  />
                  <span className="absolute left-3 top-3 text-xs text-editorial-muted">$</span>
                </div>
                <p className="text-[11px] text-editorial-muted">
                  وصول كامل لمدة شهر.
                </p>
              </div>

              <div className="space-y-2">
                <label className="text-xs text-editorial-secondary block font-medium">
                  الاشتراك السنوي:
                </label>
                <div className="relative">
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    max="10000"
                    value={pricing.annualUsd}
                    onChange={(e) =>
                      setPricing({ ...pricing, annualUsd: parseFloat(e.target.value) || 0 })
                    }
                    className="w-full min-h-11 bg-surface-elevated border border-border-subtle rounded-lg px-3 py-2.5 text-xs text-editorial-ivory focus:outline-none focus:border-crimson focus-visible:ring-2 focus-visible:ring-crimson pl-8"
                  />
                  <span className="absolute left-3 top-3 text-xs text-editorial-muted">$</span>
                </div>
                <p className="text-[11px] text-editorial-muted">
                  وصول كامل لمدة عام.
                </p>
              </div>

              <button
                type="submit"
                disabled={isSavingPricing}
                className="w-full min-h-11 bg-crimson hover:bg-crimson-bright text-white text-xs font-bold rounded-lg shadow-halo transition-all flex items-center justify-center gap-2 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-crimson"
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
        <div className="bg-surface border border-border-subtle rounded-xl p-5 space-y-5">
          <div className="flex items-center justify-between border-b border-border-subtle pb-3">
            <div className="flex items-center gap-2 text-editorial-ivory">
              <Activity className="w-4 h-4 text-emerald-400" />
              <h3 className="font-bold text-sm">حالة الخدمات المتصلة</h3>
            </div>
            <button
              type="button"
              onClick={fetchHealth}
              disabled={isLoadingHealth}
              className="min-w-11 min-h-11 flex items-center justify-center hover:bg-surface-elevated text-editorial-secondary hover:text-editorial-ivory rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-crimson"
              title="تحديث البيانات"
              aria-label="تحديث حالة الخدمات"
            >
              <RefreshCw className={`w-4 h-4 ${isLoadingHealth ? 'animate-spin text-crimson' : ''}`} />
            </button>
          </div>

          {isLoadingHealth ? (
            <div className="py-12 flex justify-center">
              <Loader2 className="w-6 h-6 animate-spin text-crimson" />
            </div>
          ) : healthError ? (
            <div className="py-10 text-center space-y-3" role="alert">
              <AlertCircle className="w-8 h-8 mx-auto text-amber-300" aria-hidden="true" />
              <p className="text-sm text-amber-100 font-semibold">تعذر فحص الخدمات</p>
              <p className="text-xs text-editorial-muted">{healthError}</p>
              <button
                type="button"
                onClick={fetchHealth}
                className="min-h-11 px-4 rounded-lg bg-surface-elevated hover:bg-border-subtle border border-border-subtle text-editorial-ivory text-xs font-bold inline-flex items-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-crimson"
              >
                <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
                إعادة الفحص
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Overall Status */}
              <div className="flex items-center justify-between p-3.5 bg-surface-elevated rounded-lg border border-border-subtle">
                <div className="flex items-center gap-2.5">
                  <span
                      className={`w-3 h-3 rounded-full ${
                      health?.status === 'ok'
                        ? 'bg-emerald-500 shadow-emerald-500/50 shadow-sm'
                        : health
                          ? 'bg-red-500'
                          : 'bg-amber-400'
                    }`}
                  />
                  <div>
                    <div className="text-xs font-bold text-editorial-ivory">
                      {health?.status === 'ok'
                        ? 'الخدمات تعمل بكفاءة'
                        : health
                          ? 'تنبيه: خلل في بعض الخدمات'
                          : 'لا تتوفر بيانات الحالة'}
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
                        : health?.mongodb
                          ? 'bg-red-950/60 text-red-400 border border-red-800/40'
                          : 'bg-surface border border-border-subtle text-editorial-muted'
                    }`}
                  >
                    {health?.mongodb ? (health.mongodb.connected ? 'متصل' : 'غير متصل') : 'غير معروف'}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs text-editorial-secondary">
                    <span>زمن الاستجابة:</span>
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
                        : health?.r2
                          ? 'bg-red-950/60 text-red-400 border border-red-800/40'
                          : 'bg-surface border border-border-subtle text-editorial-muted'
                    }`}
                  >
                    {health?.r2 ? (health.r2.connected ? 'متصل وجاهز' : 'غير متصل') : 'غير معروف'}
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
                  <span>الرفع المباشر عبر رابط موقّت.</span>
                </div>
              </div>

              {/* Audio Security Card */}
              <div className="p-4 bg-surface-elevated rounded-lg border border-border-subtle space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-crimson" />
                    <span className="text-xs font-bold text-editorial-ivory">حماية الصوت المدفوع</span>
                  </div>
                  <span className="bg-crimson-subtle border border-crimson/40 text-[#E85A65] px-2 py-0.5 rounded text-[10px] font-bold">
                    مشددة ومحمية
                  </span>
                </div>
                <p className="text-[11px] text-editorial-secondary leading-relaxed">
                  لا يظهر الصوت المدفوع كرابط عام.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Social Links */}
        <section className="lg:col-span-2 bg-surface border border-border-subtle rounded-xl p-5 space-y-5" aria-labelledby="social-links-title">
          <div className="flex flex-col gap-3 border-b border-border-subtle pb-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex items-start gap-2 text-editorial-ivory">
              <Link2 className="mt-0.5 h-4 w-4 text-crimson" aria-hidden="true" />
              <div>
                <h3 id="social-links-title" className="font-bold text-sm">السوشيال ميديا</h3>
                <p className="mt-1 text-[11px] leading-relaxed text-editorial-muted">
                  أضف روابط حسابات المنصة لتظهر تلقائياً كأيقونات قابلة للضغط في فوتر الموقع.
                </p>
              </div>
            </div>
            <span className="w-fit rounded-full border border-border-subtle bg-surface-elevated px-2.5 py-1 text-[10px] font-semibold text-editorial-secondary">
              {SOCIAL_PLATFORMS.filter((platform) => Boolean(socialLinks[platform])).length} من {SOCIAL_PLATFORMS.length} روابط مضافة
            </span>
          </div>

          {isLoadingSocialLinks ? (
            <div className="flex justify-center py-10">
              <Loader2 className="h-6 w-6 animate-spin text-crimson" aria-label="جارٍ تحميل الروابط" />
            </div>
          ) : socialLinksError ? (
            <div className="space-y-3 py-8 text-center" role="alert">
              <AlertCircle className="mx-auto h-8 w-8 text-amber-300" aria-hidden="true" />
              <p className="text-sm font-semibold text-amber-100">تعذر تحميل روابط السوشيال ميديا</p>
              <p className="text-xs text-editorial-muted">{socialLinksError}</p>
              <button
                type="button"
                onClick={fetchSocialLinks}
                className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-border-subtle bg-surface-elevated px-4 text-xs font-bold text-editorial-ivory transition-colors hover:bg-border-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-crimson"
              >
                <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                إعادة المحاولة
              </button>
            </div>
          ) : (
            <form onSubmit={handleSaveSocialLinks} className="space-y-5">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {SOCIAL_PLATFORMS.map((platform) => {
                  const label = SOCIAL_PLATFORM_LABELS[platform];
                  const inputId = `social-link-${platform}`;
                  return (
                    <div key={platform} className="space-y-2 rounded-lg border border-border-subtle/70 bg-surface-elevated/40 p-3">
                      <label htmlFor={inputId} className="flex items-center justify-between gap-3 text-xs font-semibold text-editorial-ivory">
                        <span>{label}</span>
                        <span dir="ltr" className="text-[10px] font-normal uppercase tracking-[0.08em] text-editorial-muted">
                          {platform === 'x' ? 'X' : platform}
                        </span>
                      </label>
                      <input
                        id={inputId}
                        type="url"
                        dir="ltr"
                        inputMode="url"
                        autoComplete="url"
                        placeholder={`https://${platform === 'x' ? 'x.com' : `${platform}.com`}/...`}
                        value={socialLinks[platform] || ''}
                        onChange={(event) => setSocialLinks((previous) => ({ ...previous, [platform]: event.target.value }))}
                        className="w-full min-h-11 rounded-lg border border-border-subtle bg-surface px-3 py-2.5 text-left text-xs text-editorial-ivory placeholder:text-editorial-muted/60 focus:border-crimson focus:outline-none focus-visible:ring-2 focus-visible:ring-crimson"
                        aria-describedby={`${inputId}-hint`}
                      />
                      <p id={`${inputId}-hint`} className="text-[10px] leading-relaxed text-editorial-muted">
                        اتركه فارغاً لإيقاف ظهور الرابط مؤقتاً.
                      </p>
                    </div>
                  );
                })}
              </div>

              <div className="flex flex-col gap-3 border-t border-border-subtle/70 pt-4 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-[11px] text-editorial-muted">
                  نتحقق من أن كل رابط يبدأ بـ http:// أو https:// قبل حفظه.
                </p>
                <button
                  type="submit"
                  disabled={isSavingSocialLinks}
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-crimson px-5 text-xs font-bold text-white shadow-halo transition-colors hover:bg-crimson-bright disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-crimson"
                >
                  {isSavingSocialLinks ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                      جارٍ الحفظ...
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                      حفظ روابط السوشيال ميديا
                    </>
                  )}
                </button>
              </div>
            </form>
          )}
        </section>
      </div>
    </div>
  );
};
