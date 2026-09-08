// ============================================================
// Secure admin audio upload to Cloudflare R2
// رفع ملفات صوت الحلقات من لوحة الإدارة إلى تخزين R2 الخاص
// المفاتيح تُولَّد حصراً من معرّف الحلقة — لا ثقة باسم الملف أو مساره
// ============================================================

import { isValidObjectId } from 'mongoose';
import { getCurrentAdmin } from '@/lib/auth';
import { connectDB } from '@/lib/db/connect';
import { Episode } from '@/lib/db/models';
import { StorageService } from '@/lib/storage';
import { hasR2Configuration, isProductionRuntime } from '@/lib/config/runtime';
import { jsonOk, jsonError, writeAudit } from '@/lib/admin/content-api';

const CONTENT_ROLES = ['SUPER_ADMIN', 'ADMIN', 'CONTENT_EDITOR'];
const MAX_AUDIO_BYTES = 50 * 1024 * 1024; // 50MB — حد مناسب لبيئات serverless

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

  // في الإنتاج يتطلب الرفع ضبط R2 — لا محاكاة إطلاقاً في الإنتاج
  if (!hasR2Configuration() && isProductionRuntime()) {
    return jsonError('خدمة التخزين غير مهيأة في هذه البيئة — لا يمكن الرفع', 503);
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
  if (file.size > MAX_AUDIO_BYTES) {
    return jsonError('حجم الملف يتجاوز الحد الأقصى (50 ميغابايت)', 413);
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
    if (!hasR2Configuration()) {
      return jsonError('خدمة التخزين غير مهيأة — لا يمكن الرفع', 503);
    }
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
