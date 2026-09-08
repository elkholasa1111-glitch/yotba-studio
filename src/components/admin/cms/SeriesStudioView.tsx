'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import {
  ArrowRight,
  Film,
  Layers,
  Radio,
  Plus,
  Pencil,
  Trash2,
  Play,
  Pause,
  Volume2,
  Lock,
  Unlock,
  Subtitles,
  Sparkles,
  ExternalLink,
  Clock,
  CheckCircle2,
  AlertCircle,
  Loader2,
  UploadCloud,
  X,
  ChevronDown,
  ChevronUp,
  Music,
  Check,
} from 'lucide-react';

import type {
  AdminSeriesDTO,
  AdminSeasonDTO,
  AdminEpisodeDTO,
  ReleaseStatus,
} from './shared';
import { adminApi, formatDuration, RELEASE_STATUS_LABELS } from './shared';
import { MediaUploadDropzone } from './MediaUploadDropzone';
import { SeriesEditor } from './SeriesEditor';
import { SeasonEditor } from './SeasonEditor';
import { EpisodeEditor } from './EpisodeEditor';
import { TranscriptEditor } from './TranscriptEditor';
import { ConfirmDialog } from './ConfirmDialog';

interface Props {
  series: AdminSeriesDTO;
  initialSeasonId?: string | null;
  initialEpisodeId?: string | null;
  onBack: () => void;
  onRefresh: () => Promise<void>;
  showNotice: (type: 'success' | 'error', msg: string) => void;
}

export const SeriesStudioView: React.FC<Props> = ({
  series,
  initialSeasonId,
  initialEpisodeId,
  onBack,
  onRefresh,
  showNotice,
}) => {
  // Active Season
  const seasons = useMemo(() => series.seasons || [], [series.seasons]);
  const [activeSeasonId, setActiveSeasonId] = useState<string>(() => {
    if (initialSeasonId && seasons.some((s) => s._id === initialSeasonId)) {
      return initialSeasonId;
    }
    return seasons[0]?._id || '';
  });

  useEffect(() => {
    if (initialSeasonId && seasons.some((s) => s._id === initialSeasonId)) {
      setActiveSeasonId(initialSeasonId);
    } else if (!activeSeasonId && seasons.length > 0) {
      setActiveSeasonId(seasons[0]._id);
    }
  }, [initialSeasonId, seasons, activeSeasonId]);

  const activeSeason = seasons.find((s) => s._id === activeSeasonId) || seasons[0] || null;
  const episodes = useMemo(() => activeSeason?.episodes || [], [activeSeason]);

  // Modals & Editors state
  const [isEditingSeries, setIsEditingSeries] = useState(false);
  const [editingSeason, setEditingSeason] = useState<AdminSeasonDTO | null | 'NEW'>(null);
  const [editingEpisode, setEditingEpisode] = useState<AdminEpisodeDTO | null>(null);
  const [editingTranscriptEpisode, setEditingTranscriptEpisode] = useState<AdminEpisodeDTO | null>(null);

  // Deletion state
  const [deletingSeries, setDeletingSeries] = useState(false);
  const [deletingSeason, setDeletingSeason] = useState<AdminSeasonDTO | null>(null);
  const [deletingEpisode, setDeletingEpisode] = useState<AdminEpisodeDTO | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Quick Episode Creator Panel state
  const [showQuickAddEpisode, setShowQuickAddEpisode] = useState(false);
  const [quickTitle, setQuickTitle] = useState('');
  const [quickEpisodeNumber, setQuickEpisodeNumber] = useState<number>(() => {
    const maxNum = episodes.reduce((max, ep) => Math.max(max, ep.episodeNumber || 0), 0);
    return maxNum + 1;
  });
  const [quickAudioUrl, setQuickAudioUrl] = useState('');
  const [quickAudioKey, setQuickAudioKey] = useState('');
  const [quickDurationSecs, setQuickDurationSecs] = useState<number>(0);
  const [quickIsFree, setQuickIsFree] = useState<boolean>(false);
  const [isSavingQuickEpisode, setIsSavingQuickEpisode] = useState(false);
  const [quickError, setQuickError] = useState<string | null>(null);

  // Update quick episode number when episodes list changes
  useEffect(() => {
    const maxNum = episodes.reduce((max, ep) => Math.max(max, ep.episodeNumber || 0), 0);
    const nextNum = maxNum + 1;
    setQuickEpisodeNumber(nextNum);
    const freeThreshold = typeof series.freeEpisodesCount === 'number' ? series.freeEpisodesCount : 2;
    setQuickIsFree(nextNum <= freeThreshold);
  }, [episodes, series.freeEpisodesCount]);

  // Audio Preview state
  const [playingPreviewId, setPlayingPreviewId] = useState<string | null>(null);
  const [previewLoadingId, setPreviewLoadingId] = useState<string | null>(null);
  const audioPreviewRef = useRef<HTMLAudioElement | null>(null);

  // Stop audio preview on unmount
  useEffect(() => {
    return () => {
      if (audioPreviewRef.current) {
        audioPreviewRef.current.pause();
        audioPreviewRef.current.src = '';
      }
    };
  }, []);

  const handleToggleAudioPreview = async (ep: AdminEpisodeDTO) => {
    if (playingPreviewId === ep._id) {
      audioPreviewRef.current?.pause();
      setPlayingPreviewId(null);
      return;
    }

    setPreviewLoadingId(ep._id);
    try {
      let streamUrl = ep.audioPublicUrl;
      if (!streamUrl || streamUrl.startsWith('blob:')) {
        const res = await fetch(`/api/v1/episodes/${ep._id}/stream`);
        if (res.ok) {
          const data = await res.json();
          streamUrl = data.streamUrl;
        }
      }

      if (!streamUrl) {
        showNotice('error', 'لا يوجد ملف صوتي متاح لمعاينة هذه الحلقة');
        return;
      }

      if (!audioPreviewRef.current) {
        audioPreviewRef.current = new Audio();
        audioPreviewRef.current.onended = () => setPlayingPreviewId(null);
        audioPreviewRef.current.onerror = () => {
          setPlayingPreviewId(null);
          showNotice('error', 'تعذر تشغيل الصوت للمعاينة');
        };
      }

      audioPreviewRef.current.src = streamUrl;
      await audioPreviewRef.current.play();
      setPlayingPreviewId(ep._id);
    } catch {
      showNotice('error', 'حدث خطأ أثناء تحميل المعاينة الصوتية');
    } finally {
      setPreviewLoadingId(null);
    }
  };

  // Toggle Free / Locked for episode
  const [togglingFreeId, setTogglingFreeId] = useState<string | null>(null);
  const handleToggleFree = async (ep: AdminEpisodeDTO) => {
    setTogglingFreeId(ep._id);
    const nextFree = !ep.isFree;
    try {
      const res = await adminApi<{ success: boolean }>('/api/v1/admin/content', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entity: 'episode', episodeId: ep._id, isFree: nextFree }),
      });
      if (res.ok) {
        showNotice(
          'success',
          nextFree
            ? `الحلقة «${ep.title}» أصبحت مجانية لجميع المستمعين`
            : `الحلقة «${ep.title}» أصبحت مقفلة (تتطلب اشتراكاً)`
        );
        await onRefresh();
      } else {
        showNotice('error', res.error || 'تعذر تحديث حالة مجانية الحلقة');
      }
    } finally {
      setTogglingFreeId(null);
    }
  };

  // Delete Handlers
  const handleDeleteSeries = async () => {
    setIsDeleting(true);
    try {
      const res = await adminApi<{ success: boolean }>(
        `/api/v1/admin/content?entity=series&id=${series._id}&cascade=true`,
        { method: 'DELETE' }
      );
      if (res.ok) {
        showNotice('success', `تم حذف مسلسل «${series.title}» بنجاح`);
        await onRefresh();
        onBack();
      } else {
        showNotice('error', res.error || 'فشل حذف المسلسل');
      }
    } finally {
      setIsDeleting(false);
      setDeletingSeries(false);
    }
  };

  const handleDeleteSeason = async () => {
    if (!deletingSeason) return;
    setIsDeleting(true);
    try {
      const res = await adminApi<{ success: boolean }>(
        `/api/v1/admin/content?entity=season&id=${deletingSeason._id}&cascade=true`,
        { method: 'DELETE' }
      );
      if (res.ok) {
        showNotice('success', `تم حذف الموسم «${deletingSeason.title}» بنجاح`);
        await onRefresh();
        setDeletingSeason(null);
      } else {
        showNotice('error', res.error || 'فشل حذف الموسم');
      }
    } finally {
      setIsDeleting(false);
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

  // Quick Episode Save
  const handleSaveQuickEpisode = async (e: React.FormEvent) => {
    e.preventDefault();
    setQuickError(null);

    if (!activeSeason) {
      setQuickError('يرجى إنشاء أو اختيار موسم أولاً لإضافة الحلقة');
      return;
    }

    const title = quickTitle.trim() || `الحلقة ${quickEpisodeNumber}`;

    setIsSavingQuickEpisode(true);
    try {
      const payload = {
        entity: 'episode',
        seasonId: activeSeason._id,
        episodeNumber: Number(quickEpisodeNumber),
        title,
        teaser: null,
        durationMs: quickDurationSecs > 0 ? Math.round(quickDurationSecs * 1000) : 0,
        isFree: quickIsFree,
        publishDate: new Date().toISOString(),
        artworkOverride: null,
        audioStorageKey: quickAudioKey.trim() || null,
        audioPublicUrl:
          quickAudioUrl && !quickAudioUrl.startsWith('blob:') && !quickAudioUrl.includes('/stream')
            ? quickAudioUrl.trim()
            : null,
      };

      const res = await adminApi<{ success: boolean }>('/api/v1/admin/content', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        setQuickError(res.error || 'تعذر إضافة الحلقة');
        return;
      }

      showNotice('success', `تمت إضافة الحلقة «${title}» بنجاح`);
      // Reset form
      setQuickTitle('');
      setQuickAudioUrl('');
      setQuickAudioKey('');
      setQuickDurationSecs(0);
      setShowQuickAddEpisode(false);
      await onRefresh();
    } catch {
      setQuickError('حدث خطأ غير متوقع أثناء حفظ الحلقة');
    } finally {
      setIsSavingQuickEpisode(false);
    }
  };

  // Total series episodes calculation
  const totalSeriesEpisodes = seasons.reduce(
    (acc, sz) => acc + (sz.episodes?.length || 0),
    0
  );

  return (
    <div className="space-y-6 animate-fade-in text-right">
      {/* 1. مسار التنقل والرجوع السريع */}
      <div className="flex items-center justify-between gap-3 p-3.5 rounded-2xl bg-surface border border-border-subtle">
        <div className="flex items-center gap-2 text-xs">
          <button
            type="button"
            onClick={onBack}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-surface-elevated hover:bg-border-subtle text-editorial-secondary hover:text-editorial-ivory transition-colors font-semibold"
          >
            <ArrowRight size={15} />
            <span>العودة لجميع المسلسلات</span>
          </button>
          <span className="text-editorial-muted">/</span>
          <span className="font-bold text-editorial-ivory">{series.title}</span>
          <span className="px-2 py-0.5 rounded-md bg-crimson/15 text-crimson text-[10px] font-bold">
            استوديو العمل
          </span>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href={`/series/${encodeURIComponent(series.slug)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-surface-elevated hover:bg-border-subtle border border-border-subtle text-editorial-secondary hover:text-editorial-ivory text-xs transition-colors"
          >
            <ExternalLink size={14} />
            <span className="hidden sm:inline">معاينة العمل في المنصة</span>
          </Link>

          <button
            type="button"
            onClick={() => setIsEditingSeries(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-crimson hover:bg-crimson-bright text-white text-xs font-bold transition-all shadow-halo"
          >
            <Pencil size={13} />
            <span>تعديل بيانات العمل</span>
          </button>

          <button
            type="button"
            onClick={() => setDeletingSeries(true)}
            className="p-2 rounded-xl bg-surface-elevated hover:bg-red-950/40 border border-border-subtle hover:border-red-800 text-editorial-muted hover:text-red-300 transition-colors"
            title="حذف المسلسل"
          >
            <Trash2 size={15} />
          </button>
        </div>
      </div>

      {/* 2. بانر استوديو العمل الرئيسي (Hero Workstation Stage) */}
      <div className="relative rounded-3xl bg-surface border border-border-subtle overflow-hidden p-6 sm:p-8 flex flex-col md:flex-row gap-6 items-start">
        {/* بوستر العمل الفخم */}
        <div className="relative w-28 h-40 sm:w-36 sm:h-52 rounded-2xl overflow-hidden shrink-0 border border-white/10 shadow-2xl bg-black">
          <Image
            src={series.posterUrl}
            alt={series.title}
            fill
            sizes="144px"
            className="object-cover"
            priority
          />
          {series.featured && (
            <div className="absolute top-2 start-2 p-1.5 rounded-lg bg-crimson text-white shadow-halo">
              <Sparkles size={13} />
            </div>
          )}
        </div>

        {/* تفاصيل العمل والإحصائيات الحية */}
        <div className="flex-1 min-w-0 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="px-2.5 py-1 rounded-lg bg-surface-elevated text-xs font-bold text-editorial-secondary border border-border-subtle">
              {series.contentRating}
            </span>
            <span className="px-2.5 py-1 rounded-lg bg-surface-elevated text-xs text-editorial-muted border border-border-subtle">
              سنة {series.productionYear}
            </span>
            <span className="px-2.5 py-1 rounded-lg bg-emerald-950/40 text-emerald-400 border border-emerald-800 text-xs font-semibold">
              أول {series.freeEpisodesCount} حلقات مجانية
            </span>
            {series.isCompleted ? (
              <span className="px-2.5 py-1 rounded-lg bg-surface-elevated text-editorial-muted text-xs border border-border-subtle">
                مكتمل
              </span>
            ) : (
              <span className="px-2.5 py-1 rounded-lg bg-amber-950/40 text-amber-400 border border-amber-800 text-xs font-semibold">
                مستمر
              </span>
            )}
          </div>

          <h1 className="text-2xl sm:text-3xl font-black font-display text-editorial-ivory">
            {series.title}
          </h1>

          <p className="text-xs sm:text-sm text-editorial-secondary line-clamp-2 max-w-3xl leading-relaxed">
            {series.hook || series.description}
          </p>

          <div className="flex flex-wrap gap-1.5 pt-1">
            {(series.genres || []).map((g) => (
              <span
                key={g}
                className="px-2.5 py-0.5 rounded-md bg-surface-elevated text-[11px] text-editorial-muted border border-white/5"
              >
                {g}
              </span>
            ))}
          </div>

          {/* شريط الأرقام والمؤشرات */}
          <div className="pt-3 border-t border-border-subtle/60 flex flex-wrap items-center gap-5 text-xs text-editorial-secondary">
            <div className="flex items-center gap-1.5">
              <Layers size={15} className="text-amber-400" />
              <span className="font-bold text-editorial-ivory">{seasons.length}</span>
              <span>مواسم</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Radio size={15} className="text-crimson" />
              <span className="font-bold text-editorial-ivory">{totalSeriesEpisodes}</span>
              <span>حلقة مسجلة</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Clock size={15} className="text-editorial-muted" />
              <span>الرابط: <code className="text-editorial-ivory">/series/{series.slug}</code></span>
            </div>
          </div>
        </div>
      </div>

      {/* 3. هيكل المواسم والحلقات الشامل (Unified Seasons & Episodes Tree) */}
      <div className="space-y-4">
        {/* أزرار اختيار وتبديل المواسم الأفقية */}
        <div className="flex items-center justify-between gap-3 flex-wrap border-b border-border-subtle pb-3">
          <div className="flex items-center gap-2 overflow-x-auto pb-1 max-w-full">
            <span className="text-xs font-bold text-editorial-muted whitespace-nowrap ps-1">
              المواسم:
            </span>
            {seasons.map((season) => {
              const isSelected = activeSeason?._id === season._id;
              return (
                <button
                  key={season._id}
                  type="button"
                  onClick={() => {
                    setActiveSeasonId(season._id);
                    setShowQuickAddEpisode(false);
                  }}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
                    isSelected
                      ? 'bg-crimson text-white shadow-halo scale-105'
                      : 'bg-surface hover:bg-surface-elevated text-editorial-secondary hover:text-editorial-ivory border border-border-subtle'
                  }`}
                >
                  <Layers size={13} className={isSelected ? 'text-white' : 'text-amber-400'} />
                  <span>الموسم {season.seasonNumber}: {season.title}</span>
                  <span
                    className={`px-1.5 py-0.5 rounded-full text-[10px] ${
                      isSelected ? 'bg-white/20 text-white' : 'bg-surface-elevated text-editorial-muted'
                    }`}
                  >
                    {season.episodes?.length || 0}
                  </span>
                </button>
              );
            })}

            {/* زر إضافة موسم جديد مباشر */}
            <button
              type="button"
              onClick={() => setEditingSeason('NEW')}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-surface-elevated hover:bg-border-subtle border border-dashed border-border-subtle hover:border-crimson text-editorial-secondary hover:text-crimson text-xs font-bold transition-colors whitespace-nowrap"
            >
              <Plus size={14} />
              <span>موسم جديد</span>
            </button>
          </div>

          {/* زر إضافة حلقة جديدة البارز */}
          {activeSeason && (
            <button
              type="button"
              onClick={() => setShowQuickAddEpisode(!showQuickAddEpisode)}
              className="px-4 py-2 rounded-xl bg-crimson hover:bg-crimson-bright text-white text-xs font-bold flex items-center gap-2 shadow-halo transition-transform active:scale-95 shrink-0"
            >
              {showQuickAddEpisode ? <ChevronUp size={15} /> : <Plus size={15} />}
              <span>{showQuickAddEpisode ? 'إغلاق نموذج الإضافة' : '+ إضافة حلقة للموسم'}</span>
            </button>
          )}
        </div>

        {/* إذا لم يكن هناك مواسم مسجلة نهائياً */}
        {seasons.length === 0 && (
          <div className="p-12 text-center rounded-3xl bg-surface border border-dashed border-border-subtle space-y-4">
            <Layers size={36} className="mx-auto text-amber-400/60" />
            <div className="space-y-1">
              <h3 className="text-base font-bold text-editorial-ivory">لا توجد مواسم في هذا المسلسل بعد</h3>
              <p className="text-xs text-editorial-muted">
                أنشئ الموسم الأول للعمل لتبدأ فوراً في رفع الحلقات والصوتيات
              </p>
            </div>
            <button
              type="button"
              onClick={() => setEditingSeason('NEW')}
              className="px-5 py-2.5 rounded-xl bg-crimson hover:bg-crimson-bright text-white text-xs font-bold inline-flex items-center gap-2 shadow-halo"
            >
              <Plus size={16} />
              <span>إنشاء الموسم الأول الآن</span>
            </button>
          </div>
        )}

        {/* تفاصيل الموسم النشط */}
        {activeSeason && (
          <div className="space-y-4">
            {/* شريط معلومات وإجراءات الموسم النشط */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-4 rounded-2xl bg-surface-elevated/40 border border-border-subtle">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 font-bold">
                  {activeSeason.seasonNumber}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-bold text-editorial-ivory">
                      {activeSeason.title}
                    </h3>
                    <span className="px-2 py-0.5 rounded bg-surface text-[10px] font-bold text-editorial-muted border border-border-subtle">
                      {RELEASE_STATUS_LABELS[activeSeason.releaseStatus]}
                    </span>
                  </div>
                  <p className="text-xs text-editorial-muted">
                    سعر شراء الموسم: <span className="text-editorial-ivory font-bold">${activeSeason.price} {activeSeason.currency}</span> • {episodes.length} حلقات
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 self-end sm:self-auto">
                <button
                  type="button"
                  onClick={() => setEditingSeason(activeSeason)}
                  className="px-2.5 py-1.5 rounded-lg bg-surface hover:bg-surface-elevated border border-border-subtle text-editorial-secondary hover:text-editorial-ivory text-xs flex items-center gap-1.5 transition-colors"
                >
                  <Pencil size={12} />
                  <span>تعديل الموسم</span>
                </button>
                <button
                  type="button"
                  onClick={() => setDeletingSeason(activeSeason)}
                  className="p-1.5 rounded-lg bg-surface hover:bg-red-950/40 border border-border-subtle hover:border-red-800 text-editorial-muted hover:text-red-300 transition-colors"
                  title="حذف الموسم"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            </div>

            {/* 4. لوحة الإضافة السريعة للحلقة (Quick Episode Creator) */}
            {showQuickAddEpisode && (
              <div className="p-5 rounded-2xl bg-surface border-2 border-crimson/40 space-y-4 shadow-xl animate-fade-in">
                <div className="flex items-center justify-between border-b border-border-subtle pb-3">
                  <div className="flex items-center gap-2">
                    <Radio size={18} className="text-crimson" />
                    <h3 className="text-sm font-bold text-editorial-ivory">
                      إضافة حلقة سريعة إلى {activeSeason.title}
                    </h3>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowQuickAddEpisode(false)}
                    className="p-1 text-editorial-muted hover:text-editorial-ivory"
                  >
                    <X size={16} />
                  </button>
                </div>

                <form onSubmit={handleSaveQuickEpisode} className="space-y-4">
                  {/* سحب وإسقاط ملف الصوت مباشرة */}
                  <div>
                    <MediaUploadDropzone
                      label="الملف الصوتي للماستر (سحب وإسقاط فوري)"
                      category="audio"
                      value={quickAudioUrl}
                      onChange={(url) => setQuickAudioUrl(url)}
                      onStorageKeyChange={(key) => setQuickAudioKey(key)}
                      onDurationDetected={(durationSecs) => {
                        setQuickDurationSecs(durationSecs);
                      }}
                      helperText="يُرفع الملف الصوتي مباشرة إلى Cloudflare R2 فائق السرعة مع قياس المدة الزمنية تلقائياً"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="sm:col-span-2">
                      <label className="text-xs text-editorial-secondary block mb-1">
                        عنوان الحلقة *
                      </label>
                      <input
                        type="text"
                        value={quickTitle}
                        onChange={(e) => setQuickTitle(e.target.value)}
                        placeholder={`مثال: الحلقة ${quickEpisodeNumber}: البدايات المشوقة`}
                        className="w-full min-h-11 bg-surface-elevated border border-border-subtle rounded-xl p-2.5 text-xs text-editorial-ivory focus:outline-none focus:border-crimson"
                      />
                    </div>

                    <div>
                      <label className="text-xs text-editorial-secondary block mb-1">
                        رقم الحلقة *
                      </label>
                      <input
                        type="number"
                        min="1"
                        max="1000"
                        value={quickEpisodeNumber}
                        onChange={(e) => {
                          const num = Number(e.target.value);
                          setQuickEpisodeNumber(num);
                          setQuickIsFree(num <= (series.freeEpisodesCount || 2));
                        }}
                        className="w-full min-h-11 bg-surface-elevated border border-border-subtle rounded-xl p-2.5 text-xs text-editorial-ivory focus:outline-none focus:border-crimson"
                      />
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pt-2">
                    <label className="flex items-center gap-2 text-xs text-editorial-secondary cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={quickIsFree}
                        onChange={(e) => setQuickIsFree(e.target.checked)}
                        className="w-4 h-4 accent-[#A8202A] rounded"
                      />
                      <span>حلقة مجانية (متاحة للجميع دون اشتراك)</span>
                    </label>

                    <div className="flex items-center gap-2 w-full sm:w-auto">
                      <button
                        type="submit"
                        disabled={isSavingQuickEpisode}
                        className="flex-1 sm:flex-initial min-h-10 px-5 rounded-xl bg-crimson hover:bg-crimson-bright text-white text-xs font-bold flex items-center justify-center gap-2 shadow-halo transition-all disabled:opacity-50"
                      >
                        {isSavingQuickEpisode ? (
                          <>
                            <Loader2 size={14} className="animate-spin" />
                            <span>جارٍ حفظ الحلقة...</span>
                          </>
                        ) : (
                          <>
                            <Check size={14} />
                            <span>حفظ ونشر الحلقة</span>
                          </>
                        )}
                      </button>

                      <button
                        type="button"
                        onClick={() => setShowQuickAddEpisode(false)}
                        className="min-h-10 px-4 rounded-xl bg-surface-elevated hover:bg-border-subtle text-editorial-secondary hover:text-editorial-ivory text-xs font-semibold"
                      >
                        إلغاء
                      </button>
                    </div>
                  </div>

                  {quickError && (
                    <div className="p-3 rounded-xl bg-red-950/50 border border-red-800 text-red-300 text-xs flex items-center gap-2">
                      <AlertCircle size={15} />
                      <span>{quickError}</span>
                    </div>
                  )}
                </form>
              </div>
            )}

            {/* 5. جدول وبطاقات حلقات الموسم النشط */}
            {episodes.length === 0 ? (
              <div className="p-10 text-center rounded-2xl bg-surface border border-border-subtle space-y-3">
                <Radio size={30} className="mx-auto text-editorial-muted" />
                <p className="text-xs text-editorial-secondary">
                  لا توجد حلقات في هذا الموسم بعد
                </p>
                <button
                  type="button"
                  onClick={() => setShowQuickAddEpisode(true)}
                  className="px-4 py-2 rounded-xl bg-surface-elevated hover:bg-border-subtle text-editorial-ivory text-xs font-bold inline-flex items-center gap-2 border border-border-subtle transition-colors"
                >
                  <Plus size={14} />
                  <span>إضافة أول حلقة الآن</span>
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                {episodes.map((ep) => {
                  const isAudioPreviewing = playingPreviewId === ep._id;
                  const isAudioLoading = previewLoadingId === ep._id;
                  const isFreePolicy = typeof series.freeEpisodesCount === 'number'
                    ? ep.episodeNumber <= series.freeEpisodesCount
                    : false;

                  return (
                    <div
                      key={ep._id}
                      className="p-3.5 sm:p-4 rounded-2xl bg-surface border border-border-subtle hover:border-border-strong transition-all flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 group"
                    >
                      {/* الطرف الأيمن: زر التشغيل ومعلومات الحلقة */}
                      <div className="flex items-center gap-3.5 min-w-0 flex-1">
                        {/* زر المعاينة الصوتية اللحظية */}
                        <button
                          type="button"
                          onClick={() => handleToggleAudioPreview(ep)}
                          disabled={isAudioLoading}
                          className={`w-9 h-9 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center shrink-0 transition-transform active:scale-95 ${
                            isAudioPreviewing
                              ? 'bg-crimson text-white shadow-halo scale-105'
                              : 'bg-surface-elevated hover:bg-border-subtle text-editorial-ivory border border-border-subtle'
                          }`}
                          title={isAudioPreviewing ? 'إيقاف المعاينة' : 'معاينة صوتية حية للحلقة'}
                        >
                          {isAudioLoading ? (
                            <Loader2 size={16} className="animate-spin text-crimson" />
                          ) : isAudioPreviewing ? (
                            <Pause size={16} />
                          ) : (
                            <Play size={16} className="translate-x-0.5 text-editorial-ivory" />
                          )}
                        </button>

                        <div className="min-w-0 space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="w-5 h-5 rounded-md bg-surface-elevated text-editorial-muted text-[10px] font-bold flex items-center justify-center border border-white/5">
                              {ep.episodeNumber}
                            </span>
                            <h4 className="text-xs sm:text-sm font-bold text-editorial-ivory truncate group-hover:text-crimson transition-colors">
                              {ep.title}
                            </h4>
                          </div>

                          <div className="flex items-center gap-3 text-[11px] text-editorial-muted">
                            <span className="flex items-center gap-1">
                              <Clock size={11} />
                              {formatDuration(ep.durationMs)}
                            </span>

                            <span>•</span>

                            {/* شارة حالة الصوت */}
                            {ep.audioStatus === 'MISSING' ? (
                              <span className="text-red-400 font-semibold">بدون ملف صوت</span>
                            ) : (
                              <span className="text-emerald-400 font-semibold flex items-center gap-1">
                                <Music size={11} />
                                جاهز للبث (R2)
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* الطرف الأيسر: شارات المجانية، النص المتزامن، وأزرار الإجراءات */}
                      <div className="flex items-center gap-2 self-stretch sm:self-auto justify-between sm:justify-end border-t sm:border-t-0 pt-2 sm:pt-0 border-border-subtle/50">
                        {/* زر تبديل المجانية بنقرة واحدة */}
                        <button
                          type="button"
                          disabled={togglingFreeId === ep._id}
                          onClick={() => handleToggleFree(ep)}
                          className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-colors flex items-center gap-1.5 ${
                            ep.isFree
                              ? 'bg-emerald-950/40 text-emerald-400 border border-emerald-800 hover:bg-emerald-900/50'
                              : 'bg-surface-elevated text-editorial-muted border border-border-subtle hover:text-editorial-ivory'
                          }`}
                          title="انقر لتبديل حالة المجانية"
                        >
                          {togglingFreeId === ep._id ? (
                            <Loader2 size={11} className="animate-spin" />
                          ) : ep.isFree ? (
                            <Unlock size={11} />
                          ) : (
                            <Lock size={11} />
                          )}
                          <span>
                            {ep.isFree
                              ? isFreePolicy
                                ? 'مجانية (تلقائي)'
                                : 'مجانية'
                              : 'مدفوعة'}
                          </span>
                        </button>

                        {/* زر النص المتزامن المباشر */}
                        <button
                          type="button"
                          onClick={() => setEditingTranscriptEpisode(ep)}
                          className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 ${
                            ep.hasTranscript
                              ? 'bg-crimson-subtle text-crimson border border-crimson/40 hover:bg-crimson/20'
                              : 'bg-surface-elevated hover:bg-border-subtle text-editorial-secondary hover:text-editorial-ivory border border-border-subtle'
                          }`}
                          title="إدارة أو استيراد النص المتزامن (SRT/VTT)"
                        >
                          <Subtitles size={12} />
                          <span>
                            {ep.hasTranscript
                              ? `${ep.transcriptSegmentsCount} مقطع`
                              : '+ النص'}
                          </span>
                        </button>

                        {/* تعديل متقدم للحلقة */}
                        <button
                          type="button"
                          onClick={() => setEditingEpisode(ep)}
                          className="w-8 h-8 rounded-lg bg-surface hover:bg-surface-elevated border border-border-subtle text-editorial-secondary hover:text-editorial-ivory flex items-center justify-center transition-colors"
                          title="تعديل بيانات الحلقة بالكامل"
                        >
                          <Pencil size={13} />
                        </button>

                        {/* حذف الحلقة */}
                        <button
                          type="button"
                          onClick={() => setDeletingEpisode(ep)}
                          className="w-8 h-8 rounded-lg bg-surface hover:bg-red-950/40 border border-border-subtle hover:border-red-800 text-editorial-secondary hover:text-red-300 flex items-center justify-center transition-colors"
                          title="حذف الحلقة"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* نافذة تعديل المسلسل */}
      {isEditingSeries && (
        <SeriesEditor
          series={series}
          onClose={() => setIsEditingSeries(false)}
          onSaved={async () => {
            await onRefresh();
            setIsEditingSeries(false);
          }}
          showNotice={showNotice}
        />
      )}

      {/* نافذة إضافة / تعديل الموسم */}
      {editingSeason && activeSeason && (
        <SeasonEditor
          series={series}
          season={editingSeason === 'NEW' ? null : editingSeason}
          nextSeasonNumber={seasons.length + 1}
          onClose={() => setEditingSeason(null)}
          onSaved={async () => {
            await onRefresh();
            setEditingSeason(null);
          }}
          showNotice={showNotice}
        />
      )}

      {/* نافذة التعديل المتقدم للحلقة */}
      {editingEpisode && activeSeason && (
        <EpisodeEditor
          series={series}
          season={activeSeason}
          episode={editingEpisode}
          onClose={() => setEditingEpisode(null)}
          onSaved={async () => {
            await onRefresh();
            setEditingEpisode(null);
          }}
          showNotice={showNotice}
          onOpenTranscript={(ep) => {
            setEditingEpisode(null);
            setEditingTranscriptEpisode(ep);
          }}
        />
      )}

      {/* نافذة محرر النص المتزامن المباشر للحلقة */}
      {editingTranscriptEpisode && (
        <TranscriptEditor
          seriesTitle={series.title}
          seasonTitle={activeSeason?.title || 'الموسم الأول'}
          episode={editingTranscriptEpisode}
          onClose={() => setEditingTranscriptEpisode(null)}
          onSaved={async () => {
            await onRefresh();
            setEditingTranscriptEpisode(null);
          }}
          showNotice={showNotice}
        />
      )}

      {/* تأكيد حذف المسلسل */}
      {deletingSeries && (
        <ConfirmDialog
          title={`حذف مسلسل «${series.title}»`}
          message={`هل أنت متأكد تماماً من حذف هذا العمل الدرامي وجميع مواسمه (${seasons.length}) وحلقاته (${totalSeriesEpisodes})؟ هذا الإجراء نهائي ولا يمكن التراجع عنه.`}
          confirmLabel={isDeleting ? 'جارٍ الحذف...' : 'تأكيد الحذف النهائي'}
          onConfirm={handleDeleteSeries}
          onCancel={() => setDeletingSeries(false)}
        />
      )}

      {/* تأكيد حذف الموسم */}
      {deletingSeason && (
        <ConfirmDialog
          title={`حذف «${deletingSeason.title}»`}
          message={`هل أنت متأكد من حذف هذا الموسم وجميع حلقاته (${deletingSeason.episodes?.length || 0} حلقة)؟`}
          confirmLabel={isDeleting ? 'جارٍ الحذف...' : 'تأكيد حذف الموسم'}
          onConfirm={handleDeleteSeason}
          onCancel={() => setDeletingSeason(null)}
        />
      )}

      {/* تأكيد حذف الحلقة */}
      {deletingEpisode && (
        <ConfirmDialog
          title={`حذف «${deletingEpisode.title}»`}
          message={`هل أنت متأكد من حذف هذه الحلقة وملفها الصوتي ونصوصها المتزامنة؟`}
          confirmLabel={isDeleting ? 'جارٍ الحذف...' : 'تأكيد حذف الحلقة'}
          onConfirm={handleDeleteEpisode}
          onCancel={() => setDeletingEpisode(null)}
        />
      )}
    </div>
  );
};
