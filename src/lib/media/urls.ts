// ============================================================
// Canonical media URL helpers
// روابط الوسائط القياسية بين Cloudflare R2 وواجهات المنصة
// ============================================================

const INTERNAL_MEDIA_PREFIX = '/api/v1/media/';
const PUBLIC_MEDIA_FOLDERS = new Set(['posters', 'hero', 'media']);
const LEGACY_MEDIA_HOSTS = new Set(['media.yotba.com']);

try {
  const configuredDomain = process.env.CLOUDFLARE_R2_PUBLIC_DOMAIN;
  if (configuredDomain) {
    const hostname = new URL(configuredDomain).hostname.toLowerCase();
    if (hostname) LEGACY_MEDIA_HOSTS.add(hostname);
  }
} catch {
  // النطاق الاختياري غير الصالح لا يجب أن يمنع لوحة الإدارة من العمل.
}

function isSafeMediaKey(value: string): boolean {
  const decoded = (() => {
    try {
      return decodeURIComponent(value);
    } catch {
      return '';
    }
  })();

  if (!decoded || decoded !== value || /[\u0000-\u001F\u007F\\]/.test(decoded)) return false;
  const segments = decoded.split('/');
  if (segments.length < 2 || !PUBLIC_MEDIA_FOLDERS.has(segments[0])) return false;
  return segments.slice(1).every((segment) => Boolean(segment) && segment !== '.' && segment !== '..');
}

function normalizeInternalPath(pathname: string): string | null {
  const withoutLeadingSlash = pathname.replace(/^\/+/, '').split(/[?#]/, 1)[0];
  if (!withoutLeadingSlash.startsWith(INTERNAL_MEDIA_PREFIX.slice(1))) return null;
  const key = withoutLeadingSlash.slice(INTERNAL_MEDIA_PREFIX.length - 1);
  return isSafeMediaKey(key) ? `${INTERNAL_MEDIA_PREFIX}${key}` : null;
}

/** يحول روابط CDN القديمة إلى مسار الوسائط الداخلي الذي يقرأ من R2. */
export function normalizeMediaUrl(value: unknown): string {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  if (!trimmed) return '';

  if (trimmed.startsWith(INTERNAL_MEDIA_PREFIX)) {
    return normalizeInternalPath(trimmed) || trimmed;
  }

  try {
    const url = new URL(trimmed);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return trimmed;

    const internalPath = normalizeInternalPath(url.pathname);
    if (internalPath) return internalPath;

    if (LEGACY_MEDIA_HOSTS.has(url.hostname.toLowerCase())) {
      const key = url.pathname.replace(/^\/+/, '');
      if (isSafeMediaKey(key)) return `${INTERNAL_MEDIA_PREFIX}${key}`;
    }
  } catch {
    // طبقات التحقق الخاصة بالطلب تتولى رفض أي قيمة غير صالحة.
  }

  return trimmed;
}

/** بناء رابط كامل للواجهة العامة من مفتاح R2 أو رابط محفوظ سابقاً. */
export function mediaUrlFromStorageKey(value: unknown, origin?: string): string {
  const normalized = normalizeMediaUrl(value);
  if (!normalized) return '';

  const internalPath = normalized.startsWith(INTERNAL_MEDIA_PREFIX)
    ? normalized
    : isSafeMediaKey(normalized.replace(/^\/+/, '').split(/[?#]/, 1)[0])
      ? `${INTERNAL_MEDIA_PREFIX}${normalized.replace(/^\/+/, '').split(/[?#]/, 1)[0]}`
      : null;
  if (!internalPath) return normalized;

  const base = typeof origin === 'string' ? origin.trim().replace(/\/+$/, '') : '';
  return base ? `${base}${internalPath}` : internalPath;
}

export { getBasePublicPlatformUrl as getPublicPlatformOrigin } from '@/lib/config/public-platform';

