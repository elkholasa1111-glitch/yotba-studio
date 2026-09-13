'use client';

import React, { useState } from 'react';
import {
  Film,
  Eye,
  EyeOff,
  Loader2,
  Pencil,
  Plus,
  Trash2,
  Upload,
  Globe,
  GlobeLock,
  Subtitles,
  Clock,
} from 'lucide-react';
import { ConfirmDialog } from './cms/ConfirmDialog';
import { SeriesEditor } from './cms/SeriesEditor';
import { SeasonEditor } from './cms/SeasonEditor';
import { EpisodeEditor } from './cms/EpisodeEditor';
import { TranscriptEditor } from './cms/TranscriptEditor';
import {
  adminApi,
  formatDuration,
  AUDIO_STATUS_LABELS,
  RELEASE_STATUS_LABELS,
  CONTENT_RATING_LABELS,
  AdminSeriesDTO,
  AudioStatus,
} from './cms/shared';

interface AdminCmsWorkspaceProps {
  seriesList: AdminSeriesDTO[];
  onRefresh: () => Promise<void>;
  showNotice: (type: 'success' | 'error', msg: string) => void;
}

type EditorState =
  | { kind: 'series'; series: AdminSeriesDTO | null }
  | { kind: 'season'; series: AdminSeriesDTO; season: AdminSeriesDTO['seasons'][number] | null }
  | { kind: 'episode'; series: AdminSeriesDTO; season: AdminSeriesDTO['seasons'][number]; episode: AdminSeriesDTO['seasons'][number]['episodes'][number] | null }
  | { kind: 'transcript'; series: AdminSeriesDTO; season: AdminSeriesDTO['seasons'][number]; episode: AdminSeriesDTO['seasons'][number]['episodes'][number] }
  | null;

interface ConfirmState {
  title: string;
  message: string;
  confirmLabel: string;
  action: () => Promise<void>;
}

const AUDIO_BADGE_STYLES: Record<AudioStatus, string> = {
  MISSING: 'bg-red-950/40 text-red-300',
  PROTECTED: 'bg-crimson-subtle text-[#E85A65]',
  PUBLIC: 'bg-surface border border-border-strong text-editorial-secondary',
};

const btnBase =
  'min-h-11 flex items-center justify-center gap-1.5 rounded font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-crimson-glow focus-visible:ring-offset-2 focus-visible:ring-offset-obsidian disabled:opacity-50';
const btnPrimary = `${btnBase} px-4 py-2 bg-crimson hover:bg-crimson-bright text-white text-xs font-bold shadow-halo`;
const btnSecondary = `${btnBase} px-3 py-2 bg-surface-elevated hover:bg-border-subtle text-editorial-secondary text-[11px]`;
const btnGhost = `${btnBase} px-3 py-2 border border-border-subtle text-editorial-secondary hover:text-editorial-ivory hover:border-crimson text-[11px]`;
const btnDanger = `${btnBase} px-3 py-2 border border-red-900/50 text-red-300 hover:bg-red-950/40 text-[11px]`;
const inputClass =
  'min-h-11 w-24 rounded border border-border-subtle bg-surface px-2 text-xs text-editorial-ivory focus:border-crimson focus:outline-none focus-visible:ring-2 focus-visible:ring-crimson-glow';

export const AdminCmsWorkspace: React.FC<AdminCmsWorkspaceProps> = ({ seriesList, onRefresh, showNotice }) => {
  const [editor, setEditor] = useState<EditorState>(null);
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);
  const [busyDeleteId, setBusyDeleteId] = useState<string | null>(null);
  const [savingFreeCountId, setSavingFreeCountId] = useState<string | null>(null);
  const [savingSeasonPriceId, setSavingSeasonPriceId] = useState<string | null>(null);
  const [savingEpisodeId, setSavingEpisodeId] = useState<string | null>(null);
  const [togglingPublishId, setTogglingPublishId] = useState<string | null>(null);
  const [seasonPriceDrafts, setSeasonPriceDrafts] = useState<Record<string, string>>({});

  // ---------- الإجراءات السريعة المحفوظة (مجانية/سعر/نشر) ----------

  const handleUpdateFreeCount = async (seriesId: string, newCount: number) => {
    setSavingFreeCountId(seriesId);
    try {
      const res = await adminApi<{ title: string }>('/api/v1/admin/content', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ seriesId, freeEpisodesCount: newCount }),
      });
      if (res.ok) {
        await onRefresh();
        showNotice('success', `تم حفظ عدد الحلقات المجانية إلى ${newCount}`);
      } else {
        showNotice('error', res.error);
      }
    } finally {
      setSavingFreeCountId(null);
    }
  };

  const handleToggleEpisodeFree = async (episodeId: string, nextIsFree: boolean) => {
    setSavingEpisodeId(episodeId);
    try {
      const res = await adminApi<{ success: boolean }>('/api/v1/admin/content', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ episodeId, isFree: nextIsFree }),
      });
      if (res.ok) {
        await onRefresh();
        showNotice('success', nextIsFree ? 'أصبحت الحلقة متاحة مجاناً' : 'أصبحت الحلقة مقفلة (تتطلب شراء الموسم أو اشتراكاً)');
      } else {
        showNotice('error', res.error);
      }
    } finally {
      setSavingEpisodeId(null);
    }
  };

  const handleUpdateSeasonPrice = async (seasonId: string, rawPrice: string) => {
    const nextPrice = Number(rawPrice);
    if (!Number.isFinite(nextPrice) || nextPrice <= 0 || nextPrice > 10000) {
      showNotice('error', 'أدخل سعراً أكبر من صفر وأقل من 10000');
      return;
    }
    setSavingSeasonPriceId(seasonId);
    try {
      const res = await adminApi<{ title: string; price: number }>('/api/v1/admin/content', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ seasonId, price: nextPrice }),
      });
      if (res.ok) {
        await onRefresh();
        setSeasonPriceDrafts((prev) => {
          const next = { ...prev };
          delete next[seasonId];
          return next;
        });
        showNotice('success', `تم حفظ سعر ${res.data.title} بنجاح`);
      } else {
        showNotice('error', res.error);
      }
    } finally {
      setSavingSeasonPriceId(null);
    }
  };

  const handleTogglePublish = async (series: AdminSeriesDTO) => {
    const publishing = series.publishedAt === null;
    setTogglingPublishId(series._id);
    try {
      const res = await adminApi<{ success: boolean }>('/api/v1/admin/content', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entity: 'series', seriesId: series._id, published: publishing }),
      });
      if (res.ok) {
        await onRefresh();
        showNotice('success', publishing ? 'تم نشر المسلسل — أصبح ظاهراً في الكتالوج العام' : 'تم إخفاء المسلسل من الكتالوج العام');
      } else {
        showNotice('error', res.error);
      }
    } finally {
      setTogglingPublishId(null);
    }
  };

  // ---------- الحذف مع قواعد التتالي ----------

  const requestDeleteSeries = (series: AdminSeriesDTO) => {
    const seasonsCount = series.seasons.length;
    setConfirmState({
      title: 'حذف المسلسل',
      message: seasonsCount
        ? `سيتم حذف "${series.title}" مع كل مواسمه (${seasonsCount}) وحلقاته ونصوصها المتزامنة نهائياً. لا يمكن التراجع عن هذا الإجراء.`
        : `سيتم حذف "${series.title}" نهائياً. لا يمكن التراجع عن هذا الإجراء.`,
      confirmLabel: 'حذف نهائي',
      action: async () => {
        setBusyDeleteId(series._id);
        try {
          const res = await adminApi<{ success: boolean }>(
            `/api/v1/admin/content?entity=series&id=${encodeURIComponent(series._id)}&cascade=true`,
            { method: 'DELETE' }
          );
          if (res.ok) {
            await onRefresh();
            showNotice('success', 'تم حذف المسلسل وكل محتواه المرتبط');
          } else {
            showNotice('error', res.error);
          }
        } finally {
          setBusyDeleteId(null);
        }
      },
    });
  };

  const requestDeleteSeason = (series: AdminSeriesDTO, season: AdminSeriesDTO['seasons'][number]) => {
    setConfirmState({
      title: 'حذف الموسم',
      message: season.episodes.length
        ? `الموسم "${season.title}" يحتوي ${season.episodes.length} حلقة. الحذف الشامل سيزيل الحلقات ونصوصها المتزامنة نهائياً. لإبقائها احذفها أولاً أو انقلها.`
        : `سيتم حذف الموسم "${season.title}" نهائياً.`,
      confirmLabel: season.episodes.length ? 'حذف شامل (مع الحلقات)' : 'حذف نهائي',
      action: async () => {
        setBusyDeleteId(season._id);
        try {
          const cascade = season.episodes.length > 0 ? '&cascade=true' : '';
          const res = await adminApi<{ success: boolean }>(
            `/api/v1/admin/content?entity=season&id=${encodeURIComponent(season._id)}${cascade}`,
            { method: 'DELETE' }
          );
          if (res.ok) {
            await onRefresh();
            showNotice('success', 'تم حذف الموسم');
          } else {
            showNotice('error', res.error);
          }
        } finally {
          setBusyDeleteId(null);
        }
      },
    });
  };

  const requestDeleteEpisode = (episode: AdminSeriesDTO['seasons'][number]['episodes'][number]) => {
    setConfirmState({
      title: 'حذف الحلقة',
      message: episode.hasTranscript
        ? `سيتم حذف الحلقة "${episode.title}" مع نصها المتزامن (${episode.transcriptSegmentsCount} مقطعاً) في خطوة واحدة لتفادي مرجع معلق.`
        : `سيتم حذف الحلقة "${episode.title}" نهائياً.`,
      confirmLabel: 'حذف نهائي',
      action: async () => {
        setBusyDeleteId(episode._id);
        try {
          const withTranscript = episode.hasTranscript ? '&deleteTranscript=true' : '';
          const res = await adminApi<{ success: boolean }>(
            `/api/v1/admin/content?entity=episode&id=${encodeURIComponent(episode._id)}${withTranscript}`,
            { method: 'DELETE' }
          );
          if (res.ok) {
            await onRefresh();
            showNotice('success', 'تم حذف الحلقة');
          } else {
            showNotice('error', res.error);
          }
        } finally {
          setBusyDeleteId(null);
        }
      },
    });
  };

  const closeEditor = () => setEditor(null);

  return (
    <div className="space-y-6">
      {/* رأس مساحة العمل */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-bold text-editorial-ivory flex items-center gap-2">
            <Film size={18} className="text-crimson" />
            إدارة الكتالوج
          </h3>
          <p className="text-xs text-editorial-muted mt-1">
            أنشئ العمل ثم أضف مواسمه وحلقاته وصوته
          </p>
        </div>
        <button
          type="button"
          onClick={() => setEditor({ kind: 'series', series: null })}
          className={btnPrimary}
          aria-haspopup="dialog"
        >
          <Plus size={15} />
          <span>مسلسل جديد</span>
        </button>
      </div>

      {/* الحالة الفارغة */}
      {seriesList.length === 0 ? (
        <div className="p-8 bg-surface border border-border-subtle rounded-lg text-center space-y-3">
          <p className="text-sm text-editorial-ivory font-semibold">لا توجد مسلسلات في قاعدة البيانات</p>
          <p className="text-xs text-editorial-muted">
            ابدأ بإنشاء مسلسل جديد من الزر أعلاه.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {seriesList.map((series) => {
            const isPublished = series.publishedAt !== null;
            return (
              <div key={series._id} className="p-5 bg-surface border border-border-subtle rounded-lg space-y-4">
                <div className="flex flex-col lg:flex-row items-start lg:items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 className="text-lg font-bold text-editorial-ivory">{series.title}</h4>
                      <span className="px-2 py-0.5 bg-surface-elevated border border-border-subtle text-editorial-muted text-[10px] rounded">
                        {CONTENT_RATING_LABELS[series.contentRating] ?? series.contentRating}
                      </span>
                      <span
                        className={`px-2 py-0.5 text-[10px] rounded font-semibold ${
                          isPublished ? 'bg-crimson-subtle text-[#E85A65]' : 'bg-surface-elevated text-editorial-muted border border-border-subtle'
                        }`}
                      >
                        {isPublished ? 'منشور' : 'غير منشور'}
                      </span>
                      {series.featured && (
                        <span className="px-2 py-0.5 bg-crimson-subtle text-[#E85A65] text-[10px] rounded font-semibold">مُبرَز</span>
                      )}
                    </div>
                    <p className="text-xs text-editorial-secondary mt-1">{series.hook}</p>
                    <p className="text-[10px] text-editorial-muted mt-1" dir="ltr">
                      /series/{series.slug} · {series.productionYear}
                    </p>
                  </div>

                  <div className="flex flex-col items-start sm:items-end gap-2 flex-shrink-0">
                    {/* تحكم الإدارة بالحلقات المجانية — حفظ حقيقي */}
                    <div className="flex items-center gap-3 bg-surface-elevated p-2 rounded-lg border border-border-subtle">
                      <span className="text-xs text-editorial-muted">الحلقات المجانية:</span>
                      <div className="flex items-center gap-1">
                        {[0, 1, 2, 3, 4].map((num) => (
                          <button
                            type="button"
                            key={num}
                            onClick={() => handleUpdateFreeCount(series._id, num)}
                            disabled={savingFreeCountId === series._id}
                            aria-label={num === 0 ? `إغلاق الحلقات المجانية لـ ${series.title}` : `تعيين ${num} حلقات مجانية لـ ${series.title}`}
                            aria-pressed={series.freeEpisodesCount === num}
                            className={`w-11 h-11 rounded text-xs font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-crimson-glow focus-visible:ring-offset-2 focus-visible:ring-offset-obsidian disabled:opacity-50 ${
                              series.freeEpisodesCount === num
                                ? 'bg-crimson text-white shadow-halo'
                                : 'bg-surface hover:bg-border-subtle text-editorial-secondary'
                            }`}
                          >
                            {savingFreeCountId === series._id && series.freeEpisodesCount === num ? (
                              <Loader2 size={14} className="animate-spin mx-auto" />
                            ) : (
                              num === 0 ? 'لا' : num
                            )}
                          </button>
                        ))}
                      </div>
                    </div>
                    <p className="text-[10px] text-editorial-muted max-w-[16rem] sm:text-left">
                      ينطبق على أول N حلقة من كل موسم، بجانب الحلقات المحددة يدوياً أدناه.
                    </p>

                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => handleTogglePublish(series)}
                        disabled={togglingPublishId === series._id}
                        className={series.publishedAt === null ? btnPrimary : btnGhost}
                        aria-label={isPublished ? `إلغاء نشر ${series.title}` : `نشر ${series.title}`}
                      >
                        {togglingPublishId === series._id ? (
                          <Loader2 size={13} className="animate-spin" />
                        ) : isPublished ? (
                          <GlobeLock size={13} />
                        ) : (
                          <Globe size={13} />
                        )}
                        <span>{isPublished ? 'إلغاء النشر' : 'نشر'}</span>
                      </button>
                      <button type="button" onClick={() => setEditor({ kind: 'series', series })} className={btnSecondary} aria-haspopup="dialog">
                        <Pencil size={12} />
                        <span>تعديل</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => requestDeleteSeries(series)}
                        disabled={busyDeleteId === series._id}
                        className={btnDanger}
                        aria-label={`حذف ${series.title}`}
                      >
                        {busyDeleteId === series._id ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                        <span>حذف</span>
                      </button>
                    </div>
                  </div>
                </div>

                {/* المواسم */}
                <div className="pt-3 border-t border-border-subtle/60 space-y-2">
                  <div className="flex justify-between items-center flex-wrap gap-2">
                    <span className="text-xs font-semibold text-editorial-muted block">
                      المواسم ({series.seasons.length}):
                    </span>
                    <button
                      type="button"
                      onClick={() => setEditor({ kind: 'season', series, season: null })}
                      className={btnSecondary}
                      aria-haspopup="dialog"
                    >
                      <Plus size={12} />
                      <span>إضافة موسم</span>
                    </button>
                  </div>
                  {series.seasons.length === 0 ? (
                    <p className="text-[10px] text-editorial-muted">لا توجد مواسم بعد — أضف موسماً لبدء رفع الحلقات.</p>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {series.seasons.map((season) => (
                        <div key={season._id} className="p-3 bg-surface-elevated rounded-lg border border-border-subtle space-y-3">
                          <div className="flex justify-between items-start text-xs gap-2">
                            <div className="min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-bold text-editorial-ivory">
                                  م{season.seasonNumber}: {season.title}
                                </span>
                                <span className="text-[10px] text-editorial-muted border border-border-subtle rounded px-1.5">
                                  {RELEASE_STATUS_LABELS[season.releaseStatus] ?? season.releaseStatus}
                                </span>
                              </div>
                              <span className="text-editorial-muted block text-[10px]">
                                {season.episodes.length} حلقة · {season.price} {season.currency}
                              </span>
                              <div className="mt-2 flex items-center gap-2 flex-wrap">
                                <label htmlFor={`season-price-${season._id}`} className="sr-only">
                                  سعر {season.title}
                                </label>
                                <input
                                  id={`season-price-${season._id}`}
                                  type="number"
                                  min="0.01"
                                  max="10000"
                                  step="0.01"
                                  value={seasonPriceDrafts[season._id] ?? String(season.price)}
                                  onChange={(event) => setSeasonPriceDrafts((prev) => ({ ...prev, [season._id]: event.target.value }))}
                                  className={inputClass}
                                />
                                <span className="text-[10px] text-editorial-muted">{season.currency}</span>
                                <button
                                  type="button"
                                  onClick={() => handleUpdateSeasonPrice(season._id, seasonPriceDrafts[season._id] ?? String(season.price))}
                                  disabled={savingSeasonPriceId === season._id}
                                  className={btnSecondary}
                                >
                                  {savingSeasonPriceId === season._id ? (
                                    <Loader2 size={13} className="animate-spin" aria-label="جارٍ الحفظ" />
                                  ) : (
                                    'حفظ السعر'
                                  )}
                                </button>
                              </div>
                            </div>
                            <div className="flex flex-col items-end gap-2 flex-shrink-0">
                              <span className="text-[11px] text-editorial-secondary">
                                {season.episodes.filter((e) => e.isFree || e.episodeNumber <= series.freeEpisodesCount).length} مجانية
                              </span>
                              <div className="flex gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => setEditor({ kind: 'season', series, season })}
                                  className={btnSecondary}
                                  aria-label={`تعديل الموسم ${season.title}`}
                                  aria-haspopup="dialog"
                                >
                                  <Pencil size={11} />
                                  <span>تعديل</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => requestDeleteSeason(series, season)}
                                  disabled={busyDeleteId === season._id}
                                  className={btnDanger}
                                  aria-label={`حذف الموسم ${season.title}`}
                                >
                                  {busyDeleteId === season._id ? <Loader2 size={11} className="animate-spin" /> : <Trash2 size={11} />}
                                  <span>حذف</span>
                                </button>
                              </div>
                            </div>
                          </div>

                          {/* الحلقات */}
                          <div className="space-y-2">
                            <div className="flex justify-between items-center">
                              <span className="text-[10px] font-semibold text-editorial-muted">الحلقات:</span>
                              <button
                                type="button"
                                onClick={() => setEditor({ kind: 'episode', series, season, episode: null })}
                                className={btnSecondary}
                                aria-haspopup="dialog"
                              >
                                <Plus size={11} />
                                <span>إضافة حلقة</span>
                              </button>
                            </div>

                            {season.episodes.length === 0 ? (
                              <p className="text-[10px] text-editorial-muted">لا توجد حلقات في هذا الموسم بعد.</p>
                            ) : (
                              <ul className="space-y-1.5">
                                {season.episodes.map((episode) => {
                                  const isFreeBySeriesRule = episode.episodeNumber <= series.freeEpisodesCount;
                                  const isEffectivelyFree = episode.isFree || isFreeBySeriesRule;
                                  return (
                                    <li
                                      key={episode._id}
                                      className="p-2 bg-surface rounded border border-border-subtle/60 space-y-2"
                                    >
                                      <div className="flex items-start justify-between gap-2">
                                        <div className="min-w-0">
                                          <span className="text-[11px] text-editorial-ivory font-semibold block truncate">
                                            {episode.episodeNumber}. {episode.title}
                                          </span>
                                          <span className="text-[10px] text-editorial-muted flex items-center gap-1.5 flex-wrap">
                                            <Clock size={9} />
                                            {formatDuration(episode.durationMs)}
                                            {episode.hasTranscript && (
                                              <span className="flex items-center gap-0.5 text-editorial-secondary">
                                                <Subtitles size={9} />
                                                نص ({episode.transcriptSegmentsCount})
                                              </span>
                                            )}
                                          </span>
                                        </div>
                                        <div className="flex items-center gap-1.5 flex-shrink-0">
                                          <span
                                            className={`px-1.5 py-1 rounded text-[9px] font-semibold ${AUDIO_BADGE_STYLES[episode.audioStatus]}`}
                                            title={AUDIO_STATUS_LABELS[episode.audioStatus]}
                                          >
                                            {episode.audioStatus === 'MISSING' ? 'بلا صوت' : episode.audioStatus === 'PROTECTED' ? 'صوت محمي' : 'رابط عام'}
                                          </span>
                                          <button
                                            type="button"
                                            onClick={() => handleToggleEpisodeFree(episode._id, !episode.isFree)}
                                            disabled={savingEpisodeId === episode._id || isFreeBySeriesRule}
                                            aria-pressed={isEffectivelyFree}
                                            aria-label={
                                              isFreeBySeriesRule
                                                ? `الحلقة ${episode.episodeNumber} في ${season.title} مجانية تلقائياً ضمن إعداد المسلسل`
                                                : episode.isFree
                                                ? `إلغاء المجانية من حلقة ${episode.episodeNumber} في ${season.title}`
                                                : `تعيين حلقة ${episode.episodeNumber} في ${season.title} كمجانية`
                                            }
                                            className={`flex items-center justify-center gap-1 min-w-11 min-h-11 px-1.5 rounded text-[10px] font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-crimson-glow focus-visible:ring-offset-2 focus-visible:ring-offset-obsidian disabled:opacity-50 ${
                                              isEffectivelyFree
                                                ? 'bg-crimson text-white shadow-halo'
                                                : 'bg-surface-elevated hover:bg-border-subtle text-editorial-secondary'
                                            }`}
                                          >
                                            {savingEpisodeId === episode._id ? (
                                              <Loader2 size={13} className="animate-spin" />
                                            ) : isEffectivelyFree ? (
                                              <Eye size={12} />
                                            ) : (
                                              <EyeOff size={12} />
                                            )}
                                            <span>{isFreeBySeriesRule ? 'مجانية تلقائياً' : episode.isFree ? 'مجانية' : 'مقفلة'}</span>
                                          </button>
                                        </div>
                                      </div>

                                      <div className="flex gap-1.5 justify-start border-t border-border-subtle/40 pt-1.5">
                                        <button
                                          type="button"
                                          onClick={() => setEditor({ kind: 'episode', series, season, episode })}
                                          className={`${btnSecondary} !px-2`}
                                          aria-label={`تعديل الحلقة ${episode.episodeNumber}`}
                                          aria-haspopup="dialog"
                                        >
                                          <Pencil size={10} />
                                          <span>تعديل / صوت</span>
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => setEditor({ kind: 'transcript', series, season, episode })}
                                          className={`${btnSecondary} !px-2`}
                                          aria-label={`النص المتزامن للحلقة ${episode.episodeNumber}`}
                                          aria-haspopup="dialog"
                                        >
                                          <Upload size={10} className="rotate-180" aria-hidden="true" />
                                          <span>{episode.hasTranscript ? 'تحرير النص' : 'إضافة نص'}</span>
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => requestDeleteEpisode(episode)}
                                          disabled={busyDeleteId === episode._id}
                                          className={`${btnDanger} !px-2`}
                                          aria-label={`حذف الحلقة ${episode.episodeNumber}`}
                                        >
                                          {busyDeleteId === episode._id ? <Loader2 size={10} className="animate-spin" /> : <Trash2 size={10} />}
                                          <span>حذف</span>
                                        </button>
                                      </div>
                                    </li>
                                  );
                                })}
                              </ul>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* النوافذ */}
      {editor?.kind === 'series' && (
        <SeriesEditor series={editor.series} onClose={closeEditor} onSaved={onRefresh} showNotice={showNotice} />
      )}
      {editor?.kind === 'season' && (
        <SeasonEditor
          series={editor.series}
          season={editor.season}
          nextSeasonNumber={(editor.series.seasons.reduce((max, s) => Math.max(max, s.seasonNumber), 0) || 0) + 1}
          onClose={closeEditor}
          onSaved={onRefresh}
          showNotice={showNotice}
        />
      )}
      {editor?.kind === 'episode' && (
        <EpisodeEditor
          series={editor.series}
          season={editor.season}
          episode={editor.episode}
          onClose={closeEditor}
          onSaved={onRefresh}
          showNotice={showNotice}
          onOpenTranscript={(episode) => setEditor({ kind: 'transcript', series: editor.series, season: editor.season, episode })}
        />
      )}
      {editor?.kind === 'transcript' && (
        <TranscriptEditor
          episode={editor.episode}
          seriesTitle={editor.series.title}
          seasonTitle={editor.season.title}
          onClose={closeEditor}
          onSaved={onRefresh}
          showNotice={showNotice}
        />
      )}
      {confirmState && (
        <ConfirmDialog
          title={confirmState.title}
          message={confirmState.message}
          confirmLabel={confirmState.confirmLabel}
          onConfirm={async () => {
            await confirmState.action();
            setConfirmState(null);
          }}
          onCancel={() => setConfirmState(null)}
        />
      )}
    </div>
  );
};
