'use client';

// ============================================================
// MediaUploadDropzone - محرك الرفع المباشر الفخم لمنصة "يُتبع..."
// يرفع الملفات مباشرة من المتصفح إلى Cloudflare R2 بدون وسيط
// متكامل 100% مع لوحة التحكم دون الحاجة لأي روابط خارجية
// ============================================================

import React, { useState, useRef, DragEvent, ChangeEvent, useEffect } from 'react';
import {
  Upload,
  X,
  Check,
  AlertCircle,
  Loader2,
  Image as ImageIcon,
  Music,
  Film,
  FileText,
  Play,
  Pause,
  RotateCcw,
  Trash2,
  RefreshCw,
} from 'lucide-react';

export type MediaCategory = 'poster' | 'hero' | 'image' | 'audio' | 'video' | 'transcript';

interface MediaUploadDropzoneProps {
  label: string;
  category: MediaCategory;
  value: string;
  onChange: (url: string) => void;
  onStorageKeyChange?: (storageKey: string) => void;
  onTranscriptParsed?: (segments: any[]) => void;
  onDurationDetected?: (durationSeconds: number) => void;
  helperText?: string;
  error?: string;
  required?: boolean;
}

// دالة تحليل ملفات الترجمة والنصوص المتزامنة محلياً في المتصفح
function parseSubtitleFileLocally(content: string, fileName: string): any[] {
  const segments: any[] = [];
  const clean = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  if (fileName.endsWith('.json')) {
    try {
      const parsed = JSON.parse(clean);
      if (Array.isArray(parsed)) return parsed;
      if (Array.isArray(parsed.segments)) return parsed.segments;
    } catch {
      // Fall through to regex
    }
  }

  // دعم WebVTT و SRT
  const blocks = clean.split(/\n\s*\n/);
  for (const block of blocks) {
    const lines = block.trim().split('\n');
    if (lines.length === 0) continue;

    let timeLine = '';
    let textLines: string[] = [];

    for (const line of lines) {
      if (line.includes('-->')) {
        timeLine = line;
      } else if (timeLine && line.trim()) {
        textLines.push(line.trim());
      }
    }

    if (timeLine) {
      const timeMatch = timeLine.match(
        /(?:(\d{2}):)?(\d{2}):(\d{2})[.,](\d{3})\s*-->\s*(?:(\d{2}):)?(\d{2}):(\d{2})[.,](\d{3})/
      );
      if (timeMatch) {
        const startH = parseInt(timeMatch[1] || '0', 10);
        const startM = parseInt(timeMatch[2], 10);
        const startS = parseInt(timeMatch[3], 10);
        const startMs = parseInt(timeMatch[4], 10);
        const startTime = (startH * 3600 + startM * 60 + startS) * 1000 + startMs;

        const endH = parseInt(timeMatch[5] || '0', 10);
        const endM = parseInt(timeMatch[6], 10);
        const endS = parseInt(timeMatch[7], 10);
        const endMs = parseInt(timeMatch[8], 10);
        const endTime = (endH * 3600 + endM * 60 + endS) * 1000 + endMs;

        const text = textLines.join(' ').replace(/<[^>]+>/g, '').trim();
        if (text) {
          segments.push({
            id: `seg-${segments.length + 1}`,
            startMs: startTime,
            endMs: endTime,
            text,
            order: segments.length + 1,
          });
        }
      }
    }
  }

  return segments;
}

export const MediaUploadDropzone: React.FC<MediaUploadDropzoneProps> = ({
  label,
  category,
  value,
  onChange,
  onStorageKeyChange,
  onTranscriptParsed,
  onDurationDetected,
  helperText,
  error,
  required = false,
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadPercent, setUploadPercent] = useState(0);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [lastUploadedFile, setLastUploadedFile] = useState<File | null>(null);
  const [localPreviewUrl, setLocalPreviewUrl] = useState<string | null>(null);

  // حالة المعاينة المباشرة
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const [audioDuration, setAudioDuration] = useState<string | null>(null);
  const audioPreviewRef = useRef<HTMLAudioElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const audioEl = audioPreviewRef.current;
    return () => {
      if (audioEl) {
        audioEl.pause();
      }
    };
  }, []);

  const getAcceptedMimes = () => {
    switch (category) {
      case 'poster':
      case 'hero':
      case 'image':
        return 'image/jpeg,image/png,image/webp,image/avif';
      case 'audio':
        return 'audio/mpeg,audio/mp3,audio/x-mp3,audio/mp4,audio/m4a,audio/x-m4a,audio/aac,audio/x-aac,audio/ogg,audio/vorbis,audio/x-ogg,audio/webm,audio/x-webm,audio/wav,audio/wave,audio/x-wav,audio/flac,audio/x-flac,.mp3,.m4a,.aac,.ogg,.weba,.webm,.wav,.flac';
      case 'video':
        return 'video/mp4,video/webm,video/quicktime';
      case 'transcript':
        return '.srt,.vtt,.json,application/json,text/vtt,text/plain';
      default:
        return '*/*';
    }
  };

  const getCategoryIcon = () => {
    switch (category) {
      case 'poster':
      case 'hero':
      case 'image':
        return <ImageIcon size={24} className="text-crimson" />;
      case 'audio':
        return <Music size={24} className="text-crimson" />;
      case 'video':
        return <Film size={24} className="text-crimson" />;
      case 'transcript':
        return <FileText size={24} className="text-crimson" />;
    }
  };

  const handleAudioToggle = () => {
    if (!audioPreviewRef.current) return;
    if (isPlayingAudio) {
      audioPreviewRef.current.pause();
      setIsPlayingAudio(false);
    } else {
      audioPreviewRef.current.play().then(() => setIsPlayingAudio(true)).catch(() => {});
    }
  };

  // رفع الملف المباشر إلى Cloudflare R2
  const uploadFile = async (file: File) => {
    setLastUploadedFile(file);
    setUploadError(null);

    // التحقق المسبق في العميل قبل البدء بالرفع
    if (!file || file.size === 0) {
      setUploadError('الملف المختار فارغ (0 بايت)');
      return;
    }

    const ext = file.name.split('.').pop()?.toLowerCase() || '';
    if (ext === 'svg' || (file.type && file.type.toLowerCase().includes('svg'))) {
      setUploadError('ملفات SVG غير مدعومة لأسباب أمنية. الصيغ المدعومة للصور: JPG, PNG, WEBP, AVIF');
      return;
    }

    // استنتاج نوع MIME بدقة لضمان توافق المتصفحات المختلفة ودعم صيغ الصوت الموسعة
    const extMimeMap: Record<string, string> = {
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      png: 'image/png',
      webp: 'image/webp',
      avif: 'image/avif',
      mp3: 'audio/mpeg',
      m4a: 'audio/mp4',
      aac: 'audio/aac',
      ogg: 'audio/ogg',
      wav: 'audio/wav',
      flac: 'audio/flac',
      weba: 'audio/webm',
      webm: category === 'audio' ? 'audio/webm' : 'video/webm',
      mp4: 'video/mp4',
      mov: 'video/quicktime',
      srt: 'text/plain',
      vtt: 'text/vtt',
      json: 'application/json',
    };

    const effectiveFileType =
      file.type && file.type !== 'application/octet-stream'
        ? file.type
        : extMimeMap[ext] || file.type || 'application/octet-stream';

    setIsUploading(true);
    setUploadPercent(0);

    const previewBlob = URL.createObjectURL(file);
    setLocalPreviewUrl(previewBlob);

    if (category === 'audio') {
      try {
        const tempAudio = new Audio(previewBlob);
        tempAudio.onloadedmetadata = () => {
          if (Number.isFinite(tempAudio.duration) && tempAudio.duration > 0) {
            const dur = Math.round(tempAudio.duration);
            const m = Math.floor(dur / 60);
            const s = dur % 60;
            setAudioDuration(`${m}:${s.toString().padStart(2, '0')}`);
            onDurationDetected?.(dur);
          }
        };
      } catch {}
    }

    try {
      // 1. إذا كان الملف نصاً متزامناً، نقوم بتحليله محلياً فوراً لمنح تجربة مستخدم سريعة جداً
      if (category === 'transcript') {
        const textContent = await file.text();
        const segments = parseSubtitleFileLocally(textContent, file.name.toLowerCase());
        if (segments.length > 0 && onTranscriptParsed) {
          onTranscriptParsed(segments);
        }
      }

      // 2. طلب ترخيص الرفع الآمن المباشر من الـ Backend
      const authRes = await fetch('/api/v1/admin/upload/authorize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileName: file.name,
          fileType: effectiveFileType,
          fileSize: file.size,
          category,
        }),
      });

      const authData = await authRes.json();
      if (!authRes.ok || !authData.success) {
        throw new Error(authData.error || 'فشل الحصول على ترخيص رفع الملف');
      }

      let directSuccess = false;

      // 3. مسار الرفع المباشر (Direct Upload to Cloudflare R2 via Presigned URL)
      if (authData.directR2 && authData.uploadUrl) {
        try {
          await new Promise<void>((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            xhr.open('PUT', authData.uploadUrl);

            // ضبط ترويسة Content-Type لتطابق التوقيع بدقة
            xhr.setRequestHeader('Content-Type', authData.headers?.['Content-Type'] || effectiveFileType);

            xhr.upload.onprogress = (e) => {
              if (e.lengthComputable) {
                setUploadPercent(Math.min(100, Math.round((e.loaded / e.total) * 100)));
              }
            };

            xhr.onload = () => {
              if (xhr.status >= 200 && xhr.status < 300) {
                directSuccess = true;
                resolve();
              } else {
                reject(new Error(`فشل الرفع المباشر إلى Cloudflare R2 برمز ${xhr.status}`));
              }
            };

            xhr.onerror = () => {
              reject(new Error('تعذر الاتصال بـ Cloudflare R2 (خطأ شبكة أو CORS)'));
            };

            xhr.send(file);
          });
        } catch (directErr) {
          console.warn('Direct R2 upload encountered an issue:', directErr);
          directSuccess = false;
        }
      }

      // 4. اعتماد وتوثيق الملف المرفوع في الخادم - إرسال تذكرة التفويض الموقعة للتحقق الصارم
      if (directSuccess) {
        const finalizeRes = await fetch('/api/v1/admin/upload/finalize', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            storageKey: authData.storageKey,
            category,
            fileName: file.name,
            ticket: authData.ticket,
          }),
        });

        const finalizeData = await finalizeRes.json().catch(() => ({}));
        if (!finalizeRes.ok || !finalizeData.success) {
          throw new Error(finalizeData.error || 'فشل اعتماد وتوثيق الملف في قاعدة البيانات');
        }

        // حماية الصوت: الملفات الصوتية لا تمنح رابطاً عاماً بل نعتمد storageKey
        const finalUrl = category === 'audio' ? '' : (finalizeData.publicUrl || authData.publicUrl || '');
        onChange(finalUrl);
        if (onStorageKeyChange) {
          onStorageKeyChange(authData.storageKey);
        }
      } else {
        // إذا فشل الرفع المباشر (مثل سياسة CORS غير المضبوطة في المتصفح أو تعذر الاتصال المباشر)
        // التحقق من أن حجم الملف ضمن سعة المعالجة عبر خادم المنصة (أقل من 4.2 ميغابايت)
        const MAX_SERVER_PAYLOAD = 4.2 * 1024 * 1024; // 4.2MB
        if (file.size > MAX_SERVER_PAYLOAD) {
          throw new Error(
            `تعذر الرفع المباشر إلى Cloudflare R2 بسبب عدم ضبط سياسة CORS على الحاوية في لوحة Cloudflare، وحجم الملف (${(file.size / (1024 * 1024)).toFixed(1)} ميغابايت) يتجاوز الحد الأقصى للمعالجة عبر الخادم (4.2 ميغابايت). يرجى إضافة سياسة CORS في لوحة تحكم Cloudflare R2.`
          );
        }

        // مسار الإنقاذ الآمن والموثوق: رفع الملف مباشرة إلى R2 عبر خادم المنصة بدون أي قيود CORS للمتصفح
        // ضمان إرسال الملف بـ Content-Type الصحيح لتفادي مشاكل المتصفحات مع الأنواع الفارغة
        const fileToSend =
          file.type === effectiveFileType
            ? file
            : new File([file], file.name, { type: effectiveFileType });

        await new Promise<void>((resolve, reject) => {
          const formData = new FormData();
          formData.append('file', fileToSend);
          formData.append('category', category);

          const xhr = new XMLHttpRequest();
          xhr.open('POST', '/api/v1/admin/upload');

          xhr.upload.onprogress = (e) => {
            if (e.lengthComputable) {
              setUploadPercent(Math.min(100, Math.round((e.loaded / e.total) * 100)));
            }
          };

          xhr.onload = () => {
            try {
              const res = JSON.parse(xhr.responseText);
              if (xhr.status >= 200 && xhr.status < 300 && res.success) {
                const finalUrl = category === 'audio' ? '' : (res.url || '');
                onChange(finalUrl);
                if (onStorageKeyChange && res.key) {
                  onStorageKeyChange(res.key);
                }
                resolve();
              } else {
                reject(new Error(res.error || 'فشل حفظ الملف على الخادم'));
              }
            } catch {
              reject(new Error('استجابة غير صالحة من خادم الرفع'));
            }
          };

          xhr.onerror = () => reject(new Error('فشل الاتصال بالخادم أثناء الرفع'));
          xhr.send(formData);
        });
      }

      setIsUploading(false);
      setUploadPercent(100);
    } catch (err: any) {
      setIsUploading(false);
      setUploadError(err.message || 'حدث خطأ أثناء رفع الملف، يرجى المحاولة ثانية');
    }
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      uploadFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      uploadFile(e.target.files[0]);
    }
  };

  const handleDeleteMedia = async () => {
    if (isPlayingAudio && audioPreviewRef.current) {
      audioPreviewRef.current.pause();
      setIsPlayingAudio(false);
    }
    setLocalPreviewUrl(null);
    setAudioDuration(null);
    const currentVal = value;
    onChange('');
    if (onStorageKeyChange) onStorageKeyChange('');

    // محاولة حذف الملف في الخلفية
    if (currentVal) {
      fetch('/api/v1/admin/upload', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: currentVal }),
      }).catch(() => {});
    }
  };

  const isImageCategory = ['poster', 'hero', 'image'].includes(category);
  const isAudioCategory = category === 'audio';
  const isVideoCategory = category === 'video';
  const previewSource = localPreviewUrl || value;

  return (
    <div className="space-y-2 select-none">
      <div className="flex items-center justify-between gap-2">
        <label className="text-xs text-editorial-secondary font-semibold block">
          {label} {required && <span className="text-crimson">*</span>}
        </label>
        {value && (
          <span className="text-[11px] text-emerald-400 font-medium flex items-center gap-1">
            <Check size={12} />
            <span>ملف مرفوع ومحفوظ</span>
          </span>
        )}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept={getAcceptedMimes()}
        onChange={handleFileChange}
        className="hidden"
      />

      {/* الحالة 1: يوجد ملف مرفوع مسبقاً (معاينة فخمة وخيارات استبدال وحذف) */}
      {(value || localPreviewUrl) && !isUploading ? (
        <div className="relative p-3.5 bg-surface-elevated/80 border border-border-subtle rounded-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 group hover:border-crimson/40 transition-colors">
          <div className="flex items-center gap-3 min-w-0 w-full sm:w-auto">
            {isImageCategory && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={previewSource}
                alt="معاينة البوستر"
                className="w-16 h-16 object-cover rounded-lg border border-border-subtle bg-black shrink-0 shadow-sm"
                onError={(e) => {
                  (e.target as HTMLElement).style.display = 'none';
                }}
              />
            )}

            {isAudioCategory && (
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={handleAudioToggle}
                  className="w-12 h-12 rounded-xl bg-crimson/20 border border-crimson/40 text-crimson hover:bg-crimson hover:text-white flex items-center justify-center transition-all shadow-sm shrink-0"
                  title={isPlayingAudio ? 'إيقاف مؤقت' : 'استماع للمعاينة'}
                >
                  {isPlayingAudio ? <Pause size={20} /> : <Play size={20} className="mr-0.5" />}
                </button>
                <audio
                  ref={audioPreviewRef}
                  src={previewSource}
                  onEnded={() => setIsPlayingAudio(false)}
                  onLoadedMetadata={(e) => {
                    const dur = Math.round(e.currentTarget.duration);
                    const m = Math.floor(dur / 60);
                    const s = dur % 60;
                    setAudioDuration(`${m}:${s.toString().padStart(2, '0')}`);
                    if (onDurationDetected && Number.isFinite(dur) && dur > 0) {
                      onDurationDetected(dur);
                    }
                  }}
                />
              </div>
            )}

            {isVideoCategory && (
              <div className="w-16 h-16 rounded-lg bg-black/60 border border-border-subtle overflow-hidden shrink-0 flex items-center justify-center">
                <video src={previewSource} className="w-full h-full object-cover" muted />
              </div>
            )}

            <div className="min-w-0 flex-1">
              <p className="text-xs text-editorial-ivory font-bold truncate max-w-xs" dir="ltr">
                {value.split('/').pop() || 'الملف المرفوع'}
              </p>
              <div className="flex items-center gap-2 mt-1 text-[11px] text-editorial-muted">
                {audioDuration && <span>المدة: {audioDuration} دقيقة</span>}
                <span className="text-emerald-400 font-medium">جاهز للبث</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="px-3 py-1.5 text-xs bg-surface hover:bg-border-subtle border border-border-strong text-editorial-ivory rounded-lg transition-colors flex items-center gap-1.5"
            >
              <RefreshCw size={13} />
              <span>استبدال</span>
            </button>
            <button
              type="button"
              onClick={handleDeleteMedia}
              className="p-1.5 text-editorial-muted hover:text-crimson rounded-lg hover:bg-crimson/10 border border-transparent hover:border-crimson/20 transition-colors"
              title="حذف الملف"
            >
              <Trash2 size={15} />
            </button>
          </div>
        </div>
      ) : (
        /* الحالة 2: منطقة السحب والإفلات أو أثناء الرفع */
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => !isUploading && fileInputRef.current?.click()}
          className={`relative border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all ${
            isDragging
              ? 'border-crimson bg-crimson/10 scale-[1.01]'
              : 'border-border-subtle hover:border-crimson/50 bg-surface-elevated/40 hover:bg-surface-elevated/70'
          } ${isUploading ? 'pointer-events-none' : ''}`}
        >
          {isUploading ? (
            <div className="space-y-3 py-2">
              <div className="w-10 h-10 mx-auto rounded-full bg-crimson/20 flex items-center justify-center animate-pulse">
                <Loader2 size={22} className="text-crimson animate-spin" />
              </div>
              <div>
                <p className="text-xs text-editorial-ivory font-bold">
                  جاري الرفع المباشر إلى المنصة... {uploadPercent}%
                </p>
                <p className="text-[11px] text-editorial-muted mt-0.5">
                  يتم نقل الملف مباشرة إلى سحابة التخزين المؤمنة
                </p>
              </div>
              {/* شريط التقدم الحي */}
              <div className="w-full max-w-xs mx-auto bg-obsidian-900 h-2 rounded-full overflow-hidden border border-border-subtle">
                <div
                  className="bg-gradient-to-r from-crimson to-crimson-bright h-full transition-all duration-150 ease-out"
                  style={{ width: `${uploadPercent}%` }}
                />
              </div>
            </div>
          ) : (
            <div className="space-y-2 py-1">
              <div className="w-12 h-12 mx-auto rounded-xl bg-obsidian-900 border border-border-subtle flex items-center justify-center group-hover:border-crimson/30 transition-colors">
                {getCategoryIcon()}
              </div>
              <div>
                <p className="text-xs text-editorial-ivory font-bold">
                  انقر لاختيار ملف، أو اسحبه وأفلته هنا مباشرة
                </p>
                <p className="text-[11px] text-editorial-muted mt-1">
                  {category === 'audio' && 'صيغ الصوت المدعومة: MP3, WAV, M4A, FLAC (حتى 500 ميغابايت)'}
                  {category === 'poster' && 'صيغ البوستر المدعومة: JPG, PNG, WEBP, AVIF (حتى 20 ميغابايت)'}
                  {category === 'hero' && 'غلاف هيرو عريض سينمائي: 16:9 أو 21:9 بدقة عالية'}
                  {category === 'video' && 'مقاطع فيديو ترويجية قصيرة: MP4, WEBM (حتى 300 ميغابايت)'}
                  {category === 'transcript' && 'ملفات نصوص متزامنة: SRT أو WebVTT أو JSON'}
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* تنبيه الخطأ وزر إعادة المحاولة */}
      {uploadError && (
        <div className="p-3 bg-red-950/40 border border-red-800 text-red-300 text-xs rounded-lg flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <AlertCircle size={15} className="shrink-0 text-red-400" />
            <span>{uploadError}</span>
          </div>
          {lastUploadedFile && (
            <button
              type="button"
              onClick={() => uploadFile(lastUploadedFile)}
              className="px-2.5 py-1 bg-red-900/60 hover:bg-red-800 text-white rounded text-[11px] font-bold flex items-center gap-1 shrink-0 transition-colors"
            >
              <RotateCcw size={12} />
              <span>إعادة المحاولة</span>
            </button>
          )}
        </div>
      )}

      {helperText && !uploadError && (
        <p className="text-[11px] text-editorial-muted">{helperText}</p>
      )}
      {error && <p className="text-[11px] text-red-400">{error}</p>}
    </div>
  );
};
