import { Types } from 'mongoose';
import { getCurrentAdmin } from '@/lib/auth';
import { connectDB } from '@/lib/db/connect';
import { Category, Series } from '@/lib/db/models';
import {
  jsonOk,
  jsonError,
  slugify,
  isSafeMediaUrl,
  containsHtml,
  stripControlChars,
  isPlainObject,
  isNonEmptyString,
  isBoundedInt,
  writeAudit,
} from '@/lib/admin/content-api';

const CONTENT_ROLES = new Set(['SUPER_ADMIN', 'ADMIN', 'CONTENT_EDITOR']);
const MAX_BODY_BYTES = 16 * 1024;

function canManageCategories(admin) {
  return CONTENT_ROLES.has(admin.role);
}

function serializeCategory(category) {
  return {
    _id: category._id.toString(),
    nameAr: category.nameAr,
    nameEn: category.nameEn,
    slug: category.slug,
    description: category.description || '',
    coverImage: category.coverImage || '',
    order: category.order || 0,
    isActive: Boolean(category.isActive),
  };
}

function cleanText(value, maxLength, fieldName) {
  if (!isNonEmptyString(value, 1, maxLength)) {
    return { error: `${fieldName} مطلوب` };
  }

  const cleaned = stripControlChars(value).trim();

  if (containsHtml(cleaned)) {
    return { error: `${fieldName} لا يجب أن يحتوي HTML` };
  }

  return { value: cleaned };
}

function cleanCoverImage(value) {
  if (value === undefined || value === null || value === '') {
    return { value: '' };
  }

  if (typeof value !== 'string' || !isSafeMediaUrl(value.trim())) {
    return { error: 'رابط صورة التصنيف غير صالح' };
  }

  return { value: value.trim() };
}

async function readJsonBody(request) {
  const contentType = request.headers.get('content-type') || '';
  const contentLength = Number(request.headers.get('content-length') || '0');

  if (!contentType.toLowerCase().includes('application/json')) {
    return { error: 'نوع المحتوى يجب أن يكون application/json', status: 415 };
  }

  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
    return { error: 'حجم الطلب كبير جداً', status: 413 };
  }

  try {
    const body = await request.json();

    if (!isPlainObject(body)) {
      return { error: 'بيانات غير صالحة', status: 400 };
    }

    return { body };
  } catch {
    return { error: 'بيانات JSON غير صالحة', status: 400 };
  }
}

async function requireCategoryManager() {
  const admin = await getCurrentAdmin();

  if (!admin) {
    return { error: 'غير مصرح لك', status: 401 };
  }

  if (!canManageCategories(admin)) {
    return { error: 'ليس لديك صلاحية إدارة التصنيفات', status: 403 };
  }

  const connection = await connectDB();

  if (!connection) {
    return { error: 'قاعدة البيانات غير متاحة حالياً', status: 503 };
  }

  return { admin };
}

// جلب كل التصنيفات، ومنها غير النشطة، لتظهر للإدارة فقط.
export async function GET() {
  const access = await requireCategoryManager();

  if (access.error) {
    return jsonError(access.error, access.status);
  }

  try {
    const categories = await Category.find()
      .sort({ order: 1, nameAr: 1 })
      .lean();

    return jsonOk({
      categories: categories.map(serializeCategory),
    });
  } catch (error) {
    console.error('Admin categories GET error:', error);
    return jsonError('تعذر جلب التصنيفات حالياً', 500);
  }
}

// إنشاء تصنيف جديد.
export async function POST(request) {
  const access = await requireCategoryManager();

  if (access.error) {
    return jsonError(access.error, access.status);
  }

  const parsed = await readJsonBody(request);

  if (parsed.error) {
    return jsonError(parsed.error, parsed.status);
  }

  const { body } = parsed;

  const nameArResult = cleanText(body.nameAr, 100, 'الاسم العربي');
  if (nameArResult.error) return jsonError(nameArResult.error);

  const nameEnResult = cleanText(body.nameEn, 100, 'الاسم الإنجليزي');
  if (nameEnResult.error) return jsonError(nameEnResult.error);

  const rawSlug =
    typeof body.slug === 'string' && body.slug.trim()
      ? body.slug
      : nameEnResult.value;

  const slug = slugify(rawSlug);

  if (!slug) {
    return jsonError('المعرّف slug غير صالح');
  }

  const description =
    body.description === undefined || body.description === ''
      ? ''
      : cleanText(body.description, 500, 'الوصف');

  if (description.error) return jsonError(description.error);

  const coverImage = cleanCoverImage(body.coverImage);
  if (coverImage.error) return jsonError(coverImage.error);

  const order = body.order === undefined ? 0 : body.order;

  if (!isBoundedInt(order, -10000, 10000)) {
    return jsonError('ترتيب التصنيف يجب أن يكون رقماً صحيحاً');
  }

  if (body.isActive !== undefined && typeof body.isActive !== 'boolean') {
    return jsonError('حالة التصنيف غير صالحة');
  }

  try {
    const alreadyExists = await Category.exists({ slug });

    if (alreadyExists) {
      return jsonError('هذا الـslug مستخدم بالفعل', 409);
    }

    const category = await Category.create({
      nameAr: nameArResult.value,
      nameEn: nameEnResult.value,
      slug,
      description: description.value || '',
      coverImage: coverImage.value,
      order,
      isActive: body.isActive !== false,
    });

    await writeAudit({
      adminUserId: access.admin.userId,
      action: 'CREATE_CATEGORY',
      targetEntity: 'Category',
      entityId: category._id.toString(),
      newState: serializeCategory(category),
    });

    return jsonOk({ category: serializeCategory(category) }, 201);
  } catch (error) {
    console.error('Admin categories POST error:', error);
    return jsonError('تعذر إنشاء التصنيف حالياً', 500);
  }
}

// تعديل تصنيف موجود.
export async function PATCH(request) {
  const access = await requireCategoryManager();

  if (access.error) {
    return jsonError(access.error, access.status);
  }

  const parsed = await readJsonBody(request);

  if (parsed.error) {
    return jsonError(parsed.error, parsed.status);
  }

  const { body } = parsed;

  if (typeof body.id !== 'string' || !Types.ObjectId.isValid(body.id)) {
    return jsonError('معرّف التصنيف غير صالح');
  }

  try {
    const category = await Category.findById(body.id);

    if (!category) {
      return jsonError('التصنيف غير موجود', 404);
    }

    const before = serializeCategory(category);
    const updates = {};

    if (body.nameAr !== undefined) {
      const result = cleanText(body.nameAr, 100, 'الاسم العربي');
      if (result.error) return jsonError(result.error);
      updates.nameAr = result.value;
    }

    if (body.nameEn !== undefined) {
      const result = cleanText(body.nameEn, 100, 'الاسم الإنجليزي');
      if (result.error) return jsonError(result.error);
      updates.nameEn = result.value;
    }

    if (body.slug !== undefined) {
      if (typeof body.slug !== 'string') {
        return jsonError('الـslug غير صالح');
      }

      const slug = slugify(body.slug);

      if (!slug) {
        return jsonError('الـslug غير صالح');
      }

      updates.slug = slug;
    }

    if (body.description !== undefined) {
      if (body.description === '') {
        updates.description = '';
      } else {
        const result = cleanText(body.description, 500, 'الوصف');
        if (result.error) return jsonError(result.error);
        updates.description = result.value;
      }
    }

    if (body.coverImage !== undefined) {
      const result = cleanCoverImage(body.coverImage);
      if (result.error) return jsonError(result.error);
      updates.coverImage = result.value;
    }

    if (body.order !== undefined) {
      if (!isBoundedInt(body.order, -10000, 10000)) {
        return jsonError('ترتيب التصنيف يجب أن يكون رقماً صحيحاً');
      }

      updates.order = body.order;
    }

    if (body.isActive !== undefined) {
      if (typeof body.isActive !== 'boolean') {
        return jsonError('حالة التصنيف غير صالحة');
      }

      updates.isActive = body.isActive;
    }

    if (Object.keys(updates).length === 0) {
      return jsonError('لا توجد بيانات لتعديلها');
    }

    if (updates.slug && updates.slug !== category.slug) {
      const duplicate = await Category.exists({
        slug: updates.slug,
        _id: { $ne: category._id },
      });

      if (duplicate) {
        return jsonError('هذا الـslug مستخدم بالفعل', 409);
      }
    }

    category.set(updates);
    await category.save();

    await writeAudit({
      adminUserId: access.admin.userId,
      action: 'UPDATE_CATEGORY',
      targetEntity: 'Category',
      entityId: category._id.toString(),
      previousState: before,
      newState: serializeCategory(category),
    });

    return jsonOk({ category: serializeCategory(category) });
  } catch (error) {
    console.error('Admin categories PATCH error:', error);
    return jsonError('تعذر تعديل التصنيف حالياً', 500);
  }
}

// الحذف ممنوع إن كان التصنيف مرتبطاً بمسلسل.
export async function DELETE(request) {
  const access = await requireCategoryManager();

  if (access.error) {
    return jsonError(access.error, access.status);
  }

  const id = new URL(request.url).searchParams.get('id');

  if (!id || !Types.ObjectId.isValid(id)) {
    return jsonError('معرّف التصنيف غير صالح');
  }

  try {
    const category = await Category.findById(id);

    if (!category) {
      return jsonError('التصنيف غير موجود', 404);
    }

    const linkedSeriesCount = await Series.countDocuments({
      categoryIds: category._id,
    });

    if (linkedSeriesCount > 0) {
      return jsonError(
        `لا يمكن حذف التصنيف لأنه مرتبط بـ ${linkedSeriesCount} مسلسل. افصل المسلسلات عنه أولاً.`,
        409
      );
    }

    await category.deleteOne();

    await writeAudit({
      adminUserId: access.admin.userId,
      action: 'DELETE_CATEGORY',
      targetEntity: 'Category',
      entityId: id,
      previousState: serializeCategory(category),
    });

    return jsonOk({ success: true });
  } catch (error) {
    console.error('Admin categories DELETE error:', error);
    return jsonError('تعذر حذف التصنيف حالياً', 500);
  }
}