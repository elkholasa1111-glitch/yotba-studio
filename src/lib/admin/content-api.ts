// ============================================================
// Shared helpers for the admin catalog CMS API.
// أدوات مشتركة لواجهات إدارة المحتوى: تحقق صارم وتدقيق آمن
// ============================================================

import { NextResponse } from 'next/server';
import { AdminAuditLog } from '@/lib/db/models';

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
  if (value.length === 0 || value.length > 500) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

/** يرفض أي محاولة لحقن وسوم HTML في نصوص المحتوى */
export function containsHtml(text: string): boolean {
  return /<[\s!a-zA-Z/]/.test(text);
}

/** رفض الأحرف التحكمية غير المرئية من نص المستخدم */
export function stripControlChars(text: string): string {
  // eslint-disable-next-line no-control-regex
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
