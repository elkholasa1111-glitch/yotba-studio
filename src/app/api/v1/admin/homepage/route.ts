// ============================================================
// Admin Homepage Sections API — جدولة وترتيب أقسام الصفحة الرئيسية
// ============================================================

import { revalidatePath } from 'next/cache';
import { getCurrentAdmin } from '@/lib/auth';
import { connectDB } from '@/lib/db/connect';
import { HomepageSection, Series, Category } from '@/lib/db/models';
import {
  jsonOk,
  jsonError,
  canManageOperations,
  isValidMongoId,
  cleanText,
  containsHtml,
  normalizeSectionKey,
  writeOperationsAudit,
  parseAdminJsonBody,
} from '@/lib/admin/operations-api';
import {
  getPublicPlatformOrigin,
  mediaUrlFromStorageKey,
  normalizeMediaUrl,
} from '@/lib/media/urls';

const ALLOWED_LAYOUTS = [
  'FEATURE',
  'EDITORIAL_SPLIT',
  'POSTER_WALL',
  'RAIL',
  'MOSAIC',
  'RANKED_LIST',
  'CINEMATIC_BANNER',
  'SPOTLIGHT',
] as const;
type SectionLayout = (typeof ALLOWED_LAYOUTS)[number];

const ALLOWED_SOURCES = ['MANUAL', 'AUTOMATIC'] as const;
type SectionSource = (typeof ALLOWED_SOURCES)[number];

const ALLOWED_AUTO_RULES = [
  'POPULAR',
  'NEWEST',
  'GENRE_FILTER',
  'EDITORIAL_CHOICE',
  'COMING_SOON',
  'MOST_COMPLETED',
  'CONTINUE_LISTENING',
] as const;
type SectionAutoRule = (typeof ALLOWED_AUTO_RULES)[number];

function sanitizeSectionDto(doc: any) {
  return {
    _id: doc._id.toString(),
    key: doc.key,
    title: doc.title,
    subtitle: doc.subtitle || '',
    order: doc.order ?? 0,
    layout: doc.layout,
    sourceType: doc.sourceType,
    autoRule: doc.autoRule || null,
    filterCategoryId: doc.filterCategoryId?.toString() || null,
    manualSeriesIds: (doc.manualSeriesIds || [])
      .map((item: any) => {
        const rawId =
          item && typeof item === 'object' && item._id ? item._id : item;

        return rawId?.toString?.() || String(rawId || '');
      })
      .filter(Boolean),
    manualSeries: Array.isArray(doc.manualSeriesIds)
      ? doc.manualSeriesIds
          .filter(
            (s: any) =>
              s &&
              typeof s === 'object' &&
              s._id &&
              typeof s.title === 'string',
          )
          .map((s: any) => ({
            _id: s._id.toString(),
            title: s.title,
            slug: s.slug,
            posterUrl: mediaUrlFromStorageKey(
              normalizeMediaUrl(s.posterUrl),
              getPublicPlatformOrigin(),
            ),
          }))
      : [],
    isVisible: Boolean(doc.isVisible),
    scheduledStart: doc.scheduledStart
      ? new Date(doc.scheduledStart).toISOString()
      : null,
    scheduledEnd: doc.scheduledEnd
      ? new Date(doc.scheduledEnd).toISOString()
      : null,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

/** إعادة التحقق الآمن من كاش الصفحة الرئيسية العامة */
function triggerHomepageRevalidation() {
  try {
    revalidatePath('/');
  } catch (error) {
    console.warn('Homepage revalidation skipped or failed:', error);
  }
}

// GET: جلب جميع أقسام الرئيسية مرتبة + قائمة المسلسلات المتاحة للاختيار اليدوي
export async function GET() {
  const admin = await getCurrentAdmin();
  if (!admin) {
    return jsonError('غير مصرح لك بالوصول', 401);
  }

  const conn = await connectDB();
  if (!conn) {
    return jsonError('قاعدة البيانات غير متاحة حالياً', 503);
  }

  try {
    const [sections, rawSeries, rawCategories] = await Promise.all([
      HomepageSection.find()
        .sort({ order: 1, createdAt: 1 })
        .populate('manualSeriesIds', 'title slug posterUrl')
        .lean(),
      Series.find()
        .select('_id title slug posterUrl publishedAt')
        .sort({ title: 1 })
        .lean(),
      Category.find()
        .select('_id nameAr slug')
        .sort({ order: 1, nameAr: 1 })
        .lean(),
    ]);

    const seriesOptions = rawSeries.map((s: any) => ({
      _id: s._id.toString(),
      title: s.title,
      slug: s.slug,
      posterUrl: mediaUrlFromStorageKey(
        normalizeMediaUrl(s.posterUrl),
        getPublicPlatformOrigin(),
      ),
      isPublished: Boolean(s.publishedAt),
    }));

    const categoryOptions = rawCategories.map((category: any) => ({
      _id: category._id.toString(),
      nameAr: category.nameAr,
      slug: category.slug,
    }));

    return jsonOk({
      sections: sections.map(sanitizeSectionDto),
      seriesOptions,
      categoryOptions,
    });
  } catch (error) {
    console.error('Admin homepage sections GET error:', error);
    return jsonError('فشل جلب أقسام الصفحة الرئيسية', 500);
  }
}

// POST: إنشاء قسم جديد في الصفحة الرئيسية
export async function POST(req: Request) {
  const admin = await getCurrentAdmin();
  if (!admin) {
    return jsonError('غير مصرح لك بالوصول', 401);
  }

  if (!canManageOperations(admin.role)) {
    return jsonError(
      'ليس لديك صلاحية إنشاء أقسام الصفحة الرئيسية (مطلوب ADMIN أو SUPER_ADMIN)',
      403,
    );
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

  const rawKey = cleanText(body?.key);
  const normalizedKey = normalizeSectionKey(rawKey);
  const title = cleanText(body?.title);
  const subtitle = cleanText(body?.subtitle);
  const layout = cleanText(body?.layout) as SectionLayout;
  const sourceType = (cleanText(body?.sourceType) ||
    'AUTOMATIC') as SectionSource;
  const autoRule = cleanText(body?.autoRule) as SectionAutoRule;
  const filterCategoryId = cleanText(body?.filterCategoryId);
  const isVisible = body?.isVisible === undefined ? true : body.isVisible;

  if (typeof isVisible !== 'boolean') {
    return jsonError('حالة ظهور القسم يجب أن تكون قيمة منطقية صحيحة', 400);
  }

  // التحقق من المفتاح
  if (!normalizedKey || normalizedKey.length < 2) {
    return jsonError(
      'معرّف القسم (Key) يجب أن يحتوي على حرفين على الأقل بالإنجليزية أو أرقام',
      400,
    );
  }

  // التحقق من العنوان
  if (!title || title.length < 2 || title.length > 120 || containsHtml(title)) {
    return jsonError(
      'عنوان القسم مطلوب ويجب ألا يتجاوز 120 حرفاً وبدون وسوم HTML',
      400,
    );
  }

  if (subtitle && (subtitle.length > 300 || containsHtml(subtitle))) {
    return jsonError(
      'الوصف الفرعي يجب ألا يتجاوز 300 حرف وبدون وسوم HTML',
      400,
    );
  }

  // التحقق من التخطيط والمصدر
  if (!(ALLOWED_LAYOUTS as readonly string[]).includes(layout)) {
    return jsonError('تخطيط القسم المحدد غير صالح', 400);
  }

  if (!(ALLOWED_SOURCES as readonly string[]).includes(sourceType)) {
    return jsonError('نوع مصدر المحتوى غير صالح', 400);
  }

  if (sourceType === 'AUTOMATIC') {
    if (
      !autoRule ||
      !(ALLOWED_AUTO_RULES as readonly string[]).includes(autoRule)
    ) {
      return jsonError('قاعدة التغذية التلقائية المطلوبة غير صالحة', 400);
    }
    if (autoRule === 'GENRE_FILTER') {
      if (!filterCategoryId || !isValidMongoId(filterCategoryId)) {
        return jsonError('يرجى اختيار تصنيف صالح', 400);
      }

      const categoryExists = await Category.exists({ _id: filterCategoryId });

      if (!categoryExists) {
        return jsonError('التصنيف المحدد غير موجود', 404);
      }
    }
  }

  // التحقق من المسلسلات اليدوية
  let manualSeriesIds: string[] = [];
  if (sourceType === 'MANUAL') {
    const rawIds = Array.isArray(body?.manualSeriesIds)
      ? body.manualSeriesIds
      : [];
    if (rawIds.length === 0) {
      return jsonError('يجب تحديد عمل واحد على الأقل للأقسام اليدوية', 400);
    }
    if (rawIds.length > 30) {
      return jsonError('لا يمكن إضافة أكثر من 30 عملاً للقسم الواحد', 400);
    }

    const uniqueIds: string[] = Array.from(
      new Set(rawIds.map((id: any) => cleanText(id))),
    );
    for (const sId of uniqueIds) {
      if (!isValidMongoId(sId)) {
        return jsonError(`معرّف العمل ${sId} غير صالح`, 400);
      }
    }

    // التحقق من وجود جميع المسلسلات المحددة في قاعدة البيانات
    const existingSeries = await Series.find({ _id: { $in: uniqueIds } })
      .select('_id')
      .lean();
    if (existingSeries.length !== uniqueIds.length) {
      return jsonError('بعض الأعمال المحددة غير موجودة في قاعدة البيانات', 400);
    }
    manualSeriesIds = uniqueIds;
  }

  // التحقق من الجدولة الزمنية
  let scheduledStart: Date | null = null;
  let scheduledEnd: Date | null = null;

  if (body?.scheduledStart) {
    if (typeof body.scheduledStart !== 'string') {
      return jsonError('تاريخ بداية العرض يجب أن يكون نصاً بصيغة ISO', 400);
    }
    const sDate = new Date(body.scheduledStart);
    if (Number.isNaN(sDate.getTime())) {
      return jsonError('تاريخ بداية العرض غير صالح', 400);
    }
    scheduledStart = sDate;
  }

  if (body?.scheduledEnd) {
    if (typeof body.scheduledEnd !== 'string') {
      return jsonError('تاريخ نهاية العرض يجب أن يكون نصاً بصيغة ISO', 400);
    }
    const eDate = new Date(body.scheduledEnd);
    if (Number.isNaN(eDate.getTime())) {
      return jsonError('تاريخ نهاية العرض غير صالح', 400);
    }
    scheduledEnd = eDate;
  }

  if (
    scheduledStart &&
    scheduledEnd &&
    scheduledStart.getTime() >= scheduledEnd.getTime()
  ) {
    return jsonError('تاريخ بداية العرض يجب أن يسبق تاريخ النهاية', 400);
  }

  // التحقق من الترتيب
  let order = 0;
  if (
    typeof body?.order === 'number' &&
    Number.isInteger(body.order) &&
    body.order >= 0
  ) {
    order = Math.min(body.order, 1000);
  } else if (body?.order === undefined) {
    // إعطاء الترتيب التالي تلقائياً
    const highest = (await HomepageSection.findOne()
      .sort({ order: -1 })
      .select('order')
      .lean()) as any;
    order = (highest?.order ?? -1) + 1;
  } else {
    return jsonError('ترتيب القسم يجب أن يكون رقماً صحيحاً بين 0 و 1000', 400);
  }

  try {
    // التحقق من عدم تكرار المفتاح
    const keyExists = await HomepageSection.findOne({ key: normalizedKey });
    if (keyExists) {
      return jsonError(
        'معرّف القسم (Key) مستخدم مسبقاً، يرجى اختيار معرّف فريد',
        409,
      );
    }

    const created = await HomepageSection.create({
      key: normalizedKey,
      title,
      subtitle: subtitle || undefined,
      order,
      layout,
      sourceType,
      autoRule: sourceType === 'AUTOMATIC' ? autoRule : undefined,
      filterCategoryId:
        sourceType === 'AUTOMATIC' && autoRule === 'GENRE_FILTER'
          ? filterCategoryId
          : undefined,
      manualSeriesIds: sourceType === 'MANUAL' ? manualSeriesIds : [],
      isVisible,
      scheduledStart,
      scheduledEnd,
    });

    await writeOperationsAudit({
      adminUserId: admin.userId,
      action: 'CREATE_HOMEPAGE_SECTION',
      targetEntity: 'HomepageSection',
      entityId: created._id.toString(),
      newState: {
        key: created.key,
        title: created.title,
        order: created.order,
        layout: created.layout,
        sourceType: created.sourceType,
        isVisible: created.isVisible,
        scheduledStart: scheduledStart?.toISOString() || null,
        scheduledEnd: scheduledEnd?.toISOString() || null,
      },
    });

    triggerHomepageRevalidation();

    const populated = await HomepageSection.findById(created._id)
      .populate('manualSeriesIds', 'title slug posterUrl')
      .lean();

    return jsonOk(
      { success: true, section: sanitizeSectionDto(populated) },
      201,
    );
  } catch (error) {
    console.error('Admin homepage section create error:', error);
    return jsonError('فشل إنشاء قسم الصفحة الرئيسية', 500);
  }
}

// PATCH: تعديل خصائص قسم أو إعادة ترتيب الأقسام كعملية مخصصة
export async function PATCH(req: Request) {
  const admin = await getCurrentAdmin();
  if (!admin) {
    return jsonError('غير مصرح لك بالوصول', 401);
  }

  if (!canManageOperations(admin.role)) {
    return jsonError(
      'ليس لديك صلاحية تعديل أقسام الصفحة الرئيسية (مطلوب ADMIN أو SUPER_ADMIN)',
      403,
    );
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

  // 1. إعادة ترتيب الأقسام بالكامل (Reorder Action)
  if (body?.action === 'reorder') {
    const orders = body?.orders;
    if (!Array.isArray(orders) || orders.length === 0) {
      return jsonError('قائمة الترتيب يجب أن تكون مصفوفة غير فارغة', 400);
    }

    // إعادة الترتيب عملية كلية: يجب أن تغطي كل الأقسام الحالية مرة واحدة
    // حتى لا تترك الطلبات الجزئية أو المعرّفات الوهمية ترتيباً غير متسق.
    const existingSections = await HomepageSection.find().select('_id').lean();
    if (orders.length !== existingSections.length) {
      return jsonError('يجب إرسال ترتيب جميع أقسام الصفحة الرئيسية', 400);
    }

    const existingIds = new Set(
      existingSections.map((section: any) => section._id.toString()),
    );
    const seenOrders = new Set<number>();

    const seenIds = new Set<string>();
    for (const item of orders) {
      const id = cleanText(item?.id);
      const order = item?.order;
      if (
        !isValidMongoId(id) ||
        !Number.isInteger(order) ||
        order < 0 ||
        order > 1000
      ) {
        return jsonError('بيانات إعادة الترتيب غير صحيحة', 400);
      }
      if (seenIds.has(id)) {
        return jsonError('تكرار معرّف القسم في طلب إعادة الترتيب', 409);
      }
      if (!existingIds.has(id)) {
        return jsonError('يوجد قسم غير موجود في طلب إعادة الترتيب', 400);
      }
      if (seenOrders.has(order)) {
        return jsonError('يجب أن يكون ترتيب كل قسم رقماً فريداً', 409);
      }
      seenIds.add(id);
      seenOrders.add(order);
    }

    try {
      await HomepageSection.bulkWrite(
        orders.map((item: any) => ({
          updateOne: {
            filter: { _id: item.id },
            update: { $set: { order: item.order } },
          },
        })),
      );

      await writeOperationsAudit({
        adminUserId: admin.userId,
        action: 'REORDER_HOMEPAGE_SECTIONS',
        targetEntity: 'HomepageSection',
        entityId: 'ALL',
        newState: { count: orders.length },
      });

      triggerHomepageRevalidation();

      const updatedSections = await HomepageSection.find()
        .sort({ order: 1 })
        .populate('manualSeriesIds', 'title slug posterUrl')
        .lean();

      return jsonOk({
        success: true,
        message: 'تم تحديث ترتيب الأقسام بنجاح',
        sections: updatedSections.map(sanitizeSectionDto),
      });
    } catch (error) {
      console.error('Admin homepage reorder error:', error);
      return jsonError('فشل حفظ الترتيب الجديد', 500);
    }
  }

  // 2. تعديل قسم فردي
  const sectionId = cleanText(body?.sectionId || body?.id);
  if (!isValidMongoId(sectionId)) {
    return jsonError('معرّف القسم غير صالح', 400);
  }

  try {
    const section = await HomepageSection.findById(sectionId);
    if (!section) {
      return jsonError('القسم غير موجود', 404);
    }

    const previousState = {
      title: section.title,
      order: section.order,
      isVisible: section.isVisible,
      layout: section.layout,
      sourceType: section.sourceType,
    };

    // التحقق من الحقول المسموح بتحديثها
    if (body?.title !== undefined) {
      const title = cleanText(body.title);
      if (
        !title ||
        title.length < 2 ||
        title.length > 120 ||
        containsHtml(title)
      ) {
        return jsonError(
          'عنوان القسم يجب أن يكون بين 2 و 120 حرفاً وبدون وسوم HTML',
          400,
        );
      }
      section.title = title;
    }

    if (body?.subtitle !== undefined) {
      const subtitle = cleanText(body.subtitle);
      if (subtitle && (subtitle.length > 300 || containsHtml(subtitle))) {
        return jsonError(
          'الوصف الفرعي يجب ألا يتجاوز 300 حرف وبدون وسوم HTML',
          400,
        );
      }
      section.subtitle = subtitle || '';
    }

    if (body?.layout !== undefined) {
      const layout = cleanText(body.layout) as SectionLayout;
      if (!(ALLOWED_LAYOUTS as readonly string[]).includes(layout)) {
        return jsonError('تخطيط القسم المحدد غير صالح', 400);
      }
      section.layout = layout;
    }

    if (body?.sourceType !== undefined) {
      const sourceType = cleanText(body.sourceType) as SectionSource;
      if (!(ALLOWED_SOURCES as readonly string[]).includes(sourceType)) {
        return jsonError('نوع مصدر المحتوى غير صالح', 400);
      }
      section.sourceType = sourceType;

      // لا نحتفظ ببيانات المصدر السابق عند التحويل بين يدوي وتلقائي.
      if (sourceType === 'MANUAL') {
        section.autoRule = undefined;
        section.filterCategoryId = undefined;
      } else {
        section.manualSeriesIds = [];
      }
    }

    if (section.sourceType === 'AUTOMATIC') {
      if (body?.autoRule !== undefined) {
        const autoRule = cleanText(body.autoRule) as SectionAutoRule;
        if (!(ALLOWED_AUTO_RULES as readonly string[]).includes(autoRule)) {
          return jsonError('قاعدة التغذية التلقائية غير صالحة', 400);
        }
        section.autoRule = autoRule;
      }
      if (body?.filterCategoryId !== undefined) {
        const categoryId = cleanText(body.filterCategoryId);
        section.filterCategoryId = categoryId || undefined;
      }

      if (
        !section.autoRule ||
        !(ALLOWED_AUTO_RULES as readonly string[]).includes(section.autoRule)
      ) {
        return jsonError('يجب تحديد قاعدة تغذية تلقائية صالحة للقسم', 400);
      }

      if (section.autoRule === 'GENRE_FILTER') {
        const categoryId = section.filterCategoryId?.toString();

        if (!categoryId || !isValidMongoId(categoryId)) {
          return jsonError('يرجى اختيار تصنيف صالح', 400);
        }

        const categoryExists = await Category.exists({ _id: categoryId });

        if (!categoryExists) {
          return jsonError('التصنيف المحدد غير موجود', 404);
        }
      } else {
        section.filterCategoryId = undefined;
      }
    }

    if (section.sourceType === 'MANUAL') {
      if (body?.manualSeriesIds !== undefined) {
        const rawIds = Array.isArray(body.manualSeriesIds)
          ? body.manualSeriesIds
          : [];
        if (rawIds.length === 0) {
          return jsonError('يجب تحديد عمل واحد على الأقل للأقسام اليدوية', 400);
        }
        if (rawIds.length > 30) {
          return jsonError('لا يمكن إضافة أكثر من 30 عملاً للقسم الواحد', 400);
        }

        const uniqueIds = Array.from(
          new Set(rawIds.map((id: any) => cleanText(id))),
        );
        for (const sId of uniqueIds) {
          if (!isValidMongoId(sId)) {
            return jsonError(`معرّف العمل ${sId} غير صالح`, 400);
          }
        }

        const existingSeries = await Series.find({ _id: { $in: uniqueIds } })
          .select('_id')
          .lean();
        if (existingSeries.length !== uniqueIds.length) {
          return jsonError(
            'بعض الأعمال المحددة غير موجودة في قاعدة البيانات',
            400,
          );
        }
        section.manualSeriesIds = uniqueIds as any;
      }

      if (
        !Array.isArray(section.manualSeriesIds) ||
        section.manualSeriesIds.length === 0
      ) {
        return jsonError('يجب تحديد عمل واحد على الأقل للأقسام اليدوية', 400);
      }
    }

    if (body?.order !== undefined) {
      const order = body.order;
      if (
        typeof order !== 'number' ||
        !Number.isInteger(order) ||
        order < 0 ||
        order > 1000
      ) {
        return jsonError(
          'ترتيب القسم يجب أن يكون رقماً صحيحاً بين 0 و 1000',
          400,
        );
      }
      section.order = order;
    }

    let visibilityAction: string | null = null;
    if (body?.isVisible !== undefined) {
      if (typeof body.isVisible !== 'boolean') {
        return jsonError('حالة ظهور القسم يجب أن تكون قيمة منطقية صحيحة', 400);
      }
      const nextVisible = body.isVisible;
      if (section.isVisible !== nextVisible) {
        visibilityAction = nextVisible
          ? 'SHOW_HOMEPAGE_SECTION'
          : 'HIDE_HOMEPAGE_SECTION';
      }
      section.isVisible = nextVisible;
    }

    // فحص الجدولة
    if (body?.scheduledStart !== undefined) {
      if (body.scheduledStart !== null && body.scheduledStart !== '') {
        if (typeof body.scheduledStart !== 'string') {
          return jsonError(
            'تاريخ البداية يجب أن يكون نصاً بصيغة ISO أو فارغاً',
            400,
          );
        }
        const sDate = new Date(body.scheduledStart);
        if (Number.isNaN(sDate.getTime()))
          return jsonError('تاريخ البداية غير صالح', 400);
        section.scheduledStart = sDate;
      } else {
        section.scheduledStart = undefined;
      }
    }

    if (body?.scheduledEnd !== undefined) {
      if (body.scheduledEnd !== null && body.scheduledEnd !== '') {
        if (typeof body.scheduledEnd !== 'string') {
          return jsonError(
            'تاريخ النهاية يجب أن يكون نصاً بصيغة ISO أو فارغاً',
            400,
          );
        }
        const eDate = new Date(body.scheduledEnd);
        if (Number.isNaN(eDate.getTime()))
          return jsonError('تاريخ النهاية غير صالح', 400);
        section.scheduledEnd = eDate;
      } else {
        section.scheduledEnd = undefined;
      }
    }

    if (
      section.scheduledStart &&
      section.scheduledEnd &&
      section.scheduledStart.getTime() >= section.scheduledEnd.getTime()
    ) {
      return jsonError('تاريخ بداية العرض يجب أن يسبق تاريخ النهاية', 400);
    }

    await section.save();

    await writeOperationsAudit({
      adminUserId: admin.userId,
      action: visibilityAction || 'UPDATE_HOMEPAGE_SECTION',
      targetEntity: 'HomepageSection',
      entityId: section._id.toString(),
      previousState,
      newState: {
        title: section.title,
        order: section.order,
        isVisible: section.isVisible,
        layout: section.layout,
        sourceType: section.sourceType,
      },
    });

    triggerHomepageRevalidation();

    const populated = await HomepageSection.findById(section._id)
      .populate('manualSeriesIds', 'title slug posterUrl')
      .lean();

    return jsonOk({ success: true, section: sanitizeSectionDto(populated) });
  } catch (error) {
    console.error('Admin homepage section update error:', error);
    return jsonError('فشل تحديث قسم الصفحة الرئيسية', 500);
  }
}

// DELETE: حذف قسم من الصفحة الرئيسية مع التدقيق
export async function DELETE(req: Request) {
  const admin = await getCurrentAdmin();
  if (!admin) {
    return jsonError('غير مصرح لك بالوصول', 401);
  }

  if (!canManageOperations(admin.role)) {
    return jsonError(
      'ليس لديك صلاحية حذف أقسام الصفحة الرئيسية (مطلوب ADMIN أو SUPER_ADMIN)',
      403,
    );
  }

  const conn = await connectDB();
  if (!conn) {
    return jsonError('قاعدة البيانات غير متاحة حالياً', 503);
  }

  const { searchParams } = new URL(req.url);
  let sectionId = cleanText(
    searchParams.get('id') || searchParams.get('sectionId'),
  );

  if (!sectionId) {
    try {
      const body = await req.json();
      sectionId = cleanText(body?.id || body?.sectionId);
    } catch {
      // قد لا يحتوي الطلب على جسم
    }
  }

  if (!isValidMongoId(sectionId)) {
    return jsonError('معرّف القسم غير صالح', 400);
  }

  try {
    const section = await HomepageSection.findById(sectionId);
    if (!section) {
      return jsonError('القسم غير موجود', 404);
    }

    const previousSummary = {
      key: section.key,
      title: section.title,
      order: section.order,
    };

    await HomepageSection.findByIdAndDelete(sectionId);

    await writeOperationsAudit({
      adminUserId: admin.userId,
      action: 'DELETE_HOMEPAGE_SECTION',
      targetEntity: 'HomepageSection',
      entityId: sectionId,
      previousState: previousSummary,
      newState: null,
    });

    triggerHomepageRevalidation();

    return jsonOk({
      success: true,
      message: 'تم حذف القسم بنجاح وتحديث الكاش',
      deletedId: sectionId,
    });
  } catch (error) {
    console.error('Admin homepage section delete error:', error);
    return jsonError('فشل حذف قسم الصفحة الرئيسية', 500);
  }
}
