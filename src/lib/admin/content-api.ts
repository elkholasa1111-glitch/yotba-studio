// ============================================================
// Shared helpers for the admin catalog CMS API.
// أدوات مشتركة لواجهات إدارة المحتوى: تحقق صارم وتدقيق آمن
// ============================================================

import { NextResponse } from 'next/server';
import { AdminAuditLog, Series, Episode, ShareAsset } from '@/lib/db/models';
import { connectDB } from '@/lib/db/connect';
import {
  extractStorageKey,
  isValidGeneratedStorageKey,
  StorageService,
  verifyUploadTicket,
  type ValidationResult,
  type UploadAuthorizationTicket,
} from '@/lib/storage';

/** بيانات الإدارة لا يجب تخزينها في أي ذاكرة وسيطة */
export const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;

export function jsonOk(data: unknown, status: number = 200) {
  return NextResponse.json(data, { status, headers: NO_STORE_HEADERS });
}

export function jsonError(error: string, status: number = 400, extra?: Record<string, unknown>) {
  return NextResponse.json({ error, ...extra }, { status, headers: NO_STORE_HEADERS });
}

/** تحويل أي نص إلى معرّف URL آمن مع الحفاظ على الحروف العربية */
export function slugify(input: string): string {
  return input
    .toString()
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, '-')
    .replace(/[^\p{L}\p{N}-]/gu, '')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120);
}

export function isSafeHttpUrl(value: string): boolean {
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > 500) return false;
  try {
    const url = new URL(trimmed);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
    // لا نقبل بيانات اعتماد مضمّنة أو محارف تحكم يمكنها تغيير تفسير الرابط.
    if (url.username || url.password || /[\u0000-\u001F\u007F]/.test(trimmed)) return false;
    return Boolean(url.hostname);
  } catch {
    return false;
  }
}

/** روابط أصول المنصة: HTTP(S) آمن أو مسار داخلي معروف من الرفع المحلي. */
export function isSafeMediaUrl(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 500 || /[\u0000-\u001F\u007F]/.test(trimmed)) return false;
  if (!trimmed.startsWith('/')) return isSafeHttpUrl(trimmed);

  // نسمح فقط بمسارات الأصول التي تنشئها المنصة، ونرفض traversal و protocol-relative URLs.
  if (trimmed.startsWith('//') || trimmed.includes('\\') || /(^|\/)\.\.?(?=\/|$)/.test(trimmed)) return false;
  return /^\/(?:uploads|api\/v1\/media|branding|posters|audio)(?:\/|$)/.test(trimmed);
}

/** يرفض أي محاولة لحقن وسوم HTML في نصوص المحتوى */
export function containsHtml(text: string): boolean {
  return /<[\s!a-zA-Z/]/.test(text);
}

/** رفض الأحرف التحكمية غير المرئية من نص المستخدم */
export function stripControlChars(text: string): string {
  return text.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '');
}

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isNonEmptyString(value: unknown, min: number, max: number): value is string {
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  return trimmed.length >= min && trimmed.length <= max;
}

export function isBoundedInt(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max;
}

export function isBoundedNumber(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
}

export function parseStringArray(value: unknown, maxItems: number, maxLen: number): string[] | null {
  if (!Array.isArray(value)) return null;
  if (value.length > maxItems) return null;
  const out: string[] = [];
  for (const item of value) {
    if (typeof item !== 'string') return null;
    const cleaned = stripControlChars(item).trim();
    if (cleaned.length === 0 || cleaned.length > maxLen || containsHtml(cleaned)) return null;
    out.push(cleaned);
  }
  return out;
}

export interface AuditEntry {
  adminUserId: string;
  action: string;
  targetEntity: string;
  entityId: string;
  previousState?: Record<string, unknown> | null;
  newState?: Record<string, unknown> | null;
}

/** كتابة سجل تدقيق مع تلخيص الحقول فقط — لا أجساد نصوص أو مفاتيح صوتية كاملة */
export async function writeAudit(entry: AuditEntry): Promise<void> {
  try {
    await AdminAuditLog.create({
      adminUserId: entry.adminUserId,
      action: entry.action,
      targetEntity: entry.targetEntity,
      entityId: entry.entityId,
      previousState: entry.previousState ?? undefined,
      newState: entry.newState ?? undefined,
    });
  } catch (error) {
    // لا نُفشل العملية الأساسية إذا تعذر التدقيق، لكن نسجّل الخطأ للمراجعة.
    console.error('Admin audit write failed:', error);
  }
}

/** استخراج الحقول المتغيرة فقط بين حالتين لتسجيلها في التدقيق */
export function diffFields(
  before: Record<string, unknown>,
  after: Record<string, unknown>
): { previousState: Record<string, unknown>; newState: Record<string, unknown> } | null {
  const previousState: Record<string, unknown> = {};
  const newState: Record<string, unknown> = {};
  let changed = false;
  for (const key of Object.keys(after)) {
    const a = before[key];
    const b = after[key];
    if (JSON.stringify(a ?? null) !== JSON.stringify(b ?? null)) {
      previousState[key] = a ?? null;
      newState[key] = b ?? null;
      changed = true;
    }
  }
  return changed ? { previousState, newState } : null;
}

// ============================================================
// Media Reference Checking & Lifecycle Cleanup Helpers
// ============================================================

export interface MediaReferenceRecords {
  series?: any[];
  episodes?: any[];
  shareAssets?: any[];
}

export interface MediaReferenceOptions {
  records?: MediaReferenceRecords;
}

export type StorageCleanupReport = Awaited<ReturnType<typeof StorageService.deleteMediaMany>> & {
  skippedReferenced: number;
  skippedKeys: string[];
  referenceCheckFailed?: boolean;
};

export function collectMediaKeysFromRecord(record: any, fields: string[]): Set<string> {
  const keys = new Set<string>();
  if (!record) return keys;
  for (const field of fields) {
    const val = record[field];
    if (typeof val === 'string' && val.trim()) {
      const key =
        extractStorageKey(val) ||
        (isValidGeneratedStorageKey(val.replace(/^\/+/, '')) ? val.trim().replace(/^\/+/, '') : null);
      if (key) keys.add(key);
    }
  }
  return keys;
}

export function mergeMediaKeys(target: Set<string>, source: Set<string>): void {
  for (const key of source) target.add(key);
}

export async function findReferencedMediaKeys(
  keys: Iterable<string>,
  options?: MediaReferenceOptions
): Promise<Set<string>> {
  const keySet = new Set<string>();
  for (const k of keys) {
    if (typeof k === 'string' && k.trim()) {
      const clean =
        extractStorageKey(k) ||
        (isValidGeneratedStorageKey(k.replace(/^\/+/, '')) ? k.trim().replace(/^\/+/, '') : null);
      if (clean) keySet.add(clean);
    }
  }
  if (keySet.size === 0) return new Set();

  let remainingSeries: any[];
  let remainingEpisodes: any[];
  let remainingShareAssets: any[];

  if (options?.records) {
    remainingSeries = options.records.series || [];
    remainingEpisodes = options.records.episodes || [];
    remainingShareAssets = options.records.shareAssets || [];
  } else {
    const conn = await connectDB();
    if (!conn) {
      throw new Error('Database connection unavailable for reference check');
    }
    const [s, e, sa] = await Promise.all([
      Series.find().select('posterUrl heroArtworkUrl shareVideoUrl').lean(),
      Episode.find().select('audioStorageKey audioPublicUrl artworkOverride').lean(),
      ShareAsset.find().select('storageKey publicUrl').lean(),
    ]);
    remainingSeries = s as any[];
    remainingEpisodes = e as any[];
    remainingShareAssets = sa as any[];
  }

  const referenced = new Set<string>();
  for (const record of remainingSeries) {
    mergeMediaKeys(referenced, collectMediaKeysFromRecord(record, ['posterUrl', 'heroArtworkUrl', 'shareVideoUrl']));
  }
  for (const record of remainingEpisodes) {
    mergeMediaKeys(referenced, collectMediaKeysFromRecord(record, ['audioStorageKey', 'audioPublicUrl', 'artworkOverride']));
  }
  for (const record of remainingShareAssets) {
    mergeMediaKeys(referenced, collectMediaKeysFromRecord(record, ['storageKey', 'publicUrl']));
  }

  const result = new Set<string>();
  for (const key of keySet) {
    if (referenced.has(key)) {
      result.add(key);
    }
  }
  return result;
}

export async function isStorageKeyReferencedInDb(
  storageKey: string,
  options?: MediaReferenceOptions
): Promise<boolean> {
  const cleanKey =
    extractStorageKey(storageKey) ||
    (isValidGeneratedStorageKey(storageKey.replace(/^\/+/, '')) ? storageKey.trim().replace(/^\/+/, '') : null);
  if (!cleanKey) return false;
  const referenced = await findReferencedMediaKeys([cleanKey], options);
  return referenced.has(cleanKey);
}

export async function cleanupContentMedia(
  keys: Iterable<string>,
  options?: MediaReferenceOptions
): Promise<StorageCleanupReport> {
  const uniqueKeys = Array.from(new Set(keys))
    .map((k) =>
      typeof k === 'string'
        ? extractStorageKey(k) || (isValidGeneratedStorageKey(k.replace(/^\/+/, '')) ? k.trim().replace(/^\/+/, '') : null)
        : null
    )
    .filter((k): k is string => Boolean(k));

  if (uniqueKeys.length === 0) {
    return {
      requested: 0,
      deleted: 0,
      failed: 0,
      deletedKeys: [],
      failedKeys: [],
      skippedReferenced: 0,
      skippedKeys: [],
    };
  }

  try {
    const referenced = await findReferencedMediaKeys(uniqueKeys, options);
    const deletableKeys = uniqueKeys.filter((key) => !referenced.has(key));
    const skippedKeys = uniqueKeys.filter((key) => referenced.has(key));
    const deleted = await StorageService.deleteMediaMany(deletableKeys);
    return { ...deleted, skippedReferenced: skippedKeys.length, skippedKeys };
  } catch (error) {
    console.error('Content media reference check failed:', error);
    return {
      requested: uniqueKeys.length,
      deleted: 0,
      failed: 0,
      deletedKeys: [],
      failedKeys: [],
      skippedReferenced: uniqueKeys.length,
      skippedKeys: uniqueKeys,
      referenceCheckFailed: true,
    };
  }
}

export interface SeriesMediaUpdates {
  posterUrl?: string | null;
  heroArtworkUrl?: string | null;
  shareVideoUrl?: string | null;
}

export interface EpisodeMediaUpdates {
  artworkOverride?: string | null;
  audioStorageKey?: string | null;
  audioPublicUrl?: string | null;
}

export function buildSeriesMediaUpdates(
  updates: Record<string, unknown>
): SeriesMediaUpdates {
  const mediaUpdates: SeriesMediaUpdates = {};
  if (Object.prototype.hasOwnProperty.call(updates, 'posterUrl')) {
    mediaUpdates.posterUrl = updates.posterUrl as string | null | undefined;
  }
  if (Object.prototype.hasOwnProperty.call(updates, 'heroArtworkUrl')) {
    mediaUpdates.heroArtworkUrl = updates.heroArtworkUrl as string | null | undefined;
  }
  if (Object.prototype.hasOwnProperty.call(updates, 'shareVideoUrl')) {
    mediaUpdates.shareVideoUrl = updates.shareVideoUrl as string | null | undefined;
  }
  return mediaUpdates;
}

export function buildEpisodeMediaUpdates(
  updates: Record<string, unknown>
): EpisodeMediaUpdates {
  const mediaUpdates: EpisodeMediaUpdates = {};
  if (Object.prototype.hasOwnProperty.call(updates, 'artworkOverride')) {
    mediaUpdates.artworkOverride = updates.artworkOverride as string | null | undefined;
  }
  if (Object.prototype.hasOwnProperty.call(updates, 'audioStorageKey')) {
    mediaUpdates.audioStorageKey = updates.audioStorageKey as string | null | undefined;
  }
  if (Object.prototype.hasOwnProperty.call(updates, 'audioPublicUrl')) {
    mediaUpdates.audioPublicUrl = updates.audioPublicUrl as string | null | undefined;
  }
  return mediaUpdates;
}

function isPropertySupplied(obj: object, prop: string): boolean {
  return Object.prototype.hasOwnProperty.call(obj, prop);
}

function isMediaValueCleared(val: unknown): boolean {
  return val === null || val === undefined || (typeof val === 'string' && val.trim().length === 0);
}

export function collectReplacedSeriesMediaKeys(
  currentSeries:
    | {
        posterUrl?: string | null;
        heroArtworkUrl?: string | null;
        shareVideoUrl?: string | null;
      }
    | null
    | undefined,
  updates: SeriesMediaUpdates | Record<string, unknown>
): Set<string> {
  const replaced = new Set<string>();
  if (!currentSeries || !updates) return replaced;

  if (isPropertySupplied(updates, 'posterUrl')) {
    const val = (updates as any).posterUrl;
    const oldKey = extractStorageKey(currentSeries.posterUrl);
    if (isMediaValueCleared(val)) {
      if (oldKey) replaced.add(oldKey);
    } else {
      const newKey = extractStorageKey(val);
      if (oldKey && oldKey !== newKey) {
        replaced.add(oldKey);
      }
    }
  }

  if (isPropertySupplied(updates, 'heroArtworkUrl')) {
    const val = (updates as any).heroArtworkUrl;
    const oldKey = extractStorageKey(currentSeries.heroArtworkUrl);
    if (isMediaValueCleared(val)) {
      if (oldKey) replaced.add(oldKey);
    } else {
      const newKey = extractStorageKey(val);
      if (oldKey && oldKey !== newKey) {
        replaced.add(oldKey);
      }
    }
  }

  if (isPropertySupplied(updates, 'shareVideoUrl')) {
    const val = (updates as any).shareVideoUrl;
    const oldKey = extractStorageKey(currentSeries.shareVideoUrl);
    if (isMediaValueCleared(val)) {
      if (oldKey) replaced.add(oldKey);
    } else {
      const newKey = extractStorageKey(val);
      if (oldKey && oldKey !== newKey) {
        replaced.add(oldKey);
      }
    }
  }

  return replaced;
}

export function collectReplacedEpisodeMediaKeys(
  currentEpisode:
    | {
        artworkOverride?: string | null;
        audioStorageKey?: string | null;
        audioPublicUrl?: string | null;
      }
    | null
    | undefined,
  updates: EpisodeMediaUpdates | Record<string, unknown>
): Set<string> {
  const replaced = new Set<string>();
  if (!currentEpisode || !updates) return replaced;

  if (isPropertySupplied(updates, 'artworkOverride')) {
    const val = (updates as any).artworkOverride;
    const oldKey = extractStorageKey(currentEpisode.artworkOverride);
    if (isMediaValueCleared(val)) {
      if (oldKey) replaced.add(oldKey);
    } else {
      const newKey = extractStorageKey(val);
      if (oldKey && oldKey !== newKey) {
        replaced.add(oldKey);
      }
    }
  }

  const rawOldAudioKey = currentEpisode.audioStorageKey?.trim().replace(/^\/+/, '') || '';
  const oldAudioKey =
    extractStorageKey(currentEpisode.audioStorageKey) ||
    (isValidGeneratedStorageKey(rawOldAudioKey) ? rawOldAudioKey : null);

  let newAudioKey: string | null = null;
  let audioStorageKeyChanged = false;

  if (isPropertySupplied(updates, 'audioStorageKey')) {
    const val = (updates as any).audioStorageKey;
    if (isMediaValueCleared(val)) {
      audioStorageKeyChanged = true;
      if (oldAudioKey) replaced.add(oldAudioKey);
    } else {
      const rawNewAudioKey = typeof val === 'string' ? val.trim().replace(/^\/+/, '') : '';
      newAudioKey =
        extractStorageKey(val) ||
        (isValidGeneratedStorageKey(rawNewAudioKey) ? rawNewAudioKey : null);
      if (oldAudioKey && oldAudioKey !== newAudioKey) {
        audioStorageKeyChanged = true;
        replaced.add(oldAudioKey);
      }
    }
  }

  if (audioStorageKeyChanged && newAudioKey && currentEpisode.audioPublicUrl) {
    const oldPublicKey = extractStorageKey(currentEpisode.audioPublicUrl);
    if (oldPublicKey && oldPublicKey !== newAudioKey) {
      replaced.add(oldPublicKey);
    }
  }

  if (isPropertySupplied(updates, 'audioPublicUrl')) {
    const val = (updates as any).audioPublicUrl;
    const oldPublicKey = extractStorageKey(currentEpisode.audioPublicUrl);
    if (isMediaValueCleared(val)) {
      if (oldPublicKey) replaced.add(oldPublicKey);
    } else {
      const newPublicKey = extractStorageKey(val);
      if (oldPublicKey && oldPublicKey !== newPublicKey) {
        replaced.add(oldPublicKey);
      }
    }
  }

  return replaced;
}

export function validateUploadDeleteTicket(
  ticket: unknown,
  adminUserId: string,
  storageKey: string
): ValidationResult<UploadAuthorizationTicket> {
  if (!ticket || typeof ticket !== 'string') {
    return { ok: false, status: 400, error: 'رمز تفويض الرفع (ticket) مطلوب لإجراء الحذف' };
  }
  return verifyUploadTicket(ticket, adminUserId, storageKey);
}
