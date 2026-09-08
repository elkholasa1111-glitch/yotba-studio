'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, Plus, Trash2 } from 'lucide-react';
import { ModalDialog } from './ModalDialog';
import { ConfirmDialog } from './ConfirmDialog';
import { adminApi, AdminEpisodeDTO } from './shared';
import { MediaUploadDropzone } from './MediaUploadDropzone';

interface TranscriptEditorProps {
  episode: AdminEpisodeDTO;
  seriesTitle: string;
  seasonTitle: string;
  onClose: () => void;
  onSaved: () => Promise<void>;
  showNotice: (type: 'success' | 'error', msg: string) => void;
}

interface SegmentRow {
  key: string;
  start: string;
  end: string;
  text: string;
}

const inputClass =
  'w-full min-h-11 bg-surface-elevated border border-border-subtle rounded-lg p-2.5 text-xs text-editorial-ivory focus:outline-none focus:border-crimson focus-visible:ring-2 focus-visible:ring-crimson-glow';
const labelClass = 'text-xs text-editorial-secondary block mb-1';
const errorClass = 'text-[10px] text-red-400 mt-1';

function rowsToSegments(rows: SegmentRow[]): { startMs: number; endMs: number; text: string }[] | null {
  return rows.map((row) => ({
    startMs: Math.round(Number(row.start) * 1000),
    endMs: Math.round(Number(row.end) * 1000),
    text: row.text.trim(),
  }));
}

export const TranscriptEditor: React.FC<TranscriptEditorProps> = ({ episode, seriesTitle, seasonTitle, onClose, onSaved, showNotice }) => {
  const [rows, setRows] = useState<SegmentRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [initialSnapshot, setInitialSnapshot] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await adminApi<{ segments: { startMs: number; endMs: number; text: string }[] }>(
        `/api/v1/admin/content?transcriptOf=${encodeURIComponent(episode._id)}`
      );
      if (cancelled) return;
      if (!res.ok) {
        setLoadError(res.error);
        setIsLoading(false);
        return;
      }
      const loaded = res.data.segments.map((seg, index) => ({
        key: `seg-${index}-${seg.startMs}`,
        start: String(seg.startMs / 1000),
        end: String(seg.endMs / 1000),
        text: seg.text,
      }));
      setRows(loaded);
      setInitialSnapshot(JSON.stringify(loaded));
      setIsLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [episode._id]);

  const isDirty = !isLoading && !loadError && JSON.stringify(rows) !== initialSnapshot;
  const setRow = (key: string, patch: Partial<SegmentRow>) => {
    setRows((prev) => prev.map((row) => (row.key === key ? { ...row, ...patch } : row)));
    setErrors((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  const validate = (): boolean => {
    const nextErrors: Record<string, string> = {};
    let previousEnd = 0;
    rows.forEach((row, index) => {
      const start = Number(row.start);
      const end = Number(row.end);
      if (!Number.isFinite(start) || start < 0 || Math.round(start * 1000) > 86_400_000) {
        nextErrors[row.key] = `المقطع ${index + 1}: وقت البدء غير صالح`;
      } else if (!Number.isFinite(end) || end < start) {
        nextErrors[row.key] = `المقطع ${index + 1}: وقت الانتهاء غير صالح`;
      } else if (Math.round(start * 1000) < previousEnd) {
        nextErrors[row.key] = `المقطع ${index + 1}: يتداخل زمنياً مع المقطع السابق`;
      } else if (row.text.trim().length === 0 || row.text.trim().length > 1000) {
        nextErrors[row.key] = `المقطع ${index + 1}: النص مطلوب (حتى 1000 حرف)`;
      } else if (row.text.includes('<')) {
        nextErrors[row.key] = `المقطع ${index + 1}: النص يجب ألا يحتوي وسوم HTML`;
      } else {
        previousEnd = Math.round(end * 1000);
      }
    });
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleSave = async () => {
    setServerError(null);
    if (rows.length === 0) {
      setServerError('أضف مقطعاً واحداً على الأقل');
      return;
    }
    if (!validate()) return;
    setSaving(true);
    try {
      const segments = rowsToSegments(rows);
      const res = await adminApi<{ success: boolean }>('/api/v1/admin/content', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entity: 'transcript', episodeId: episode._id, segments }),
      });
      if (!res.ok) {
        setServerError(res.error);
        return;
      }
      await onSaved();
      showNotice('success', `تم حفظ النص المتزامن للحلقة (${rows.length} مقطعاً)`);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    setSaving(true);
    try {
      const res = await adminApi<{ success: boolean }>(
        `/api/v1/admin/content?entity=transcript&id=${encodeURIComponent(episode._id)}`,
        { method: 'DELETE' }
      );
      if (!res.ok) {
        setServerError(res.error);
        return;
      }
      await onSaved();
      showNotice('success', 'تم حذف النص المتزامن');
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const hasExisting = useMemo(() => rows.length > 0 || episode.hasTranscript, [rows.length, episode.hasTranscript]);

  return (
    <ModalDialog title={`محرر النص المتزامن — الحلقة ${episode.episodeNumber}: ${episode.title}`} onClose={onClose} isDirty={isDirty} wide>
      <div className="space-y-4">
        <p className="text-xs text-editorial-muted">
          {seriesTitle} — {seasonTitle}. أوقات المقاطع بالثواني ويجب أن تكون تصاعدية وغير متداخلة.
        </p>

        {isLoading ? (
          <div className="py-12 flex justify-center">
            <Loader2 size={24} className="animate-spin text-crimson" aria-label="جارٍ التحميل" />
          </div>
        ) : loadError ? (
          <p role="alert" className="p-3 bg-red-950/40 border border-red-800 text-red-300 text-xs rounded-lg">
            {loadError}
          </p>
        ) : (
          <>
            <div className="p-3 bg-surface-elevated/40 border border-border-subtle rounded-xl mb-4">
              <MediaUploadDropzone
                label="استيراد ملف نص متزامن (SRT أو WebVTT أو JSON)"
                category="transcript"
                value=""
                onChange={() => {}}
                onTranscriptParsed={(parsedSegments) => {
                  const importedRows = parsedSegments.map((seg, idx) => ({
                    key: `imported-${Date.now()}-${idx}`,
                    start: String((seg.startMs / 1000).toFixed(3)),
                    end: String((seg.endMs / 1000).toFixed(3)),
                    text: seg.text,
                  }));
                  setRows(importedRows);
                  showNotice('success', `تم استيراد ${importedRows.length} مقطعاً بنجاح من الملف`);
                }}
                helperText="ارفع ملف SRT أو VTT مستخرج من برنامج المونتاج وسيتم ملء المقاطع والأوقات تلقائياً"
              />
            </div>

            {rows.length === 0 && (
              <p className="p-4 bg-surface-elevated border border-border-subtle rounded-lg text-xs text-editorial-muted text-center">
                لا توجد مقاطع بعد — يمكنك رفع ملف SRT أو النقر على «إضافة مقطع جديد» أدناه.
              </p>
            )}

            <ul className="space-y-3" aria-label="مقاطع النص المتزامن">
              {rows.map((row, index) => (
                <li key={row.key} className="p-3 bg-surface-elevated border border-border-subtle rounded-lg space-y-2">
                  <div className="flex items-end gap-2">
                    <div className="w-24">
                      <label htmlFor={`seg-start-${row.key}`} className={labelClass}>
                        البدء (ث)
                      </label>
                      <input
                        id={`seg-start-${row.key}`}
                        type="number"
                        min="0"
                        step="0.001"
                        dir="ltr"
                        value={row.start}
                        onChange={(e) => setRow(row.key, { start: e.target.value })}
                        className={inputClass}
                      />
                    </div>
                    <div className="w-24">
                      <label htmlFor={`seg-end-${row.key}`} className={labelClass}>
                        الانتهاء (ث)
                      </label>
                      <input
                        id={`seg-end-${row.key}`}
                        type="number"
                        min="0"
                        step="0.001"
                        dir="ltr"
                        value={row.end}
                        onChange={(e) => setRow(row.key, { end: e.target.value })}
                        className={inputClass}
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => setRows((prev) => prev.filter((r) => r.key !== row.key))}
                      aria-label={`حذف المقطع ${index + 1}`}
                      className="flex min-w-11 min-h-11 items-center justify-center rounded border border-border-subtle text-editorial-secondary hover:text-red-300 hover:border-red-800 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-crimson-glow"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                  <div>
                    <label htmlFor={`seg-text-${row.key}`} className={labelClass}>
                      نص المقطع {index + 1}
                    </label>
                    <textarea
                      id={`seg-text-${row.key}`}
                      rows={2}
                      value={row.text}
                      onChange={(e) => setRow(row.key, { text: e.target.value })}
                      className={`${inputClass} min-h-16`}
                    />
                  </div>
                  {errors[row.key] && (
                    <p role="alert" className={errorClass}>
                      {errors[row.key]}
                    </p>
                  )}
                </li>
              ))}
            </ul>

            <button
              type="button"
              onClick={() =>
                setRows((prev) => [
                  ...prev,
                  {
                    key: `seg-new-${Date.now()}-${prev.length}`,
                    start: prev.length > 0 ? prev[prev.length - 1].end : '0',
                    end: prev.length > 0 ? String(Number(prev[prev.length - 1].end) + 5) : '5',
                    text: '',
                  },
                ])
              }
              className="min-h-11 px-4 py-2 bg-surface-elevated hover:bg-border-subtle border border-border-subtle text-editorial-secondary text-xs font-semibold rounded-lg transition-colors flex items-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-crimson-glow"
            >
              <Plus size={14} />
              <span>إضافة مقطع</span>
            </button>

            {serverError && (
              <p role="alert" className="p-3 bg-red-950/40 border border-red-800 text-red-300 text-xs rounded-lg">
                {serverError}
              </p>
            )}

            <div className="flex justify-start gap-2 pt-3 border-t border-border-subtle">
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="min-h-11 px-5 py-2.5 bg-crimson hover:bg-crimson-bright text-white text-xs font-bold rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-crimson-glow focus-visible:ring-offset-2 focus-visible:ring-offset-obsidian"
              >
                {saving && <Loader2 size={14} className="animate-spin" aria-label="جارٍ الحفظ" />}
                <span>حفظ النص المتزامن</span>
              </button>
              {hasExisting && (
                <button
                  type="button"
                  onClick={() => setShowDeleteConfirm(true)}
                  disabled={saving}
                  className="min-h-11 px-4 py-2.5 border border-red-900/50 text-red-300 hover:bg-red-950/40 text-xs font-semibold rounded-lg transition-colors disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-crimson-glow"
                >
                  حذف النص بالكامل
                </button>
              )}
            </div>
          </>
        )}
      </div>
      {showDeleteConfirm && (
        <ConfirmDialog
          title="حذف النص المتزامن"
          message="سيتم حذف كل مقاطع النص من هذه الحلقة نهائياً. لا يمكن التراجع عن هذا الإجراء."
          confirmLabel="حذف النص بالكامل"
          onConfirm={async () => {
            setShowDeleteConfirm(false);
            await handleDelete();
          }}
          onCancel={() => setShowDeleteConfirm(false)}
        />
      )}
    </ModalDialog>
  );
};
