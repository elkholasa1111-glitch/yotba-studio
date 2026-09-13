// ============================================================
// Secure admin audio upload to Cloudflare R2
// رفع ملفات صوت الحلقات من لوحة الإدارة إلى تخزين R2 الخاص
// المفاتيح تُولَّد حصراً من معرّف الحلقة — لا ثقة باسم الملف أو مساره
// ============================================================

import { isValidObjectId } from 'mongoose';
import { getCurrentAdmin } from '@/lib/auth';
import { connectDB } from '@/lib/db/connect';
import { Episode } from '@/lib/db/models';
import { StorageService, getLegacyMultipartUploadPolicy } from '@/lib/storage';
import { jsonOk, jsonError, writeAudit } from '@/lib/admin/content-api';
import {
  CONTENT_PREVIEW_ROLES,
  validateAudioPreviewPolicy,
  resolvePublicPlatformUrl,
} from '@/lib/config/public-platform';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const CONTENT_ROLES = CONTENT_PREVIEW_ROLES as readonly string[];

/** قائمة MIME المسموحة مع الامتداد الآمن المقابل (لا نستخدم اسم الملف أبداً) */
const ALLOWED_AUDIO_TYPES: Record<string, string> = {
  'audio/mpeg': 'mp3',
  'audio/mp3': 'mp3',
  'audio/mp4': 'm4a',
  'audio/x-m4a': 'm4a',
  'audio/aac': 'aac',
  'audio/ogg': 'ogg',
  'audio/webm': 'weba',
  'audio/wav': 'wav',
  'audio/wave': 'wav',
  'audio/x-wav': 'wav',
};

export async function POST(req: Request) {
  const admin = await getCurrentAdmin();
  if (!admin) return jsonError('غير مصرح لك', 401);
  if (!CONTENT_ROLES.includes(admin.role)) return jsonError('ليس لديك صلاحية تعديل المحتوى', 403);

  // في الإنتاج: يُمنع استخدام مسار multipart القديم ويشترط الرفع المباشر إلى Cloudflare R2
  const uploadPolicy = getLegacyMultipartUploadPolicy();
  if (!uploadPolicy.allowed) {
    return jsonError(
      uploadPolicy.errorMessage ||
        'رفع الملفات الصوتية عبر multipart غير مدعوم في بيئة الإنتاج. يجب استخدام مسار الرفع المباشر من المتصفح إلى Cloudflare R2.',
      400
    );
  }

  const contentType = req.headers.get('content-type') || '';
  if (!contentType.toLowerCase().includes('multipart/form-data')) {
    return jsonError('الطلب يجب أن يكون multipart/form-data', 415);
  }

  const conn = await connectDB();
  if (!conn) return jsonError('قاعدة البيانات غير متاحة', 503);

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return jsonError('تعذر قراءة بيانات الطلب', 400);
  }

  const episodeIdRaw = formData.get('episodeId');
  const episodeId = typeof episodeIdRaw === 'string' ? episodeIdRaw : null;
  if (!episodeId || !isValidObjectId(episodeId)) {
    return jsonError('معرّف الحلقة غير صالح', 400);
  }

  const file = formData.get('file');
  if (!(file instanceof File) || file.size === 0) {
    return jsonError('ملف الصوت مطلوب', 400);
  }
  const fileContentType = (file.type || '').toLowerCase();
  const extension = ALLOWED_AUDIO_TYPES[fileContentType];
  if (!extension) {
    return jsonError('نوع الملف غير مدعوم — المسموح: MP3, M4A, AAC, OGG, WAV, WEBM', 415);
  }

  const episode = await Episode.findById(episodeId);
  if (!episode) return jsonError('الحلقة غير موجودة', 404);

  // مفتاح حتمي آمن: episodes/<ObjectId>/audio.<ext> — لا مسار من المستخدم
  const storageKey = `episodes/${episodeId}/audio.${extension}`;

  let buffer: Buffer;
  try {
    buffer = Buffer.from(await file.arrayBuffer());
  } catch {
    return jsonError('تعذر قراءة الملف', 400);
  }

  try {
    await StorageService.uploadMedia(storageKey, buffer, fileContentType);
  } catch (error) {
    console.error('Admin audio upload error:', error);
    return jsonError('فشل رفع الملف إلى التخزين', 503);
  }

  // الصوت المدفوع يبقى محمياً: نعتمد المفتاح والبث الموقع، لا رابط عام دائم
  episode.audioStorageKey = storageKey;
  episode.audioPublicUrl = undefined;
  await episode.save();

  await writeAudit({
    adminUserId: admin.userId,
    action: 'UPLOAD_EPISODE_AUDIO',
    targetEntity: 'Episode',
    entityId: episodeId,
    newState: { storageKey, sizeBytes: file.size, contentType: fileContentType },
  });

  return jsonOk({
    success: true,
    key: storageKey,
    sizeBytes: file.size,
    contentType: fileContentType,
  });
}
// GET: جلب رابط البث الصوتي الآمن للمعاينة الإدارية (حصراً للمشرفين المصرح لهم)
export async function GET(req: Request) {
  const admin = await getCurrentAdmin();
  if (!admin) return jsonError('غير مصرح لك — يرجى تسجيل الدخول كمسؤول', 401);
  if (!CONTENT_ROLES.includes(admin.role)) {
    return jsonError('ليس لديك صلاحية معاينة الصوتيات الإدارية', 403);
  }

  const { searchParams } = new URL(req.url);
  const episodeId = searchParams.get('episodeId');
  if (!episodeId || !isValidObjectId(episodeId)) {
    return jsonError('معرّف الحلقة غير صالح', 400);
  }

  const conn = await connectDB();
  if (!conn) return jsonError('قاعدة البيانات غير متاحة', 503);

  const episode = await Episode.findById(episodeId);
  if (!episode) return jsonError('الحلقة غير موجودة', 404);

  const policy = validateAudioPreviewPolicy(episode);
  if (!policy.canPreview) {
    if (policy.reason === 'PREMIUM_REQUIRES_PROTECTED_STORAGE_KEY') {
      return jsonError('هذه الحلقة مدفوعة ولا تملك ملفاً صوتياً في التخزين المحمي R2. لا يمكن استخدام روابط عامة للصوت المدفوع.', 400);
    }
    return jsonError('لا يوجد ملف صوتي متاح لمعاينة هذه الحلقة', 404);
  }

  if (policy.streamType === 'protected' && episode.audioStorageKey) {
    try {
      const streamUrl = await StorageService.getProtectedAudioUrl(episode.audioStorageKey, 900);
      return jsonOk({
        streamUrl,
        isProtected: true,
        durationMs: episode.durationMs,
        title: episode.title,
      });
    } catch (storageErr) {
      console.warn('Storage fetch failed for audio preview:', storageErr);
      return jsonError('تعذر توليد رابط البث من خدمة التخزين', 503);
    }
  }

  if (policy.streamType === 'public_free' && episode.audioPublicUrl) {
    const rawUrl = episode.audioPublicUrl.trim();
    let streamUrl = rawUrl;
    if (rawUrl.startsWith('/')) {
      streamUrl = resolvePublicPlatformUrl(rawUrl);
    }
    return jsonOk({
      streamUrl,
      isProtected: false,
      durationMs: episode.durationMs,
      title: episode.title,
    });
  }

  return jsonError('الملف الصوتي غير متوفر لهذه الحلقة', 404);
}
