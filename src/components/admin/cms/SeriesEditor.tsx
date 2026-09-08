'use client';

import React, { useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { ModalDialog } from './ModalDialog';
import { adminApi, AdminSeriesDTO } from './shared';
import { MediaUploadDropzone } from './MediaUploadDropzone';

interface SeriesEditorProps {
  series: AdminSeriesDTO | null;
  onClose: () => void;
  onSaved: (createdSeriesId?: string) => Promise<void>;
  showNotice: (type: 'success' | 'error', msg: string) => void;
}

interface SeriesFormState {
  title: string;
  slug: string;
  hook: string;
  description: string;
  posterUrl: string;
  heroArtworkUrl: string;
  shareVideoUrl: string;
  genresText: string;
  contentWarningsText: string;
  contentRating: AdminSeriesDTO['contentRating'];
  productionYear: string;
  freeEpisodesCount: string;
  isCompleted: boolean;
  featured: boolean;
  published: boolean;
}

function initialState(series: AdminSeriesDTO | null): SeriesFormState {
  return {
    title: series?.title ?? '',
    slug: series?.slug ?? '',
    hook: series?.hook ?? '',
    description: series?.description ?? '',
    posterUrl: series?.posterUrl ?? '',
    heroArtworkUrl: series?.heroArtworkUrl ?? '',
    shareVideoUrl: series?.shareVideoUrl ?? '',
    genresText: series?.genres.join('، ') ?? '',
    contentWarningsText: series?.contentWarnings.join('، ') ?? '',
    contentRating: series?.contentRating ?? 'PG13',
    productionYear: String(series?.productionYear ?? new Date().getFullYear()),
    freeEpisodesCount: String(series?.freeEpisodesCount ?? 2),
    isCompleted: series?.isCompleted ?? false,
    featured: series?.featured ?? false,
    published: series ? series.publishedAt !== null : true,
  };
}

function splitList(text: string): string[] {
  return text
    .split(/[،,]/)
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function isValidHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

const inputClass =
  'w-full min-h-11 bg-surface-elevated border border-border-subtle rounded-lg p-2.5 text-xs text-editorial-ivory focus:outline-none focus:border-crimson focus-visible:ring-2 focus-visible:ring-crimson-glow';
const labelClass = 'text-xs text-editorial-secondary block mb-1';
const errorClass = 'text-[10px] text-red-400 mt-1';
const detailsClass = 'border border-border-subtle rounded-lg bg-surface-elevated/40';
const summaryClass =
  'cursor-pointer select-none px-4 py-3 text-xs font-bold text-editorial-ivory focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-crimson-glow rounded-lg';

export const SeriesEditor: React.FC<SeriesEditorProps> = ({ series, onClose, onSaved, showNotice }) => {
  const initial = useMemo(() => initialState(series), [series]);
  const [form, setForm] = useState<SeriesFormState>(initial);
  const [autoCreateSeason1, setAutoCreateSeason1] = useState(true);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const isDirty = JSON.stringify(form) !== JSON.stringify(initial);
  const setField = <K extends keyof SeriesFormState>(key: K, value: SeriesFormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => {
      if (!prev[key as string]) return prev;
      const next = { ...prev };
      delete next[key as string];
      return next;
    });
  };

  const validate = (): boolean => {
    const nextErrors: Record<string, string> = {};
    if (form.title.trim().length === 0 || form.title.trim().length > 150) nextErrors.title = 'العنوان مطلوب (حتى 150 حرفاً)';
    if (form.hook.trim().length === 0 || form.hook.trim().length > 300) nextErrors.hook = 'الجملة التسويقية مطلوبة (حتى 300 حرف)';
    if (form.description.trim().length === 0 || form.description.trim().length > 5000) nextErrors.description = 'الوصف مطلوب (حتى 5000 حرف)';
    const isValidMedia = (val: string) => val.trim().startsWith('http://') || val.trim().startsWith('https://') || val.trim().startsWith('/');
    if (!isValidMedia(form.posterUrl)) nextErrors.posterUrl = 'يرجى رفع صورة الغلاف أو إدخال رابط صالح';
    if (!isValidMedia(form.heroArtworkUrl)) nextErrors.heroArtworkUrl = 'يرجى رفع صورة الواجهة أو إدخال رابط صالح';
    if (form.shareVideoUrl.trim() && !isValidMedia(form.shareVideoUrl)) nextErrors.shareVideoUrl = 'رابط الفيديو غير صالح';
    const year = Number(form.productionYear);
    if (!Number.isInteger(year) || year < 1900 || year > 2100) nextErrors.productionYear = 'سنة بين 1900 و 2100';
    const freeCount = Number(form.freeEpisodesCount);
    if (!Number.isInteger(freeCount) || freeCount < 0 || freeCount > 10) nextErrors.freeEpisodesCount = 'عدد بين 0 و 10';
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setServerError(null);
    if (!validate()) return;
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        entity: 'series',
        title: form.title.trim(),
        slug: form.slug.trim() || undefined,
        hook: form.hook.trim(),
        description: form.description.trim(),
        posterUrl: form.posterUrl.trim(),
        heroArtworkUrl: form.heroArtworkUrl.trim(),
        shareVideoUrl: form.shareVideoUrl.trim() || null,
        genres: splitList(form.genresText),
        contentWarnings: splitList(form.contentWarningsText),
        contentRating: form.contentRating,
        productionYear: Number(form.productionYear),
        freeEpisodesCount: Number(form.freeEpisodesCount),
        isCompleted: form.isCompleted,
        featured: form.featured,
      };
      if (form.published !== (series ? series.publishedAt !== null : true)) {
        payload.published = form.published;
      }

      const res = series
        ? await adminApi<{ success: boolean; id?: string }>('/api/v1/admin/content', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...payload, seriesId: series._id }),
          })
        : await adminApi<{ success: boolean; id?: string }>('/api/v1/admin/content', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          });

      if (!res.ok) {
        setServerError(res.error);
        return;
      }

      let createdSeriesId: string | undefined;
      if (!series && res.data && res.data.id) {
        createdSeriesId = res.data.id;
        if (autoCreateSeason1) {
          try {
            await adminApi<{ success: boolean }>('/api/v1/admin/content', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                entity: 'season',
                seriesId: createdSeriesId,
                seasonNumber: 1,
                title: 'الموسم الأول',
                price: 0.5,
                releaseStatus: 'AVAILABLE',
              }),
            });
          } catch (e) {
            console.error('Auto create season 1 error:', e);
          }
        }
      }

      await onSaved(createdSeriesId);
      showNotice(
        'success',
        series
          ? 'تم حفظ تعديلات المسلسل بنجاح'
          : autoCreateSeason1
          ? 'تم إنشاء المسلسل والموسم الأول بنجاح! يمكنك الآن إضافة الحلقات مباشرة.'
          : 'تم إنشاء المسلسل بنجاح'
      );
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalDialog title={series ? `تعديل المسلسل: ${series.title}` : 'مسلسل جديد'} onClose={onClose} isDirty={isDirty} wide>
      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        <details open className={detailsClass}>
          <summary className={summaryClass}>البيانات الأساسية</summary>
          <div className="p-4 pt-1 space-y-3">
            <div>
              <label htmlFor="series-title" className={labelClass}>
                عنوان المسلسل *
              </label>
              <input
                id="series-title"
                type="text"
                value={form.title}
                onChange={(e) => setField('title', e.target.value)}
                className={inputClass}
                aria-invalid={Boolean(errors.title)}
                aria-describedby={errors.title ? 'series-title-error' : undefined}
              />
              {errors.title && (
                <p id="series-title-error" role="alert" className={errorClass}>
                  {errors.title}
                </p>
              )}
            </div>
            <div>
              <label htmlFor="series-slug" className={labelClass}>
                المعرّف (slug) — يُولَّد تلقائياً من العنوان إذا تُرك فارغاً
              </label>
              <input
                id="series-slug"
                type="text"
                dir="ltr"
                value={form.slug}
                onChange={(e) => setField('slug', e.target.value)}
                className={inputClass}
                aria-describedby="series-slug-hint"
              />
              <p id="series-slug-hint" className="text-[10px] text-editorial-muted mt-1">
                يستخدم في رابط الصفحة العامة: /series/&lt;slug&gt;
              </p>
            </div>
            <div>
              <label htmlFor="series-hook" className={labelClass}>
                الجملة التسويقية *
              </label>
              <input
                id="series-hook"
                type="text"
                value={form.hook}
                onChange={(e) => setField('hook', e.target.value)}
                className={inputClass}
                aria-invalid={Boolean(errors.hook)}
              />
              {errors.hook && (
                <p role="alert" className={errorClass}>
                  {errors.hook}
                </p>
              )}
            </div>
            <div>
              <label htmlFor="series-description" className={labelClass}>
                الوصف الكامل *
              </label>
              <textarea
                id="series-description"
                rows={4}
                value={form.description}
                onChange={(e) => setField('description', e.target.value)}
                className={`${inputClass} min-h-24`}
                aria-invalid={Boolean(errors.description)}
              />
              {errors.description && (
                <p role="alert" className={errorClass}>
                  {errors.description}
                </p>
              )}
            </div>
          </div>
        </details>

        <details className={detailsClass}>
          <summary className={summaryClass}>الصور والوسائط (رفع مباشر)</summary>
          <div className="p-4 pt-2 space-y-4">
            <MediaUploadDropzone
              label="صورة الغلاف (بوستر المسلسل)"
              category="poster"
              value={form.posterUrl}
              onChange={(url) => setField('posterUrl', url)}
              error={errors.posterUrl}
              helperText="تظهر في بطاقات المسلسلات والصفحة الرئيسية (نسبة أبعاد 2:3)"
              required
            />
            <MediaUploadDropzone
              label="صورة الواجهة الرئيسية (Hero Artwork)"
              category="hero"
              value={form.heroArtworkUrl}
              onChange={(url) => setField('heroArtworkUrl', url)}
              error={errors.heroArtworkUrl}
              helperText="بانر أفقي عالي الدقة يظهر أعلى صفحة المسلسل (نسبة أبعاد 16:9)"
              required
            />
            <MediaUploadDropzone
              label="فيديو المشاركة والترويج (اختياري)"
              category="video"
              value={form.shareVideoUrl}
              onChange={(url) => setField('shareVideoUrl', url)}
              error={errors.shareVideoUrl}
              helperText="مقطع قصير ترويجي أو فيديو تيزر يُشارك على وسائل التواصل"
            />
          </div>
        </details>

        <details className={detailsClass}>
          <summary className={summaryClass}>التصنيف وتحذيرات المحتوى</summary>
          <div className="p-4 pt-1 space-y-3">
            <div>
              <label htmlFor="series-genres" className={labelClass}>
                التصنيفات — مفصولة بفواصل (حتى 12)
              </label>
              <input
                id="series-genres"
                type="text"
                value={form.genresText}
                onChange={(e) => setField('genresText', e.target.value)}
                placeholder="غموض، تشويق، جريمة"
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor="series-warnings" className={labelClass}>
                تحذيرات المحتوى — مفصولة بفواصل (حتى 10)
              </label>
              <input
                id="series-warnings"
                type="text"
                value={form.contentWarningsText}
                onChange={(e) => setField('contentWarningsText', e.target.value)}
                placeholder="عنف، لغة قاسية"
                className={inputClass}
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor="series-rating" className={labelClass}>
                  تصنيف العمر
                </label>
                <select
                  id="series-rating"
                  value={form.contentRating}
                  onChange={(e) => setField('contentRating', e.target.value as AdminSeriesDTO['contentRating'])}
                  className={inputClass}
                >
                  <option value="GENERAL">للجميع</option>
                  <option value="PG13">+13</option>
                  <option value="PG16">+16</option>
                  <option value="PG18">+18</option>
                </select>
              </div>
              <div>
                <label htmlFor="series-year" className={labelClass}>
                  سنة الإنتاج
                </label>
                <input
                  id="series-year"
                  type="number"
                  min="1900"
                  max="2100"
                  value={form.productionYear}
                  onChange={(e) => setField('productionYear', e.target.value)}
                  className={inputClass}
                  aria-invalid={Boolean(errors.productionYear)}
                />
                {errors.productionYear && (
                  <p role="alert" className={errorClass}>
                    {errors.productionYear}
                  </p>
                )}
              </div>
            </div>
          </div>
        </details>

        <details className={detailsClass}>
          <summary className={summaryClass}>النشر والاكتمال</summary>
          <div className="p-4 pt-1 space-y-3">
            <div>
              <label htmlFor="series-free-count" className={labelClass}>
                عدد الحلقات المجانية تلقائياً (أول N حلقة من كل موسم)
              </label>
              <input
                id="series-free-count"
                type="number"
                min="0"
                max="10"
                value={form.freeEpisodesCount}
                onChange={(e) => setField('freeEpisodesCount', e.target.value)}
                className={inputClass}
                aria-invalid={Boolean(errors.freeEpisodesCount)}
              />
              {errors.freeEpisodesCount && (
                <p role="alert" className={errorClass}>
                  {errors.freeEpisodesCount}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <label className="flex items-center gap-3 min-h-11 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.published}
                  onChange={(e) => setField('published', e.target.checked)}
                  className="w-5 h-5 accent-[#A8202A]"
                />
                <span className="text-xs text-editorial-secondary">
                  منشور للجمهور — {form.published ? 'سيظهر في الكتالوج' : 'مخفي حتى النشر'}
                </span>
              </label>
              <label className="flex items-center gap-3 min-h-11 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.isCompleted}
                  onChange={(e) => setField('isCompleted', e.target.checked)}
                  className="w-5 h-5 accent-[#A8202A]"
                />
                <span className="text-xs text-editorial-secondary">مسلسل مكتمل (انتهت حلقاته)</span>
              </label>
              <label className="flex items-center gap-3 min-h-11 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.featured}
                  onChange={(e) => setField('featured', e.target.checked)}
                  className="w-5 h-5 accent-[#A8202A]"
                />
                <span className="text-xs text-editorial-secondary">مُبرَز في الصفحة الرئيسية</span>
              </label>
            </div>
          </div>
        </details>

        {!series && (
          <div className="p-3.5 rounded-xl bg-surface-elevated/70 border border-border-subtle flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
            <label className="flex items-center gap-2.5 text-xs font-bold text-editorial-ivory cursor-pointer select-none">
              <input
                type="checkbox"
                checked={autoCreateSeason1}
                onChange={(e) => setAutoCreateSeason1(e.target.checked)}
                className="w-4 h-4 accent-[#A8202A] rounded"
              />
              <span>إنشاء «الموسم الأول» تلقائياً داخل العمل</span>
            </label>
            <span className="text-[11px] text-editorial-muted">
              يتيح لك البدء في رفع الحلقات والصوتيات فوراً
            </span>
          </div>
        )}

        {serverError && (
          <p role="alert" className="p-3 bg-red-950/40 border border-red-800 text-red-300 text-xs rounded-lg">
            {serverError}
          </p>
        )}

        <div className="flex justify-start gap-2 pt-2 border-t border-border-subtle">
          <button
            type="submit"
            disabled={saving}
            className="min-h-11 px-5 py-2.5 bg-crimson hover:bg-crimson-bright text-white text-xs font-bold rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-crimson-glow focus-visible:ring-offset-2 focus-visible:ring-offset-obsidian"
          >
            {saving && <Loader2 size={14} className="animate-spin" aria-label="جارٍ الحفظ" />}
            <span>{saving ? 'جارٍ الحفظ...' : series ? 'حفظ التعديلات' : 'إنشاء المسلسل'}</span>
          </button>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="min-h-11 px-4 py-2.5 bg-surface-elevated hover:bg-border-subtle text-editorial-secondary text-xs font-semibold rounded-lg transition-colors disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-crimson-glow"
          >
            إلغاء
          </button>
        </div>
      </form>
    </ModalDialog>
  );
};
