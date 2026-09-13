// ============================================================
// Universal In-Platform Upload Engine - منصة "يُتبع..."
// يتيح لمشرفي المنصة رفع جميع وسائط المحتوى مباشرة من داخل المنصة:
// بوسترات (Posters)، صور الواجهة (Hero Artwork)، مقاطع الفيديو،
// الملفات الصوتية، وملفات النصوص المتزامنة (SRT / VTT / JSON)
// ============================================================

import { NextResponse } from 'next/server';
import { getCurrentAdmin } from '@/lib/auth';
import {
  StorageService,
  getLegacyMultipartUploadPolicy,
  validateUploadAuthorizeInput,
  generateStorageKey,
  sanitizeFileName,
  isSupportedCategory,
  CATEGORY_CONFIGS,
  parseSubtitleText,
  isValidGeneratedStorageKey,
  extractStorageKey,
  verifyUploadTicket,
} from '@/lib/storage';
import { isStorageKeyReferencedInDb, validateUploadDeleteTicket, writeAudit } from '@/lib/admin/content-api';

const CONTENT_ROLES = ['SUPER_ADMIN', 'ADMIN', 'CONTENT_EDITOR'];

export async function POST(req: Request) {
  try {
    const admin = await getCurrentAdmin();
    if (!admin) {
      return NextResponse.json({ error: 'غير مصرح لك — يرجى تسجيل الدخول كمسؤول' }, { status: 401 });
    }
    if (!CONTENT_ROLES.includes(admin.role)) {
      return NextResponse.json({ error: 'ليس لديك صلاحية رفع الوسائط' }, { status: 403 });
    }

    const contentType = req.headers.get('content-type') || '';
    if (!contentType.toLowerCase().includes('multipart/form-data')) {
      return NextResponse.json({ error: 'الطلب يجب أن يكون multipart/form-data' }, { status: 415 });
    }

    let formData: FormData;
    try {
      formData = await req.formData();
    } catch {
      return NextResponse.json({ error: 'تعذر معالجة بيانات النموذج' }, { status: 400 });
    }

    const file = formData.get('file');
    const categoryRaw = formData.get('category');
    const category = typeof categoryRaw === 'string' ? categoryRaw.toLowerCase().trim() : '';

    if (
      !(file instanceof File) ||
      typeof file.size !== 'number' ||
      !Number.isFinite(file.size) ||
      !Number.isInteger(file.size) ||
      file.size <= 0
    ) {
      return NextResponse.json({ error: 'لم يتم إرسال أي ملف أو الملف فارغ' }, { status: 400 });
    }

    // 1. معالجة ملفات النصوص والترجمات (Transcripts) - فحص الحجم والامتداد والنوع قبل قراءة المحتوى
    if (category === 'transcript') {
      const MAX_TRANSCRIPT_SIZE = 10 * 1024 * 1024; // 10MB
      if (file.size > MAX_TRANSCRIPT_SIZE) {
        return NextResponse.json(
          { error: 'حجم ملف الترجمة يتجاوز الحد الأقصى المسموح (10 ميغابايت)' },
          { status: 413 }
        );
      }

      const cleanName = sanitizeFileName(file.name);
      const ext = cleanName.split('.').pop()?.toLowerCase() || '';
      if (!['srt', 'vtt', 'json'].includes(ext)) {
        return NextResponse.json(
          { error: 'صيغة ملف الترجمة غير مدعومة. الصيغ المدعومة: SRT أو WebVTT أو JSON' },
          { status: 400 }
        );
      }

      const rawMime = (file.type || '').split(';')[0].trim().toLowerCase();
      if (rawMime) {
        const allowedTranscriptMimes = [
          'text/plain',
          'text/vtt',
          'text/x-vtt',
          'application/json',
          'application/x-subrip',
        ];
        if (!allowedTranscriptMimes.includes(rawMime)) {
          return NextResponse.json(
            { error: `نوع المحتوى (${rawMime}) غير صالح لملفات الترجمة والنصوص المتزامنة` },
            { status: 415 }
          );
        }
      }

      const text = await file.text();
      if (!text || text.trim().length === 0) {
        return NextResponse.json({ error: 'ملف الترجمة فارغ' }, { status: 400 });
      }
      if (text.length > 5 * 1024 * 1024) {
        return NextResponse.json(
          { error: 'محتوى ملف الترجمة يتجاوز الحد الأقصى المسموح للقراءة' },
          { status: 413 }
        );
      }

      const segments = parseSubtitleText(text);
      if (segments.length === 0) {
        return NextResponse.json(
          { error: 'لم يتم العثور على مقاطع صالحة في الملف أو توقيت المقاطع غير صحيح' },
          { status: 400 }
        );
      }
      return NextResponse.json({
        success: true,
        category: 'transcript',
        filename: cleanName,
        segmentsCount: segments.length,
        segments,
      });
    }

    // 2. في بيئة الإنتاج: يُمنع رفع وسائط الصور والصوت والفيديو عبر خادم المنصة (يجب استخدام الرفع المباشر إلى Cloudflare R2)
    const uploadPolicy = getLegacyMultipartUploadPolicy();
    if (!uploadPolicy.allowed) {
      return NextResponse.json(
        { error: 'رفع وسائط الصور والصوت والفيديو عبر الخادم غير متاح في بيئة الإنتاج. يجب استخدام مسار الرفع المباشر إلى Cloudflare R2.' },
        { status: 400 }
      );
    }

    // 3. استنتاج MIME إذا كان فارغاً أو octet-stream من المتصفح
    const cleanExt = sanitizeFileName(file.name).split('.').pop()?.toLowerCase() || '';
    const catConfig = isSupportedCategory(category) ? CATEGORY_CONFIGS[category] : null;
    const fallbackMime = catConfig?.extensionToMime[cleanExt] || file.type || 'application/octet-stream';
    const effectiveType = file.type && file.type !== 'application/octet-stream' ? file.type : fallbackMime;

    // 3. التحقق الصارم من نوع الملف والحجم
    const validation = validateUploadAuthorizeInput({
      fileName: file.name,
      fileType: effectiveType,
      fileSize: file.size,
      category,
    });

    if (!validation.ok) {
      return NextResponse.json({ error: validation.error }, { status: validation.status });
    }

    const { folder, extension, canonicalMime, isProtected } = validation.data;
    const storageKey = generateStorageKey(folder, extension);

    const buffer = Buffer.from(await file.arrayBuffer());
    const uploadResult = await StorageService.uploadMedia(storageKey, buffer, canonicalMime);

    const publicUrl = isProtected ? '' : uploadResult.publicUrl;

    await writeAudit({
      adminUserId: admin.userId,
      action: 'DIRECT_MEDIA_UPLOAD',
      targetEntity: 'MediaAsset',
      entityId: storageKey,
      newState: {
        category,
        key: uploadResult.key,
        url: publicUrl,
        sizeBytes: file.size,
        contentType: canonicalMime,
      },
    }).catch(() => {});

    return NextResponse.json({
      success: true,
      category,
      key: uploadResult.key,
      url: publicUrl,
      sizeBytes: file.size,
      contentType: canonicalMime,
    });
  } catch (error) {
    console.error('Direct media upload error:', error);
    return NextResponse.json(
      { error: 'حدث خطأ غير متوقع أثناء معالجة رفع الملف' },
      { status: 500 }
    );
  }
}

export async function DELETE(req: Request) {
  try {
    const admin = await getCurrentAdmin();
    if (!admin || !CONTENT_ROLES.includes(admin.role)) {
      return NextResponse.json({ error: 'غير مصرح لك بحذف الوسائط' }, { status: 401 });
    }

    let body: any;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: 'صيغة البيانات المرسلة غير صالحة' }, { status: 400 });
    }

    const { key, url, storageKey, ticket } = body || {};
    const candidate =
      (typeof key === 'string' && key.trim()) ||
      (typeof storageKey === 'string' && storageKey.trim()) ||
      (typeof url === 'string' && url.trim()) ||
      '';
    if (!candidate) {
      return NextResponse.json({ error: 'معرف الملف غير محدد' }, { status: 400 });
    }

    const cleanKey =
      extractStorageKey(candidate) ||
      (isValidGeneratedStorageKey(candidate.replace(/^\/+/, '')) ? candidate.trim().replace(/^\/+/, '') : null);

    if (!cleanKey) {
      return NextResponse.json({ error: 'معرف الملف غير صالح للحذف' }, { status: 400 });
    }

    // التحقق الصارم من وجود رمز تفويض الرفع (ticket) ومطابقته للمشرف والملف المطلوب حذفه
    const ticketValidation = validateUploadDeleteTicket(ticket, admin.userId, cleanKey);
    if (!ticketValidation.ok) {
      return NextResponse.json({ error: ticketValidation.error }, { status: ticketValidation.status });
    }

    // الحماية من حذف أي ملف مرتبط بمحتوى قائم في قاعدة البيانات حتى لو كانت التذكرة صالحة
    const isReferenced = await isStorageKeyReferencedInDb(cleanKey);
    if (isReferenced) {
      return NextResponse.json(
        { error: 'لا يمكن حذف هذا الملف لأنه مستخدم ومرتبط بمحتوى مسجل في المنصة' },
        { status: 409 }
      );
    }

    const success = await StorageService.deleteMedia(cleanKey);
    await writeAudit({
      adminUserId: admin.userId,
      action: 'DIRECT_MEDIA_DELETE',
      targetEntity: 'MediaAsset',
      entityId: cleanKey,
      newState: { key: cleanKey, success },
    }).catch(() => {});

    return NextResponse.json({ success, key: cleanKey });
  } catch (error) {
    console.error('Direct media delete error:', error);
    return NextResponse.json(
      { error: 'حدث خطأ غير متوقع أثناء حذف الملف' },
      { status: 500 }
    );
  }
}
