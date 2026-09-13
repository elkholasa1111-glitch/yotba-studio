// ============================================================
// Protected Social Links Settings API
// إدارة روابط السوشيال ميديا التي تظهر في فوتر المنصة العامة
// ============================================================

import { getCurrentAdmin } from '@/lib/auth';
import { connectDB } from '@/lib/db/connect';
import { AdminAuditLog, PlatformSetting } from '@/lib/db/models';
import { parseAdminJsonBody, canManageOperations, jsonError, jsonOk } from '@/lib/admin/operations-api';
import {
  emptySocialLinks,
  sanitizeSocialLinks,
  sanitizeSocialUrl,
  SOCIAL_PLATFORMS,
} from '@/lib/config/social';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const SETTING_KEY = 'social_links';

async function readLinks() {
  const setting = await PlatformSetting.findOne({ key: SETTING_KEY }).lean();
  return sanitizeSocialLinks((setting as any)?.value);
}

export async function GET() {
  const admin = await getCurrentAdmin();
  if (!admin) return jsonError('غير مصرح لك — يرجى تسجيل الدخول كمسؤول', 401);

  const conn = await connectDB();
  if (!conn) return jsonOk({ links: emptySocialLinks(), source: 'default' });

  try {
    const setting = await PlatformSetting.findOne({ key: SETTING_KEY }).lean();
    return jsonOk({
      links: sanitizeSocialLinks((setting as any)?.value),
      source: setting ? 'admin' : 'default',
      updatedAt: (setting as any)?.updatedAt || null,
    });
  } catch (error) {
    console.error('Admin get social links error:', error);
    return jsonOk({ links: emptySocialLinks(), source: 'default' });
  }
}

export async function PUT(req: Request) {
  const admin = await getCurrentAdmin();
  if (!admin) return jsonError('غير مصرح لك — يرجى تسجيل الدخول كمسؤول', 401);
  if (!canManageOperations(admin.role)) {
    return jsonError('ليس لديك صلاحية تعديل روابط السوشيال ميديا', 403);
  }

  const parsed = await parseAdminJsonBody(req);
  if (!parsed.ok) return jsonError(parsed.error, parsed.status);

  const conn = await connectDB();
  if (!conn) return jsonError('قاعدة البيانات غير متاحة حالياً', 503);

  try {
    const previous = await readLinks();
    const links = { ...previous };

    for (const platform of SOCIAL_PLATFORMS) {
      if (!Object.prototype.hasOwnProperty.call(parsed.body, platform)) continue;
      const raw = parsed.body[platform];
      if (raw === null || (typeof raw === 'string' && raw.trim() === '')) {
        links[platform] = null;
        continue;
      }

      const sanitized = sanitizeSocialUrl(raw);
      if (!sanitized) {
        return jsonError(`رابط ${platform} غير صالح — استخدم رابط HTTP أو HTTPS صحيحاً`, 400);
      }
      links[platform] = sanitized;
    }

    await PlatformSetting.findOneAndUpdate(
      { key: SETTING_KEY },
      {
        key: SETTING_KEY,
        value: links,
        description: 'روابط حسابات المنصة على شبكات التواصل الاجتماعي',
        updatedByAdminId: admin.userId,
      },
      { upsert: true, new: true }
    );

    await AdminAuditLog.create({
      adminUserId: admin.userId,
      action: 'UPDATE_SOCIAL_LINKS',
      targetEntity: 'PlatformSetting',
      entityId: SETTING_KEY,
      previousState: previous,
      newState: links,
    });

    return jsonOk({ success: true, links });
  } catch (error) {
    console.error('Admin update social links error:', error);
    return jsonError('فشل حفظ روابط السوشيال ميديا', 500);
  }
}

