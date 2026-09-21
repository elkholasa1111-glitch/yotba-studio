// ============================================================
// Admin Single User Detail API — تفاصيل المستخدم واستحقاقاته
// ============================================================

import { getCurrentAdmin } from '@/lib/auth';
import { connectDB } from '@/lib/db/connect';
import { User, Entitlement, Purchase, Subscription } from '@/lib/db/models';
import {
  jsonOk,
  jsonError,
  canManageOperations,
  isValidMongoId,
  cleanText,
} from '@/lib/admin/operations-api';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await getCurrentAdmin();
  if (!admin) {
    return jsonError('غير مصرح لك بالوصول', 401);
  }
  if (!canManageOperations(admin.role)) {
    return jsonError('ليس لديك صلاحية عرض بيانات المستخدمين (مطلوب ADMIN أو SUPER_ADMIN)', 403);
  }

  const conn = await connectDB();
  if (!conn) {
    return jsonError('قاعدة البيانات غير متاحة حالياً', 503);
  }

  const { id } = await params;
  const userId = cleanText(id);
  if (!isValidMongoId(userId)) {
    return jsonError('معرّف المستخدم غير صالح', 400);
  }

  try {
    const user = (await User.findById(userId).lean()) as any;
    if (!user) {
      return jsonError('المستخدم غير موجود', 404);
    }

    const [entitlements, purchases, subscriptions] = await Promise.all([
      Entitlement.find({ userId })
        .sort({ createdAt: -1 })
        .populate('targetSeriesId', 'title slug')
        .populate('targetSeasonId', 'seasonNumber title')
        .populate('grantedByAdminId', 'displayName email')
        .lean(),
      Purchase.find({ userId })
        .sort({ createdAt: -1 })
        .populate('seriesId', 'title slug')
        .populate('seasonId', 'seasonNumber title')
        .select('-paymentMetadata')
        .lean(),
      Subscription.find({ userId })
        .sort({ createdAt: -1 })
        .select('-providerSubscriptionId')
        .lean(),
    ]);

    return jsonOk({
      user: {
        _id: user._id.toString(),
        email: user.email,
        displayName: user.displayName,
        status: user.status,
        emailVerified: Boolean(user.emailVerified),
        createdAt: user.createdAt,
        lastLoginAt: user.lastLoginAt ?? null,
      },
      entitlements: entitlements.map((e: any) => ({
        _id: e._id.toString(),
        type: e.type,
        source: e.source,
        targetSeries: e.targetSeriesId
          ? { _id: e.targetSeriesId._id.toString(), title: e.targetSeriesId.title, slug: e.targetSeriesId.slug }
          : null,
        targetSeason: e.targetSeasonId
          ? { _id: e.targetSeasonId._id.toString(), seasonNumber: e.targetSeasonId.seasonNumber, title: e.targetSeasonId.title }
          : null,
        validFrom: e.validFrom,
        validUntil: e.validUntil,
        isActive: Boolean(e.isActive),
        grantedBy: e.grantedByAdminId
          ? { displayName: e.grantedByAdminId.displayName, email: e.grantedByAdminId.email }
          : null,
        createdAt: e.createdAt,
      })),
      purchases: purchases.map((p: any) => ({
        _id: p._id.toString(),
        orderNumber: p.orderNumber,
        amount: p.amount,
        currency: p.currency,
        status: p.status,
        source: p.source,
        series: p.seriesId ? { title: p.seriesId.title, slug: p.seriesId.slug } : null,
        season: p.seasonId ? { title: p.seasonId.title, seasonNumber: p.seasonId.seasonNumber } : null,
        createdAt: p.createdAt,
      })),
      subscriptions: subscriptions.map((s: any) => ({
        _id: s._id.toString(),
        plan: s.plan,
        price: s.price,
        currency: s.currency,
        status: s.status,
        currentPeriodStart: s.currentPeriodStart,
        currentPeriodEnd: s.currentPeriodEnd,
        cancelAtPeriodEnd: Boolean(s.cancelAtPeriodEnd),
        source: s.source,
        createdAt: s.createdAt,
      })),
    });
  } catch (error) {
    console.error('Admin user [id] route error:', error);
    return jsonError('فشل جلب تفاصيل المستخدم', 500);
  }
}
