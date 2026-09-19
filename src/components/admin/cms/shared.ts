// ============================================================
// Shared types & API client for the admin catalog CMS
// أنواع وعميل طلبات مشتركة لواجهة إدارة المحتوى
// ============================================================

export type ContentRating = 'GENERAL' | 'PG13' | 'PG16' | 'PG18';
export type ReleaseStatus = 'AVAILABLE' | 'COMING_SOON' | 'IN_PRODUCTION';
export type AudioStatus = 'MISSING' | 'PROTECTED' | 'PUBLIC';

export interface AdminEpisodeDTO {
  _id: string;
  episodeNumber: number;
  title: string;
  teaser: string | null;
  durationMs: number;
  isFree: boolean;
  publishDate: string | null;
  artworkOverride: string | null;
  audioStatus: AudioStatus;
  audioPublicUrl?: string | null;
  audioStorageKey?: string | null;
  hasTranscript: boolean;
  transcriptSegmentsCount: number;
}

export interface AdminSeasonDTO {
  _id: string;
  seasonNumber: number;
  title: string;
  description: string | null;
  price: number;
  currency: string;
  releaseStatus: ReleaseStatus;
  episodesCount: number;
  episodes: AdminEpisodeDTO[];
}

export interface AdminSeriesDTO {
  _id: string;
  title: string;
  slug: string;
  posterUrl: string;
  heroArtworkUrl: string;
  hook: string;
  description: string;
  genres: string[];
  categoryIds: string[];
  contentRating: ContentRating;
  contentWarnings: string[];
  productionYear: number;
  shareVideoUrl: string | null;
  trailerUrl: string | null;
  isCompleted: boolean;
  featured: boolean;
  publishedAt: string | null;
  freeEpisodesCount: number;
  seasons: AdminSeasonDTO[];
}

export interface ApiResult<T> {
  ok: true;
  data: T;
}

export interface ApiFailure {
  ok: false;
  status: number;
  error: string;
  extra: Record<string, unknown>;
}

export type ApiResponse<T> = ApiResult<T> | ApiFailure;

export async function adminApi<T>(url: string, init?: RequestInit): Promise<ApiResponse<T>> {
  try {
    const res = await fetch(url, { cache: 'no-store', ...init });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      return { ok: true, data: data as T };
    }
    const record = (data && typeof data === 'object' ? data : {}) as Record<string, unknown>;
    const error = typeof record.error === 'string' ? record.error : 'حدث خطأ غير متوقع';
    return { ok: false, status: res.status, error, extra: record };
  } catch {
    return { ok: false, status: 0, error: 'تعذر الاتصال بالخادم. حاول مرة أخرى.', extra: {} };
  }
}

export function uploadEpisodeAudio(
  episodeId: string,
  file: File,
  onProgress: (percent: number) => void
): Promise<ApiResponse<{ key: string; sizeBytes: number; contentType: string }>> {
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/v1/admin/content/audio');
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        onProgress(Math.min(100, Math.round((event.loaded / event.total) * 100)));
      }
    };
    xhr.onload = () => {
      let parsed: Record<string, unknown> = {};
      try {
        parsed = JSON.parse(xhr.responseText);
      } catch {
        parsed = {};
      }
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve({ ok: true, data: parsed as { key: string; sizeBytes: number; contentType: string } });
      } else {
        const error = typeof parsed.error === 'string' ? parsed.error : 'فشل رفع الملف';
        resolve({ ok: false, status: xhr.status, error, extra: parsed });
      }
    };
    xhr.onerror = () => {
      resolve({ ok: false, status: 0, error: 'تعذر الاتصال بالخادم أثناء الرفع.', extra: {} });
    };
    const formData = new FormData();
    formData.append('episodeId', episodeId);
    formData.append('file', file);
    xhr.send(formData);
  });
}

/** تحويل ISO إلى صيغة datetime-local المحلية لأغراض العرض في الحقل */
export function toLocalInputValue(iso: string | null): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function formatDuration(ms: number): string {
  if (!ms || ms <= 0) return 'مدة غير محددة';
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  if (minutes === 0) return `${seconds} ث`;
  return `${minutes} د ${seconds > 0 ? `${seconds} ث` : ''}`.trim();
}

export const CONTENT_RATING_LABELS: Record<ContentRating, string> = {
  GENERAL: 'للجميع',
  PG13: '+13',
  PG16: '+16',
  PG18: '+18',
};

export const RELEASE_STATUS_LABELS: Record<ReleaseStatus, string> = {
  AVAILABLE: 'متاح',
  COMING_SOON: 'قريباً',
  IN_PRODUCTION: 'قيد الإنتاج',
};

export const AUDIO_STATUS_LABELS: Record<AudioStatus, string> = {
  MISSING: 'بلا صوت — يلزم رفع الملف',
  PROTECTED: 'صوت محمي (بث موقع)',
  PUBLIC: 'رابط عام',
};
