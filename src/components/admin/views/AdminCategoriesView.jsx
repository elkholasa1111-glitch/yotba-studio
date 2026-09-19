'use client';

import { useCallback, useEffect, useState } from 'react';
import { FolderTree, Plus, Pencil, Trash2, Loader2, X } from 'lucide-react';
import { adminApi } from '../cms/shared';
import { MediaUploadDropzone } from '../cms/MediaUploadDropzone';
import { ConfirmDialog } from '../cms/ConfirmDialog';

const EMPTY_FORM = {
  nameAr: '',
  nameEn: '',
  slug: '',
  description: '',
  coverImage: '',
  order: '0',
  isActive: true,
};

const inputClass =
  'w-full min-h-11 bg-surface-elevated border border-border-subtle rounded-lg p-2.5 text-xs text-editorial-ivory focus:outline-none focus:border-crimson focus-visible:ring-2 focus-visible:ring-crimson-glow';

export default function AdminCategoriesView({ showNotice }) {
  const [categories, setCategories] = useState([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [categoryToDelete, setCategoryToDelete] = useState(null);

  const loadCategories = useCallback(async () => {
    setIsLoading(true);

    const result = await adminApi('/api/v1/admin/categories');

    if (!result.ok) {
      showNotice('error', result.error);
      setIsLoading(false);
      return;
    }

    setCategories(
      Array.isArray(result.data.categories) ? result.data.categories : [],
    );
    setIsLoading(false);
  }, [showNotice]);

  useEffect(() => {
    loadCategories();
  }, [loadCategories]);

  const setField = (field, value) => {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const resetForm = () => {
    setForm(EMPTY_FORM);
    setEditingId(null);
  };

  const startEdit = (category) => {
    setEditingId(category._id);

    setForm({
      nameAr: category.nameAr || '',
      nameEn: category.nameEn || '',
      slug: category.slug || '',
      description: category.description || '',
      coverImage: category.coverImage || '',
      order: String(category.order || 0),
      isActive: Boolean(category.isActive),
    });

    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (!form.nameAr.trim() || !form.nameEn.trim()) {
      showNotice('error', 'أدخل الاسم العربي والاسم الإنجليزي للتصنيف');
      return;
    }

    if (!form.slug.trim()) {
      showNotice('error', 'أدخل slug إنجليزي قصيراً، مثل horror أو historical');
      return;
    }

    const order = Number(form.order);

    if (!Number.isInteger(order)) {
      showNotice('error', 'الترتيب يجب أن يكون رقماً صحيحاً');
      return;
    }

    setIsSaving(true);

    const payload = {
      nameAr: form.nameAr.trim(),
      nameEn: form.nameEn.trim(),
      slug: form.slug.trim(),
      description: form.description.trim(),
      coverImage: form.coverImage.trim(),
      order,
      isActive: form.isActive,
    };

    const result = editingId
      ? await adminApi('/api/v1/admin/categories', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: editingId, ...payload }),
        })
      : await adminApi('/api/v1/admin/categories', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

    setIsSaving(false);

    if (!result.ok) {
      showNotice('error', result.error);
      return;
    }

    showNotice(
      'success',
      editingId ? 'تم تعديل التصنيف بنجاح' : 'تم إنشاء التصنيف بنجاح',
    );

    resetForm();
    await loadCategories();
  };

  const handleDelete = (category) => {
    setCategoryToDelete(category);
  };

  const confirmDelete = async () => {
    if (!categoryToDelete) return;

    setDeletingId(categoryToDelete._id);

    const result = await adminApi(
      `/api/v1/admin/categories?id=${encodeURIComponent(categoryToDelete._id)}`,
      { method: 'DELETE' },
    );

    setDeletingId(null);

    if (!result.ok) {
      showNotice('error', result.error);
      return;
    }

    setCategoryToDelete(null);
    showNotice('success', 'تم حذف التصنيف');
    await loadCategories();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 border-b border-border-subtle pb-4">
        <FolderTree className="w-5 h-5 text-crimson" />
        <div>
          <h2 className="text-xl font-black font-display text-editorial-ivory">
            إدارة التصنيفات
          </h2>
          <p className="text-xs text-editorial-secondary mt-1">
            التصنيفات النشطة تظهر في صفحة استكشف والمنصة العامة.
          </p>
        </div>
      </div>

      <form
        onSubmit={handleSubmit}
        className="space-y-4 rounded-xl border border-border-subtle bg-surface p-5"
      >
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-sm font-bold text-editorial-ivory">
            {editingId ? 'تعديل تصنيف' : 'تصنيف جديد'}
          </h3>

          {editingId && (
            <button
              type="button"
              onClick={resetForm}
              className="min-h-11 px-3 text-xs text-editorial-secondary hover:text-editorial-ivory"
            >
              <X className="inline w-4 h-4 ml-1" />
              إلغاء التعديل
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="block mb-1 text-xs text-editorial-secondary">
              الاسم العربي
            </label>
            <input
              value={form.nameAr}
              onChange={(event) => setField('nameAr', event.target.value)}
              className={inputClass}
              placeholder="رعب وما وراء الطبيعة"
              required
            />
          </div>

          <div>
            <label className="block mb-1 text-xs text-editorial-secondary">
              الاسم الإنجليزي
            </label>
            <input
              dir="ltr"
              value={form.nameEn}
              onChange={(event) => setField('nameEn', event.target.value)}
              className={inputClass}
              placeholder="Horror and Supernatural"
              required
            />
          </div>

          <div>
            <label className="block mb-1 text-xs text-editorial-secondary">
              slug للرابط
            </label>
            <input
              dir="ltr"
              value={form.slug}
              onChange={(event) => setField('slug', event.target.value)}
              className={inputClass}
              placeholder="horror"
              required
            />
            <p className="mt-1 text-[10px] text-editorial-muted">
              يصبح رابط الصفحة: /category/horror
            </p>
          </div>

          <div>
            <label className="block mb-1 text-xs text-editorial-secondary">
              ترتيب الظهور
            </label>
            <input
              type="number"
              value={form.order}
              onChange={(event) => setField('order', event.target.value)}
              className={inputClass}
            />
          </div>
        </div>

        <div>
          <label className="block mb-1 text-xs text-editorial-secondary">
            وصف قصير اختياري
          </label>
          <textarea
            value={form.description}
            onChange={(event) => setField('description', event.target.value)}
            className={inputClass}
            rows="3"
            maxLength="500"
          />
        </div>

        <MediaUploadDropzone
          label="صورة التصنيف"
          category="image"
          value={form.coverImage}
          onChange={(url) => setField('coverImage', url)}
          helperText="صورة بطاقة التصنيف في صفحة استكشف."
        />

        <label className="flex items-center gap-2 text-xs text-editorial-secondary cursor-pointer">
          <input
            type="checkbox"
            checked={form.isActive}
            onChange={(event) => setField('isActive', event.target.checked)}
            className="accent-crimson"
          />
          التصنيف نشط ويظهر في المنصة
        </label>

        <button
          type="submit"
          disabled={isSaving}
          className="min-h-11 px-4 rounded-lg bg-crimson hover:bg-crimson-bright text-white text-xs font-bold disabled:opacity-60"
        >
          {isSaving ? (
            <>
              <Loader2 className="inline w-4 h-4 ml-1 animate-spin" />
              جارٍ الحفظ...
            </>
          ) : editingId ? (
            'حفظ التعديلات'
          ) : (
            <>
              <Plus className="inline w-4 h-4 ml-1" />
              إضافة التصنيف
            </>
          )}
        </button>
      </form>

      <div className="rounded-xl border border-border-subtle bg-surface overflow-hidden">
        <div className="p-4 border-b border-border-subtle">
          <h3 className="text-sm font-bold text-editorial-ivory">
            التصنيفات الحالية ({categories.length})
          </h3>
        </div>

        {isLoading ? (
          <div className="p-10 text-center text-editorial-muted text-xs">
            <Loader2 className="w-5 h-5 mx-auto mb-2 animate-spin text-crimson" />
            جارٍ تحميل التصنيفات...
          </div>
        ) : categories.length === 0 ? (
          <p className="p-10 text-center text-xs text-editorial-muted">
            لا توجد تصنيفات بعد.
          </p>
        ) : (
          <div className="divide-y divide-border-subtle">
            {categories.map((category) => (
              <div
                key={category._id}
                className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4"
              >
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h4 className="text-sm font-bold text-editorial-ivory">
                      {category.nameAr}
                    </h4>

                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        category.isActive
                          ? 'bg-crimson-subtle text-[#E85A65]'
                          : 'bg-surface-elevated text-editorial-muted'
                      }`}
                    >
                      {category.isActive ? 'نشط' : 'مخفي'}
                    </span>
                  </div>

                  <p className="mt-1 text-xs text-editorial-secondary">
                    {category.nameEn}
                  </p>

                  <p
                    dir="ltr"
                    className="mt-1 text-[10px] text-editorial-muted"
                  >
                    /category/{category.slug} · order: {category.order}
                  </p>
                </div>

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => startEdit(category)}
                    className="min-h-11 px-3 rounded-lg bg-surface-elevated hover:bg-border-subtle text-editorial-secondary text-xs"
                  >
                    <Pencil className="inline w-4 h-4 ml-1" />
                    تعديل
                  </button>

                  <button
                    type="button"
                    onClick={() => handleDelete(category)}
                    disabled={deletingId === category._id}
                    className="min-h-11 px-3 rounded-lg border border-red-900/50 text-red-300 hover:bg-red-950/40 text-xs disabled:opacity-60"
                  >
                    {deletingId === category._id ? (
                      <Loader2 className="inline w-4 h-4 ml-1 animate-spin" />
                    ) : (
                      <Trash2 className="inline w-4 h-4 ml-1" />
                    )}
                    حذف
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {categoryToDelete && (
        <ConfirmDialog
          title="حذف التصنيف"
          message={`سيتم حذف تصنيف "${categoryToDelete.nameAr}" نهائياً. لا يمكن التراجع عن هذا الإجراء.`}
          confirmLabel="حذف نهائي"
          onConfirm={confirmDelete}
          onCancel={() => setCategoryToDelete(null)}
        />
      )}
    </div>
  );
}
