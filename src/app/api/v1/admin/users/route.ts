// ============================================================
// Admin Users API — إدارة دورة حياة المستخدمين والبحث الآمن
// ============================================================

import { NextResponse } from 'next/server';
import { getCurrentAdmin } from '@/lib/auth';
import { connectDB } from '@/lib/db/connect';
import { User, Entitlement, Purchase, Subscription } from '@/lib/db/models';
import {
  jsonOk,
  jsonError,
  canManageOperations,
  isValidMongoId,
  cleanText,
  escapeRegex,
  writeOperationsAudit,
  parseAdminJsonBody,
} from '@/lib/admin/operations-api';

const ALLOWED_STATUSES = ['ACTIVE', 'SUSPENDED', 'BANNED', 'PENDING_VERIFICATION'] as const;
type UserStatus = (typeof ALLOWED_STATUSES)[number];

const TARGET_STATUSES = ['ACTIVE', 'SUSPENDED', 'BANNED'] as const;
type TargetStatus = (typeof TARGET_STATUSES)[number];

/** تحويل مستند المستخدم إلى DTO آمن تماماً بدون كلمات مرور أو رموز */
function sanitizeUserDto(user: any) {
  return {
    _id: user._id.toString(),
    email: user.email,
    displayName: user.displayName,
    status: user.status,
    emailVerified: Boolean(user.emailVerified),
    createdAt: user.createdAt,
    lastLoginAt: user.lastLoginAt ?? null,
  };
}

// GET: قائمة المستخدمين أو مستخدم محدد بالتفصيل
export async function GET(req: Request) {
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

  const { searchParams } = new URL(req.url);
  const singleId = cleanText(searchParams.get('id') || searchParams.get('userId'));

  // 1. طلب تفاصيل مستخدم واحد
  if (singleId) {
    if (!isValidMongoId(singleId)) {
      return jsonError('معرّف المستخدم غير صالح', 400);
    }

    try {
      const user = await User.findById(singleId).lean();
      if (!user) {
        return jsonError('المستخدم غير موجود', 404);
      }

      // جلب استحقاقات المستخدم ومشترياته واشتراكاته
      const [entitlements, purchases, subscriptions] = await Promise.all([
        Entitlement.find({ userId: singleId })
          .sort({ createdAt: -1 })
          .populate('targetSeriesId', 'title slug')
          .populate('targetSeasonId', 'seasonNumber title')
          .populate('grantedByAdminId', 'displayName email')
          .lean(),
        Purchase.find({ userId: singleId })
          .sort({ createdAt: -1 })
          .populate('seriesId', 'title slug')
          .populate('seasonId', 'seasonNumber title')
          .select('-paymentMetadata')
          .lean(),
        Subscription.find({ userId: singleId })
          .sort({ createdAt: -1 })
          .select('-providerSubscriptionId')
          .lean(),
      ]);

      return jsonOk({
        user: sanitizeUserDto(user),
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
      console.error('Admin user detail fetch error:', error);
      return jsonError('فشل جلب تفاصيل المستخدم', 500);
    }
  }

  // 2. قائمة المستخدمين مع التصفية والترقيم
  try {
    const rawPage = parseInt(searchParams.get('page') || '1', 10);
    const rawLimit = parseInt(searchParams.get('limit') || '20', 10);
    const page = Number.isFinite(rawPage) && rawPage > 0 ? rawPage : 1;
    const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, 100) : 20;

    const queryStr = cleanText(searchParams.get('query') || searchParams.get('q') || '').slice(0, 100);
    const statusParam = cleanText(searchParams.get('status') || '').toUpperCase();

    const filter: Record<string, unknown> = {};

    if (statusParam && (ALLOWED_STATUSES as readonly string[]).includes(statusParam)) {
      filter.status = statusParam;
    }

    if (queryStr) {
      const safePattern = new RegExp(escapeRegex(queryStr), 'i');
      filter.$or = [{ email: safePattern }, { displayName: safePattern }];
    }

    const [totalCount, rawUsers] = await Promise.all([
      User.countDocuments(filter),
      User.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
    ]);

    // حساب إجمالي الاستحقاقات والمشتريات والاشتراكات النشطة للمستخدمين في الصفحة
    const userIds = rawUsers.map((u: any) => u._id);
    const [entCounts, purCounts, subCounts] = await Promise.all([
      Entitlement.aggregate([
        { $match: { userId: { $in: userIds }, isActive: true } },
        { $group: { _id: '$userId', count: { $sum: 1 } } },
      ]),
      Purchase.aggregate([
        { $match: { userId: { $in: userIds }, status: 'PAID' } },
        { $group: { _id: '$userId', count: { $sum: 1 } } },
      ]),
      Subscription.aggregate([
        { $match: { userId: { $in: userIds }, status: 'ACTIVE' } },
        { $group: { _id: '$userId', count: { $sum: 1 } } },
      ]),
    ]);

    const entMap = new Map(entCounts.map((c: any) => [c._id.toString(), c.count]));
    const purMap = new Map(purCounts.map((c: any) => [c._id.toString(), c.count]));
    const subMap = new Map(subCounts.map((c: any) => [c._id.toString(), c.count]));

    const users = rawUsers.map((u: any) => {
      const idStr = u._id.toString();
      return {
        ...sanitizeUserDto(u),
        activeEntitlementsCount: entMap.get(idStr) || 0,
        purchasesCount: purMap.get(idStr) || 0,
        activeSubscriptionsCount: subMap.get(idStr) || 0,
      };
    });

    return jsonOk({
      users,
      pagination: {
        page,
        limit,
        totalCount,
        totalPages: Math.max(1, Math.ceil(totalCount / limit)),
      },
    });
  } catch (error) {
    console.error('Admin users list fetch error:', error);
    return jsonError('فشل جلب قائمة المستخدمين', 500);
  }
}

// PATCH: تغيير حالة المستخدم (تنشيط / تعليق / حظر) مع التدقيق الأمني
export async function PATCH(req: Request) {
  const admin = await getCurrentAdmin();
  if (!admin) {
    return jsonError('غير مصرح لك بالوصول', 401);
  }

  if (!canManageOperations(admin.role)) {
    return jsonError('ليس لديك صلاحية تعديل حالة المستخدمين (مطلوب ADMIN أو SUPER_ADMIN)', 403);
  }

  const conn = await connectDB();
  if (!conn) {
    return jsonError('قاعدة البيانات غير متاحة حالياً', 503);
  }

  const parsedBody = await parseAdminJsonBody(req);
  if (!parsedBody.ok) {
    return jsonError(parsedBody.error, parsedBody.status);
  }
  const body = parsedBody.body;

  const userId = cleanText(body?.userId || body?.id);
  const newStatus = cleanText(body?.status || '').toUpperCase() as TargetStatus;
  const reason = cleanText(body?.reason || '').slice(0, 300);

  if (!isValidMongoId(userId)) {
    return jsonError('معرّف المستخدم غير صالح', 400);
  }

  if (!(TARGET_STATUSES as readonly string[]).includes(newStatus)) {
    return jsonError('الحالة المطلوبة غير صالحة. الحالات المسموح بها: ACTIVE, SUSPENDED, BANNED', 400);
  }

  try {
    const user = await User.findById(userId);
    if (!user) {
      return jsonError('المستخدم غير موجود', 404);
    }

    if (user.status === newStatus) {
      return jsonError('المستخدم بهذه الحالة بالفعل', 409);
    }

    const previousStatus = user.status;

    // تحديث الحالة وتصفير محاولات القفل عند التنشيط
    user.status = newStatus;
    if (newStatus === 'ACTIVE') {
      user.lockUntil = undefined;
      user.failedLoginAttempts = 0;
    }

    await user.save();

    await writeOperationsAudit({
      adminUserId: admin.userId,
      action: 'UPDATE_USER_STATUS',
      targetEntity: 'User',
      entityId: user._id.toString(),
      previousState: { status: previousStatus },
      newState: { status: newStatus, reason: reason || undefined },
    });

    return jsonOk({
      success: true,
      user: sanitizeUserDto(user),
    });
  } catch (error) {
    console.error('Admin user status update error:', error);
    return jsonError('فشل تحديث حالة المستخدم', 500);
  }
}
