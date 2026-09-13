// ============================================================
// Cloudflare R2 Storage & Protected Media Access - منصة "يُتبع..."
// ============================================================

import crypto from 'crypto';
import path from 'path';
import { S3Client, GetObjectCommand, HeadBucketCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { isDemoMode, isProductionRuntime, hasR2Configuration, normalizeEnv } from '@/lib/config/runtime';
import { getPublicPlatformOrigin, mediaUrlFromStorageKey, normalizeMediaUrl } from '@/lib/media/urls';

const R2_ACCOUNT_ID = normalizeEnv(process.env.CLOUDFLARE_R2_ACCOUNT_ID);
const R2_ACCESS_KEY_ID = normalizeEnv(process.env.CLOUDFLARE_R2_ACCESS_KEY_ID);
const R2_SECRET_ACCESS_KEY = normalizeEnv(process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY);
const R2_BUCKET_NAME = normalizeEnv(process.env.CLOUDFLARE_R2_BUCKET_NAME) || 'yotba-media';
const R2_PUBLIC_DOMAIN = normalizeEnv(process.env.CLOUDFLARE_R2_PUBLIC_DOMAIN);
// لا نستخدم نطاق CDN المخصص إلا بعد تفعيل صريح وتحقق DNS؛ المسار الداخلي
// يظل الخيار الآمن والموثوق أثناء تشغيل المنصة على نطاق Vercel.
const USE_R2_PUBLIC_DOMAIN = (normalizeEnv(process.env.CLOUDFLARE_R2_PUBLIC_DOMAIN_ENABLED) || '').toLowerCase() === 'true';

let s3Client: S3Client | null = null;

if (R2_ACCOUNT_ID && R2_ACCESS_KEY_ID && R2_SECRET_ACCESS_KEY) {
  s3Client = new S3Client({
    region: 'auto',
    endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: R2_ACCESS_KEY_ID,
      secretAccessKey: R2_SECRET_ACCESS_KEY,
    },
  });
}

export interface StorageHealthStatus {
  provider: 'cloudflare_r2';
  configured: boolean;
  status: 'connected' | 'configured_unchecked' | 'connection_failed' | 'timed_out' | 'not_configured';
  connectivity: 'connected' | 'connection_failed' | 'timed_out' | 'unchecked';
  latencyMs: number | null;
}

export function getStorageStatus(): StorageHealthStatus {
  const configured = hasR2Configuration();
  return {
    provider: 'cloudflare_r2',
    configured,
    status: configured ? 'configured_unchecked' : 'not_configured',
    connectivity: 'unchecked',
    latencyMs: null,
  };
}

/**
 * Bounded, read-only R2 connectivity check. HeadBucket validates the
 * endpoint, credentials, and bucket without uploading or modifying objects.
 */
export async function checkStorageHealth(timeoutMs: number = 5000): Promise<StorageHealthStatus> {
  const baseStatus = getStorageStatus();
  if (!baseStatus.configured || !s3Client) {
    return baseStatus;
  }

  const start = Date.now();
  let timer: NodeJS.Timeout | undefined;
  try {
    const request = s3Client.send(new HeadBucketCommand({ Bucket: R2_BUCKET_NAME }));
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('TIMEOUT')), timeoutMs);
    });
    await Promise.race([request, timeout]);
    if (timer) clearTimeout(timer);
    return {
      ...baseStatus,
      status: 'connected',
      connectivity: 'connected',
      latencyMs: Date.now() - start,
    };
  } catch (error) {
    if (timer) clearTimeout(timer);
    const timedOut = error instanceof Error && error.message === 'TIMEOUT';
    return {
      ...baseStatus,
      status: timedOut ? 'timed_out' : 'connection_failed',
      connectivity: timedOut ? 'timed_out' : 'connection_failed',
      latencyMs: null,
    };
  }
}

export const SUPPORTED_CATEGORIES = [
  'poster',
  'hero',
  'image',
  'audio',
  'video',
  'transcript',
] as const;

export type SupportedMediaCategory = (typeof SUPPORTED_CATEGORIES)[number];

export interface CategoryValidationConfig {
  category: SupportedMediaCategory;
  folder: string;
  maxBytes: number;
  isProtected: boolean;
  allowedMimes: Record<string, string>; // mime -> canonical extension
  extensionToMime: Record<string, string>; // extension -> canonical mime
  arabicLabel: string;
}

// الصور والفيديو والصوت تُرفع مباشرة من المتصفح إلى Cloudflare R2، لذلك لا
// نضع لها حدوداً اصطناعية من طرف المنصة. قيمة maxBytes ما زالت موجودة داخل
// التذكرة للتوافق مع بنية التفويض القديمة، لكنها تساوي أكبر عدد صحيح آمن.
// حد مزوّد التخزين نفسه (إن وُجد) لا يمكن تجاوزه إلا بإضافة multipart upload.
const UNLIMITED_MEDIA_BYTES = Number.MAX_SAFE_INTEGER;

// Allowed Image MIMEs (Raster graphics only - NO SVG for security)
const ALLOWED_IMAGE_MIMES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/avif': 'avif',
};

const IMAGE_EXTENSION_TO_MIME: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  avif: 'image/avif',
};

// Allowed Audio MIMEs (Master files - Protected)
const ALLOWED_AUDIO_MIMES: Record<string, string> = {
  'audio/mpeg': 'mp3',
  'audio/mp3': 'mp3',
  'audio/x-mp3': 'mp3',
  'audio/mp4': 'm4a',
  'audio/m4a': 'm4a',
  'audio/x-m4a': 'm4a',
  'audio/aac': 'aac',
  'audio/x-aac': 'aac',
  'audio/ogg': 'ogg',
  'audio/vorbis': 'ogg',
  'audio/x-ogg': 'ogg',
  'audio/webm': 'weba',
  'audio/x-webm': 'weba',
  'audio/wav': 'wav',
  'audio/wave': 'wav',
  'audio/x-wav': 'wav',
  'audio/flac': 'flac',
  'audio/x-flac': 'flac',
};

const AUDIO_EXTENSION_TO_MIME: Record<string, string> = {
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  aac: 'audio/aac',
  ogg: 'audio/ogg',
  weba: 'audio/webm',
  webm: 'audio/webm',
  wav: 'audio/wav',
  flac: 'audio/flac',
};

// Allowed Video MIMEs (Short clips / Teasers)
const ALLOWED_VIDEO_MIMES: Record<string, string> = {
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'video/quicktime': 'mov',
};

const VIDEO_EXTENSION_TO_MIME: Record<string, string> = {
  mp4: 'video/mp4',
  webm: 'video/webm',
  mov: 'video/quicktime',
};

// Allowed Transcript MIMEs
const ALLOWED_TRANSCRIPT_MIMES: Record<string, string> = {
  'application/json': 'json',
  'text/vtt': 'vtt',
  'text/plain': 'srt',
  'application/x-subrip': 'srt',
};

const TRANSCRIPT_EXTENSION_TO_MIME: Record<string, string> = {
  json: 'application/json',
  vtt: 'text/vtt',
  srt: 'text/plain',
  txt: 'text/plain',
};

export const CATEGORY_CONFIGS: Record<SupportedMediaCategory, CategoryValidationConfig> = {
  poster: {
    category: 'poster',
    folder: 'posters',
    maxBytes: UNLIMITED_MEDIA_BYTES,
    isProtected: false,
    allowedMimes: ALLOWED_IMAGE_MIMES,
    extensionToMime: IMAGE_EXTENSION_TO_MIME,
    arabicLabel: 'بوستر',
  },
  hero: {
    category: 'hero',
    folder: 'hero',
    maxBytes: UNLIMITED_MEDIA_BYTES,
    isProtected: false,
    allowedMimes: ALLOWED_IMAGE_MIMES,
    extensionToMime: IMAGE_EXTENSION_TO_MIME,
    arabicLabel: 'غلاف هيرو عريض',
  },
  image: {
    category: 'image',
    folder: 'media',
    maxBytes: UNLIMITED_MEDIA_BYTES,
    isProtected: false,
    allowedMimes: ALLOWED_IMAGE_MIMES,
    extensionToMime: IMAGE_EXTENSION_TO_MIME,
    arabicLabel: 'صورة',
  },
  audio: {
    category: 'audio',
    folder: 'audio',
    maxBytes: UNLIMITED_MEDIA_BYTES,
    isProtected: true,
    allowedMimes: ALLOWED_AUDIO_MIMES,
    extensionToMime: AUDIO_EXTENSION_TO_MIME,
    arabicLabel: 'ملف صوتي',
  },
  video: {
    category: 'video',
    folder: 'media',
    maxBytes: UNLIMITED_MEDIA_BYTES,
    isProtected: false,
    allowedMimes: ALLOWED_VIDEO_MIMES,
    extensionToMime: VIDEO_EXTENSION_TO_MIME,
    arabicLabel: 'مقطع فيديو',
  },
  transcript: {
    category: 'transcript',
    folder: 'media',
    maxBytes: 10 * 1024 * 1024, // 10MB
    isProtected: false,
    allowedMimes: ALLOWED_TRANSCRIPT_MIMES,
    extensionToMime: TRANSCRIPT_EXTENSION_TO_MIME,
    arabicLabel: 'نص متزامن',
  },
};

export type ValidationSuccess<T> = { ok: true; data: T };
export type ValidationError = { ok: false; error: string; status: number };
export type ValidationResult<T> = ValidationSuccess<T> | ValidationError;

export function isSupportedCategory(val: unknown): val is SupportedMediaCategory {
  return (
    typeof val === 'string' &&
    (SUPPORTED_CATEGORIES as readonly string[]).includes(val.toLowerCase().trim())
  );
}

export function sanitizeFileName(rawName: string): string {
  const stripped = rawName.replace(/[\u0000-\u001F\u007F-\u009F]/g, '').trim();
  const normalized = stripped.replace(/\\/g, '/');
  return path.posix.basename(normalized);
}

export interface ValidatedAuthorizeInput {
  category: SupportedMediaCategory;
  fileName: string;
  fileType: string;
  fileSize: number;
  extension: string;
  canonicalMime: string;
  folder: string;
  maxBytes: number;
  isProtected: boolean;
}

export function validateUploadAuthorizeInput(rawBody: unknown): ValidationResult<ValidatedAuthorizeInput> {
  if (!rawBody || typeof rawBody !== 'object' || Array.isArray(rawBody)) {
    return { ok: false, status: 400, error: 'بيانات الطلب غير صالحة' };
  }

  const { fileName, fileType, fileSize, category } = rawBody as Record<string, unknown>;

  // 1. فحص فئة الوسائط (category)
  if (typeof category !== 'string' || !isSupportedCategory(category)) {
    return {
      ok: false,
      status: 400,
      error: 'فئة الوسائط غير مدعومة أو غير محددة. الفئات المدعومة: poster, hero, image, audio, video, transcript',
    };
  }

  const cat = category.toLowerCase().trim() as SupportedMediaCategory;
  const config = CATEGORY_CONFIGS[cat];

  // 2. فحص اسم الملف (fileName)
  if (typeof fileName !== 'string' || fileName.trim().length === 0) {
    return { ok: false, status: 400, error: 'اسم الملف مطلوب ويجب أن يكون نصاً صالحاً' };
  }

  const cleanName = sanitizeFileName(fileName);
  if (!cleanName || cleanName.length > 255) {
    return { ok: false, status: 400, error: 'اسم الملف غير صالح أو يتجاوز 255 حرفاً' };
  }

  if (cleanName.startsWith('.')) {
    return { ok: false, status: 400, error: 'اسم الملف غير صالح (ملف مخفي)' };
  }

  const parts = cleanName.split('.');
  if (parts.length < 2) {
    return { ok: false, status: 400, error: 'اسم الملف يجب أن يحتوي على امتداد صالح' };
  }

  const rawExt = parts.pop()!.toLowerCase().trim();
  if (!rawExt) {
    return { ok: false, status: 400, error: 'امتداد الملف مفقود' };
  }

  // 3. رفض صريح لملفات SVG النشطة لمنع ثغرات XSS المخزنة
  if (rawExt === 'svg' || (typeof fileType === 'string' && fileType.toLowerCase().includes('svg'))) {
    return {
      ok: false,
      status: 400,
      error: 'صيغة SVG غير مدعومة لأسباب أمنية. الصيغ المدعومة للصور: JPG, PNG, WEBP, AVIF',
    };
  }

  // 4. فحص حجم الملف (fileSize) — إلزامي كرقم موجب فقط.
  // لا نضع حداً للصور أو الصوت أو الفيديو؛ هذه الملفات تذهب مباشرة إلى R2.
  if (
    typeof fileSize !== 'number' ||
    !Number.isFinite(fileSize) ||
    !Number.isInteger(fileSize) ||
    fileSize <= 0
  ) {
    return {
      ok: false,
      status: 400,
      error: 'حجم الملف مطلوب ويجب أن يكون رقماً صحيحاً موجباً بالبايت',
    };
  }

  // ملفات الترجمة تُقرأ داخل الخادم، لذلك تبقى لها حماية منفصلة من الحجم.
  if (config.category === 'transcript' && fileSize > config.maxBytes) {
    const maxMb = Math.floor(config.maxBytes / (1024 * 1024));
    return {
      ok: false,
      status: 413,
      error: `حجم الملف يتجاوز الحد الأقصى المسموح لـ ${config.arabicLabel} (${maxMb} ميغابايت)`,
    };
  }

  // 5. فحص نوع الملف (fileType / MIME)
  if (typeof fileType !== 'string' || fileType.trim().length === 0) {
    return { ok: false, status: 400, error: 'نوع الملف (MIME Type) مطلوب' };
  }

  const normalizedMime = fileType.split(';')[0].trim().toLowerCase();

  // 6. التحقق من توافق الامتداد مع الفئة
  const expectedMimeFromExt = config.extensionToMime[rawExt];
  if (!expectedMimeFromExt) {
    return {
      ok: false,
      status: 400,
      error: `امتداد الملف (.${rawExt}) غير مدعوم لفئة ${config.arabicLabel}`,
    };
  }

  // 7. التحقق من توافق MIME مع الفئة
  const canonicalExtFromMime = config.allowedMimes[normalizedMime];
  if (!canonicalExtFromMime) {
    return {
      ok: false,
      status: 415,
      error: `نوع المحتوى (${normalizedMime}) غير مدعوم لفئة ${config.arabicLabel}`,
    };
  }

  // 8. منع تعارض الامتداد مع نوع المحتوى (Extension vs MIME Mismatch Prevention)
  const canonicalExtFromName = config.allowedMimes[expectedMimeFromExt];
  if (canonicalExtFromMime !== canonicalExtFromName) {
    return {
      ok: false,
      status: 400,
      error: `تعارض بين نوع المحتوى (${normalizedMime}) وامتداد الملف (.${rawExt})`,
    };
  }

  const canonicalMime = config.extensionToMime[canonicalExtFromMime] || normalizedMime;

  return {
    ok: true,
    data: {
      category: cat,
      fileName: cleanName,
      fileType: normalizedMime,
      fileSize,
      extension: canonicalExtFromMime,
      canonicalMime,
      folder: config.folder,
      maxBytes: config.maxBytes,
      isProtected: config.isProtected,
    },
  };
}

export function generateStorageKey(folder: string, extension: string): string {
  const timestamp = Date.now();
  const randomHex = crypto.randomBytes(8).toString('hex');
  return `${folder}/${timestamp}_${randomHex}.${extension}`;
}

export interface ValidatedFinalizeInput {
  category: SupportedMediaCategory;
  storageKey: string;
  fileName: string;
  folder: string;
  extension: string;
  maxBytes: number;
  isProtected: boolean;
}

const STORAGE_KEY_REGEX = /^(posters|hero|media|audio)\/(\d+_[a-f0-9]{16}\.[a-z0-9]+)$/;
const LEGACY_EPISODE_AUDIO_KEY_REGEX = /^episodes\/[a-f0-9]{24}\/audio\.[a-z0-9]+$/i;

/** يتحقق من أن المفتاح صادر عن مولّد الرفع وليس مساراً اعتباطياً. */
export function isValidGeneratedStorageKey(rawKey: unknown, category?: SupportedMediaCategory): rawKey is string {
  if (typeof rawKey !== 'string') return false;
  const cleanKey = rawKey.trim().replace(/^\/+/, '');
  const match = cleanKey.match(STORAGE_KEY_REGEX);
  if (match) {
    if (!category) return true;
    const config = CATEGORY_CONFIGS[category];
    const extension = cleanKey.split('.').pop()?.toLowerCase() || '';
    return match[1] === config.folder && Boolean(config.extensionToMime[extension]);
  }

  // ملفات الصوت التي رُفعت عبر المسار القديم كانت تُحفظ تحت
  // episodes/<ObjectId>/audio.<ext>. نسمح بحذفها فقط بهذا الشكل الصارم.
  return LEGACY_EPISODE_AUDIO_KEY_REGEX.test(cleanKey) && (!category || category === 'audio');
}

/**
 * استخراج مفتاح R2 من قيمة محفوظة كمسار داخلي أو رابط CDN قديم.
 * لا نعيد أي قيمة إلا إذا طابقت بنية مفتاح مولّدة آمنة، حتى لا تتحول
 * عملية تنظيف المحتوى إلى حذف رابط خارجي أو مسار اعتباطي.
 */
export function extractStorageKey(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.startsWith('blob:')) return null;

  const match = trimmed.match(
    /(?:^|\/)((?:posters|hero|media|audio)\/\d+_[a-f0-9]{16}\.[a-z0-9]+|episodes\/[a-f0-9]{24}\/audio\.[a-z0-9]+)(?:[?#]|$)/i
  );
  if (!match) return null;

  const candidate = match[1];
  return isValidGeneratedStorageKey(candidate) ? candidate : null;
}

export function validateUploadFinalizeInput(rawBody: unknown): ValidationResult<ValidatedFinalizeInput> {
  if (!rawBody || typeof rawBody !== 'object' || Array.isArray(rawBody)) {
    return { ok: false, status: 400, error: 'بيانات الطلب غير صالحة' };
  }

  const { storageKey, category, fileName } = rawBody as Record<string, unknown>;

  if (typeof storageKey !== 'string' || storageKey.trim().length === 0) {
    return { ok: false, status: 400, error: 'معرف التخزين (storageKey) مطلوب' };
  }

  const cleanKey = storageKey.trim().replace(/^\/+/, '');
  const match = cleanKey.match(STORAGE_KEY_REGEX);
  if (!match) {
    return {
      ok: false,
      status: 400,
      error: 'معرف التخزين غير صالح أو لا يطابق البنية المعتمدة للمنصة',
    };
  }

  const keyFolder = match[1];
  const keyExt = cleanKey.split('.').pop()?.toLowerCase() || '';

  if (typeof category !== 'string' || !isSupportedCategory(category)) {
    return {
      ok: false,
      status: 400,
      error: 'فئة الوسائط غير صالحة أو غير محددة',
    };
  }

  const cat = category.toLowerCase().trim() as SupportedMediaCategory;
  const config = CATEGORY_CONFIGS[cat];

  // التحقق من أن مجلد التخزين يطابق فئة الوسائط
  if (keyFolder !== config.folder) {
    return {
      ok: false,
      status: 400,
      error: `مجلد التخزين (${keyFolder}) لا يتطابق مع فئة الوسائط (${cat})`,
    };
  }

  // التحقق من أن الامتداد مدعوم لهذه الفئة
  if (!config.extensionToMime[keyExt]) {
    return {
      ok: false,
      status: 400,
      error: `امتداد الملف (.${keyExt}) غير معتمد لهذه الفئة`,
    };
  }

  const safeFileName =
    typeof fileName === 'string' && fileName.trim() ? sanitizeFileName(fileName) : cleanKey;

  return {
    ok: true,
    data: {
      category: cat,
      storageKey: cleanKey,
      fileName: safeFileName,
      folder: keyFolder,
      extension: keyExt,
      maxBytes: config.maxBytes,
      isProtected: config.isProtected,
    },
  };
}

export interface UploadAuthorizationTicket {
  adminId: string;
  storageKey: string;
  category: SupportedMediaCategory;
  expectedSizeBytes: number;
  canonicalMime: string;
  expiresAt: number; // Unix timestamp in ms
}

export function getTicketSecret(): string {
  const secret = normalizeEnv(process.env.JWT_SECRET) || normalizeEnv(process.env.ADMIN_SESSION_SECRET);
  if (isProductionRuntime() || process.env.NODE_ENV === 'production') {
    if (!secret) {
      throw new Error('JWT_SECRET or ADMIN_SESSION_SECRET must be configured in production for upload authorization tickets');
    }
    return secret;
  }
  return secret || 'development-only-upload-ticket-secret';
}

export function createUploadTicket(data: UploadAuthorizationTicket): string {
  const secret = getTicketSecret();
  const payload = Buffer.from(JSON.stringify(data)).toString('base64url');
  const signature = crypto.createHmac('sha256', secret).update(payload).digest('base64url');
  return `${payload}.${signature}`;
}

export function verifyUploadTicket(
  ticket: unknown,
  expectedAdminId?: string,
  expectedStorageKey?: string
): ValidationResult<UploadAuthorizationTicket> {
  if (typeof ticket !== 'string' || !ticket.includes('.')) {
    return { ok: false, status: 400, error: 'رمز تفويض الرفع (ticket) مطلوب ويجب أن يكون نصاً صالحاً' };
  }

  const parts = ticket.split('.');
  if (parts.length !== 2) {
    return { ok: false, status: 400, error: 'تنسيق رمز التفويض غير صحيح' };
  }

  const [payloadB64, signature] = parts;
  let secret: string;
  try {
    secret = getTicketSecret();
  } catch {
    return { ok: false, status: 500, error: 'خطأ أمني: تعذر التحقق من التوقيع في بيئة الإنتاج' };
  }

  const expectedSignature = crypto.createHmac('sha256', secret).update(payloadB64).digest('base64url');

  const sigBuf = Buffer.from(signature);
  const expBuf = Buffer.from(expectedSignature);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return { ok: false, status: 403, error: 'رمز تفويض الرفع تم التلاعب به أو توقيعه غير صالح' };
  }

  let data: any;
  try {
    const jsonStr = Buffer.from(payloadB64, 'base64url').toString('utf-8');
    data = JSON.parse(jsonStr);
  } catch {
    return { ok: false, status: 400, error: 'بيانات رمز تفويض الرفع تالفة' };
  }

  if (!data || typeof data !== 'object') {
    return { ok: false, status: 400, error: 'بيانات رمز التفويض غير صالحة' };
  }

  const { adminId, storageKey, category, expectedSizeBytes, canonicalMime, expiresAt } = data;

  if (typeof adminId !== 'string' || !adminId) {
    return { ok: false, status: 400, error: 'معرف المشرف في رمز التفويض مفقود' };
  }
  if (expectedAdminId && adminId !== expectedAdminId) {
    return { ok: false, status: 403, error: 'رمز تفويض الرفع غير صادر للمشرف الحالي' };
  }

  if (typeof storageKey !== 'string' || !storageKey) {
    return { ok: false, status: 400, error: 'معرف التخزين في رمز التفويض مفقود' };
  }
  if (expectedStorageKey) {
    const cleanExpected = expectedStorageKey.replace(/\.\./g, '').replace(/^\/+/, '');
    const cleanTicketKey = storageKey.replace(/\.\./g, '').replace(/^\/+/, '');
    if (cleanTicketKey !== cleanExpected) {
      return { ok: false, status: 400, error: 'معرف التخزين في رمز التفويض لا يطابق الملف المطلوب اعتماده' };
    }
  }

  if (!isSupportedCategory(category)) {
    return { ok: false, status: 400, error: 'فئة الوسائط في رمز التفويض غير مدعومة' };
  }

  if (
    typeof expectedSizeBytes !== 'number' ||
    !Number.isFinite(expectedSizeBytes) ||
    !Number.isInteger(expectedSizeBytes) ||
    expectedSizeBytes <= 0
  ) {
    return { ok: false, status: 400, error: 'حجم الملف المصرح به في رمز التفويض غير صالح' };
  }

  if (typeof canonicalMime !== 'string' || !canonicalMime) {
    return { ok: false, status: 400, error: 'نوع المحتوى في رمز التفويض غير صالح' };
  }

  if (typeof expiresAt !== 'number' || !Number.isFinite(expiresAt)) {
    return { ok: false, status: 400, error: 'تاريخ انتهاء رمز التفويض غير صالح' };
  }

  if (Date.now() > expiresAt) {
    return { ok: false, status: 401, error: 'انتهت صلاحية رمز تفويض الرفع. يرجى إعادة المحاولة' };
  }

  return {
    ok: true,
    data: {
      adminId,
      storageKey,
      category,
      expectedSizeBytes,
      canonicalMime,
      expiresAt,
    },
  };
}

export interface LocalStreamTicket {
  storageKey: string;
  expiresAt: number;
}

export function createLocalStreamTicket(storageKey: string, expiresInSeconds: number = 3600): string {
  const secret = getTicketSecret();
  const cleanKey = storageKey.replace(/\.\./g, '').replace(/^\/+/, '');
  const data: LocalStreamTicket = {
    storageKey: cleanKey,
    expiresAt: Date.now() + expiresInSeconds * 1000,
  };
  const payload = Buffer.from(JSON.stringify(data)).toString('base64url');
  const signature = crypto.createHmac('sha256', secret).update(payload).digest('base64url');
  return `${payload}.${signature}`;
}

export function verifyLocalStreamTicket(ticket: unknown, expectedStorageKey: string): boolean {
  if (typeof ticket !== 'string' || !ticket.includes('.')) return false;
  const parts = ticket.split('.');
  if (parts.length !== 2) return false;

  const [payloadB64, signature] = parts;
  let secret: string;
  try {
    secret = getTicketSecret();
  } catch {
    return false;
  }

  const expectedSignature = crypto.createHmac('sha256', secret).update(payloadB64).digest('base64url');
  const sigBuf = Buffer.from(signature);
  const expBuf = Buffer.from(expectedSignature);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return false;
  }

  try {
    const data = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf-8'));
    if (!data || typeof data !== 'object') return false;
    if (Date.now() > data.expiresAt) return false;
    const cleanExpected = expectedStorageKey.replace(/\.\./g, '').replace(/^\/+/, '');
    return data.storageKey === cleanExpected;
  } catch {
    return false;
  }
}

export function getLocalStoragePath(cleanKey: string): { filePath: string; baseDir: string } {
  const safeKey = cleanKey.replace(/\.\./g, '').replace(/^\/+/, '').replace(/[^a-zA-Z0-9_\-\.\/]/g, '_');
  const isAudio = safeKey.startsWith('audio/') || safeKey.startsWith('episodes/');
  const baseDir = isAudio
    ? path.resolve(process.cwd(), '.private_storage')
    : path.resolve(process.cwd(), 'public', 'uploads');
  const filePath = path.resolve(baseDir, safeKey);
  return { filePath, baseDir };
}

export function isPathInsideDir(filePath: string, baseDir: string): boolean {
  const rel = path.relative(baseDir, filePath);
  return !rel.startsWith('..') && !path.isAbsolute(rel);
}

export function validateVerifiedMetadata(
  ticketOrConfig: UploadAuthorizationTicket | CategoryValidationConfig,
  metadata: { exists: boolean; sizeBytes?: number; contentType?: string }
): ValidationResult<{ sizeBytes: number; contentType: string }> {
  if (!metadata.exists) {
    return {
      ok: false,
      status: 404,
      error: 'تعذر التحقق من وجود الملف في سحابة التخزين',
    };
  }

  const isTicket = 'expectedSizeBytes' in ticketOrConfig;
  const config = isTicket ? CATEGORY_CONFIGS[ticketOrConfig.category] : ticketOrConfig;

  if (
    metadata.sizeBytes === undefined ||
    !Number.isFinite(metadata.sizeBytes) ||
    metadata.sizeBytes <= 0
  ) {
    return {
      ok: false,
      status: 400,
      error: 'الملف المرفوع في التخزين فارغ أو تالف (0 بايت)',
    };
  }

  // لا يوجد حد تطبيقي للصور/الصوت/الفيديو عند الرفع المباشر إلى R2.
  // نحتفظ بحد الترجمة فقط لأنها تُحلّل داخل خادم المنصة.
  if (config.category === 'transcript' && metadata.sizeBytes > config.maxBytes) {
    const maxMb = Math.floor(config.maxBytes / (1024 * 1024));
    return {
      ok: false,
      status: 413,
      error: `حجم الملف الفعلي (${(metadata.sizeBytes / (1024 * 1024)).toFixed(1)} ميغابايت) يتجاوز الحد الأقصى (${maxMb} ميغابايت)`,
    };
  }

  // إذا تم تمرير تذكرة تفويض، نتحقق بدقة من مطابقة الحجم الفعلي للحجم المصرح به
  if (isTicket && metadata.sizeBytes !== ticketOrConfig.expectedSizeBytes) {
    return {
      ok: false,
      status: 400,
      error: `حجم الملف الفعلي (${metadata.sizeBytes} بايت) لا يطابق الحجم المصرح به في تذكرة الرفع (${ticketOrConfig.expectedSizeBytes} بايت)`,
    };
  }

  const rawContentType = metadata.contentType ? metadata.contentType.trim() : '';
  if (!rawContentType || rawContentType.toLowerCase() === 'application/octet-stream') {
    return {
      ok: false,
      status: 400,
      error: 'نوع المحتوى الفعلي للملف مفقود أو غير محدد (octet-stream) ولا يمكن اعتماده كأصل إعلامي صالح',
    };
  }

  const norm = rawContentType.split(';')[0].trim().toLowerCase();
  if (norm.includes('svg')) {
    return {
      ok: false,
      status: 400,
      error: 'الملف المرفوع هو بصيغة SVG وهو غير مسموح به لأسباب أمنية',
    };
  }

  const realExt = config.allowedMimes[norm];
  if (!realExt) {
    return {
      ok: false,
      status: 415,
      error: `نوع المحتوى الفعلي للملف (${norm}) غير مدعوم لفئة ${config.arabicLabel}`,
    };
  }

  // إذا تم تمرير تذكرة تفويض، نتحقق بدقة من مطابقة النوع الفعلي للنوع المصرح به
  if (isTicket) {
    const authorizedNorm = ticketOrConfig.canonicalMime.split(';')[0].trim().toLowerCase();
    const authorizedExt = config.allowedMimes[authorizedNorm];
    if (realExt !== authorizedExt) {
      return {
        ok: false,
        status: 400,
        error: `نوع المحتوى الفعلي للملف (${norm}) لا يطابق النوع المصرح به (${authorizedNorm})`,
      };
    }
  }

  return {
    ok: true,
    data: {
      sizeBytes: metadata.sizeBytes,
      contentType: norm,
    },
  };
}

export interface LegacyMultipartUploadPolicyResult {
  allowed: boolean;
  requiresDirectUpload: boolean;
  reason: 'PRODUCTION_DIRECT_UPLOAD_REQUIRED' | 'LOCAL_DEVELOPMENT_FALLBACK_ALLOWED';
  errorMessage?: string;
}

/**
 * سياسة رفع الوسائط عبر مسار multipart القديم على الخادم:
 * - في بيئة الإنتاج: يُمنع الرفع عبر الخادم لمنع استهلاك الذاكرة وتجاوز حدود Serverless،
 *   ويشترط استخدام الرفع المباشر إلى Cloudflare R2 (Direct Upload).
 * - في بيئة التطوير المحلي: يُسمح بالمسار القديم كبديل احتياطي محلي (Legacy Fallback).
 */
export function getLegacyMultipartUploadPolicy(
  envNodeEnv?: string
): LegacyMultipartUploadPolicyResult {
  const isProd =
    typeof envNodeEnv === 'string'
      ? envNodeEnv.trim().toLowerCase() === 'production'
      : isProductionRuntime();

  if (isProd) {
    return {
      allowed: false,
      requiresDirectUpload: true,
      reason: 'PRODUCTION_DIRECT_UPLOAD_REQUIRED',
      errorMessage:
        'رفع الوسائط عبر multipart غير مدعوم في بيئة الإنتاج. يجب استخدام مسار الرفع المباشر إلى Cloudflare R2.',
    };
  }

  return {
    allowed: true,
    requiresDirectUpload: false,
    reason: 'LOCAL_DEVELOPMENT_FALLBACK_ALLOWED',
  };
}

export class StorageService {
  /**
   * توليد رابط وصول موقع ومؤقت لملف صوتي محمي في Cloudflare R2
   * لا يتم إعطاء أي رابط عام دائم للملفات المدفوعة!
   */
  static async getProtectedAudioUrl(storageKey: string, expiresInSeconds: number = 900): Promise<string> {
    const cleanKey = storageKey.replace(/\.\./g, '').replace(/^\/+/, '');
    if (!s3Client) {
      if (!isProductionRuntime()) {
        if (cleanKey.startsWith('http')) {
          return cleanKey;
        }
        const ticket = createLocalStreamTicket(cleanKey, expiresInSeconds);
        return `/api/v1/media/${cleanKey}?ticket=${ticket}`;
      }
      throw new Error('R2 storage is not configured for protected media');
    }

    const command = new GetObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: cleanKey,
    });

    return getSignedUrl(s3Client, command, { expiresIn: expiresInSeconds });
  }

  /**
   * ضمان ضبط قواعد CORS على حاوية Cloudflare R2 للسماح بالرفع المباشر من المتصفح
   */
  static async ensureBucketCors(): Promise<void> {
    if (!s3Client) return;
    try {
      const { PutBucketCorsCommand } = await import('@aws-sdk/client-s3');
      await s3Client.send(
        new PutBucketCorsCommand({
          Bucket: R2_BUCKET_NAME,
          CORSConfiguration: {
            CORSRules: [
              {
                AllowedOrigins: ['*'],
                AllowedMethods: ['GET', 'PUT', 'HEAD', 'POST'],
                AllowedHeaders: ['*'],
                ExposeHeaders: ['ETag', 'Content-Range', 'Accept-Ranges'],
                MaxAgeSeconds: 3600,
              },
            ],
          },
        })
      );
    } catch (corsErr) {
      console.warn('Unable to auto-configure R2 bucket CORS:', corsErr);
    }
  }

  /**
   * الحصول على رابط عام للأصول المجانية (بوسترات، صور، مقاطع ترويجية)
   * الملفات الصوتية المحمية (audio/ أو episodes/) لا تملك رابطاً عاماً أبداً!
   */
  static getPublicMediaUrl(storageKey: string): string {
    if (!storageKey) return '';
    const cleanKey = storageKey.replace(/\.\./g, '').replace(/^\/+/, '');

    // حظر الروابط العامة لملفات الصوت المحمية لمنع تسريبها
    if (cleanKey.startsWith('audio/') || cleanKey.startsWith('episodes/')) {
      return '';
    }

    const normalizedStoredUrl = normalizeMediaUrl(storageKey);
    if (normalizedStoredUrl !== storageKey || normalizedStoredUrl.startsWith('/api/v1/media/')) {
      return mediaUrlFromStorageKey(normalizedStoredUrl, getPublicPlatformOrigin());
    }
    if (/^https?:\/\//i.test(storageKey)) return storageKey;
    if (
      storageKey.startsWith('/api/v1/media') ||
      storageKey.startsWith('/uploads') ||
      storageKey.startsWith('/branding')
    ) {
      return storageKey;
    }

    if (hasR2Configuration()) {
      if (R2_PUBLIC_DOMAIN && USE_R2_PUBLIC_DOMAIN) {
        return `${R2_PUBLIC_DOMAIN.replace(/\/$/, '')}/${cleanKey}`;
      }
      return mediaUrlFromStorageKey(cleanKey, getPublicPlatformOrigin());
    }

    // عندما لا يكون R2 مضبوطاً في بيئة التطوير، الصور والوسائط العامة تحال مباشرة إلى /uploads/...
    if (!isProductionRuntime()) {
      return `/uploads/${cleanKey}`;
    }

    return `/api/v1/media/${cleanKey}`;
  }

  /**
   * توليد رابط رفع موقع ومباشر (Presigned PUT URL) لرفع الملفات من المتصفح مباشرة إلى R2
   * يوقع Content-Type ولا يقوم بتعديل إعدادات CORS على الحاوية أثناء الرفع الروتيني
   */
  static async getUploadPresignedUrl(
    key: string,
    contentType: string,
    expiresInSeconds: number = 3600
  ): Promise<{ uploadUrl: string; publicUrl: string; key: string } | null> {
    if (!s3Client) return null;
    try {
      const command = new PutObjectCommand({
        Bucket: R2_BUCKET_NAME,
        Key: key,
        ContentType: contentType,
      });
      const uploadUrl = await getSignedUrl(s3Client, command, { expiresIn: expiresInSeconds });
      const publicUrl = this.getPublicMediaUrl(key);
      return { uploadUrl, publicUrl, key };
    } catch (err) {
      console.error('Failed to generate presigned upload URL:', err);
      return null;
    }
  }

  /**
   * حذف ملف من R2 أو التخزين المحلي
   */
  static async deleteMedia(key: string): Promise<boolean> {
    if (!key) return false;
    const cleanKey = key.replace(/\.\./g, '').replace(/^\/+/, '');
    if (s3Client) {
      try {
        const { DeleteObjectCommand } = await import('@aws-sdk/client-s3');
        await s3Client.send(
          new DeleteObjectCommand({
            Bucket: R2_BUCKET_NAME,
            Key: cleanKey,
          })
        );
        return true;
      } catch (err) {
        console.error('Failed to delete object from R2:', err);
        return false;
      }
    }

    try {
      const fs = await import('fs');
      const { filePath, baseDir } = getLocalStoragePath(cleanKey);
      if (!isPathInsideDir(filePath, baseDir)) {
        return false;
      }
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
      return true;
    } catch {
      return false;
    }
  }

  /**
   * حذف مجموعة مفاتيح بشكل idempotent مع تقرير بالنتيجة لكل ملف.
   * DeleteObject في R2 لا يحتاج معرفة مسبقة بوجود الملف، لذلك إعادة المحاولة
   * آمنة، كما أن الملفات الفاشلة تُعاد للمشرف في سجل التدقيق.
   */
  static async deleteMediaMany(keys: Iterable<string>): Promise<{
    requested: number;
    deleted: number;
    failed: number;
    deletedKeys: string[];
    failedKeys: string[];
  }> {
    const uniqueKeys = Array.from(
      new Set(
        Array.from(keys).filter((key): key is string => isValidGeneratedStorageKey(key))
      )
    );

    const results = await Promise.all(
      uniqueKeys.map(async (key) => ({ key, success: await StorageService.deleteMedia(key) }))
    );
    const deletedKeys = results.filter((result) => result.success).map((result) => result.key);
    const failedKeys = results.filter((result) => !result.success).map((result) => result.key);

    return {
      requested: uniqueKeys.length,
      deleted: deletedKeys.length,
      failed: failedKeys.length,
      deletedKeys,
      failedKeys,
    };
  }

  /**
   * التحقق من وجود الملف في R2 أو التخزين المحلي وجلب معلوماته الرسمية الموثوقة
   */
  static async verifyMediaObject(key: string): Promise<{ exists: boolean; sizeBytes?: number; contentType?: string }> {
    if (!key) return { exists: false };
    const cleanKey = key.replace(/\.\./g, '').replace(/^\/+/, '');
    if (s3Client) {
      try {
        const { HeadObjectCommand } = await import('@aws-sdk/client-s3');
        const head = await s3Client.send(
          new HeadObjectCommand({
            Bucket: R2_BUCKET_NAME,
            Key: cleanKey,
          })
        );
        return {
          exists: true,
          sizeBytes: head.ContentLength,
          contentType: head.ContentType,
        };
      } catch {
        return { exists: false };
      }
    }

    if (!isProductionRuntime()) {
      try {
        const fs = await import('fs');
        const { filePath, baseDir } = getLocalStoragePath(cleanKey);
        if (!isPathInsideDir(filePath, baseDir)) {
          return { exists: false };
        }
        if (fs.existsSync(filePath)) {
          const stats = fs.statSync(filePath);
          const ext = cleanKey.split('.').pop()?.toLowerCase() || '';
          const config = Object.values(CATEGORY_CONFIGS).find((c) => c.extensionToMime[ext]);
          const inferredContentType = config?.extensionToMime[ext] || 'application/octet-stream';
          return { exists: true, sizeBytes: stats.size, contentType: inferredContentType };
        }
      } catch {
        return { exists: false };
      }
    }

    return { exists: false };
  }

  /**
   * رفع أصل إعلامي جديد من لوحة الإدارة إلى R2 أو مجلد الرفع المحلي
   * يتم تخزين الصوتيات محلياً في .private_storage للحفاظ على الحماية التامة
   */
  static async uploadMedia(key: string, body: Buffer, contentType: string): Promise<{ key: string; publicUrl: string }> {
    const cleanKey = key.replace(/\.\./g, '').replace(/^\/+/, '');

    // 1. في حال توفر اتصال Cloudflare R2
    if (s3Client) {
      await s3Client.send(
        new PutObjectCommand({
          Bucket: R2_BUCKET_NAME,
          Key: cleanKey,
          Body: body,
          ContentType: contentType,
        })
      );
      const publicUrl = this.getPublicMediaUrl(cleanKey);
      return { key: cleanKey, publicUrl };
    }

    // 2. في بيئة الإنتاج السحابية (Vercel): يُمنع التخزين المحلي تماماً ويجب أن يفشل بوضوح
    if (isProductionRuntime()) {
      throw new Error('خدمة التخزين السحابي Cloudflare R2 غير متاحة في بيئة الإنتاج');
    }

    // 3. التخزين الاحتياطي المحلي متاح فقط في بيئة التطوير المحلية المستقلة
    try {
      const fs = await import('fs');
      const pathModule = await import('path');
      const { filePath, baseDir } = getLocalStoragePath(cleanKey);
      if (!isPathInsideDir(filePath, baseDir)) {
        throw new Error('مسار التخزين غير مسموح به');
      }
      const dir = pathModule.dirname(filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(filePath, body);
      const publicUrl = this.getPublicMediaUrl(cleanKey);
      return { key: cleanKey, publicUrl };
    } catch (fsErr) {
      console.error('Local fallback upload failed:', fsErr);
      throw new Error('تعذر حفظ الملف في التخزين المحلي');
    }
  }
}

/**
 * تحليل ملفات الترجمة والنصوص المتزامنة (SRT / VTT / JSON) مع التحقق الصارم من التوقيتات الإيجابية المنتهية
 */
export function parseSubtitleText(
  content: string
): Array<{ id: string; startMs: number; endMs: number; text: string; order: number }> {
  if (typeof content !== 'string') return [];
  const boundedContent = content.length > 5 * 1024 * 1024 ? content.slice(0, 5 * 1024 * 1024) : content;
  const segments: Array<{ id: string; startMs: number; endMs: number; text: string; order: number }> = [];
  const clean = boundedContent.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const MAX_SEGMENTS = 5000;

  // تحقق مما إذا كان المحتوى JSON مسبقاً
  if (clean.trim().startsWith('[') || clean.trim().startsWith('{')) {
    try {
      const parsed = JSON.parse(clean);
      const list = Array.isArray(parsed) ? parsed : (parsed.segments || []);
      if (Array.isArray(list)) {
        for (let idx = 0; idx < list.length && segments.length < MAX_SEGMENTS; idx++) {
          const item = list[idx];
          if (!item || typeof item !== 'object') continue;
          const startMs = Number(item.startMs);
          const endMs = Number(item.endMs);
          const rawText = String(item.text || item.content || '').trim();
          if (
            Number.isFinite(startMs) &&
            Number.isFinite(endMs) &&
            startMs >= 0 &&
            endMs > startMs &&
            rawText.length > 0
          ) {
            segments.push({
              id: String(item.id || `seg-${segments.length + 1}`).slice(0, 64),
              startMs: Math.round(startMs),
              endMs: Math.round(endMs),
              text: rawText.slice(0, 5000),
              order: segments.length + 1,
            });
          }
        }
        return segments;
      }
    } catch {}
  }

  // معالجة SRT / WebVTT
  const blocks = clean.split(/\n\s*\n/);
  const timeRegex = /(?:(\d{1,2}):)?(\d{2}):(\d{2})[,.](\d{3})\s*-->\s*(?:(\d{1,2}):)?(\d{2}):(\d{2})[,.](\d{3})/;

  for (const block of blocks) {
    if (segments.length >= MAX_SEGMENTS) break;
    const lines = block.trim().split('\n').filter(Boolean);
    if (lines.length === 0) continue;

    let timeLineIdx = -1;
    for (let i = 0; i < lines.length; i++) {
      if (timeRegex.test(lines[i])) {
        timeLineIdx = i;
        break;
      }
    }

    if (timeLineIdx === -1) continue;

    const match = lines[timeLineIdx].match(timeRegex);
    if (!match) continue;

    const startH = match[1] ? parseInt(match[1], 10) : 0;
    const startM = parseInt(match[2], 10);
    const startS = parseInt(match[3], 10);
    const startMs = parseInt(match[4], 10);

    const endH = match[5] ? parseInt(match[5], 10) : 0;
    const endM = parseInt(match[6], 10);
    const endS = parseInt(match[7], 10);
    const endMs = parseInt(match[8], 10);

    const totalStartMs = (startH * 3600 + startM * 60 + startS) * 1000 + startMs;
    const totalEndMs = (endH * 3600 + endM * 60 + endS) * 1000 + endMs;

    // التحقق الصارم من أن التوقيتات منتهية، موجبة، ونهاية المقطع أكبر تماماً من بدايته
    if (
      !Number.isFinite(totalStartMs) ||
      !Number.isFinite(totalEndMs) ||
      totalStartMs < 0 ||
      totalEndMs <= totalStartMs
    ) {
      continue;
    }

    const textLines = lines
      .slice(timeLineIdx + 1)
      .map((l) => l.replace(/<[^>]*>/g, '').trim())
      .filter(Boolean);
    const text = textLines.join(' ').trim();

    if (text) {
      segments.push({
        id: `seg-${segments.length + 1}`,
        startMs: totalStartMs,
        endMs: totalEndMs,
        text: text.slice(0, 5000),
        order: segments.length + 1,
      });
    }
  }

  return segments;
}
