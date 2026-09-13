// ============================================================
// Public Platform & Preview Integration Helpers - منصة "يُتبع..."
// أدوات آمنة لمعالجة روابط المنصة العامة، حراسة أدوار الإدارة،
// وسياسة معاينة الصوتيات لمنع تسريب المحتوى المدفوع.
// ============================================================

export const CONTENT_PREVIEW_ROLES = ['SUPER_ADMIN', 'ADMIN', 'CONTENT_EDITOR'] as const;
export const PRICING_MUTATION_ROLES = ['SUPER_ADMIN', 'ADMIN'] as const;

export type ContentPreviewRole = (typeof CONTENT_PREVIEW_ROLES)[number];
export type PricingMutationRole = (typeof PRICING_MUTATION_ROLES)[number];

/**
 * فحص ما إذا كان دور المشرف مصرحاً له بمعاينة المحتوى والمسودات
 */
export function isAuthorizedPreviewRole(role?: string | null): boolean {
  if (!role || typeof role !== 'string') return false;
  return (CONTENT_PREVIEW_ROLES as readonly string[]).includes(role);
}

/**
 * فحص ما إذا كان دور المشرف مصرحاً له بتعديل الأسعار المركزية
 */
export function isAuthorizedPricingMutationRole(role?: string | null): boolean {
  if (!role || typeof role !== 'string') return false;
  return (PRICING_MUTATION_ROLES as readonly string[]).includes(role);
}

/**
 * فحص أمان الرابط الخارجي ومنع البروتوكولات الخطرة مثل javascript: أو data: أو ملفات محلية
 */
export function isSafeExternalUrl(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  if (!trimmed) return false;

  // فحص عدم وجود محارف تحكم أو مسافات خفية أو محاولات حقن سطر جديد
  if (/[\u0000-\u001F\u007F]/.test(trimmed)) return false;

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return false;
    }
    // منع وجود بيانات اعتماد مدمجة في الرابط (username:password@host)
    if (parsed.username || parsed.password) {
      return false;
    }
    // منع أسماء النطاقات الفارغة
    if (!parsed.hostname) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

export const CANONICAL_PUBLIC_PLATFORM_URL = 'https://yotba.vercel.app';
export const DEVELOPMENT_PUBLIC_PLATFORM_URL = 'http://localhost:3000';

/**
 * استخراج الرابط الأساسي لمنصة الاستماع العامة مع التحقق الصارم من صحته:
 * 1. الرابط الصريح في NEXT_PUBLIC_PUBLIC_PLATFORM_URL له الأولوية في حال كان آمناً وصالحاً.
 * 2. في بيئة الإنتاج: الرابط القياسي الافتراضي https://yotba.vercel.app لمنع توجيه الروابط إلى الاستوديو نفسه.
 * 3. في بيئة التطوير والاختبار: الرابط المحلي الافتراضي http://localhost:3000.
 */
export function getBasePublicPlatformUrl(): string {
  const envUrl = process.env.NEXT_PUBLIC_PUBLIC_PLATFORM_URL?.trim();
  if (envUrl) {
    if (isSafeExternalUrl(envUrl)) {
      return envUrl.replace(/\/+$/, '');
    }
    console.warn('[Security Warning] Invalid NEXT_PUBLIC_PUBLIC_PLATFORM_URL ignored');
  }

  if (process.env.NODE_ENV === 'production') {
    return CANONICAL_PUBLIC_PLATFORM_URL;
  }

  return DEVELOPMENT_PUBLIC_PLATFORM_URL;
}

/** اسم مرادف وموحد للرابط الأساسي للمنصة العامة */
export const getPublicPlatformOrigin = getBasePublicPlatformUrl;

/**
 * حل وتجهيز رابط المعاينة في المنصة العامة
 * يرفض الروابط المشوهة والبروتوكولات غير المسموحة
 */
export function resolvePublicPlatformUrl(pathOrUrl?: string | null): string {
  if (!pathOrUrl || typeof pathOrUrl !== 'string') {
    return getBasePublicPlatformUrl() || '/';
  }

  const trimmed = pathOrUrl.trim();

  // إذا كان الرابط كاملاً، نتحقق من أمانه
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed)) {
    if (isSafeExternalUrl(trimmed)) {
      return trimmed;
    }
    // إذا كان الرابط مشوهاً أو يستعمل بروتوكولاً غير آمن، نرفضه
    throw new Error(`Invalid or unsafe public platform URL: ${trimmed}`);
  }

  // التأكد من خلو المسار النسبي من محارف التحكم وحقن CRLF
  if (/[\u0000-\u001F\u007F]/.test(trimmed)) {
    throw new Error(`Invalid characters in public platform path: ${trimmed}`);
  }

  // منع محاولات Directory Traversal الخبيثة في المسار النسبي
  const normalizedPath = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  const base = getBasePublicPlatformUrl();

  if (!base) {
    return normalizedPath;
  }

  return `${base}${normalizedPath}`;
}

export interface AudioPreviewPolicyResult {
  canPreview: boolean;
  streamType: 'protected' | 'public_free' | 'none';
  reason?: string;
}

/**
 * التحقق من سياسة معاينة الصوتيات الإدارية:
 * 1. الحلقات المدفوعة (غير المجانية) لا يجوز أبداً أن تملك رابطاً عاماً دائماً!
 *    يجب أن تُبث حصراً عبر مفتاح التخزين المحمي (Cloudflare R2 / Local Ticket).
 * 2. الحلقات المجانية يمكن معاينتها عبر الرابط العام الصالح أو عبر مفتاح التخزين.
 * 3. الحلقات التي تفتقر لأي مصدر صوتي يتم رفض معاينتها بوضوح.
 */
export function validateAudioPreviewPolicy(episode?: {
  isFree?: boolean;
  audioStorageKey?: string | null;
  audioPublicUrl?: string | null;
}): AudioPreviewPolicyResult {
  if (!episode) {
    return { canPreview: false, streamType: 'none', reason: 'NO_EPISODE_DATA' };
  }

  const isFree = Boolean(episode.isFree);
  const storageKey = typeof episode.audioStorageKey === 'string' && episode.audioStorageKey.trim()
    ? episode.audioStorageKey.trim()
    : null;
  const publicUrl = typeof episode.audioPublicUrl === 'string' && episode.audioPublicUrl.trim()
    ? episode.audioPublicUrl.trim()
    : null;

  // إذا كان هناك مفتاح تخزين محمي
  if (storageKey) {
    return { canPreview: true, streamType: 'protected' };
  }

  // إذا كانت الحلقة مدفوعة ولا تملك مفتاح تخزين، يمنع منعاً باتاً كشف أي رابط عام للصوت
  if (!isFree) {
    return {
      canPreview: false,
      streamType: 'none',
      reason: 'PREMIUM_REQUIRES_PROTECTED_STORAGE_KEY',
    };
  }

  // إذا كانت الحلقة مجانية ولديها رابط عام صالح
  if (isFree && publicUrl) {
    // استبعاد روابط pixabay الوهمية أو غير الصالحة
    if (publicUrl.includes('pixabay.com')) {
      return { canPreview: false, streamType: 'none', reason: 'INVALID_SAMPLE_URL' };
    }
    return { canPreview: true, streamType: 'public_free' };
  }

  return { canPreview: false, streamType: 'none', reason: 'NO_AUDIO_SOURCE' };
}

export interface PricingValues {
  seasonUsd: number;
  monthlyUsd: number;
  annualUsd: number;
}

/**
 * التحقق الصارم من صحة أرقام الأسعار الإدارية:
 * يجب أن تكون أرقاماً حقيقية وموجبة ومحدودة (بين 0.01 و 10000 دولار)
 */
export function validatePricingValues(
  body: unknown
): { ok: true; values: PricingValues } | { ok: false; error: string } {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, error: 'بيانات غير صالحة' };
  }

  const raw = body as Record<string, unknown>;
  const seasonUsd = Number(raw.seasonUsd);
  const monthlyUsd = Number(raw.monthlyUsd);
  const annualUsd = Number(raw.annualUsd);

  const entries: [string, number][] = [
    ['سعر الموسم', seasonUsd],
    ['سعر الاشتراك الشهري', monthlyUsd],
    ['سعر الاشتراك السنوي', annualUsd],
  ];

  for (const [name, val] of entries) {
    if (!Number.isFinite(val) || val <= 0) {
      return { ok: false, error: `${name} يجب أن يكون رقماً موجباً أكبر من الصفر` };
    }
    if (val > 10000) {
      return { ok: false, error: `${name} يتجاوز الحد الأقصى المسموح (10,000 دولار)` };
    }
  }

  return {
    ok: true,
    values: {
      seasonUsd: Math.round(seasonUsd * 100) / 100,
      monthlyUsd: Math.round(monthlyUsd * 100) / 100,
      annualUsd: Math.round(annualUsd * 100) / 100,
    },
  };
}
