'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  MessageSquare,
  AlertTriangle,
  CheckCircle2,
  Trash2,
  EyeOff,
  RefreshCw,
  Loader2,
  ShieldAlert,
} from 'lucide-react';

interface ReportItem {
  _id: string;
  reason: string;
  createdAt: string;
  comment: { content: string; authorName: string; episodeId: string } | null;
}

interface AdminCommentsViewProps {
  onNotice?: (type: 'success' | 'error', msg: string) => void;
}

export const AdminCommentsView: React.FC<AdminCommentsViewProps> = ({ onNotice }) => {
  const [reports, setReports] = useState<ReportItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  const fetchReports = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const res = await fetch('/api/v1/admin/moderation');
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(data?.error || 'تعذر تحميل البلاغات');
      }
      setReports(Array.isArray(data?.reports) ? data.reports : []);
    } catch (error) {
      console.error('Failed to fetch moderation reports:', error);
      setLoadError(error instanceof Error ? error.message : 'تعذر تحميل البلاغات');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchReports();
  }, [fetchReports]);

  const handleReportAction = async (reportId: string, action: 'REMOVE_COMMENT' | 'DISMISS') => {
    setActionLoadingId(reportId);
    try {
      const res = await fetch('/api/v1/admin/moderation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reportId, action }),
      });
      if (res.ok) {
        setReports((prev) => prev.filter((r) => r._id !== reportId));
        onNotice?.(
          'success',
          action === 'REMOVE_COMMENT' ? 'تم حذف التعليق المخالف وتحديث السجل' : 'تم تجاهل البلاغ'
        );
      } else {
        const data = await res.json().catch(() => ({}));
        onNotice?.('error', data.error || 'فشل تنفيذ الإجراء على البلاغ');
      }
    } catch {
      onNotice?.('error', 'تعذر الاتصال بالخادم');
    } finally {
      setActionLoadingId(null);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in text-right">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border-subtle pb-4">
        <div>
          <h2 className="text-xl font-black font-display text-editorial-ivory flex items-center gap-2">
            <MessageSquare className="w-5 h-5 text-crimson" />
            بلاغات التعليقات
          </h2>
          <p className="text-xs text-editorial-secondary mt-1">
            راجع البلاغات واتخذ الإجراء المناسب.
          </p>
        </div>
        <button
          type="button"
          onClick={fetchReports}
          disabled={isLoading}
          className="min-h-11 flex items-center gap-2 px-3 py-2 bg-surface-elevated hover:bg-border-subtle text-editorial-secondary hover:text-editorial-ivory text-xs rounded-lg transition-colors self-start sm:self-auto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-crimson"
          aria-label="تحديث بلاغات التعليقات"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-crimson' : ''}`} />
          <span>تحديث البلاغات</span>
        </button>
      </div>

      {isLoading ? (
        <div className="py-20 flex justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-crimson" />
        </div>
      ) : loadError ? (
        <div className="p-10 bg-surface border border-amber-700/50 rounded-xl text-center space-y-3" role="alert">
          <AlertTriangle className="w-8 h-8 mx-auto text-amber-300" aria-hidden="true" />
          <h3 className="text-sm font-bold text-amber-100">تعذر تحميل البلاغات</h3>
          <p className="text-xs text-editorial-muted">{loadError}</p>
          <button
            type="button"
            onClick={fetchReports}
            className="min-h-11 px-4 rounded-lg bg-surface-elevated hover:bg-border-subtle border border-border-subtle text-editorial-ivory text-xs font-bold inline-flex items-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-crimson"
          >
            <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
            إعادة المحاولة
          </button>
        </div>
      ) : reports.length === 0 ? (
        <div className="p-12 bg-surface border border-border-subtle rounded-xl text-center space-y-3">
          <div className="w-12 h-12 rounded-full bg-emerald-950/40 text-emerald-400 flex items-center justify-center mx-auto">
            <CheckCircle2 className="w-6 h-6" />
          </div>
          <h3 className="text-sm font-bold text-editorial-ivory">لا توجد بلاغات معلقة حالياً</h3>
          <p className="text-xs text-editorial-muted max-w-sm mx-auto">
            لا توجد بلاغات معلقة تحتاج إلى إجراء.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between text-xs text-editorial-muted">
            <span>عدد البلاغات المعلقة: {reports.length}</span>
          </div>

          <div className="space-y-3">
            {reports.map((report) => (
              <div
                key={report._id}
                className="p-5 bg-surface border border-red-900/30 rounded-xl space-y-4 shadow-sm"
              >
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="flex items-center gap-2">
                    <ShieldAlert className="w-4 h-4 text-crimson shrink-0" />
                    <div>
                      <span className="text-xs font-bold text-editorial-ivory">
                        الكاتب: {report.comment?.authorName || 'مستخدم غير معروف'}
                      </span>
                      <span className="text-[11px] text-editorial-muted block">
                        تاريخ البلاغ: {new Date(report.createdAt).toLocaleString('ar-EG')}
                      </span>
                    </div>
                  </div>

                  <span className="bg-crimson-subtle border border-crimson/30 text-[#E85A65] px-2.5 py-1 rounded text-xs font-bold flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    سبب البلاغ: {report.reason}
                  </span>
                </div>

                {report.comment ? (
                  <div className="bg-surface-elevated p-3.5 rounded-lg border border-border-subtle text-xs text-editorial-ivory font-mono leading-relaxed">
                    &quot;{report.comment.content}&quot;
                  </div>
                ) : (
                  <div className="text-xs text-editorial-muted italic">
                    تم حذف هذا التعليق سابقاً أو لم يعد متاحاً.
                  </div>
                )}

                <div className="flex items-center justify-end gap-3 pt-2 border-t border-border-subtle/50">
                  <button
                    type="button"
                    disabled={actionLoadingId === report._id}
                    onClick={() => handleReportAction(report._id, 'REMOVE_COMMENT')}
                    className="min-h-11 px-4 py-2 bg-crimson hover:bg-crimson-bright text-white text-xs font-bold rounded-lg transition-colors flex items-center gap-1.5 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-crimson"
                  >
                    {actionLoadingId === report._id ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="w-3.5 h-3.5" />
                    )}
                    <span>حذف التعليق المخالف</span>
                  </button>

                  <button
                    type="button"
                    disabled={actionLoadingId === report._id}
                    onClick={() => handleReportAction(report._id, 'DISMISS')}
                    className="min-h-11 px-4 py-2 bg-surface-elevated hover:bg-border-subtle text-editorial-secondary hover:text-editorial-ivory text-xs rounded-lg transition-colors flex items-center gap-1.5 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-crimson"
                  >
                    <EyeOff className="w-3.5 h-3.5" />
                    <span>تجاهل البلاغ</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
