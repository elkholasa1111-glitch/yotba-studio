import { NextResponse } from 'next/server';
import { getCurrentAdmin } from '@/lib/auth';
import {
  StorageService,
  validateUploadFinalizeInput,
  validateVerifiedMetadata,
  verifyUploadTicket,
} from '@/lib/storage';
import { writeAudit } from '@/lib/admin/content-api';

const CONTENT_ROLES = ['SUPER_ADMIN', 'ADMIN', 'CONTENT_EDITOR'];

export async function POST(req: Request) {
  try {
    const admin = await getCurrentAdmin();
    if (!admin || !CONTENT_ROLES.includes(admin.role)) {
      return NextResponse.json({ error: 'غير مصرح لك بتأكيد وسائط المحتوى' }, { status: 401 });
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: 'صيغة البيانات المرسلة غير صالحة' }, { status: 400 });
    }

    // 1. التحقق من بنية ومعرّف التخزين ومطابقته لفئة الوسائط
    const inputValidation = validateUploadFinalizeInput(body);
    if (!inputValidation.ok) {
      return NextResponse.json({ error: inputValidation.error }, { status: inputValidation.status });
    }

    const { storageKey, category, fileName, isProtected } = inputValidation.data;
    const { ticket } = (body as Record<string, unknown>) || {};

    // 2. التحقق الصارم من تذكرة التفويض الموقعة (HMAC) قبل أي استعلام HEAD على التخزين
    const ticketValidation = verifyUploadTicket(ticket, admin.userId, storageKey);
    if (!ticketValidation.ok) {
      return NextResponse.json({ error: ticketValidation.error }, { status: ticketValidation.status });
    }

    const authorizedTicket = ticketValidation.data;
    if (authorizedTicket.category !== category) {
      return NextResponse.json(
        { error: 'فئة الوسائط المطلوبة لا تطابق الفئة المصرح بها في تذكرة الرفع' },
        { status: 400 }
      );
    }

    // 3. فحص وتأكيد وجود الملف الفعلي في سحابة التخزين (Cloudflare R2 / Local Storage)
    const verification = await StorageService.verifyMediaObject(storageKey);

    // 4. التحقق الصارم من البيانات الوصفية الحقيقية ومطابقتها للتذكرة المصرح بها
    // (فحص الحجم الفعلي مقابل الحجم المصرح به، ونوع المحتوى الفعلي مقابل النوع المصرح به)
    const metadataValidation = validateVerifiedMetadata(authorizedTicket, verification);
    if (!metadataValidation.ok) {
      return NextResponse.json({ error: metadataValidation.error }, { status: metadataValidation.status });
    }

    // 5. حماية الصوت: الملفات الصوتية لا تمنح أي رابط عام دائم
    const publicUrl = isProtected ? '' : StorageService.getPublicMediaUrl(storageKey);

    await writeAudit({
      adminUserId: admin.userId,
      action: 'DIRECT_MEDIA_FINALIZED',
      targetEntity: 'MediaAsset',
      entityId: storageKey,
      newState: {
        category,
        fileName,
        storageKey,
        publicUrl,
        sizeBytes: metadataValidation.data.sizeBytes,
        contentType: metadataValidation.data.contentType,
      },
    }).catch(() => {});

    return NextResponse.json({
      success: true,
      verified: true,
      storageKey,
      publicUrl,
      sizeBytes: metadataValidation.data.sizeBytes,
      contentType: metadataValidation.data.contentType,
    });
  } catch (error) {
    console.error('Finalize media upload error:', error);
    return NextResponse.json(
      { error: 'حدث خطأ داخلي أثناء اعتماد الملف' },
      { status: 500 }
    );
  }
}

