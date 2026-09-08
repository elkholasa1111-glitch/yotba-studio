'use client';

import React, { useState, useEffect } from 'react';
import {
  Subtitles,
  Upload,
  Plus,
  Trash2,
  Save,
  Check,
  ChevronDown,
  AlertCircle,
  Clock,
  FileText,
  Loader2,
} from 'lucide-react';
import type { AdminSeriesDTO } from '../cms/shared';
import { adminApi, formatDuration } from '../cms/shared';

interface Segment {
  id: string;
  startMs: number;
  endMs: number;
  text: string;
}

interface Props {
  seriesList: AdminSeriesDTO[];
  initialSeriesId?: string | null;
  initialSeasonId?: string | null;
  initialEpisodeId?: string | null;
  onRefresh: () => Promise<void>;
  showNotice: (type: 'success' | 'error', msg: string) => void;
}

export const AdminTranscriptsView: React.FC<Props> = ({
  seriesList,
  initialSeriesId,
  initialSeasonId,
  initialEpisodeId,
  onRefresh,
  showNotice,
}) => {
  const [selectedSeriesId, setSelectedSeriesId] = useState<string>(
    initialSeriesId || seriesList[0]?._id || ''
  );

  const currentSeries = seriesList.find((s) => s._id === selectedSeriesId) || seriesList[0];
  const seasons = React.useMemo(() => currentSeries?.seasons || [], [currentSeries]);

  const [selectedSeasonId, setSelectedSeasonId] = useState<string>(
    initialSeasonId || seasons[0]?._id || ''
  );

  const currentSeason = seasons.find((s) => s._id === selectedSeasonId) || seasons[0];
  const episodes = React.useMemo(() => currentSeason?.episodes || [], [currentSeason]);

  const [selectedEpisodeId, setSelectedEpisodeId] = useState<string>(
    initialEpisodeId || episodes[0]?._id || ''
  );

  const currentEpisode = episodes.find((e) => e._id === selectedEpisodeId) || episodes[0];

  const [segments, setSegments] = useState<Segment[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

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

  useEffect(() => {
    if (initialEpisodeId) {
      setSelectedEpisodeId(initialEpisodeId);
    } else if (episodes.length > 0 && !episodes.some((e) => e._id === selectedEpisodeId)) {
      setSelectedEpisodeId(episodes[0]._id);
    }
  }, [initialEpisodeId, episodes, selectedEpisodeId]);

  // جلب النص المتزامن للحلقة المحددة
  useEffect(() => {
    if (!currentEpisode?._id) {
      setSegments([]);
      return;
    }

    setIsLoading(true);
    fetch(`/api/v1/episodes/${currentEpisode._id}/stream`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.transcript && Array.isArray(data.transcript)) {
          setSegments(
            data.transcript.map((s: any, idx: number) => ({
              id: s.id || `seg-${idx + 1}`,
              startMs: Number(s.startMs) || 0,
              endMs: Number(s.endMs) || 0,
              text: s.text || '',
            }))
          );
        } else {
          setSegments([]);
        }
      })
      .catch(() => setSegments([]))
      .finally(() => setIsLoading(false));
  }, [currentEpisode?._id]);

  // معالجة رفع ملف الترجمة محلياً وتفكيكه
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const clean = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

      if (file.name.endsWith('.json')) {
        const parsed = JSON.parse(clean);
        const list = Array.isArray(parsed) ? parsed : parsed.segments || [];
        setSegments(
          list.map((s: any, idx: number) => ({
            id: s.id || `seg-${idx + 1}`,
            startMs: Number(s.startMs) || 0,
            endMs: Number(s.endMs) || 0,
            text: s.text || '',
          }))
        );
        showNotice('success', `تم تفكيك ${list.length} مقطع من ملف JSON بنجاح`);
        return;
      }

      // دعم ملفات SRT و WebVTT
      const parsedSegments: Segment[] = [];
      const blocks = clean.split(/\n\s*\n/);
      for (const block of blocks) {
        const lines = block.trim().split('\n');
        if (lines.length === 0) continue;

        let timeLine = '';
        const textLines: string[] = [];

        for (const line of lines) {
          if (line.includes('-->')) {
            timeLine = line;
          } else if (timeLine && line.trim()) {
            textLines.push(line.trim());
          }
        }

        if (timeLine) {
          const match = timeLine.match(
            /(?:(\d{2}):)?(\d{2}):(\d{2})[.,](\d{3})\s*-->\s*(?:(\d{2}):)?(\d{2}):(\d{2})[.,](\d{3})/
          );
          if (match) {
            const startH = parseInt(match[1] || '0', 10);
            const startM = parseInt(match[2], 10);
            const startS = parseInt(match[3], 10);
            const startMs = parseInt(match[4], 10);
            const startTime = (startH * 3600 + startM * 60 + startS) * 1000 + startMs;

            const endH = parseInt(match[5] || '0', 10);
            const endM = parseInt(match[6], 10);
            const endS = parseInt(match[7], 10);
            const endMs = parseInt(match[8], 10);
            const endTime = (endH * 3600 + endM * 60 + endS) * 1000 + endMs;

            const segmentText = textLines.join(' ').replace(/<[^>]+>/g, '').trim();
            if (segmentText) {
              parsedSegments.push({
                id: `seg-${parsedSegments.length + 1}`,
                startMs: startTime,
                endMs: endTime,
                text: segmentText,
              });
            }
          }
        }
      }

      if (parsedSegments.length > 0) {
        setSegments(parsedSegments);
        showNotice('success', `تم استخراج وتوقيت ${parsedSegments.length} مقطع بنجاح`);
      } else {
        showNotice('error', 'تعذر استخراج مقاطع نصية صالحة من الملف');
      }
    } catch {
      showNotice('error', 'فشل تحليل ملف الترجمة');
    }
  };

  const handleUpdateSegment = (idx: number, field: keyof Segment, val: any) => {
    setSegments((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], [field]: val };
      return next;
    });
  };

  const handleAddSegment = () => {
    const last = segments[segments.length - 1];
    const newStart = last ? last.endMs : 0;
    const newEnd = newStart + 5000;
    setSegments((prev) => [
      ...prev,
      {
        id: `seg-${prev.length + 1}`,
        startMs: newStart,
        endMs: newEnd,
        text: 'نص درامي جديد...',
      },
    ]);
  };

  const handleDeleteSegment = (idx: number) => {
    setSegments((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleSaveTranscript = async () => {
    if (!currentEpisode?._id) return;
    setIsSaving(true);
    try {
      const res = await adminApi<{ success: boolean }>('/api/v1/admin/content', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entity: 'transcript',
          episodeId: currentEpisode._id,
          segments,
        }),
      });

      if (res.ok) {
        showNotice('success', 'تم حفظ النص المتزامن في قاعدة البيانات بنجاح');
        await onRefresh();
      } else {
        showNotice('error', res.error || 'فشل حفظ النص المتزامن');
      }
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* 1. الترويسة وأدوات الاختيار الثلاثية */}
      <div className="p-4 rounded-2xl bg-surface border border-border-subtle flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
        <div className="space-y-1">
          <h2 className="text-lg font-bold text-editorial-ivory flex items-center gap-2">
            <Subtitles size={20} className="text-crimson" />
            <span>محرر النصوص المتزامنة (Sync Transcripts)</span>
          </h2>
          <p className="text-xs text-editorial-muted">
            رفع وضبط نصوص الحلقات المتزامنة كلمة بكلمة ومقطعاً بمقطع
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 w-full lg:w-auto">
          {/* محدد العمل */}
          <div className="relative flex-1 sm:w-48">
            <select
              value={selectedSeriesId}
              onChange={(e) => setSelectedSeriesId(e.target.value)}
              className="w-full min-h-10 ps-3 pe-8 rounded-xl bg-surface-elevated border border-border-subtle text-xs text-editorial-ivory appearance-none focus:outline-none focus:border-crimson"
            >
              {seriesList.map((s) => (
                <option key={s._id} value={s._id}>
                  {s.title}
                </option>
              ))}
            </select>
            <ChevronDown
              size={14}
              className="absolute end-3 top-1/2 -translate-y-1/2 text-editorial-muted pointer-events-none"
            />
          </div>

          {/* محدد الموسم */}
          <div className="relative flex-1 sm:w-40">
            <select
              value={selectedSeasonId}
              onChange={(e) => setSelectedSeasonId(e.target.value)}
              className="w-full min-h-10 ps-3 pe-8 rounded-xl bg-surface-elevated border border-border-subtle text-xs text-editorial-ivory appearance-none focus:outline-none focus:border-crimson"
            >
              {seasons.map((sz) => (
                <option key={sz._id} value={sz._id}>
                  {sz.title}
                </option>
              ))}
            </select>
            <ChevronDown
              size={14}
              className="absolute end-3 top-1/2 -translate-y-1/2 text-editorial-muted pointer-events-none"
            />
          </div>

          {/* محدد الحلقة */}
          <div className="relative flex-1 sm:w-44">
            <select
              value={selectedEpisodeId}
              onChange={(e) => setSelectedEpisodeId(e.target.value)}
              className="w-full min-h-10 ps-3 pe-8 rounded-xl bg-surface-elevated border border-border-subtle text-xs text-editorial-ivory appearance-none focus:outline-none focus:border-crimson"
            >
              {episodes.map((ep) => (
                <option key={ep._id} value={ep._id}>
                  الحلقة {ep.episodeNumber}: {ep.title}
                </option>
              ))}
            </select>
            <ChevronDown
              size={14}
              className="absolute end-3 top-1/2 -translate-y-1/2 text-editorial-muted pointer-events-none"
            />
          </div>
        </div>
      </div>

      {/* 2. شريط أدوات تحرير النص */}
      <div className="p-4 rounded-2xl bg-surface border border-border-subtle flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <label className="min-h-10 px-4 rounded-xl bg-surface-elevated hover:bg-border-subtle border border-border-subtle text-editorial-ivory text-xs font-bold flex items-center gap-2 cursor-pointer transition-colors">
            <Upload size={15} className="text-crimson" />
            <span>استيراد ملف (SRT / VTT / JSON)</span>
            <input
              type="file"
              accept=".srt,.vtt,.json"
              onChange={handleFileUpload}
              className="hidden"
            />
          </label>

          <button
            type="button"
            onClick={handleAddSegment}
            className="min-h-10 px-3.5 rounded-xl bg-surface hover:bg-surface-elevated border border-border-subtle text-editorial-secondary hover:text-editorial-ivory text-xs font-semibold flex items-center gap-1.5 transition-colors"
          >
            <Plus size={15} />
            <span>إضافة مقطع يدوياً</span>
          </button>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-xs text-editorial-muted font-mono">
            {segments.length} مقطع مسجل
          </span>

          <button
            type="button"
            onClick={handleSaveTranscript}
            disabled={isSaving}
            className="min-h-10 px-6 rounded-xl bg-crimson hover:bg-crimson-bright text-white text-xs font-bold flex items-center gap-2 shadow-halo transition-transform active:scale-95 disabled:opacity-50"
          >
            {isSaving ? (
              <>
                <Loader2 size={15} className="animate-spin" />
                <span>جارٍ الحفظ...</span>
              </>
            ) : (
              <>
                <Save size={15} />
                <span>حفظ النص في قاعدة البيانات</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* 3. جدول المقاطع التفاعلي */}
      <div className="rounded-2xl bg-surface border border-border-subtle overflow-hidden">
        {isLoading ? (
          <div className="p-12 text-center text-editorial-muted flex items-center justify-center gap-2 text-xs">
            <Loader2 size={16} className="animate-spin" />
            <span>جارٍ جلب النص المتزامن...</span>
          </div>
        ) : segments.length > 0 ? (
          <div className="overflow-x-auto max-h-[500px] overflow-y-auto scrollbar-thin scrollbar-thumb-border-subtle">
            <table className="w-full text-right text-xs">
              <thead className="bg-surface-elevated/80 text-editorial-muted border-b border-border-subtle sticky top-0 z-10 backdrop-blur-md">
                <tr>
                  <th className="p-3 ps-4 font-bold w-14">#</th>
                  <th className="p-3 font-bold w-32">البداية (ms)</th>
                  <th className="p-3 font-bold w-32">النهاية (ms)</th>
                  <th className="p-3 font-bold">النص المنطوق</th>
                  <th className="p-3 pe-4 font-bold text-center w-16">حذف</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle/50 font-reading">
                {segments.map((seg, idx) => (
                  <tr key={seg.id || idx} className="hover:bg-surface-elevated/30">
                    <td className="p-3 ps-4 text-editorial-muted font-mono">{idx + 1}</td>

                    <td className="p-3">
                      <input
                        type="number"
                        value={seg.startMs}
                        onChange={(e) =>
                          handleUpdateSegment(idx, 'startMs', parseInt(e.target.value) || 0)
                        }
                        className="w-full bg-surface-elevated border border-border-subtle rounded-lg px-2 py-1 text-xs text-editorial-ivory font-mono focus:border-crimson focus:outline-none"
                      />
                    </td>

                    <td className="p-3">
                      <input
                        type="number"
                        value={seg.endMs}
                        onChange={(e) =>
                          handleUpdateSegment(idx, 'endMs', parseInt(e.target.value) || 0)
                        }
                        className="w-full bg-surface-elevated border border-border-subtle rounded-lg px-2 py-1 text-xs text-editorial-ivory font-mono focus:border-crimson focus:outline-none"
                      />
                    </td>

                    <td className="p-3">
                      <input
                        type="text"
                        value={seg.text}
                        onChange={(e) => handleUpdateSegment(idx, 'text', e.target.value)}
                        className="w-full bg-surface-elevated border border-border-subtle rounded-lg px-3 py-1 text-xs text-editorial-ivory font-reading focus:border-crimson focus:outline-none"
                      />
                    </td>

                    <td className="p-3 pe-4 text-center">
                      <button
                        type="button"
                        onClick={() => handleDeleteSegment(idx)}
                        className="w-7 h-7 rounded-lg hover:bg-red-950/40 text-editorial-muted hover:text-red-300 flex items-center justify-center transition-colors mx-auto"
                        title="حذف هذا المقطع"
                      >
                        <Trash2 size={13} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-12 text-center space-y-3">
            <FileText size={32} className="mx-auto text-editorial-muted" />
            <p className="text-sm text-editorial-secondary font-medium">
              لا يوجد نص متزامن لهذه الحلقة بعد
            </p>
            <p className="text-xs text-editorial-muted">
              يمكنك استيراد ملف SRT أو WebVTT أو إضافة المقاطع يدوياً
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
