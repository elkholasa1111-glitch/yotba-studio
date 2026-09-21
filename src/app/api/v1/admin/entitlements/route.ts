// ============================================================
// Admin Entitlements API — إدارة استحقاقات المستخدمين ومنحها وإلغاؤها
// ============================================================

import { getCurrentAdmin } from '@/lib/auth';
import { connectDB } from '@/lib/db/connect';
import {
  User,
  Entitlement,
  Purchase,
  Subscription,
  Series,
  Season,
} from '@/lib/db/models';
import {
  jsonOk,
  jsonError,
  canManageOperations,
  isValidMongoId,
  cleanText,
  writeOperationsAudit,
  parseAdminJsonBody,
} from '@/lib/admin/operations-api';

// GET: جلب استحقاقات مستخدم وقائمة الأعمال المتاحة للمنح
export async function GET(req: Request) {
  const admin = await getCurrentAdmin();
  if (!admin) {
    return jsonError('غير مصرح لك بالوصول', 401);
  }
  if (!canManageOperations(admin.role)) {
    return jsonError('ليس لديك صلاحية عرض الاستحقاقات (مطلوب ADMIN أو SUPER_ADMIN)', 403);
  }

  const conn = await connectDB();
  if (!conn) {
    return jsonError('قاعدة البيانات غير متاحة حالياً', 503);
  }

  const { searchParams } = new URL(req.url);
  const userId = cleanText(searchParams.get('userId'));
  const includeCatalog = searchParams.get('catalog') === 'true';

  try {
    let seriesOptions: any[] = [];
    if (includeCatalog) {
      const [seriesList, seasonsList] = await Promise.all([
        Series.find().select('_id title slug').sort({ title: 1 }).lean(),
        Season.find().select('_id seriesId seasonNumber title').sort({ seasonNumber: 1 }).lean(),
      ]);

      const seasonsBySeries = new Map<string, any[]>();
      for (const season of seasonsList as any[]) {
        const sKey = season.seriesId.toString();
        const existing = seasonsBySeries.get(sKey) || [];
        existing.push({
          _id: season._id.toString(),
          seasonNumber: season.seasonNumber,
          title: season.title,
        });
        seasonsBySeries.set(sKey, existing);
      }

      seriesOptions = seriesList.map((s: any) => ({
        _id: s._id.toString(),
        title: s.title,
        slug: s.slug,
        seasons: seasonsBySeries.get(s._id.toString()) || [],
      }));
    }

    if (!userId) {
      return jsonOk({
        seriesOptions,
        entitlements: [],
        purchases: [],
        subscriptions: [],
      });
    }

    if (!isValidMongoId(userId)) {
      return jsonError('معرّف المستخدم غير صالح', 400);
    }

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
      seriesOptions,
      user: {
        _id: user._id.toString(),
        email: user.email,
        displayName: user.displayName,
        status: user.status,
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
    console.error('Admin entitlements GET error:', error);
    return jsonError('فشل جلب الاستحقاقات', 500);
  }
}

// POST: منح استحقاق إداري (ADMIN_GRANT) لمسلسل أو موسم
export async function POST(req: Request) {
  const admin = await getCurrentAdmin();
  if (!admin) {
    return jsonError('غير مصرح لك بالوصول', 401);
  }

  if (!canManageOperations(admin.role)) {
    return jsonError('ليس لديك صلاحية منح الاستحقاقات (مطلوب ADMIN أو SUPER_ADMIN)', 403);
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

  const userId = cleanText(body?.userId);
  const targetSeriesId = cleanText(body?.targetSeriesId);
  const targetSeasonId = cleanText(body?.targetSeasonId);
  const validUntilRaw = cleanText(body?.validUntil);
  const reason = cleanText(body?.reason).slice(0, 300);

  if (!isValidMongoId(userId)) {
    return jsonError('معرّف المستخدم غير صالح', 400);
  }

  if (!targetSeriesId && !targetSeasonId) {
    return jsonError('يجب تحديد مسلسل أو موسم لمنح الاستحقاق', 400);
  }

  // التحقق من وجود المستخدم
  const user = await User.findById(userId);
  if (!user) {
    return jsonError('المستخدم المستهدف غير موجود', 404);
  }

  // التحقق من صلاحية وانتساب العمل (مسلسل / موسم)
  let resolvedSeriesId: string | null = null;
  let resolvedSeasonId: string | null = null;

  if (targetSeasonId) {
    if (!isValidMongoId(targetSeasonId)) {
      return jsonError('معرّف الموسم غير صالح', 400);
    }
    const season = await Season.findById(targetSeasonId);
    if (!season) {
      return jsonError('الموسم المحدد غير موجود', 404);
    }
    resolvedSeasonId = season._id.toString();
    resolvedSeriesId = season.seriesId.toString();

    // إذا تم تمرير مسلسل أيضاً، نتأكد أنه نفس مسلسل الموسم
    if (targetSeriesId) {
      if (targetSeriesId !== resolvedSeriesId) {
        return jsonError('الموسم المحدد لا ينتمي إلى هذا المسلسل', 400);
      }
    }
  } else if (targetSeriesId) {
    if (!isValidMongoId(targetSeriesId)) {
      return jsonError('معرّف المسلسل غير صالح', 400);
    }
    const series = await Series.findById(targetSeriesId);
    if (!series) {
      return jsonError('المسلسل المحدد غير موجود', 404);
    }
    resolvedSeriesId = series._id.toString();
  }

  // التحقق من تاريخ الانتهاء إذا حُدد
  let validUntil: Date | null = null;
  if (validUntilRaw) {
    const parsedDate = new Date(validUntilRaw);
    if (Number.isNaN(parsedDate.getTime()) || parsedDate.getTime() <= Date.now()) {
      return jsonError('تاريخ انتهاء الصلاحية يجب أن يكون تاريخاً صحيحاً في المستقبل', 400);
    }
    validUntil = parsedDate;
  }

  // التحقق من التكرار (Idempotency / Avoid duplicates)
  try {
    const duplicateQuery: Record<string, unknown> = {
      userId,
      isActive: true,
    };

    if (resolvedSeasonId) {
      // إذا كان يملك استحقاقاً لنفس الموسم، أو للمسلسل بأكمله
      duplicateQuery.$or = [
        { targetSeasonId: resolvedSeasonId },
        { targetSeriesId: resolvedSeriesId, targetSeasonId: null },
      ];
    } else {
      duplicateQuery.targetSeriesId = resolvedSeriesId;
      duplicateQuery.targetSeasonId = null;
    }

    const existing = await Entitlement.findOne(duplicateQuery);
    if (existing) {
      return jsonError('المستخدم يمتلك بالفعل استحقاقاً نشطاً يغطي هذا المحتوى', 409);
    }

    // إنشاء الاستحقاق كـ ADMIN_GRANT حصراً
    const newEntitlement = await Entitlement.create({
      userId,
      type: 'ADMIN_GRANT',
      source: 'ADMIN',
      targetSeriesId: resolvedSeriesId,
      targetSeasonId: resolvedSeasonId,
      validFrom: new Date(),
      validUntil,
      grantedByAdminId: admin.userId,
      isActive: true,
    });

    await writeOperationsAudit({
      adminUserId: admin.userId,
      action: 'GRANT_ENTITLEMENT',
      targetEntity: 'Entitlement',
      entityId: newEntitlement._id.toString(),
      newState: {
        userId,
        type: 'ADMIN_GRANT',
        targetSeriesId: resolvedSeriesId,
        targetSeasonId: resolvedSeasonId,
        validUntil: validUntil?.toISOString() || null,
        reason: reason || undefined,
      },
    });

    return jsonOk({
      success: true,
      entitlement: {
        _id: newEntitlement._id.toString(),
        type: newEntitlement.type,
        source: newEntitlement.source,
        targetSeriesId: resolvedSeriesId,
        targetSeasonId: resolvedSeasonId,
        validFrom: newEntitlement.validFrom,
        validUntil: newEntitlement.validUntil,
        isActive: newEntitlement.isActive,
        createdAt: newEntitlement.createdAt,
      },
    }, 201);
  } catch (error) {
    console.error('Admin grant entitlement error:', error);
    return jsonError('فشل منح الاستحقاق للمستخدم', 500);
  }
}

// DELETE: إلغاء استحقاق محدد (Soft revoke بإلغاء isActive)
export async function DELETE(req: Request) {
  const admin = await getCurrentAdmin();
  if (!admin) {
    return jsonError('غير مصرح لك بالوصول', 401);
  }

  if (!canManageOperations(admin.role)) {
    return jsonError('ليس لديك صلاحية إلغاء الاستحقاقات (مطلوب ADMIN أو SUPER_ADMIN)', 403);
  }

  const conn = await connectDB();
  if (!conn) {
    return jsonError('قاعدة البيانات غير متاحة حالياً', 503);
  }

  const { searchParams } = new URL(req.url);
  let entitlementId = cleanText(searchParams.get('id') || searchParams.get('entitlementId'));

  if (!entitlementId) {
    try {
      const body = await req.json();
      entitlementId = cleanText(body?.id || body?.entitlementId);
    } catch {
      // قد لا يحتوي الطلب على جسم json
    }
  }

  if (!isValidMongoId(entitlementId)) {
    return jsonError('معرّف الاستحقاق غير صالح', 400);
  }

  try {
    const entitlement = await Entitlement.findById(entitlementId);
    if (!entitlement) {
      return jsonError('الاستحقاق غير موجود', 404);
    }

    if (!entitlement.isActive) {
      return jsonError('الاستحقاق ملغى مسبقاً', 409);
    }

    // لا يمكن لمسار المنح الإداري أن يلغي صلاحية مدفوعة أو اشتراكاً فعلياً.
    // إلغاء هذه السجلات يجب أن يتم من مسار ردّ الأموال/بوابة الدفع حتى لا
    // يفقد المستخدم وصولاً اشتراه أو تصبح الحالة المحاسبية غير متسقة.
    if (entitlement.type !== 'ADMIN_GRANT' || entitlement.source !== 'ADMIN') {
      return jsonError('لا يمكن إلغاء الاستحقاقات المدفوعة من هذه الشاشة. استخدم مسار ردّ الأموال المعتمد.', 403);
    }

    entitlement.isActive = false;
    await entitlement.save();

    await writeOperationsAudit({
      adminUserId: admin.userId,
      action: 'REVOKE_ENTITLEMENT',
      targetEntity: 'Entitlement',
      entityId: entitlement._id.toString(),
      previousState: { isActive: true },
      newState: { isActive: false },
    });

    return jsonOk({
      success: true,
      message: 'تم إلغاء الاستحقاق بنجاح',
      entitlementId,
    });
  } catch (error) {
    console.error('Admin revoke entitlement error:', error);
    return jsonError('فشل إلغاء الاستحقاق', 500);
  }
}
