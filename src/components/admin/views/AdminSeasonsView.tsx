'use client';

import React, { useState, useEffect } from 'react';
import {
  Layers,
  Plus,
  Pencil,
  Trash2,
  Radio,
  DollarSign,
  ChevronDown,
  Check,
  AlertCircle,
  Clock,
} from 'lucide-react';
import type { AdminSeriesDTO, AdminSeasonDTO } from '../cms/shared';
import { SeasonEditor } from '../cms/SeasonEditor';
import { ConfirmDialog } from '../cms/ConfirmDialog';
import { adminApi, RELEASE_STATUS_LABELS } from '../cms/shared';

interface Props {
  seriesList: AdminSeriesDTO[];
  initialSeriesId?: string | null;
  onRefresh: () => Promise<void>;
  showNotice: (type: 'success' | 'error', msg: string) => void;
  onManageEpisodes: (seriesId: string, seasonId: string) => void;
}

export const AdminSeasonsView: React.FC<Props> = ({
  seriesList,
  initialSeriesId,
  onRefresh,
  showNotice,
  onManageEpisodes,
}) => {
  const [selectedSeriesId, setSelectedSeriesId] = useState<string>(
    initialSeriesId || seriesList[0]?._id || ''
  );

  useEffect(() => {
    if (initialSeriesId) {
      setSelectedSeriesId(initialSeriesId);
    } else if (!selectedSeriesId && seriesList.length > 0) {
      setSelectedSeriesId(seriesList[0]._id);
    }
  }, [initialSeriesId, seriesList, selectedSeriesId]);

  const currentSeries = seriesList.find((s) => s._id === selectedSeriesId) || seriesList[0];
  const seasons = currentSeries?.seasons || [];

  const [editingSeason, setEditingSeason] = useState<AdminSeasonDTO | null | 'NEW'>(null);
  const [deletingSeason, setDeletingSeason] = useState<AdminSeasonDTO | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDeleteSeason = async () => {
    if (!deletingSeason || !currentSeries) return;
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

  return (
    <div className="space-y-6">
      {/* 1. محدد المسلسل وزر إضافة موسم */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 rounded-2xl bg-surface border border-border-subtle">
        <div className="space-y-1">
          <h2 className="text-lg font-bold text-editorial-ivory flex items-center gap-2">
            <Layers size={20} className="text-amber-400" />
            <span>إدارة مواسم المسلسلات</span>
          </h2>
          <p className="text-xs text-editorial-muted">
            اختر العمل لعرض وتعديل مواسمه وتسعيرها
          </p>
        </div>

        <div className="flex items-center gap-3 w-full sm:w-auto">
          {/* محدد العمل الدرامي */}
          <div className="relative flex-1 sm:w-64">
            <select
              value={selectedSeriesId}
              onChange={(e) => setSelectedSeriesId(e.target.value)}
              className="w-full min-h-10 ps-3 pe-8 rounded-xl bg-surface-elevated border border-border-subtle text-xs text-editorial-ivory appearance-none focus:outline-none focus:border-crimson"
            >
              {seriesList.map((s) => (
                <option key={s._id} value={s._id}>
                  {s.title} ({s.seasons?.length || 0} مواسم)
                </option>
              ))}
            </select>
            <ChevronDown
              size={15}
              className="absolute end-3 top-1/2 -translate-y-1/2 text-editorial-muted pointer-events-none"
            />
          </div>

          {currentSeries && (
            <button
              type="button"
              onClick={() => setEditingSeason('NEW')}
              className="min-h-10 px-4 rounded-xl bg-crimson hover:bg-crimson-bright text-white text-xs font-bold flex items-center gap-2 shadow-halo shrink-0 transition-transform active:scale-95"
            >
              <Plus size={16} />
              <span>موسم جديد</span>
            </button>
          )}
        </div>
      </div>

      {/* 2. بطاقات المواسم */}
      {currentSeries ? (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
            {seasons.map((season) => (
              <div
                key={season._id}
                className="p-5 rounded-2xl bg-surface border border-border-subtle hover:border-border-strong flex flex-col justify-between space-y-4 transition-all"
              >
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="px-2.5 py-0.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs font-bold">
                      الموسم {season.seasonNumber}
                    </span>
                    <span className="px-2 py-0.5 rounded bg-surface-elevated text-[10px] text-editorial-secondary border border-border-subtle">
                      {RELEASE_STATUS_LABELS[season.releaseStatus] || season.releaseStatus}
                    </span>
                  </div>

                  <h3 className="text-base font-bold font-display text-editorial-ivory">
                    {season.title}
                  </h3>

                  {season.description && (
                    <p className="text-xs text-editorial-secondary line-clamp-2 font-reading">
                      {season.description}
                    </p>
                  )}
                </div>

                <div className="pt-3 border-t border-border-subtle flex items-center justify-between text-xs">
                  <div className="space-y-0.5">
                    <span className="text-[11px] text-editorial-muted block">
                      سعر شراء الموسم للأبد
                    </span>
                    <span className="font-bold text-editorial-ivory font-mono">
                      ${season.price ?? 0.5} {season.currency || 'USD'}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    {/* الانتقال المباشر لحلقات هذا الموسم */}
                    <button
                      type="button"
                      onClick={() => onManageEpisodes(currentSeries._id, season._id)}
                      className="min-h-8 px-3 rounded-lg bg-surface-elevated hover:bg-border-subtle border border-border-subtle text-editorial-ivory text-xs font-semibold flex items-center gap-1.5 transition-colors"
                      title="عرض وتعديل حلقات هذا الموسم"
                    >
                      <Radio size={13} className="text-emerald-400" />
                      <span>{season.episodes?.length || 0} حلقة</span>
                    </button>

                    {/* تعديل الموسم */}
                    <button
                      type="button"
                      onClick={() => setEditingSeason(season)}
                      className="w-8 h-8 rounded-lg bg-surface hover:bg-surface-elevated border border-border-subtle text-editorial-secondary hover:text-editorial-ivory flex items-center justify-center transition-colors"
                      title="تعديل بيانات وتسعير الموسم"
                    >
                      <Pencil size={13} />
                    </button>

                    {/* حذف الموسم */}
                    <button
                      type="button"
                      onClick={() => setDeletingSeason(season)}
                      className="w-8 h-8 rounded-lg bg-surface hover:bg-red-950/40 border border-border-subtle hover:border-red-800 text-editorial-secondary hover:text-red-300 flex items-center justify-center transition-colors"
                      title="حذف الموسم بالكامل"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {seasons.length === 0 && (
            <div className="p-12 text-center rounded-2xl bg-surface border border-border-subtle space-y-3">
              <Layers size={32} className="mx-auto text-editorial-muted" />
              <p className="text-sm text-editorial-secondary font-medium">
                لا توجد مواسم مسجلة لهذا المسلسل بعد
              </p>
              <button
                type="button"
                onClick={() => setEditingSeason('NEW')}
                className="min-h-9 px-4 rounded-xl bg-crimson hover:bg-crimson-bright text-white text-xs font-bold inline-flex items-center gap-2"
              >
                <Plus size={14} />
                <span>إضافة الموسم الأول</span>
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="p-12 text-center rounded-2xl bg-surface border border-border-subtle">
          <p className="text-xs text-editorial-muted">يرجى إضافة مسلسل أولاً لإدارة مواسمه</p>
        </div>
      )}

      {/* نافذة تعديل / إنشاء موسم */}
      {editingSeason && currentSeries && (
        <SeasonEditor
          series={currentSeries}
          season={editingSeason === 'NEW' ? null : editingSeason}
          nextSeasonNumber={(currentSeries.seasons?.length || 0) + 1}
          onClose={() => setEditingSeason(null)}
          onSaved={async () => {
            await onRefresh();
            setEditingSeason(null);
          }}
          showNotice={showNotice}
        />
      )}

      {/* تأكيد حذف الموسم */}
      {deletingSeason && (
        <ConfirmDialog
          title={`حذف موسم «${deletingSeason.title}»`}
          message={`هل أنت متأكد من حذف هذا الموسم وجميع حلقاته الصوتية ونصوصه؟`}
          confirmLabel={isDeleting ? 'جارٍ الحذف...' : 'تأكيد الحذف النهائي'}
          onConfirm={handleDeleteSeason}
          onCancel={() => setDeletingSeason(null)}
        />
      )}
    </div>
  );
};
