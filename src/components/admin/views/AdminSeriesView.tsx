'use client';

import React, { useState, useEffect } from 'react';
import {
  Film,
  Plus,
  Pencil,
  Trash2,
  Star,
  Search,
  Radio,
} from 'lucide-react';
import type { AdminSeriesDTO } from '../cms/shared';
import { SeriesEditor } from '../cms/SeriesEditor';
import { ConfirmDialog } from '../cms/ConfirmDialog';
import { SeriesStudioView } from '../cms/SeriesStudioView';
import { adminApi } from '../cms/shared';
import { AdaptiveImage } from '@/components/media/AdaptiveImage';

interface Props {
  seriesList: AdminSeriesDTO[];
  initialSeriesId?: string | null;
  initialSeasonId?: string | null;
  initialEpisodeId?: string | null;
  onRefresh: () => Promise<void>;
  showNotice: (type: 'success' | 'error', msg: string) => void;
}

export const AdminSeriesView: React.FC<Props> = ({
  seriesList,
  initialSeriesId,
  initialSeasonId,
  initialEpisodeId,
  onRefresh,
  showNotice,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [studioSeriesId, setStudioSeriesId] = useState<string | null>(initialSeriesId || null);
  const [editingSeries, setEditingSeries] = useState<AdminSeriesDTO | null | 'NEW'>(null);
  const [deletingSeries, setDeletingSeries] = useState<AdminSeriesDTO | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    if (initialSeriesId) {
      setStudioSeriesId(initialSeriesId);
    }
  }, [initialSeriesId]);

  // Find active studio series
  const studioSeries = studioSeriesId ? seriesList.find((s) => s._id === studioSeriesId) : null;

  if (studioSeries) {
    return (
      <SeriesStudioView
        series={studioSeries}
        initialSeasonId={initialSeasonId}
        initialEpisodeId={initialEpisodeId}
        onBack={() => setStudioSeriesId(null)}
        onRefresh={onRefresh}
        showNotice={showNotice}
      />
    );
  }

  const filteredSeries = seriesList.filter(
    (s) =>
      s.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.slug.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (s.genres || []).some((g) => g.includes(searchTerm))
  );

  const handleDeleteSeries = async () => {
    if (!deletingSeries) return;
    setIsDeleting(true);
    try {
      const res = await adminApi<{ success: boolean }>(
        `/api/v1/admin/content?entity=series&id=${deletingSeries._id}&cascade=true`,
        { method: 'DELETE' }
      );
      if (res.ok) {
        showNotice('success', `تم حذف المسلسل «${deletingSeries.title}» بنجاح`);
        await onRefresh();
        setDeletingSeries(null);
      } else {
        showNotice('error', res.error || 'فشل حذف المسلسل');
      }
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* 1. الترويسة وأزرار الإجراء السريع */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 rounded-2xl bg-surface border border-border-subtle">
        <div className="space-y-1">
          <h2 className="text-lg font-bold text-editorial-ivory flex items-center gap-2">
            <Film size={20} className="text-crimson" />
            <span>المسلسلات</span>
          </h2>
          <p className="text-xs text-editorial-muted">
            {seriesList.length} أعمال مسجلة
          </p>
        </div>

        <div className="flex items-center gap-3 w-full sm:w-auto">
          {/* حقل البحث السريع */}
          <div className="relative flex-1 sm:w-64">
            <Search size={15} className="absolute start-3 top-1/2 -translate-y-1/2 text-editorial-muted pointer-events-none" />
            <input
              type="text"
              placeholder="بحث في المسلسلات..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              aria-label="البحث في المسلسلات"
              className="w-full min-h-11 ps-9 pe-3 rounded-xl bg-surface-elevated border border-border-subtle text-xs text-editorial-ivory placeholder:text-editorial-muted focus:outline-none focus:border-crimson focus-visible:ring-2 focus-visible:ring-crimson"
            />
          </div>

          <button
            type="button"
            onClick={() => setEditingSeries('NEW')}
            className="min-h-11 px-4 rounded-xl bg-crimson hover:bg-crimson-bright text-white text-xs font-bold flex items-center gap-2 shadow-halo shrink-0 transition-transform active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-crimson"
          >
            <Plus size={16} />
            <span>مسلسل جديد</span>
          </button>
        </div>
      </div>

      {/* 2. شبكة بطاقات المسلسلات الفخمة */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
        {filteredSeries.map((series) => {
          const totalEpisodes = (series.seasons || []).reduce(
            (acc, sz) => acc + (sz.episodes?.length || 0),
            0
          );

          return (
            <div
              key={series._id}
              className="rounded-2xl bg-surface border border-border-subtle hover:border-border-strong overflow-hidden flex flex-col justify-between transition-all duration-300 group shadow-sm"
            >
              <div className="p-4 flex gap-3 sm:gap-4">
                {/* بوستر العمل المصغر */}
                <button
                  type="button"
                  onClick={() => setStudioSeriesId(series._id)}
                  className="relative w-20 h-28 sm:w-24 sm:h-32 rounded-xl overflow-hidden shrink-0 border border-white/10 bg-black cursor-pointer group-hover:border-crimson/50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-crimson"
                  aria-label={`فتح استوديو ${series.title}`}
                >
                  <AdaptiveImage
                    src={series.posterUrl}
                    unoptimized
                    alt={series.title}
                    fit="cover"
                    sizes="(max-width: 640px) 80px, 96px"
                    className="object-cover group-hover:scale-105 transition-transform duration-500"
                  />
                  {series.featured && (
                    <div className="absolute top-1.5 start-1.5 p-1 rounded-md bg-crimson text-white shadow-halo">
                      <Star size={11} aria-hidden="true" />
                    </div>
                  )}
                </button>

                {/* بيانات العمل التحريرية */}
                <div className="flex-1 min-w-0 space-y-1.5 text-right">
                  <div className="flex items-center gap-1.5">
                    <span className="px-2 py-0.5 rounded bg-surface-elevated text-[10px] font-bold text-editorial-secondary border border-border-subtle">
                      {series.contentRating}
                    </span>
                    <span className="text-[11px] text-editorial-muted truncate">
                      {series.productionYear}
                    </span>
                  </div>

                  <h3 className="text-base font-bold font-display text-editorial-ivory truncate group-hover:text-crimson transition-colors">
                    <button
                      type="button"
                      onClick={() => setStudioSeriesId(series._id)}
                      className="block w-full text-right truncate focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-crimson rounded"
                      aria-label={`فتح استوديو ${series.title}`}
                    >
                      {series.title}
                    </button>
                  </h3>

                  <p className="text-xs text-editorial-secondary line-clamp-2 font-reading">
                    {series.hook}
                  </p>

                  <div className="flex flex-wrap gap-1 pt-1">
                    {(series.genres || []).slice(0, 3).map((g) => (
                      <span
                        key={g}
                        className="px-2 py-0.5 rounded-md bg-surface-elevated text-[10px] text-editorial-muted"
                      >
                        {g}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              {/* إحصائيات سريعة وأزرار الإجراءات */}
              <div className="px-4 py-3 border-t border-border-subtle/60 bg-surface-elevated/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-editorial-muted">
                  <span>{series.seasons?.length || 0} مواسم</span>
                  <span>•</span>
                  <span>{totalEpisodes} حلقة</span>
                  <span>•</span>
                  <span className={series.freeEpisodesCount > 0 ? 'text-emerald-400 font-medium' : 'text-editorial-muted'}>
                    {series.freeEpisodesCount > 0
                      ? `${series.freeEpisodesCount} مجانية`
                      : 'لا توجد مجانية'}
                  </span>
                </div>

                <div className="grid w-full grid-cols-3 gap-2 sm:w-auto sm:flex sm:items-center sm:justify-end">
                  {/* فتح استوديو المسلسل والمواسم والحلقات */}
                  <button
                    type="button"
                    onClick={() => setStudioSeriesId(series._id)}
                    className="col-span-1 min-h-11 px-3 rounded-lg bg-crimson hover:bg-crimson-bright text-white border border-crimson text-xs font-bold flex items-center justify-center gap-1.5 transition-all shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-crimson"
                    title="فتح استوديو العمل والمواسم والحلقات"
                    aria-label={`استوديو ${series.title}`}
                  >
                    <Radio size={14} />
                    <span>إدارة العمل</span>
                  </button>

                  {/* تعديل المسلسل */}
                  <button
                    type="button"
                    onClick={() => setEditingSeries(series)}
                    className="min-h-11 px-3 rounded-lg bg-surface hover:bg-surface-elevated border border-border-subtle text-editorial-secondary hover:text-editorial-ivory text-xs font-bold flex items-center justify-center gap-1.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-crimson"
                    title="تعديل بيانات وغلاف العمل"
                    aria-label={`تعديل ${series.title}`}
                  >
                    <Pencil size={14} />
                    <span>تعديل</span>
                  </button>

                  {/* حذف المسلسل */}
                  <button
                    type="button"
                    onClick={() => setDeletingSeries(series)}
                    className="min-h-11 px-3 rounded-lg bg-red-950/20 hover:bg-red-950/50 border border-red-900/60 hover:border-red-700 text-red-300 hover:text-red-200 text-xs font-bold flex items-center justify-center gap-1.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-300"
                    title="حذف المسلسل بالكامل"
                    aria-label={`حذف ${series.title}`}
                  >
                    <Trash2 size={14} />
                    <span>حذف</span>
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {filteredSeries.length === 0 && (
        <div className="p-12 text-center rounded-2xl bg-surface border border-border-subtle space-y-3">
          <Film size={32} className="mx-auto text-editorial-muted" />
          <p className="text-sm text-editorial-secondary font-medium">
            {searchTerm ? 'لا توجد أعمال تطابق مصطلح البحث' : 'لا توجد أعمال مسجلة بعد'}
          </p>
          {searchTerm ? (
            <button
              type="button"
              onClick={() => setSearchTerm('')}
              className="min-h-11 px-4 rounded-xl bg-surface-elevated hover:bg-border-subtle border border-border-subtle text-editorial-ivory text-xs font-bold inline-flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-crimson"
            >
              مسح البحث
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setEditingSeries('NEW')}
              className="min-h-11 px-4 rounded-xl bg-crimson hover:bg-crimson-bright text-white text-xs font-bold inline-flex items-center gap-2 shadow-halo focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-crimson"
            >
              <Plus size={14} aria-hidden="true" />
              إضافة أول مسلسل
            </button>
          )}
        </div>
      )}

      {/* نافذة إنشاء / تعديل المسلسل */}
      {editingSeries && (
        <SeriesEditor
          series={editingSeries === 'NEW' ? null : editingSeries}
          onClose={() => setEditingSeries(null)}
          onSaved={async (createdId) => {
            await onRefresh();
            setEditingSeries(null);
            if (createdId) {
              setStudioSeriesId(createdId);
            }
          }}
          showNotice={showNotice}
        />
      )}

      {/* تأكيد حذف المسلسل */}
      {deletingSeries && (
        <ConfirmDialog
          title={`حذف مسلسل «${deletingSeries.title}»`}
          message={`هل أنت متأكد من حذف هذا المسلسل وجميع مواسمه وحلقاته وملفاته؟ هذا الإجراء نهائي ولا يمكن التراجع عنه.`}
          confirmLabel={isDeleting ? 'جارٍ الحذف...' : 'تأكيد الحذف النهائي'}
          onConfirm={handleDeleteSeries}
          onCancel={() => setDeletingSeries(null)}
        />
      )}
    </div>
  );
};
