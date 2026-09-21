// ============================================================
// Admin Operations Shared API Utilities
// أدوات مشتركة لعمليات إدارة المستخدمين والاستحقاقات وأقسام الرئيسية
// ============================================================

import { NextResponse } from 'next/server';
import { isValidObjectId } from 'mongoose';
import { AdminAuditLog } from '@/lib/db/models';

/** جميع استجابات عمليات الإدارة تمنع التخزين المؤقت */
export const NO_STORE_HEADERS = {
  'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
  Pragma: 'no-cache',
  Expires: '0',
} as const;

const MAX_ADMIN_JSON_BODY_BYTES = 512 * 1024;

/** قراءة جسم JSON لواجهات الإدارة مع حد حجم ونوع محتوى واضحين */
export async function parseAdminJsonBody(
  req: Request,
  maxBytes: number = MAX_ADMIN_JSON_BODY_BYTES
): Promise<
  | { ok: true; body: Record<string, unknown> }
  | { ok: false; status: number; error: string }
> {
  const contentType = req.headers.get('content-type') || '';
  if (!contentType.toLowerCase().includes('application/json')) {
    return { ok: false, status: 415, error: 'نوع المحتوى يجب أن يكون application/json' };
  }

  const contentLength = Number(req.headers.get('content-length') || '0');
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    return { ok: false, status: 413, error: 'حجم الطلب كبير جداً' };
  }

  try {
    const body = await req.json();
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return { ok: false, status: 400, error: 'بيانات JSON غير صالحة' };
    }
    return { ok: true, body: body as Record<string, unknown> };
  } catch {
    return { ok: false, status: 400, error: 'صيغة البيانات غير صالحة' };
  }
}

export function jsonOk<T>(data: T, status: number = 200) {
  return NextResponse.json(data, { status, headers: NO_STORE_HEADERS });
}

export function jsonError(error: string, status: number = 400, extra?: Record<string, unknown>) {
  return NextResponse.json({ error, ...extra }, { status, headers: NO_STORE_HEADERS });
}

/** أدوار التعديل الكاملة لعمليات الإدارة الحساسة */
export const OPERATIONS_WRITE_ROLES = ['SUPER_ADMIN', 'ADMIN'] as const;

/** فحص صلاحية المشرف للتعديل */
export function canManageOperations(role: string): boolean {
  return (OPERATIONS_WRITE_ROLES as readonly string[]).includes(role);
}

/** فحص صحة معرف مونغو */
export function isValidMongoId(id: unknown): id is string {
  return typeof id === 'string' && isValidObjectId(id);
}

/** تنظيف النصوص من الرموز غير المرئية وحروف التحكم */
export function cleanText(input: unknown): string {
  if (typeof input !== 'string') return '';
  return input.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim();
}

/** رفض أي محاولة لحقن وسوم HTML */
export function containsHtml(text: string): boolean {
  return /<[\s!a-zA-Z/]/.test(text);
}

/** تحويل نصوص البحث إلى تعبير نمطي آمن دون حقن ReDoS */
export function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** تطبيع مفتاح القسم (slug) باللغة الإنجليزية والأرقام والشرطات */
export function normalizeSectionKey(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[\s_]+/g, '_')
    .replace(/[^a-z0-9_-]/g, '')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50);
}

/** كتابة سجل تدقيق آمن للعمليات — استبعاد كلمات المرور والتوكنات وبيانات الدفع الحساسة */
export interface AuditLogParams {
  adminUserId: string;
  action: string;
  targetEntity: 'User' | 'Entitlement' | 'HomepageSection' | 'AdminUser';
  entityId: string;
  previousState?: Record<string, unknown> | null;
  newState?: Record<string, unknown> | null;
}

export async function writeOperationsAudit(params: AuditLogParams): Promise<void> {
  try {
    // تصفية أي حقول حساسة قد تتسرب عن غير قصد
    const sanitize = (state?: Record<string, unknown> | null) => {
      if (!state) return undefined;
      const clean: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(state)) {
        if (
          /password|hash|token|secret|cvv|card|authorization/i.test(k)
        ) {
          continue;
        }
        clean[k] = v;
      }
      return clean;
    };

    await AdminAuditLog.create({
      adminUserId: params.adminUserId,
      action: params.action,
      targetEntity: params.targetEntity,
      entityId: params.entityId,
      previousState: sanitize(params.previousState),
      newState: sanitize(params.newState),
    });
  } catch (error) {
    console.error('Operations audit log error:', error);
  }
}
