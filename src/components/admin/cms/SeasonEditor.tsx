'use client';

import React, { useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { ModalDialog } from './ModalDialog';
import { adminApi, AdminSeriesDTO, ReleaseStatus } from './shared';

interface SeasonEditorProps {
  series: AdminSeriesDTO;
  season: AdminSeriesDTO['seasons'][number] | null;
  nextSeasonNumber: number;
  onClose: () => void;
  onSaved: () => Promise<void>;
  showNotice: (type: 'success' | 'error', msg: string) => void;
}

interface SeasonFormState {
  seasonNumber: string;
  title: string;
  description: string;
  releaseStatus: ReleaseStatus;
  price: string;
}

function initialState(season: SeasonEditorProps['season'], nextSeasonNumber: number): SeasonFormState {
  return {
    seasonNumber: String(season?.seasonNumber ?? nextSeasonNumber),
    title: season?.title ?? '',
    description: season?.description ?? '',
    releaseStatus: season?.releaseStatus ?? 'AVAILABLE',
    price: String(season?.price ?? 0.5),
  };
}

const inputClass =
  'w-full min-h-11 bg-surface-elevated border border-border-subtle rounded-lg p-2.5 text-xs text-editorial-ivory focus:outline-none focus:border-crimson focus-visible:ring-2 focus-visible:ring-crimson-glow';
const labelClass = 'text-xs text-editorial-secondary block mb-1';
const errorClass = 'text-[10px] text-red-400 mt-1';

export const SeasonEditor: React.FC<SeasonEditorProps> = ({ series, season, nextSeasonNumber, onClose, onSaved, showNotice }) => {
  const initial = useMemo(() => initialState(season, nextSeasonNumber), [season, nextSeasonNumber]);
  const [form, setForm] = useState<SeasonFormState>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const isDirty = JSON.stringify(form) !== JSON.stringify(initial);
  const setField = <K extends keyof SeasonFormState>(key: K, value: SeasonFormState[K]) => {
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
    const number = Number(form.seasonNumber);
    if (!Number.isInteger(number) || number < 1 || number > 100) nextErrors.seasonNumber = 'رقم الموسم بين 1 و 100';
    if (form.title.trim().length === 0 || form.title.trim().length > 150) nextErrors.title = 'عنوان الموسم مطلوب (حتى 150 حرفاً)';
    const price = Number(form.price);
    if (!Number.isFinite(price) || price < 0.01 || price > 10000) nextErrors.price = 'السعر بين 0.01 و 10000';
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
        entity: 'season',
        seriesId: series._id,
        seasonNumber: Number(form.seasonNumber),
        title: form.title.trim(),
        description: form.description.trim() || null,
        releaseStatus: form.releaseStatus,
        price: Number(form.price),
        currency: 'USD',
      };

      const res = season
        ? await adminApi<{ success: boolean }>('/api/v1/admin/content', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...payload, seasonId: season._id }),
          })
        : await adminApi<{ success: boolean }>('/api/v1/admin/content', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          });

      if (!res.ok) {
        setServerError(res.error);
        return;
      }
      await onSaved();
      showNotice('success', season ? 'تم حفظ تعديلات الموسم بنجاح' : 'تم إنشاء الموسم بنجاح');
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalDialog title={season ? `تعديل الموسم: ${season.title}` : `موسم جديد في ${series.title}`} onClose={onClose} isDirty={isDirty}>
      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label htmlFor="season-number" className={labelClass}>
              رقم الموسم *
            </label>
            <input
              id="season-number"
              type="number"
              min="1"
              max="100"
              value={form.seasonNumber}
              onChange={(e) => setField('seasonNumber', e.target.value)}
              className={inputClass}
              aria-invalid={Boolean(errors.seasonNumber)}
            />
            {errors.seasonNumber && (
              <p role="alert" className={errorClass}>
                {errors.seasonNumber}
              </p>
            )}
          </div>
          <div>
            <label htmlFor="season-status" className={labelClass}>
              حالة الإصدار
            </label>
            <select
              id="season-status"
              value={form.releaseStatus}
              onChange={(e) => setField('releaseStatus', e.target.value as ReleaseStatus)}
              className={inputClass}
            >
              <option value="AVAILABLE">متاح</option>
              <option value="COMING_SOON">قريباً</option>
              <option value="IN_PRODUCTION">قيد الإنتاج</option>
            </select>
          </div>
        </div>

        <div>
          <label htmlFor="season-title" className={labelClass}>
            عنوان الموسم *
          </label>
          <input
            id="season-title"
            type="text"
            value={form.title}
            onChange={(e) => setField('title', e.target.value)}
            className={inputClass}
            aria-invalid={Boolean(errors.title)}
          />
          {errors.title && (
            <p role="alert" className={errorClass}>
              {errors.title}
            </p>
          )}
        </div>

        <div>
          <label htmlFor="season-description" className={labelClass}>
            وصف الموسم (اختياري)
          </label>
          <textarea
            id="season-description"
            rows={3}
            value={form.description}
            onChange={(e) => setField('description', e.target.value)}
            className={`${inputClass} min-h-20`}
          />
        </div>

        <div>
          <label htmlFor="season-price" className={labelClass}>
            سعر شراء الموسم (USD) *
          </label>
          <input
            id="season-price"
            type="number"
            min="0.01"
            max="10000"
            step="0.01"
            value={form.price}
            onChange={(e) => setField('price', e.target.value)}
            className={inputClass}
            aria-invalid={Boolean(errors.price)}
            aria-describedby="season-price-hint"
          />
          <p id="season-price-hint" className="text-[10px] text-editorial-muted mt-1">
            يُعرض للمستخدمين بعملاتهم المحلية تلقائياً بناء على أسعار صرف إرشادية.
          </p>
          {errors.price && (
            <p role="alert" className={errorClass}>
              {errors.price}
            </p>
          )}
        </div>

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
            <span>{saving ? 'جارٍ الحفظ...' : season ? 'حفظ التعديلات' : 'إنشاء الموسم'}</span>
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
