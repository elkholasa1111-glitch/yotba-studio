'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  LayoutGrid,
  Plus,
  ArrowUp,
  ArrowDown,
  Pencil,
  Trash2,
  Eye,
  EyeOff,
  Calendar,
  Layers,
  Film,
  AlertCircle,
  Loader2,
  RefreshCw,
  X,
} from 'lucide-react';
import {
  AdminHomepageSectionDTO,
  HomepageSectionLayout,
  HomepageSectionSource,
  HomepageSectionAutoRule,
  SeriesOption,
  CategoryOption,
} from './types';
import {
  fetchHomepageSections,
  createHomepageSection,
  updateHomepageSection,
  reorderHomepageSections,
  deleteHomepageSection,
} from './operations-client';
import { ConfirmModal } from './ConfirmModal';

interface HomepagePanelProps {
  onNotice?: (type: 'success' | 'error', msg: string) => void;
}

const LAYOUT_LABELS: Record<HomepageSectionLayout, string> = {
  FEATURE: 'مميز',
  EDITORIAL_SPLIT: 'منقسم',
  POSTER_WALL: 'جدار بوسترات',
  RAIL: 'شريط أفقي',
  MOSAIC: 'شبكة',
  RANKED_LIST: 'قائمة مرقمة',
  CINEMATIC_BANNER: 'بانر عريض',
  SPOTLIGHT: 'تركيز',
};

const AUTO_RULE_LABELS: Record<HomepageSectionAutoRule, string> = {
  POPULAR: 'الأكثر استماعاً',
  NEWEST: 'الأحدث',
  GENRE_FILTER: 'حسب التصنيف',
  EDITORIAL_CHOICE: 'اختيارات التحرير',
  COMING_SOON: 'قريباً',
  MOST_COMPLETED: 'الأعلى إكمالاً',
  CONTINUE_LISTENING: 'متابعة الاستماع',
};

export const HomepagePanel: React.FC<HomepagePanelProps> = ({ onNotice }) => {
  const [sections, setSections] = useState<AdminHomepageSectionDTO[]>([]);
  const [seriesOptions, setSeriesOptions] = useState<SeriesOption[]>([]);
  const [categoryOptions, setCategoryOptions] = useState<CategoryOption[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // حالة الترتيب وإعادة الحفظ
  const [isReordering, setIsReordering] = useState(false);

  // حالة نافذة الإنشاء / التعديل
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editingSection, setEditingSection] =
    useState<AdminHomepageSectionDTO | null>(null);

  // حقول نموذج القسم
  const [formKey, setFormKey] = useState('');
  const [formTitle, setFormTitle] = useState('');
  const [formSubtitle, setFormSubtitle] = useState('');
  const [formLayout, setFormLayout] = useState<HomepageSectionLayout>('RAIL');
  const [formSourceType, setFormSourceType] =
    useState<HomepageSectionSource>('AUTOMATIC');
  const [formAutoRule, setFormAutoRule] =
    useState<HomepageSectionAutoRule>('NEWEST');
  const [formCategoryId, setFormCategoryId] = useState('');
  const [formManualSeriesIds, setFormManualSeriesIds] = useState<string[]>([]);
  const [formIsVisible, setFormIsVisible] = useState(true);
  const [formScheduledStart, setFormScheduledStart] = useState('');
  const [formScheduledEnd, setFormScheduledEnd] = useState('');

  const [formHasChanges, setFormHasChanges] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // نافذة تأكيد الإلغاء في حال وجود تعديلات غير محفوظة
  const [isDiscardConfirmOpen, setIsDiscardConfirmOpen] = useState(false);

  // نافذة تأكيد الحذف
  const [deleteTarget, setDeleteTarget] =
    useState<AdminHomepageSectionDTO | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const editorCloseRef = useRef<HTMLButtonElement>(null);

  // جلب الأقسام
  const loadSections = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    const res = await fetchHomepageSections();
    setIsLoading(false);

    if (res.ok) {
      setSections(res.data.sections);
      setSeriesOptions(res.data.seriesOptions);
      setCategoryOptions(res.data.categoryOptions);
    } else {
      setError(res.error);
    }
  }, []);

  useEffect(() => {
    loadSections();
  }, [loadSections]);

  // دعم Escape والتركيز الأولي حتى لا يضيع المشرف داخل نموذج القسم الطويل.
  useEffect(() => {
    if (!isEditorOpen) return;
    const timer = window.setTimeout(() => editorCloseRef.current?.focus(), 0);
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || isSubmitting) return;
      event.preventDefault();
      if (formHasChanges) {
        setIsDiscardConfirmOpen(true);
      } else {
        setIsEditorOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isEditorOpen, isSubmitting, formHasChanges]);

  // تحويل ISO إلى صيغة datetime-local
  const toDateTimeLocal = (iso: string | null) => {
    if (!iso) return '';
    try {
      const d = new Date(iso);
      if (Number.isNaN(d.getTime())) return '';
      const pad = (n: number) => String(n).padStart(2, '0');
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    } catch {
      return '';
    }
  };

  // فتح نافذة الإنشاء
  const handleOpenCreate = () => {
    setEditingSection(null);
    setFormKey('');
    setFormTitle('');
    setFormSubtitle('');
    setFormLayout('RAIL');
    setFormSourceType('AUTOMATIC');
    setFormAutoRule('NEWEST');
    setFormCategoryId('');
    setFormManualSeriesIds([]);
    setFormIsVisible(true);
    setFormScheduledStart('');
    setFormScheduledEnd('');
    setFormHasChanges(false);
    setFormError(null);
    setIsEditorOpen(true);
  };

  // فتح نافذة التعديل
  const handleOpenEdit = (sec: AdminHomepageSectionDTO) => {
    setEditingSection(sec);
    setFormKey(sec.key);
    setFormTitle(sec.title);
    setFormSubtitle(sec.subtitle || '');
    setFormLayout(sec.layout);
    setFormSourceType(sec.sourceType);
    setFormAutoRule(sec.autoRule || 'NEWEST');
    setFormCategoryId(sec.filterCategoryId || '');
    setFormManualSeriesIds(sec.manualSeriesIds || []);
    setFormIsVisible(sec.isVisible);
    setFormScheduledStart(toDateTimeLocal(sec.scheduledStart));
    setFormScheduledEnd(toDateTimeLocal(sec.scheduledEnd));
    setFormHasChanges(false);
    setFormError(null);
    setIsEditorOpen(true);
  };

  // إغلاق نافذة التعديل مع حماية التعديلات غير المحفوظة
  const handleRequestCloseEditor = () => {
    if (formHasChanges) {
      setIsDiscardConfirmOpen(true);
    } else {
      setIsEditorOpen(false);
    }
  };

  // تبديل اختيار عمل في القسم اليدوي
  const toggleSeriesInManual = (seriesId: string) => {
    setFormHasChanges(true);
    setFormManualSeriesIds((prev) =>
      prev.includes(seriesId)
        ? prev.filter((id) => id !== seriesId)
        : [...prev, seriesId],
    );
  };

  // حفظ القسم (إنشاء أو تحديث)
  const handleSubmitForm = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!formTitle.trim() || formTitle.length < 2) {
      setFormError('عنوان القسم مطلوب ويجب ألا يقل عن حرفين');
      return;
    }

    if (!editingSection && (!formKey.trim() || formKey.length < 2)) {
      setFormError('معرّف القسم (Key) مطلوب ويجب أن يكون بالإنجليزية والأرقام');
      return;
    }

    if (
      formSourceType === 'AUTOMATIC' &&
      formAutoRule === 'GENRE_FILTER' &&
      !formCategoryId
    ) {
      setFormError('يرجى اختيار تصنيف للقسم');
      return;
    }

    if (formSourceType === 'MANUAL' && formManualSeriesIds.length === 0) {
      setFormError('يجب اختيار عمل واحد على الأقل للقسم اليدوي');
      return;
    }

    if (formScheduledStart && formScheduledEnd) {
      if (
        new Date(formScheduledStart).getTime() >=
        new Date(formScheduledEnd).getTime()
      ) {
        setFormError('تاريخ ووقت بداية العرض يجب أن يسبق تاريخ النهاية');
        return;
      }
    }

    setIsSubmitting(true);

    const payload: Record<string, unknown> = {
      title: formTitle.trim(),
      subtitle: formSubtitle.trim() || undefined,
      layout: formLayout,
      sourceType: formSourceType,
      autoRule: formSourceType === 'AUTOMATIC' ? formAutoRule : undefined,
      filterCategoryId:
        formSourceType === 'AUTOMATIC' && formAutoRule === 'GENRE_FILTER'
          ? formCategoryId || undefined
          : undefined,
      manualSeriesIds: formSourceType === 'MANUAL' ? formManualSeriesIds : [],
      isVisible: formIsVisible,
      scheduledStart: formScheduledStart
        ? new Date(formScheduledStart).toISOString()
        : null,
      scheduledEnd: formScheduledEnd
        ? new Date(formScheduledEnd).toISOString()
        : null,
    };

    let res;
    if (editingSection) {
      res = await updateHomepageSection(editingSection._id, payload);
    } else {
      payload.key = formKey.trim();
      res = await createHomepageSection(payload);
    }

    setIsSubmitting(false);

    if (res.ok) {
      onNotice?.(
        'success',
        editingSection
          ? `تم تحديث قسم "${res.data.section.title}" وتحديث كاش الصفحة الرئيسية`
          : `تم إنشاء قسم "${res.data.section.title}" بنجاح`,
      );
      setIsEditorOpen(false);
      loadSections();
    } else {
      setFormError(res.error);
    }
  };

  // تبديل الرؤية السريع
  const handleToggleVisibility = async (sec: AdminHomepageSectionDTO) => {
    const nextVal = !sec.isVisible;
    const res = await updateHomepageSection(sec._id, { isVisible: nextVal });
    if (res.ok) {
      onNotice?.(
        'success',
        nextVal ? `تم إظهار قسم "${sec.title}"` : `تم إخفاء قسم "${sec.title}"`,
      );
      setSections((prev) =>
        prev.map((s) => (s._id === sec._id ? { ...s, isVisible: nextVal } : s)),
      );
    } else {
      onNotice?.('error', res.error);
    }
  };

  // نقل القسم للأعلى أو الأسفل (Keyboard Accessible Reordering)
  const handleMoveSection = async (index: number, direction: 'UP' | 'DOWN') => {
    if (direction === 'UP' && index === 0) return;
    if (direction === 'DOWN' && index === sections.length - 1) return;

    const targetIndex = direction === 'UP' ? index - 1 : index + 1;
    const reordered = [...sections];
    const [moved] = reordered.splice(index, 1);
    reordered.splice(targetIndex, 0, moved);

    // إعادة ترقيم order
    const updatedOrders = reordered.map((sec, i) => ({
      id: sec._id,
      order: i + 1,
    }));

    setIsReordering(true);
    const res = await reorderHomepageSections(updatedOrders);
    setIsReordering(false);

    if (res.ok) {
      setSections(res.data.sections);
      onNotice?.('success', 'تم حفظ الترتيب الجديد وتحديث كاش الصفحة الرئيسية');
    } else {
      onNotice?.('error', res.error);
    }
  };

  // تأكيد وحذف قسم
  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);

    const res = await deleteHomepageSection(deleteTarget._id);
    setIsDeleting(false);
    setDeleteTarget(null);

    if (res.ok) {
      onNotice?.('success', 'تم حذف القسم وتحديث كاش الصفحة الرئيسية');
      loadSections();
    } else {
      onNotice?.('error', res.error);
    }
  };

  return (
    <div className="space-y-6" dir="rtl">
      {/* شريط الإجراءات العلوي */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between rounded-xl border border-border-subtle bg-surface p-4">
        <div>
          <h2 className="text-base font-bold text-editorial-ivory flex items-center gap-2">
            <LayoutGrid className="h-5 w-5 text-crimson" />
            <span>أقسام وجدولة الصفحة الرئيسية</span>
          </h2>
          <p className="text-xs text-editorial-secondary mt-1">
            رتّب الأقسام وحدد محتواها ووقت ظهورها.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={loadSections}
            disabled={isLoading}
            className="min-h-11 min-w-11 flex items-center justify-center rounded-lg border border-border-subtle bg-surface-elevated text-editorial-secondary hover:text-editorial-ivory hover:border-crimson focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-crimson disabled:opacity-50"
            aria-label="تحديث الأقسام"
          >
            <RefreshCw
              className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`}
            />
          </button>
          <button
            type="button"
            onClick={handleOpenCreate}
            className="min-h-11 px-4 py-2 rounded-lg bg-crimson hover:bg-crimson-bright text-white text-xs font-bold shadow-halo flex items-center justify-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-crimson"
          >
            <Plus className="h-4 w-4" />
            <span>إضافة قسم جديد</span>
          </button>
        </div>
      </div>

      {/* رسالة الخطأ */}
      {error && (
        <div className="flex items-center gap-3 rounded-xl border border-crimson/30 bg-crimson-subtle p-4 text-sm text-crimson-bright">
          <AlertCircle className="h-5 w-5 shrink-0" />
          <p>{error}</p>
          <button
            type="button"
            onClick={loadSections}
            className="min-h-11 mr-auto px-4 py-1 text-xs font-bold underline hover:no-underline"
          >
            إعادة المحاولة
          </button>
        </div>
      )}

      {/* قائمة الأقسام */}
      {isLoading ? (
        <div className="flex min-h-[260px] items-center justify-center rounded-xl border border-border-subtle bg-surface">
          <Loader2 className="h-8 w-8 animate-spin text-crimson" />
        </div>
      ) : sections.length === 0 ? (
        <div className="flex min-h-[240px] flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border-subtle bg-surface p-8 text-center text-editorial-secondary">
          <p className="text-base font-bold text-editorial-ivory">
            لا توجد أقسام مسجلة حالياً
          </p>
          <p className="text-xs">
            تعتمد الصفحة الرئيسية حالياً على الأقسام الافتراضية. أضف قسماً
            لتخصيص الواجهة.
          </p>
          <button
            type="button"
            onClick={handleOpenCreate}
            className="min-h-11 px-4 py-2 rounded-lg bg-crimson text-white text-xs font-bold shadow-halo inline-flex items-center gap-2"
          >
            <Plus className="h-4 w-4" />
            <span>إنشاء أول قسم مخصص</span>
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {sections.map((sec, index) => {
            const hasSchedule = Boolean(sec.scheduledStart || sec.scheduledEnd);
            const now = Date.now();
            const startMs = sec.scheduledStart
              ? new Date(sec.scheduledStart).getTime()
              : null;
            const endMs = sec.scheduledEnd
              ? new Date(sec.scheduledEnd).getTime()
              : null;
            const isLiveBySchedule =
              (!startMs || now >= startMs) && (!endMs || now <= endMs);

            return (
              <div
                key={sec._id}
                className={`rounded-xl border transition-all ${
                  sec.isVisible
                    ? 'border-border-subtle bg-surface hover:border-border-strong'
                    : 'border-border-subtle/50 bg-surface/60 opacity-75'
                } p-4`}
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  {/* معلومات القسم */}
                  <div className="flex items-start gap-3">
                    {/* أزرار الترتيب السريع (Keyboard Accessible Reordering) */}
                    <div className="flex flex-col items-center gap-1 shrink-0 pt-0.5">
                      <button
                        type="button"
                        onClick={() => handleMoveSection(index, 'UP')}
                        disabled={index === 0 || isReordering}
                        className="min-h-11 min-w-11 p-1.5 rounded bg-surface-elevated text-editorial-secondary hover:text-editorial-ivory hover:bg-border-subtle disabled:opacity-30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-crimson"
                        aria-label={`تحريك قسم "${sec.title}" للأعلى`}
                      >
                        <ArrowUp className="h-4 w-4" />
                      </button>
                      <span className="text-[10px] font-mono text-editorial-secondary">
                        {sec.order}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleMoveSection(index, 'DOWN')}
                        disabled={index === sections.length - 1 || isReordering}
                        className="min-h-11 min-w-11 p-1.5 rounded bg-surface-elevated text-editorial-secondary hover:text-editorial-ivory hover:bg-border-subtle disabled:opacity-30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-crimson"
                        aria-label={`تحريك قسم "${sec.title}" للأسفل`}
                      >
                        <ArrowDown className="h-4 w-4" />
                      </button>
                    </div>

                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-bold text-sm text-editorial-ivory">
                          {sec.title}
                        </span>
                        <span className="hidden sm:inline font-mono text-[11px] text-editorial-secondary bg-surface-elevated px-2 py-0.5 rounded">
                          {sec.key}
                        </span>
                        <span className="text-[11px] px-2 py-0.5 rounded-full border border-border-subtle text-editorial-secondary">
                          {LAYOUT_LABELS[sec.layout] || sec.layout}
                        </span>
                        {sec.sourceType === 'AUTOMATIC' ? (
                          <span className="text-[11px] px-2 py-0.5 rounded-full bg-blue-950/30 text-blue-300 border border-blue-900/40">
                            تلقائي:{' '}
                            {AUTO_RULE_LABELS[
                              sec.autoRule as HomepageSectionAutoRule
                            ] || sec.autoRule}
                          </span>
                        ) : (
                          <span className="text-[11px] px-2 py-0.5 rounded-full bg-purple-950/30 text-purple-300 border border-purple-900/40">
                            يدوي: {sec.manualSeriesIds.length} عمل
                          </span>
                        )}
                      </div>

                      {sec.subtitle && (
                        <p className="text-xs text-editorial-secondary line-clamp-1">
                          {sec.subtitle}
                        </p>
                      )}

                      {hasSchedule && (
                        <div className="flex items-center gap-1.5 text-[11px] text-editorial-secondary pt-1">
                          <Calendar className="h-3.5 w-3.5 text-crimson" />
                          <span>
                            الجدولة:{' '}
                            {sec.scheduledStart
                              ? new Date(sec.scheduledStart).toLocaleDateString(
                                  'ar-EG',
                                )
                              : 'الآن'}{' '}
                            إلى{' '}
                            {sec.scheduledEnd
                              ? new Date(sec.scheduledEnd).toLocaleDateString(
                                  'ar-EG',
                                )
                              : 'بلا نهاية'}
                          </span>
                          {!isLiveBySchedule && (
                            <span className="text-amber-400 font-semibold mr-1">
                              (خارج نافذة البث)
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* أزرار الإجراءات */}
                  <div className="flex flex-wrap items-center justify-end gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleToggleVisibility(sec)}
                      className={`min-h-11 px-3 py-1.5 rounded-lg border text-xs font-semibold inline-flex items-center gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-crimson ${
                        sec.isVisible
                          ? 'border-emerald-800/40 bg-emerald-950/20 text-emerald-300 hover:bg-emerald-950/40'
                          : 'border-border-subtle bg-surface-elevated text-editorial-secondary hover:text-editorial-ivory'
                      }`}
                    >
                      {sec.isVisible ? (
                        <Eye className="h-3.5 w-3.5" />
                      ) : (
                        <EyeOff className="h-3.5 w-3.5" />
                      )}
                      <span>{sec.isVisible ? 'ظاهر' : 'مخفي'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleOpenEdit(sec)}
                      className="min-h-11 px-3 py-1.5 rounded-lg border border-border-subtle bg-surface-elevated text-xs font-medium text-editorial-secondary hover:text-editorial-ivory hover:border-crimson inline-flex items-center gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-crimson"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                      <span>تعديل</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setDeleteTarget(sec)}
                      className="min-h-11 px-3 py-1.5 rounded-lg border border-crimson/40 bg-crimson-subtle text-xs font-semibold text-crimson-bright hover:bg-crimson/30 inline-flex items-center gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-crimson"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      <span>حذف</span>
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* نافذة الإنشاء والتعديل (Modal Dialog) */}
      {isEditorOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-obsidian-950/85 p-4 backdrop-blur-sm"
          role="presentation"
          onClick={handleRequestCloseEditor}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="section-editor-title"
            className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-xl border border-border-strong bg-surface-modal p-6 text-right shadow-cinematic"
            onClick={(e) => e.stopPropagation()}
            dir="rtl"
          >
            <div className="flex items-center justify-between border-b border-border-subtle pb-4">
              <h2
                id="section-editor-title"
                className="text-base font-bold text-editorial-ivory"
              >
                {editingSection
                  ? `تعديل قسم: ${editingSection.title}`
                  : 'إضافة قسم جديد للصفحة الرئيسية'}
              </h2>
              <button
                type="button"
                ref={editorCloseRef}
                onClick={handleRequestCloseEditor}
                disabled={isSubmitting}
                className="min-h-11 min-w-11 flex items-center justify-center rounded-lg text-editorial-secondary hover:text-editorial-ivory focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-crimson"
                aria-label="إغلاق نافذة القسم"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {formError && (
              <div className="mt-4 rounded-lg bg-crimson-subtle border border-crimson/30 p-3 text-xs text-crimson-bright flex items-center gap-2">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            <form
              onSubmit={handleSubmitForm}
              className="mt-4 space-y-4 text-xs"
            >
              {/* المعرّف (Key) */}
              <div>
                <label
                  htmlFor="sec-key-input"
                  className="block font-semibold text-editorial-ivory mb-1"
                >
                  المعرّف الداخلي (بالإنجليزية):
                </label>
                <input
                  id="sec-key-input"
                  type="text"
                  value={formKey}
                  onChange={(e) => {
                    setFormKey(e.target.value);
                    setFormHasChanges(true);
                  }}
                  disabled={Boolean(editingSection)}
                  placeholder="مثال: trending_today, ramadan_specials, crime_mysteries"
                  className="min-h-11 w-full rounded-lg border border-border-subtle bg-surface px-3 text-xs text-editorial-ivory focus:border-crimson focus:outline-none focus-visible:ring-2 focus-visible:ring-crimson disabled:opacity-50 font-mono"
                  required
                />
              </div>

              {/* العنوان والوصف الفرعي */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label
                    htmlFor="sec-title-input"
                    className="block font-semibold text-editorial-ivory mb-1"
                  >
                    عنوان القسم (بالعربية):
                  </label>
                  <input
                    id="sec-title-input"
                    type="text"
                    value={formTitle}
                    onChange={(e) => {
                      setFormTitle(e.target.value);
                      setFormHasChanges(true);
                    }}
                    placeholder="مثال: يُتبع الآن، الأكثر رواجاً، اختيارات الأسبوع"
                    className="min-h-11 w-full rounded-lg border border-border-subtle bg-surface px-3 text-xs text-editorial-ivory focus:border-crimson focus:outline-none focus-visible:ring-2 focus-visible:ring-crimson"
                    required
                  />
                </div>

                <div>
                  <label
                    htmlFor="sec-subtitle-input"
                    className="block font-semibold text-editorial-ivory mb-1"
                  >
                    الوصف الفرعي (اختياري):
                  </label>
                  <input
                    id="sec-subtitle-input"
                    type="text"
                    value={formSubtitle}
                    onChange={(e) => {
                      setFormSubtitle(e.target.value);
                      setFormHasChanges(true);
                    }}
                    placeholder="جملة موجزة تشوق المستمع للقسم..."
                    className="min-h-11 w-full rounded-lg border border-border-subtle bg-surface px-3 text-xs text-editorial-ivory focus:border-crimson focus:outline-none focus-visible:ring-2 focus-visible:ring-crimson"
                  />
                </div>
              </div>

              {/* التخطيط (Layout) */}
              <div>
                <label
                  htmlFor="sec-layout-select"
                  className="block font-semibold text-editorial-ivory mb-1"
                >
                  شكل القسم:
                </label>
                <select
                  id="sec-layout-select"
                  value={formLayout}
                  onChange={(e) => {
                    setFormLayout(e.target.value as HomepageSectionLayout);
                    setFormHasChanges(true);
                  }}
                  className="min-h-11 w-full rounded-lg border border-border-subtle bg-surface px-3 text-xs text-editorial-ivory focus:border-crimson focus:outline-none focus-visible:ring-2 focus-visible:ring-crimson"
                >
                  {Object.entries(LAYOUT_LABELS).map(([layoutKey, label]) => (
                    <option key={layoutKey} value={layoutKey}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>

              {/* نوع المصدر (تلقائي / يدوي) */}
              <div>
                <label className="block font-semibold text-editorial-ivory mb-2">
                  مصدر الأعمال في هذا القسم:
                </label>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="secSourceType"
                      value="AUTOMATIC"
                      checked={formSourceType === 'AUTOMATIC'}
                      onChange={() => {
                        setFormSourceType('AUTOMATIC');
                        setFormHasChanges(true);
                      }}
                      className="accent-crimson"
                    />
                    <span className="text-editorial-ivory">تلقائي</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="secSourceType"
                      value="MANUAL"
                      checked={formSourceType === 'MANUAL'}
                      onChange={() => {
                        setFormSourceType('MANUAL');
                        setFormHasChanges(true);
                      }}
                      className="accent-crimson"
                    />
                    <span className="text-editorial-ivory">اختيار يدوي</span>
                  </label>
                </div>
              </div>

              {/* خيارات التغذية التلقائية */}
              {formSourceType === 'AUTOMATIC' && (
                <div className="p-3 rounded-lg border border-border-subtle bg-surface space-y-3">
                  <div>
                    <label
                      htmlFor="sec-autorule-select"
                      className="block font-semibold text-editorial-ivory mb-1"
                    >
                      قاعدة الاختيار:
                    </label>
                    <select
                      id="sec-autorule-select"
                      value={formAutoRule}
                      onChange={(e) => {
                        setFormAutoRule(
                          e.target.value as HomepageSectionAutoRule,
                        );
                        setFormHasChanges(true);
                      }}
                      className="min-h-11 w-full rounded-lg border border-border-subtle bg-obsidian-850 px-3 text-xs text-editorial-ivory focus:border-crimson focus:outline-none"
                    >
                      {Object.entries(AUTO_RULE_LABELS).map(
                        ([ruleKey, label]) => (
                          <option key={ruleKey} value={ruleKey}>
                            {label}
                          </option>
                        ),
                      )}
                    </select>
                  </div>

                  {formAutoRule === 'GENRE_FILTER' && (
                    <div>
                      <label
                        htmlFor="sec-category-select"
                        className="block font-semibold text-editorial-ivory mb-1"
                      >
                        التصنيف:
                      </label>

                      <select
                        id="sec-category-select"
                        value={formCategoryId}
                        onChange={(e) => {
                          setFormCategoryId(e.target.value);
                          setFormHasChanges(true);
                        }}
                        className="min-h-11 w-full rounded-lg border border-border-subtle bg-obsidian-850 px-3 text-xs text-editorial-ivory focus:border-crimson focus:outline-none"
                      >
                        <option value="">اختر تصنيفًا</option>

                        {categoryOptions.map((category) => (
                          <option key={category._id} value={category._id}>
                            {category.nameAr}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
              )}

              {/* قائمة الاختيار اليدوي */}
              {formSourceType === 'MANUAL' && (
                <div className="p-3 rounded-lg border border-border-subtle bg-surface space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-editorial-ivory">
                      اختر الأعمال المعروضة ({formManualSeriesIds.length} تم
                      اختيارها):
                    </span>
                  </div>
                  <div className="max-h-44 overflow-y-auto space-y-1.5 divide-y divide-border-subtle/50">
                    {seriesOptions.map((s) => {
                      const isSelected = formManualSeriesIds.includes(s._id);
                      return (
                        <label
                          key={s._id}
                          className="flex items-center justify-between p-2 rounded hover:bg-surface-elevated cursor-pointer"
                        >
                          <div className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleSeriesInManual(s._id)}
                              className="accent-crimson h-4 w-4"
                            />
                            <span className="text-editorial-ivory font-medium">
                              {s.title}
                            </span>
                          </div>
                          <span className="text-[11px] text-editorial-secondary font-mono">
                            {s.slug}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* الجدولة الزمنية */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label
                    htmlFor="sec-sched-start"
                    className="block font-semibold text-editorial-ivory mb-1"
                  >
                    يبدأ العرض (اختياري):
                  </label>
                  <input
                    id="sec-sched-start"
                    type="datetime-local"
                    value={formScheduledStart}
                    onChange={(e) => {
                      setFormScheduledStart(e.target.value);
                      setFormHasChanges(true);
                    }}
                    className="min-h-11 w-full rounded-lg border border-border-subtle bg-surface px-3 text-xs text-editorial-ivory focus:border-crimson focus:outline-none"
                  />
                </div>

                <div>
                  <label
                    htmlFor="sec-sched-end"
                    className="block font-semibold text-editorial-ivory mb-1"
                  >
                    ينتهي العرض (اختياري):
                  </label>
                  <input
                    id="sec-sched-end"
                    type="datetime-local"
                    value={formScheduledEnd}
                    onChange={(e) => {
                      setFormScheduledEnd(e.target.value);
                      setFormHasChanges(true);
                    }}
                    className="min-h-11 w-full rounded-lg border border-border-subtle bg-surface px-3 text-xs text-editorial-ivory focus:border-crimson focus:outline-none"
                  />
                </div>
              </div>

              {/* الرؤية العامة */}
              <div className="flex items-center gap-3 pt-2">
                <input
                  id="sec-visible-checkbox"
                  type="checkbox"
                  checked={formIsVisible}
                  onChange={(e) => {
                    setFormIsVisible(e.target.checked);
                    setFormHasChanges(true);
                  }}
                  className="accent-crimson h-4 w-4"
                />
                <label
                  htmlFor="sec-visible-checkbox"
                  className="font-semibold text-editorial-ivory cursor-pointer"
                >
                  إظهار القسم للجمهور
                </label>
              </div>

              {/* أزرار الحفظ والإلغاء */}
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-border-subtle">
                <button
                  type="button"
                  onClick={handleRequestCloseEditor}
                  disabled={isSubmitting}
                  className="min-h-11 px-4 py-2 rounded-lg border border-border-subtle bg-surface text-editorial-secondary hover:text-editorial-ivory focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-crimson"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="min-h-11 px-5 py-2 rounded-lg bg-crimson hover:bg-crimson-bright text-white font-bold shadow-halo flex items-center justify-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-crimson disabled:opacity-50"
                >
                  {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
                  <span>
                    {editingSection ? 'حفظ التعديلات' : 'إنشاء القسم'}
                  </span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* نافذة تأكيد تجاهل التعديلات غير المحفوظة */}
      <ConfirmModal
        isOpen={isDiscardConfirmOpen}
        title="تجاهل التعديلات غير المحفوظة"
        message="لديك تعديلات غير محفوظة على هذا القسم. هل أنت متأكد من رغبتك في إغلاق النافذة وتجاهل التغييرات؟"
        confirmLabel="تجاهل التعديلات"
        cancelLabel="العودة للمتابعة"
        isDestructive={true}
        onConfirm={() => {
          setIsDiscardConfirmOpen(false);
          setIsEditorOpen(false);
        }}
        onClose={() => setIsDiscardConfirmOpen(false)}
      />

      {/* نافذة تأكيد الحذف */}
      <ConfirmModal
        isOpen={Boolean(deleteTarget)}
        title="حذف قسم من الصفحة الرئيسية"
        message={`هل أنت متأكد من رغبتك في حذف قسم "${deleteTarget?.title || ''}" نهائياً؟ سيتم تحديث كاش الصفحة الرئيسية فوراً.`}
        confirmLabel="حذف القسم"
        isDestructive={true}
        isLoading={isDeleting}
        onConfirm={handleConfirmDelete}
        onClose={() => setDeleteTarget(null)}
      />
    </div>
  );
};
