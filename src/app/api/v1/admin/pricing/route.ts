// ============================================================
// Protected Admin Pricing Route - استوديو منصة "يُتبع..."
// إدارة وتعديل الأسعار المركزية بالدولار (موسم / شهري / سنوي)
// مقتصرة حصراً على المشرفين ذوي الصلاحيات العليا (SUPER_ADMIN / ADMIN)
// ============================================================

import { getCurrentAdmin } from '@/lib/auth';
import { connectDB } from '@/lib/db/connect';
import { PlatformSetting, AdminAuditLog } from '@/lib/db/models';
import {
  NO_STORE_HEADERS,
  jsonOk,
  jsonError,
  parseAdminJsonBody,
} from '@/lib/admin/operations-api';
import {
  isAuthorizedPricingMutationRole,
  validatePricingValues,
} from '@/lib/config/public-platform';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const DEFAULT_PRICING = {
  seasonUsd: 0.5,
  monthlyUsd: 1,
  annualUsd: 10,
};

// GET: جلب الأسعار المركزية الحالية للوحة الإدارة
export async function GET() {
  const admin = await getCurrentAdmin();
  if (!admin) {
    return jsonError('غير مصرح لك — يرجى تسجيل الدخول', 401);
  }

  const conn = await connectDB();
  if (!conn) {
    return jsonOk({
      ...DEFAULT_PRICING,
      source: 'default',
    });
  }

  try {
    const doc = await PlatformSetting.findOne({ key: 'pricing_usd' }).lean();
    if (doc && (doc as any).value) {
      const val = (doc as any).value;
      return jsonOk({
        seasonUsd: typeof val.seasonUsd === 'number' ? val.seasonUsd : DEFAULT_PRICING.seasonUsd,
        monthlyUsd: typeof val.monthlyUsd === 'number' ? val.monthlyUsd : DEFAULT_PRICING.monthlyUsd,
        annualUsd: typeof val.annualUsd === 'number' ? val.annualUsd : DEFAULT_PRICING.annualUsd,
        source: 'admin',
        updatedByAdminId: (doc as any).updatedByAdminId?.toString() || null,
        updatedAt: (doc as any).updatedAt || null,
      });
    }

    return jsonOk({
      ...DEFAULT_PRICING,
      source: 'default',
    });
  } catch (error) {
    console.error('Admin get pricing error:', error);
    return jsonOk({
      ...DEFAULT_PRICING,
      source: 'default',
    });
  }
}

// PUT: تحديث الأسعار المركزية (يتطلب SUPER_ADMIN أو ADMIN)
export async function PUT(req: Request) {
  const admin = await getCurrentAdmin();
  if (!admin) {
    return jsonError('غير مصرح لك — يرجى تسجيل الدخول كمسؤول', 401);
  }

  if (!isAuthorizedPricingMutationRole(admin.role)) {
    return jsonError('ليس لديك صلاحية تعديل الأسعار المركزية للمنصة', 403);
  }

  const parsed = await parseAdminJsonBody(req);
  if (!parsed.ok) {
    return jsonError(parsed.error, parsed.status);
  }

  const validation = validatePricingValues(parsed.body);
  if (!validation.ok) {
    return jsonError(validation.error, 400);
  }

  const conn = await connectDB();
  if (!conn) {
    return jsonError('قاعدة البيانات غير متاحة حالياً', 503);
  }

  try {
    const previous = await PlatformSetting.findOne({ key: 'pricing_usd' }).lean();

    await PlatformSetting.findOneAndUpdate(
      { key: 'pricing_usd' },
      {
        key: 'pricing_usd',
        value: validation.values,
        description: 'الأسعار المركزية بالدولار: موسم/شهري/سنوي',
        updatedByAdminId: admin.userId,
      },
      { upsert: true, new: true }
    );

    await AdminAuditLog.create({
      adminUserId: admin.userId,
      action: 'UPDATE_PRICING',
      targetEntity: 'PlatformSetting',
      entityId: 'pricing_usd',
      previousState: (previous as any)?.value || null,
      newState: validation.values,
    });

    return jsonOk({
      success: true,
      values: validation.values,
    });
  } catch (error) {
    console.error('Admin update pricing error:', error);
    return jsonError('فشل حفظ وتطبيق الأسعار الجديدة', 500);
  }
}
