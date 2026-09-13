'use client';

import React, { useState, useEffect } from 'react';
import {
  Radio,
  Plus,
  Pencil,
  Trash2,
  Lock,
  Unlock,
  Subtitles,
  ChevronDown,
  Volume2,
  Play,
  Pause,
  Clock,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import type { AdminSeriesDTO, AdminSeasonDTO, AdminEpisodeDTO } from '../cms/shared';
import { EpisodeEditor } from '../cms/EpisodeEditor';
import { ConfirmDialog } from '../cms/ConfirmDialog';
import { adminApi, formatDuration } from '../cms/shared';

interface Props {
  seriesList: AdminSeriesDTO[];
  initialSeriesId?: string | null;
  initialSeasonId?: string | null;
  onRefresh: () => Promise<void>;
  showNotice: (type: 'success' | 'error', msg: string) => void;
  onManageTranscript: (seriesId: string, seasonId: string, episodeId: string) => void;
}

export const AdminEpisodesView: React.FC<Props> = ({
  seriesList,
  initialSeriesId,
  initialSeasonId,
  onRefresh,
  showNotice,
  onManageTranscript,
}) => {
  const [selectedSeriesId, setSelectedSeriesId] = useState<string>(
    initialSeriesId || seriesList[0]?._id || ''
  );

  const currentSeries = seriesList.find((s) => s._id === selectedSeriesId) || seriesList[0];
  const seasons = React.useMemo(() => currentSeries?.seasons || [], [currentSeries]);

  const [selectedSeasonId, setSelectedSeasonId] = useState<string>(
    initialSeasonId || seasons[0]?._id || ''
  );

  useEffect(() => {
    if (initialSeriesId) setSelectedSeriesId(initialSeriesId);
  }, [initialSeriesId]);

  useEffect(() => {
    if (initialSeasonId) {
      setSelectedSeasonId(initialSeasonId);
    } else if (seasons.length > 0 && !seasons.some((s) => s._id === selectedSeasonId)) {
      setSelectedSeasonId(seasons[0]._id);
    }
  }, [initialSeasonId, seasons, selectedSeasonId]);

  const currentSeason = seasons.find((s) => s._id === selectedSeasonId) || seasons[0];
  const episodes = React.useMemo(() => currentSeason?.episodes || [], [currentSeason]);

  const [editingEpisode, setEditingEpisode] = useState<AdminEpisodeDTO | null | 'NEW'>(null);
  const [deletingEpisode, setDeletingEpisode] = useState<AdminEpisodeDTO | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [togglingFreeId, setTogglingFreeId] = useState<string | null>(null);

  // معاينة الصوت محلياً
  const [playingPreviewId, setPlayingPreviewId] = useState<string | null>(null);
  const previewAudioRef = React.useRef<HTMLAudioElement | null>(null);

  const handleToggleFree = async (episode: AdminEpisodeDTO) => {
    const isPolicyFree = Boolean(
      currentSeries &&
      typeof currentSeries.freeEpisodesCount === 'number' &&
      currentSeries.freeEpisodesCount > 0 &&
      episode.episodeNumber <= currentSeries.freeEpisodesCount
    );
    if (isPolicyFree) {
      showNotice('error', `هذه الحلقة مشمولة تلقائياً بسياسة أول ${currentSeries.freeEpisodesCount} حلقات مجانية للمسلسل`);
      return;
    }

    setTogglingFreeId(episode._id);
    const nextFree = !episode.isFree;
    try {
      const res = await adminApi<{ success: boolean }>('/api/v1/admin/content', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entity: 'episode', episodeId: episode._id, isFree: nextFree }),
      });
      if (res.ok) {
        showNotice(
          'success',
          nextFree
            ? `الحلقة «${episode.title}» أصبحت متاحة مجاناً للمستمعين`
            : `الحلقة «${episode.title}» أصبحت مقفلة وتتطلب اشتراكاً أو شراء الموسم`
        );
        await onRefresh();
      } else {
        showNotice('error', res.error || 'تعذر تغيير حالة مجانية الحلقة');
      }
    } finally {
      setTogglingFreeId(null);
    }
  };

  const handleDeleteEpisode = async () => {
    if (!deletingEpisode) return;
    setIsDeleting(true);
    try {
      const res = await adminApi<{ success: boolean }>(
        `/api/v1/admin/content?entity=episode&id=${deletingEpisode._id}&deleteTranscript=true`,
        { method: 'DELETE' }
      );
      if (res.ok) {
        showNotice('success', `تم حذف الحلقة «${deletingEpisode.title}» بنجاح`);
        await onRefresh();
        setDeletingEpisode(null);
      } else {
        showNotice('error', res.error || 'فشل حذف الحلقة');
      }
    } finally {
      setIsDeleting(false);
    }
  };

  const handleAudioPreviewToggle = async (ep: AdminEpisodeDTO) => {
    if (playingPreviewId === ep._id) {
      previewAudioRef.current?.pause();
      setPlayingPreviewId(null);
      return;
    }

    try {
      // جلب رابط البث الصوتي المباشر للمعاينة الإدارية عبر واجهة الاستوديو المحمية
      const res = await fetch(`/api/v1/admin/content/audio?episodeId=${ep._id}`);
      if (!res.ok) {
        const errData = await res.json().catch(() => null);
        showNotice('error', errData?.error || 'الملف الصوتي لهذه الحلقة غير متوفر أو قيد المعالجة');
        return;
      }
      const data = await res.json();
      if (data?.streamUrl) {
        if (!previewAudioRef.current) {
          previewAudioRef.current = new Audio();
          previewAudioRef.current.onended = () => setPlayingPreviewId(null);
        }
        previewAudioRef.current.src = data.streamUrl;
        await previewAudioRef.current.play();
        setPlayingPreviewId(ep._id);
      } else {
        showNotice('error', 'الملف الصوتي لهذه الحلقة غير متوفر أو قيد المعالجة');
      }
    } catch {
      showNotice('error', 'تعذر تشغيل الملف الصوتي');
    }
  };

  return (
    <div className="space-y-6">
      {/* 1. أدوات التصفية وتحديد المسلسل والموسم */}
      <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 p-4 rounded-2xl bg-surface border border-border-subtle">
        <div className="space-y-1">
          <h2 className="text-lg font-bold text-editorial-ivory flex items-center gap-2">
            <Radio size={20} className="text-emerald-400" />
            <span>إدارة الحلقات والملفات الصوتية</span>
          </h2>
          <p className="text-xs text-editorial-muted">
            إدارة الحلقات، رفع الصوت المباشر إلى R2، وتحديد المجانية
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto">
          {/* محدد العمل */}
          <div className="relative flex-1 sm:w-56">
            <select
              value={selectedSeriesId}
              onChange={(e) => setSelectedSeriesId(e.target.value)}
              aria-label="اختيار المسلسل"
              className="w-full min-h-11 ps-3 pe-8 rounded-xl bg-surface-elevated border border-border-subtle text-xs text-editorial-ivory appearance-none focus:outline-none focus:border-crimson focus-visible:ring-2 focus-visible:ring-crimson"
            >
              {seriesList.map((s) => (
                <option key={s._id} value={s._id}>
                  {s.title}
                </option>
              ))}
            </select>
            <ChevronDown
              size={15}
              className="absolute end-3 top-1/2 -translate-y-1/2 text-editorial-muted pointer-events-none"
            />
          </div>

          {/* محدد الموسم */}
          <div className="relative flex-1 sm:w-48">
            <select
              value={selectedSeasonId}
              onChange={(e) => setSelectedSeasonId(e.target.value)}
              disabled={seasons.length === 0}
              aria-label="اختيار الموسم"
              className="w-full min-h-11 ps-3 pe-8 rounded-xl bg-surface-elevated border border-border-subtle text-xs text-editorial-ivory appearance-none focus:outline-none focus:border-crimson focus-visible:ring-2 focus-visible:ring-crimson disabled:opacity-50"
            >
              {seasons.map((sz) => (
                <option key={sz._id} value={sz._id}>
                  {sz.title} ({sz.episodes?.length || 0} حلقة)
                </option>
              ))}
            </select>
            <ChevronDown
              size={15}
              className="absolute end-3 top-1/2 -translate-y-1/2 text-editorial-muted pointer-events-none"
            />
          </div>

          {currentSeries && currentSeason && (
            <button
              type="button"
              onClick={() => setEditingEpisode('NEW')}
              className="min-h-11 px-4 rounded-xl bg-crimson hover:bg-crimson-bright text-white text-xs font-bold flex items-center gap-2 shadow-halo shrink-0 transition-transform active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-crimson"
            >
              <Plus size={16} />
              <span>حلقة جديدة</span>
            </button>
          )}
        </div>
      </div>

      {/* 2. جدول وبطاقات الحلقات المتكامل */}
      {currentSeries && currentSeason ? (
        <div className="rounded-2xl bg-surface border border-border-subtle overflow-hidden">
          {/* عرض سطح المكتب (جدول) */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead className="bg-surface-elevated/70 text-editorial-muted border-b border-border-subtle">
                <tr>
                  <th scope="col" className="p-3.5 ps-4 font-bold">#</th>
                  <th scope="col" className="p-3.5 font-bold">عنوان الحلقة</th>
                  <th scope="col" className="p-3.5 font-bold">المدة</th>
                  <th scope="col" className="p-3.5 font-bold">الملف الصوتي</th>
                  <th scope="col" className="p-3.5 font-bold">حالة الوصول</th>
                  <th scope="col" className="p-3.5 font-bold">النص المتزامن</th>
                  <th scope="col" className="p-3.5 pe-4 font-bold text-center">الإجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle/50">
                {episodes.map((ep) => {
                  const hasAudio = ep.audioStatus !== 'MISSING';
                  const isPreviewing = playingPreviewId === ep._id;

                  return (
                    <tr key={ep._id} className="hover:bg-surface-elevated/30 transition-colors">
                      <td className="p-3.5 ps-4 font-bold text-editorial-muted font-mono">
                        {ep.episodeNumber}
                      </td>

                      <td className="p-3.5 max-w-xs">
                        <span className="font-bold text-editorial-ivory block truncate">
                          {ep.title}
                        </span>
                        {ep.teaser && (
                          <span className="text-[11px] text-editorial-muted block truncate font-reading">
                            {ep.teaser}
                          </span>
                        )}
                      </td>

                      <td className="p-3.5 text-editorial-secondary font-mono">
                        {formatDuration(ep.durationMs)}
                      </td>

                      <td className="p-3.5">
                        {hasAudio ? (
                          <div className="flex items-center gap-2">
                            <span className="px-2 py-0.5 rounded-full bg-emerald-950/60 border border-emerald-800/40 text-emerald-400 text-[10px] font-bold">
                              مرفوع
                            </span>
                            <button
                              type="button"
                              onClick={() => handleAudioPreviewToggle(ep)}
                              className={`min-w-11 min-h-11 rounded-full flex items-center justify-center border transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-crimson ${
                                isPreviewing
                                  ? 'bg-crimson border-crimson text-white shadow-halo'
                                  : 'bg-surface hover:bg-surface-elevated border-border-subtle text-editorial-secondary hover:text-editorial-ivory'
                              }`}
                              title={isPreviewing ? 'إيقاف المعاينة' : 'استماع تجريبي للحلقة'}
                              aria-label={isPreviewing ? `إيقاف معاينة ${ep.title}` : `معاينة ${ep.title}`}
                            >
                              {isPreviewing ? (
                                <Pause size={12} className="fill-current" />
                              ) : (
                                <Play size={12} className="fill-current ps-0.5" />
                              )}
                            </button>
                          </div>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full bg-red-950/40 border border-red-800/40 text-red-300 text-[10px] font-bold">
                            غير مرفوع
                          </span>
                        )}
                      </td>

                      <td className="p-3.5">
                        {(() => {
                          const isPolicyFree = Boolean(
                            currentSeries &&
                            typeof currentSeries.freeEpisodesCount === 'number' &&
                            currentSeries.freeEpisodesCount > 0 &&
                            ep.episodeNumber <= currentSeries.freeEpisodesCount
                          );
                          return (
                            <button
                              type="button"
                              onClick={() => handleToggleFree(ep)}
                              disabled={togglingFreeId === ep._id || isPolicyFree}
                              className={`min-h-11 px-2.5 py-1 rounded-lg border text-[11px] font-bold flex items-center gap-1.5 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-crimson ${
                                isPolicyFree
                                  ? 'bg-emerald-950/20 border-emerald-800/40 text-emerald-400/90 cursor-not-allowed'
                                  : ep.isFree
                                  ? 'bg-emerald-950/40 border-emerald-800/60 text-emerald-400 hover:bg-emerald-900/50'
                                  : 'bg-surface-elevated border-border-subtle text-editorial-muted hover:text-editorial-ivory'
                              }`}
                              title={
                                isPolicyFree
                                  ? `مجانية تلقائياً وفقاً لسياسة أول ${currentSeries.freeEpisodesCount} حلقات مجانية للمسلسل`
                                  : 'انقر لتبديل الحالة بين مجانية ومدفوعة'
                              }
                              aria-label={
                                isPolicyFree
                                  ? `الحلقة ${ep.episodeNumber} مجانية تلقائياً وفقاً لسياسة المسلسل`
                                  : ep.isFree
                                  ? `إغلاق مجانية الحلقة ${ep.episodeNumber}`
                                  : `فتح مجانية الحلقة ${ep.episodeNumber}`
                              }
                            >
                              {ep.isFree || isPolicyFree ? (
                                <>
                                  <Unlock size={12} />
                                  <span>{isPolicyFree ? 'مجانية (سياسة)' : 'مجانية للجميع'}</span>
                                </>
                              ) : (
                                <>
                                  <Lock size={12} />
                                  <span>مقفلة (شراء)</span>
                                </>
                              )}
                            </button>
                          );
                        })()}
                      </td>

                      <td className="p-3.5">
                        <button
                          type="button"
                          onClick={() =>
                            onManageTranscript(currentSeries._id, currentSeason._id, ep._id)
                          }
                          className="min-h-11 px-2.5 py-1 rounded-lg bg-surface hover:bg-surface-elevated border border-border-subtle text-editorial-secondary hover:text-editorial-ivory text-[11px] flex items-center gap-1.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-crimson"
                          aria-label={ep.hasTranscript ? `تعديل نص الحلقة ${ep.episodeNumber}` : `إضافة نص الحلقة ${ep.episodeNumber}`}
                        >
                          <Subtitles size={12} className="text-crimson" />
                          <span>
                            {ep.hasTranscript
                              ? `${ep.transcriptSegmentsCount || 0} مقطع`
                              : 'إضافة نص'}
                          </span>
                        </button>
                      </td>

                      <td className="p-3.5 pe-4 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => setEditingEpisode(ep)}
                            className="min-w-11 min-h-11 rounded-lg bg-surface hover:bg-surface-elevated border border-border-subtle text-editorial-secondary hover:text-editorial-ivory flex items-center justify-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-crimson"
                            title="تعديل الحلقة ورفع الصوت"
                            aria-label={`تعديل الحلقة ${ep.episodeNumber}: ${ep.title}`}
                          >
                            <Pencil size={13} />
                          </button>

                          <button
                            type="button"
                            onClick={() => setDeletingEpisode(ep)}
                            className="min-w-11 min-h-11 rounded-lg bg-surface hover:bg-red-950/40 border border-border-subtle hover:border-red-800 text-editorial-secondary hover:text-red-300 flex items-center justify-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-300"
                            title="حذف الحلقة"
                            aria-label={`حذف الحلقة ${ep.episodeNumber}: ${ep.title}`}
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* عرض الهاتف المحمول (بطاقات >= 320px) */}
          <div className="divide-y divide-border-subtle md:hidden">
            {episodes.map((ep) => {
              const hasAudio = ep.audioStatus !== 'MISSING';
              const isPreviewing = playingPreviewId === ep._id;

              return (
                <div key={ep._id} className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-2.5 min-w-0 flex-1">
                      <span className="w-6 h-6 rounded-lg bg-surface-elevated text-editorial-muted text-xs font-bold font-mono flex items-center justify-center shrink-0 border border-border-subtle">
                        {ep.episodeNumber}
                      </span>
                      <div className="min-w-0">
                        <span className="font-bold text-editorial-ivory text-sm block truncate">
                          {ep.title}
                        </span>
                        {ep.teaser && (
                          <span className="text-[11px] text-editorial-muted block line-clamp-1 font-reading">
                            {ep.teaser}
                          </span>
                        )}
                        <span className="text-[11px] text-editorial-secondary font-mono flex items-center gap-1 mt-0.5">
                          <Clock size={11} />
                          {formatDuration(ep.durationMs)}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {hasAudio ? (
                        <button
                          type="button"
                          onClick={() => handleAudioPreviewToggle(ep)}
                          className={`min-w-11 min-h-11 rounded-xl flex items-center justify-center border transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-crimson ${
                            isPreviewing
                              ? 'bg-crimson border-crimson text-white shadow-halo'
                              : 'bg-surface-elevated hover:bg-border-subtle border-border-subtle text-editorial-secondary hover:text-editorial-ivory'
                          }`}
                          title={isPreviewing ? 'إيقاف المعاينة' : 'استماع تجريبي للحلقة'}
                          aria-label={isPreviewing ? `إيقاف معاينة ${ep.title}` : `معاينة ${ep.title}`}
                        >
                          {isPreviewing ? (
                            <Pause size={14} className="fill-current" />
                          ) : (
                            <Play size={14} className="fill-current ps-0.5" />
                          )}
                        </button>
                      ) : (
                        <span className="px-2 py-0.5 rounded-full bg-red-950/40 border border-red-800/40 text-red-300 text-[10px] font-bold">
                          بدون صوت
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-border-subtle/50">
                    <div className="flex items-center gap-2">
                      {(() => {
                        const isPolicyFree = Boolean(
                          currentSeries &&
                          typeof currentSeries.freeEpisodesCount === 'number' &&
                          currentSeries.freeEpisodesCount > 0 &&
                          ep.episodeNumber <= currentSeries.freeEpisodesCount
                        );
                        return (
                          <button
                            type="button"
                            onClick={() => handleToggleFree(ep)}
                            disabled={togglingFreeId === ep._id || isPolicyFree}
                            className={`min-h-11 px-2.5 py-1 rounded-lg border text-xs font-bold flex items-center gap-1.5 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-crimson ${
                              isPolicyFree
                                ? 'bg-emerald-950/20 border-emerald-800/40 text-emerald-400/90 cursor-not-allowed'
                                : ep.isFree
                                ? 'bg-emerald-950/40 border-emerald-800/60 text-emerald-400 hover:bg-emerald-900/50'
                                : 'bg-surface-elevated border-border-subtle text-editorial-muted hover:text-editorial-ivory'
                            }`}
                            title={
                              isPolicyFree
                                ? `مجانية تلقائياً وفقاً لسياسة أول ${currentSeries.freeEpisodesCount} حلقات مجانية للمسلسل`
                                : 'انقر لتبديل الحالة بين مجانية ومدفوعة'
                            }
                            aria-label={
                              isPolicyFree
                                ? `الحلقة ${ep.episodeNumber} مجانية تلقائياً وفقاً لسياسة المسلسل`
                                : ep.isFree
                                ? `إغلاق مجانية الحلقة ${ep.episodeNumber}`
                                : `فتح مجانية الحلقة ${ep.episodeNumber}`
                            }
                          >
                            {ep.isFree || isPolicyFree ? (
                              <>
                                <Unlock size={12} />
                                <span>{isPolicyFree ? 'مجانية (سياسة)' : 'مجانية'}</span>
                              </>
                            ) : (
                              <>
                                <Lock size={12} />
                                <span>مقفلة</span>
                              </>
                            )}
                          </button>
                        );
                      })()}

                      <button
                        type="button"
                        onClick={() =>
                          onManageTranscript(currentSeries._id, currentSeason._id, ep._id)
                        }
                        className="min-h-11 px-2.5 py-1 rounded-lg bg-surface-elevated hover:bg-border-subtle border border-border-subtle text-editorial-secondary hover:text-editorial-ivory text-xs flex items-center gap-1.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-crimson"
                        aria-label={ep.hasTranscript ? `تعديل نص الحلقة ${ep.episodeNumber}` : `إضافة نص الحلقة ${ep.episodeNumber}`}
                      >
                        <Subtitles size={12} className="text-crimson" />
                        <span>
                          {ep.hasTranscript
                            ? `${ep.transcriptSegmentsCount || 0} مقطع`
                            : '+ النص'}
                        </span>
                      </button>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setEditingEpisode(ep)}
                        className="min-w-11 min-h-11 rounded-lg bg-surface-elevated hover:bg-border-subtle border border-border-subtle text-editorial-secondary hover:text-editorial-ivory flex items-center justify-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-crimson"
                        title="تعديل الحلقة ورفع الصوت"
                        aria-label={`تعديل الحلقة ${ep.episodeNumber}: ${ep.title}`}
                      >
                        <Pencil size={13} />
                      </button>

                      <button
                        type="button"
                        onClick={() => setDeletingEpisode(ep)}
                        className="min-w-11 min-h-11 rounded-lg bg-surface-elevated hover:bg-red-950/40 border border-border-subtle hover:border-red-800 text-editorial-secondary hover:text-red-300 flex items-center justify-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-300"
                        title="حذف الحلقة"
                        aria-label={`حذف الحلقة ${ep.episodeNumber}: ${ep.title}`}
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {episodes.length === 0 && (
            <div className="p-12 text-center space-y-3">
              <Radio size={32} className="mx-auto text-editorial-muted" />
              <p className="text-sm text-editorial-secondary font-medium">
                لا توجد حلقات مسجلة في هذا الموسم
              </p>
              <button
                type="button"
                onClick={() => setEditingEpisode('NEW')}
                className="min-h-11 px-4 rounded-xl bg-crimson hover:bg-crimson-bright text-white text-xs font-bold inline-flex items-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-crimson"
              >
                <Plus size={14} />
                <span>إضافة الحلقة الأولى</span>
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="p-12 text-center rounded-2xl bg-surface border border-border-subtle">
          <p className="text-xs text-editorial-muted">يرجى اختيار مسلسل وموسم لعرض حلقاته</p>
        </div>
      )}

      {/* نافذة تعديل / إنشاء حلقة مع رفع الصوت المباشر إلى R2 */}
      {editingEpisode && currentSeries && currentSeason && (
        <EpisodeEditor
          series={currentSeries}
          season={currentSeason}
          episode={editingEpisode === 'NEW' ? null : editingEpisode}
          onClose={() => setEditingEpisode(null)}
          onSaved={async () => {
            await onRefresh();
            setEditingEpisode(null);
          }}
          showNotice={showNotice}
          onOpenTranscript={(ep) => {
            setEditingEpisode(null);
            onManageTranscript(currentSeries._id, currentSeason._id, ep._id);
          }}
        />
      )}

      {/* تأكيد حذف الحلقة */}
      {deletingEpisode && (
        <ConfirmDialog
          title={`حذف الحلقة «${deletingEpisode.title}»`}
          message={`هل أنت متأكد من حذف هذه الحلقة وملفها الصوتي ونصوصها المتزامنة؟`}
          confirmLabel={isDeleting ? 'جارٍ الحذف...' : 'تأكيد الحذف'}
          onConfirm={handleDeleteEpisode}
          onCancel={() => setDeletingEpisode(null)}
        />
      )}
    </div>
  );
};
