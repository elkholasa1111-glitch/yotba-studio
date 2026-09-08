import { NextResponse } from 'next/server';
import { getCurrentAdmin } from '@/lib/auth';
import {
  StorageService,
  validateUploadAuthorizeInput,
  generateStorageKey,
  createUploadTicket,
} from '@/lib/storage';

const CONTENT_ROLES = ['SUPER_ADMIN', 'ADMIN', 'CONTENT_EDITOR'];

export async function POST(req: Request) {
  try {
    const admin = await getCurrentAdmin();
    if (!admin || !CONTENT_ROLES.includes(admin.role)) {
      return NextResponse.json({ error: 'غير مصرح لك بطلب ترخيص رفع الوسائط' }, { status: 401 });
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: 'صيغة البيانات المرسلة غير صالحة' }, { status: 400 });
    }

    const validation = validateUploadAuthorizeInput(body);
    if (!validation.ok) {
      return NextResponse.json({ error: validation.error }, { status: validation.status });
    }

    const { folder, extension, canonicalMime, isProtected, fileSize, category } = validation.data;

    // توليد مسار التخزين الفريد والمحصن في R2
    const storageKey = generateStorageKey(folder, extension);

    // إصدار تذكرة تفويض مشفرة وموقعة بالـ HMAC لربط المشرف بالملف والحجم والنوع والصلاحية
    const ticket = createUploadTicket({
      adminId: admin.userId,
      storageKey,
      category,
      expectedSizeBytes: fileSize,
      canonicalMime,
      expiresAt: Date.now() + 3600 * 1000,
    });

    // توليد Presigned URL للرفع المباشر إلى Cloudflare R2
    const presigned = await StorageService.getUploadPresignedUrl(
      storageKey,
      canonicalMime,
      3600 // ساعة كاملة للملفات الكبيرة
    );

    if (presigned) {
      return NextResponse.json({
        success: true,
        directR2: true,
        uploadUrl: presigned.uploadUrl,
        publicUrl: isProtected ? '' : presigned.publicUrl,
        storageKey: presigned.key,
        ticket,
        headers: {
          'Content-Type': canonicalMime,
        },
      });
    }

    // في حال عدم توفر مفاتيح R2 (مثل بيئة التطوير المحلية غير المربوطة)
    return NextResponse.json({
      success: true,
      directR2: false,
      fallbackUploadUrl: '/api/v1/admin/upload',
      storageKey,
      ticket,
      publicUrl: '',
    });
  } catch (error) {
    console.error('Upload authorization error:', error);
    return NextResponse.json(
      { error: 'حدث خطأ غير متوقع أثناء ترخيص رفع الوسائط' },
      { status: 500 }
    );
  }
}

