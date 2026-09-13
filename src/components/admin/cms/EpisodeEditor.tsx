'use client';

import React, { useMemo, useState, useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import { ModalDialog } from './ModalDialog';
import {
  adminApi,
  toLocalInputValue,
  formatDuration,
  AUDIO_STATUS_LABELS,
  AdminSeriesDTO,
  AudioStatus,
} from './shared';
import { MediaUploadDropzone } from './MediaUploadDropzone';

interface EpisodeEditorProps {
  series: AdminSeriesDTO;
  season: AdminSeriesDTO['seasons'][number];
  episode: AdminSeriesDTO['seasons'][number]['episodes'][number] | null;
  onClose: () => void;
  onSaved: () => Promise<void>;
  showNotice: (type: 'success' | 'error', msg: string) => void;
  onOpenTranscript: (episode: AdminSeriesDTO['seasons'][number]['episodes'][number]) => void;
}

interface EpisodeFormState {
  episodeNumber: string;
  title: string;
  teaser: string;
  durationMinutes: string;
  isFree: boolean;
  publishDate: string;
  artworkOverride: string;
}

function initialState(
  episode: EpisodeEditorProps['episode'],
  nextEpisodeNumber: number
): EpisodeFormState {
  return {
    episodeNumber: String(episode?.episodeNumber ?? nextEpisodeNumber),
    title: episode?.title ?? '',
    teaser: episode?.teaser ?? '',
    durationMinutes: episode && episode.durationMs > 0 ? (episode.durationMs / 60000).toFixed(1) : '',
    isFree: episode?.isFree ?? false,
    publishDate: toLocalInputValue(episode?.publishDate ?? null),
    artworkOverride: episode?.artworkOverride ?? '',
  };
}

const inputClass =
  'w-full min-h-11 bg-surface-elevated border border-border-subtle rounded-lg p-2.5 text-xs text-editorial-ivory focus:outline-none focus:border-crimson focus-visible:ring-2 focus-visible:ring-crimson-glow';
const labelClass = 'text-xs text-editorial-secondary block mb-1';
const errorClass = 'text-[10px] text-red-400 mt-1';

function isValidHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

const AUDIO_BADGE_STYLES: Record<AudioStatus, string> = {
  MISSING: 'bg-red-950/40 text-red-300 border border-red-800',
  PROTECTED: 'bg-crimson-subtle text-[#E85A65] border border-crimson/40',
  PUBLIC: 'bg-surface border border-border-strong text-editorial-secondary',
};

export const EpisodeEditor: React.FC<EpisodeEditorProps> = ({
  series,
  season,
  episode,
  onClose,
  onSaved,
  showNotice,
  onOpenTranscript,
}) => {
  const initial = useMemo(() => initialState(episode, season.episodes.length + 1), [episode, season]);
  const [form, setForm] = useState<EpisodeFormState>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [audioStatus, setAudioStatus] = useState<AudioStatus>(episode?.audioStatus ?? 'MISSING');
  const [audioUrl, setAudioUrl] = useState<string>(episode?.audioPublicUrl || '');
  // رابط البث الموقّت للمعاينة فقط؛ لا يدخل في payload ولا يجعل النموذج "متسخاً".
  const [audioPreviewUrl, setAudioPreviewUrl] = useState<string>(episode?.audioPublicUrl || '');
  const [audioStorageKey, setAudioStorageKey] = useState<string>(episode?.audioStorageKey || '');

  // استرجاع رابط البث للمعاينة إذا كانت الحلقة تحتوي على ملف صوتي محمي مسبقاً
  useEffect(() => {
    if (episode?._id && episode.audioStatus !== 'MISSING' && !audioUrl) {
      fetch(`/api/v1/admin/content/audio?episodeId=${episode._id}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          if (data?.streamUrl) {
            setAudioPreviewUrl(data.streamUrl);
          }
        })
        .catch(() => {});
    }
  }, [episode?._id, episode?.audioStatus, audioUrl]);

  const isDirty =
    JSON.stringify(form) !== JSON.stringify(initial) ||
    audioStorageKey !== (episode?.audioStorageKey || '') ||
    audioUrl !== (episode?.audioPublicUrl || '');

  const setField = <K extends keyof EpisodeFormState>(key: K, value: EpisodeFormState[K]) => {
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
    const number = Number(form.episodeNumber);
    if (!Number.isInteger(number) || number < 1 || number > 1000) nextErrors.episodeNumber = 'رقم الحلقة بين 1 و 1000';
    if (form.title.trim().length === 0 || form.title.trim().length > 150) nextErrors.title = 'عنوان الحلقة مطلوب (حتى 150 حرفاً)';
    if (form.teaser.trim().length > 500) nextErrors.teaser = 'النبذة حتى 500 حرف';
    if (form.durationMinutes.trim()) {
      const minutes = Number(form.durationMinutes);
      if (!Number.isFinite(minutes) || minutes < 0 || minutes > 1440) nextErrors.durationMinutes = 'المدة بين 0 و 1440 دقيقة';
    }
    if (form.artworkOverride.trim() && !form.artworkOverride.startsWith('/') && !isValidHttpUrl(form.artworkOverride.trim())) nextErrors.artworkOverride = 'رابط غير صالح';
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
        entity: 'episode',
        seasonId: season._id,
        episodeNumber: Number(form.episodeNumber),
        title: form.title.trim(),
        teaser: form.teaser.trim() || null,
        durationMs: form.durationMinutes.trim() ? Math.round(Number(form.durationMinutes) * 60000) : 0,
        isFree: form.isFree,
        publishDate: form.publishDate ? new Date(form.publishDate).toISOString() : null,
        artworkOverride: form.artworkOverride.trim() || null,
        audioStorageKey: audioStorageKey.trim() || null,
        audioPublicUrl:
          !audioStorageKey.trim() && audioUrl && !audioUrl.startsWith('blob:') && !audioUrl.includes('/stream')
            ? audioUrl.trim()
            : null,
      };

      const res = episode
        ? await adminApi<{ success: boolean }>('/api/v1/admin/content', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...payload, episodeId: episode._id }),
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
      showNotice('success', episode ? 'تم حفظ تعديلات الحلقة بنجاح' : 'تم إنشاء الحلقة بنجاح');
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalDialog title={episode ? `تعديل الحلقة ${episode.episodeNumber}: ${episode.title}` : `حلقة جديدة في ${season.title}`} onClose={onClose} isDirty={isDirty} wide>
      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label htmlFor="episode-number" className={labelClass}>
              رقم الحلقة *
            </label>
            <input
              id="episode-number"
              type="number"
              min="1"
              max="1000"
              value={form.episodeNumber}
              onChange={(e) => setField('episodeNumber', e.target.value)}
              className={inputClass}
              aria-invalid={Boolean(errors.episodeNumber)}
            />
            {errors.episodeNumber && (
              <p role="alert" className={errorClass}>
                {errors.episodeNumber}
              </p>
            )}
          </div>
          <div>
            <label htmlFor="episode-duration" className={labelClass}>
              المدة (دقائق)
            </label>
            <input
              id="episode-duration"
              type="number"
              min="0"
              max="1440"
              step="0.1"
              value={form.durationMinutes}
              onChange={(e) => setField('durationMinutes', e.target.value)}
              className={inputClass}
              aria-invalid={Boolean(errors.durationMinutes)}
              aria-describedby={episode ? 'episode-duration-current' : undefined}
            />
            {episode && (
              <p id="episode-duration-current" className="text-[10px] text-editorial-muted mt-1">
                المدة الحالية: {formatDuration(episode.durationMs)}
              </p>
            )}
            {errors.durationMinutes && (
              <p role="alert" className={errorClass}>
                {errors.durationMinutes}
              </p>
            )}
          </div>
        </div>

        <div>
          <label htmlFor="episode-title" className={labelClass}>
            عنوان الحلقة *
          </label>
          <input
            id="episode-title"
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
          <label htmlFor="episode-teaser" className={labelClass}>
            نبذة تعريفية (اختياري)
          </label>
          <textarea
            id="episode-teaser"
            rows={2}
            value={form.teaser}
            onChange={(e) => setField('teaser', e.target.value)}
            className={`${inputClass} min-h-16`}
          />
          {errors.teaser && (
            <p role="alert" className={errorClass}>
              {errors.teaser}
            </p>
          )}
        </div>

        {/* محرك الرفع المباشر لملف الصوت إلى Cloudflare R2 */}
        <div>
          <MediaUploadDropzone
            label="ملف الصوت الخاص بالحلقة"
            category="audio"
            value={audioPreviewUrl}
            storageKey={audioStorageKey}
            onChange={(url) => {
              setAudioUrl(url);
              setAudioPreviewUrl(url);
              setAudioStatus('PROTECTED');
            }}
            onStorageKeyChange={(key) => {
              setAudioStorageKey(key);
              setAudioStatus('PROTECTED');
            }}
            onDurationDetected={(durationSecs) => {
              if (!form.durationMinutes || form.durationMinutes === '0') {
                setField('durationMinutes', (durationSecs / 60).toFixed(1));
              }
            }}
              helperText="يُرفع إلى R2 مع معاينة وحساب المدة تلقائياً."
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label htmlFor="episode-publish-date" className={labelClass}>
              تاريخ النشر
            </label>
            <input
              id="episode-publish-date"
              type="datetime-local"
              value={form.publishDate}
              onChange={(e) => setField('publishDate', e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <MediaUploadDropzone
              label="صورة مخصصة للحلقة (اختياري)"
              category="image"
              value={form.artworkOverride}
              onChange={(url) => setField('artworkOverride', url)}
              error={errors.artworkOverride}
              helperText="إذا تُركت فارغة، سيُستخدم بوستر المسلسل تلقائياً"
            />
          </div>
        </div>

        <label className="flex items-center gap-3 min-h-11 cursor-pointer" aria-describedby="episode-free-hint">
          <input
            type="checkbox"
            checked={form.isFree}
            onChange={(e) => setField('isFree', e.target.checked)}
            className="w-5 h-5 accent-[#A8202A]"
          />
          <span className="text-xs text-editorial-secondary">حلقة مجانية (مستقلة عن قاعدة أول N حلقة)</span>
        </label>
        <p id="episode-free-hint" className="text-[10px] text-editorial-muted">
          الحلقات التي رقمها ≤ {series.freeEpisodesCount} تُفرض مجانية تلقائياً بغض النظر عن هذا الخيار.
        </p>

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
            <span>{saving ? 'جارٍ الحفظ...' : episode ? 'حفظ التعديلات' : 'إنشاء الحلقة'}</span>
          </button>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="min-h-11 px-4 py-2.5 bg-surface-elevated hover:bg-border-subtle text-editorial-secondary text-xs font-semibold rounded-lg transition-colors disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-crimson-glow"
          >
            إلغاء
          </button>
          {episode && (
            <button
              type="button"
              onClick={() => onOpenTranscript(episode)}
              className="min-h-11 px-4 py-2.5 border border-border-strong text-editorial-ivory hover:border-crimson text-xs font-semibold rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-crimson-glow"
              aria-haspopup="dialog"
            >
              {episode.hasTranscript ? `تحرير النص المتزامن (${episode.transcriptSegmentsCount} مقطعاً)` : 'إضافة نص متزامن'}
            </button>
          )}
        </div>
      </form>
    </ModalDialog>
  );
};
