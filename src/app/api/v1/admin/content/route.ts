// ============================================================
// Admin Content Management API (Catalog CMS)
// إدارة المحتوى الكاملة: مسلسلات، مواسم، حلقات، نصوص متزامنة
// يتطلب صلاحيات الإدارة (ADMIN / SUPER_ADMIN / CONTENT_EDITOR)
// كل عملية تُسجَّل في AdminAuditLog وتعيد DTO آمناً فقط
// ============================================================

import { NextResponse } from 'next/server';
import { isValidObjectId, Types } from 'mongoose';
import { getCurrentAdmin } from '@/lib/auth';
import { connectDB } from '@/lib/db/connect';
import { Series, Season, Episode, Transcript, AdminAuditLog, Purchase, Entitlement } from '@/lib/db/models';
import {
  jsonOk,
  jsonError,
  slugify,
  isSafeHttpUrl,
  containsHtml,
  stripControlChars,
  isPlainObject,
  isNonEmptyString,
  isBoundedInt,
  isBoundedNumber,
  parseStringArray,
  writeAudit,
  diffFields,
} from '@/lib/admin/content-api';

const CONTENT_ROLES = ['SUPER_ADMIN', 'ADMIN', 'CONTENT_EDITOR'];
const CONTENT_RATINGS = ['GENERAL', 'PG13', 'PG16', 'PG18'];
const RELEASE_STATUSES = ['AVAILABLE', 'COMING_SOON', 'IN_PRODUCTION'];
const CURRENCIES = ['USD'];

const MAX_SERIES_TITLE = 150;
const MAX_SLUG = 120;
const MAX_HOOK = 300;
const MAX_DESCRIPTION = 5000;
const MAX_URL = 500;
const MAX_GENRES = 12;
const MAX_WARNINGS = 10;
const MAX_SEASON_TITLE = 150;
const MAX_EPISODE_TITLE = 150;
const MAX_TEASER = 500;
const MAX_DURATION_MS = 86_400_000;
const MAX_SEGMENTS = 2000;
const MAX_SEGMENT_TEXT = 1000;
const MAX_JSON_BODY_BYTES = 3 * 1024 * 1024; // سماحية جسم الطلب JSON (نصوص متزامنة ضخمة محتملة)

// ============================================================
// أدوات داخلية
// ============================================================

async function parseJsonBody(req: Request): Promise<{ ok: true; body: Record<string, unknown> } | { ok: false; status: number; error: string }> {
  const contentType = req.headers.get('content-type') || '';
  if (!contentType.toLowerCase().includes('application/json')) {
    return { ok: false, status: 415, error: 'نوع المحتوى يجب أن يكون application/json' };
  }
  const contentLength = Number(req.headers.get('content-length') || '0');
  if (Number.isFinite(contentLength) && contentLength > MAX_JSON_BODY_BYTES) {
    return { ok: false, status: 413, error: 'حجم الطلب كبير جداً' };
  }
  try {
    const body = await req.json();
    if (!isPlainObject(body)) {
      return { ok: false, status: 400, error: 'بيانات غير صالحة' };
    }
    return { ok: true, body };
  } catch {
    return { ok: false, status: 400, error: 'بيانات غير صالحة' };
  }
}

function checkAdminRole(admin: { role: string }) {
  return CONTENT_ROLES.includes(admin.role);
}

async function syncSeriesCounters(seriesId: string) {
  const [seasonsCount, episodes] = await Promise.all([
    Season.countDocuments({ seriesId }),
    Episode.find({ seriesId }).select('durationMs').lean(),
  ]);
  const totalDurationMs = (episodes as any[]).reduce((acc, ep) => acc + (Number(ep.durationMs) || 0), 0);
  await Series.findByIdAndUpdate(seriesId, {
    totalSeasonsCount: seasonsCount,
    totalEpisodesCount: episodes.length,
    totalDurationSeconds: Math.round(totalDurationMs / 1000),
  });
}

async function syncSeasonEpisodesCount(seasonId: string) {
  await Season.findByIdAndUpdate(seasonId, { episodesCount: await Episode.countDocuments({ seasonId }) });
}

interface SegmentInput {
  id: string;
  startMs: number;
  endMs: number;
  text: string;
  order: number;
}

function validateSegments(value: unknown): { ok: true; segments: SegmentInput[]; lastEndMs: number } | { ok: false; error: string } {
  if (!Array.isArray(value) || value.length === 0) {
    return { ok: false, error: 'يجب إرسال مقاطع النص كمصفوفة غير فارغة' };
  }
  if (value.length > MAX_SEGMENTS) {
    return { ok: false, error: `الحد الأقصى ${MAX_SEGMENTS} مقطعاً للنص` };
  }
  const segments: SegmentInput[] = [];
  let previousStart = -1;
  let previousEnd = -1;
  for (let i = 0; i < value.length; i++) {
    const raw = value[i];
    if (!isPlainObject(raw)) return { ok: false, error: `المقطع ${i + 1}: بيانات غير صالحة` };
    const { startMs, endMs, text } = raw as Record<string, unknown>;
    if (!isBoundedInt(startMs, 0, MAX_DURATION_MS)) return { ok: false, error: `المقطع ${i + 1}: وقت البدء غير صالح` };
    if (!isBoundedInt(endMs, 0, MAX_DURATION_MS)) return { ok: false, error: `المقطع ${i + 1}: وقت الانتهاء غير صالح` };
    if (endMs < startMs) return { ok: false, error: `المقطع ${i + 1}: وقت الانتهاء قبل وقت البدء` };
    if (typeof text !== 'string') return { ok: false, error: `المقطع ${i + 1}: النص مفقود` };
    const cleanedText = stripControlChars(text).trim();
    if (cleanedText.length === 0 || cleanedText.length > MAX_SEGMENT_TEXT) {
      return { ok: false, error: `المقطع ${i + 1}: طول النص يجب أن يكون بين 1 و ${MAX_SEGMENT_TEXT} حرفاً` };
    }
    if (containsHtml(cleanedText)) return { ok: false, error: `المقطع ${i + 1}: النص يجب ألا يحتوي وسوم HTML` };
    if (startMs < previousStart) return { ok: false, error: `المقطع ${i + 1}: أوقات البدء يجب أن تكون تصاعدية` };
    if (startMs < previousEnd) return { ok: false, error: `المقطع ${i + 1}: يتداخل زمنياً مع المقطع السابق` };
    previousStart = startMs;
    previousEnd = endMs;
    segments.push({ id: `seg-${i + 1}`, startMs, endMs, text: cleanedText, order: i + 1 });
  }
  return { ok: true, segments, lastEndMs: segments[segments.length - 1].endMs };
}

function seriesSummary(s: any) {
  return {
    title: s.title,
    slug: s.slug,
    featured: s.featured,
    publishedAt: s.publishedAt,
    freeEpisodesCount: s.freeEpisodesCount,
  };
}

// ============================================================
// GET: DTO كامل قابل للتحرير في اللوحة
// ============================================================

export async function GET(req: Request) {
  const admin = await getCurrentAdmin();
  if (!admin) {
    return jsonError('غير مصرح لك', 401);
  }

  const conn = await connectDB();
  if (!conn) {
    return jsonError('قاعدة البيانات غير متاحة حالياً', 503);
  }

  // جلب نص متزامن واحد للتحرير: ?transcriptOf=<episodeId>
  const transcriptOf = new URL(req.url).searchParams.get('transcriptOf');
  if (transcriptOf !== null) {
    if (!isValidObjectId(transcriptOf)) return jsonError('معرّف الحلقة غير صالح', 400);
    try {
      const transcript = await Transcript.findOne({ episodeId: new Types.ObjectId(transcriptOf) }).lean();
      return jsonOk({
        segments: transcript && Array.isArray((transcript as any).segments)
          ? (transcript as any).segments.map((seg: any) => ({ startMs: seg.startMs, endMs: seg.endMs, text: seg.text }))
          : [],
      });
    } catch (error) {
      console.error('Admin get transcript error:', error);
      return jsonError('فشل جلب النص المتزامن', 500);
    }
  }

  try {
    const [seriesDocs, seasons, episodes, transcripts] = await Promise.all([
      Series.find().sort({ publishedAt: -1 }).lean(),
      Season.find().sort({ seasonNumber: 1 }).lean(),
      Episode.find().sort({ episodeNumber: 1 }).lean(),
      Transcript.find().select('episodeId segments.order').lean(),
    ]);

    const segmentsCountByEpisode = new Map<string, number>();
    for (const t of transcripts as any[]) {
      const key = t.episodeId?.toString();
      if (key) segmentsCountByEpisode.set(key, Array.isArray(t.segments) ? t.segments.length : 0);
    }

    const result = (seriesDocs as any[]).map((s) => ({
      _id: s._id.toString(),
      title: s.title,
      slug: s.slug,
      posterUrl: s.posterUrl,
      heroArtworkUrl: s.heroArtworkUrl,
      hook: s.hook,
      description: s.description,
      genres: Array.isArray(s.genres) ? s.genres : [],
      contentRating: s.contentRating,
      contentWarnings: Array.isArray(s.contentWarnings) ? s.contentWarnings : [],
      productionYear: s.productionYear,
      shareVideoUrl: s.shareVideoUrl ?? null,
      isCompleted: Boolean(s.isCompleted),
      featured: Boolean(s.featured),
      publishedAt: s.publishedAt ? new Date(s.publishedAt).toISOString() : null,
      freeEpisodesCount: s.freeEpisodesCount,
      seasons: (seasons as any[])
        .filter((sn) => sn.seriesId?.toString() === s._id.toString())
        .map((sn) => ({
          _id: sn._id.toString(),
          seasonNumber: sn.seasonNumber,
          title: sn.title,
          description: sn.description ?? null,
          price: sn.price,
          currency: sn.currency,
          releaseStatus: sn.releaseStatus,
          episodesCount: sn.episodesCount,
          episodes: (episodes as any[])
            .filter((ep) => ep.seasonId?.toString() === sn._id.toString())
            .map((ep) => ({
              _id: ep._id.toString(),
              episodeNumber: ep.episodeNumber,
              title: ep.title,
              teaser: ep.teaser ?? null,
              durationMs: ep.durationMs,
              isFree: Boolean(ep.isFree),
              publishDate: ep.publishDate ? new Date(ep.publishDate).toISOString() : null,
              artworkOverride: ep.artworkOverride ?? null,
              audioStatus: ep.audioPublicUrl ? 'PUBLIC' : ep.audioStorageKey ? 'PROTECTED' : 'MISSING',
              audioPublicUrl: ep.audioPublicUrl ?? null,
              audioStorageKey: ep.audioStorageKey ?? null,
              hasTranscript: segmentsCountByEpisode.has(ep._id.toString()),
              transcriptSegmentsCount: segmentsCountByEpisode.get(ep._id.toString()) ?? 0,
            })),
        })),
    }));

    return jsonOk({ series: result });
  } catch (error) {
    console.error('Admin get content error:', error);
    return jsonError('فشل جلب المحتوى', 500);
  }
}

// ============================================================
// POST: إنشاء مسلسل / موسم / حلقة، وحفظ النص المتزامن (upsert)
// ============================================================

export async function POST(req: Request) {
  const admin = await getCurrentAdmin();
  if (!admin) return jsonError('غير مصرح لك', 401);
  if (!checkAdminRole(admin)) return jsonError('ليس لديك صلاحية تعديل المحتوى', 403);

  const conn = await connectDB();
  if (!conn) return jsonError('قاعدة البيانات غير متاحة', 503);

  const parsed = await parseJsonBody(req);
  if (!parsed.ok) return jsonError(parsed.error, parsed.status);
  const body = parsed.body;
  const entity = body.entity;

  try {
    // ---------- إنشاء مسلسل ----------
    if (entity === 'series') {
      if (!isNonEmptyString(body.title, 1, MAX_SERIES_TITLE)) return jsonError('عنوان المسلسل مطلوب (حتى 150 حرفاً)');
      const title = stripControlChars(body.title).trim();
      if (containsHtml(title)) return jsonError('العنوان يجب ألا يحتوي وسوم HTML');

      const rawSlug = typeof body.slug === 'string' && body.slug.trim() ? body.slug : title;
      const slug = slugify(rawSlug);
      if (!slug || slug.length > MAX_SLUG) return jsonError('المعرّف (slug) غير صالح — استخدم حروفاً وأرقاماً وشرطات فقط');

      if (!isNonEmptyString(body.hook, 1, MAX_HOOK)) return jsonError('الجملة التسويقية مطلوبة (حتى 300 حرف)');
      const hook = stripControlChars(body.hook).trim();
      if (containsHtml(hook)) return jsonError('الجملة التسويقية يجب ألا تحتوي وسوم HTML');
      if (!isNonEmptyString(body.description, 1, MAX_DESCRIPTION)) return jsonError('الوصف مطلوب (حتى 5000 حرف)');
      const description = stripControlChars(body.description).trim();
      if (containsHtml(description)) return jsonError('الوصف يجب ألا يحتوي وسوم HTML');

      if (!isNonEmptyString(body.posterUrl, 1, MAX_URL) || !isSafeHttpUrl(body.posterUrl.trim())) {
        return jsonError('رابط صورة الغلاف مطلوب ويجب أن يكون رابطاً صالحاً');
      }
      if (!isNonEmptyString(body.heroArtworkUrl, 1, MAX_URL) || !isSafeHttpUrl(body.heroArtworkUrl.trim())) {
        return jsonError('رابط صورة الواجهة مطلوب ويجب أن يكون رابطاً صالحاً');
      }

      const genres = body.genres === undefined ? [] : parseStringArray(body.genres, MAX_GENRES, 50);
      if (genres === null) return jsonError('التصنيفات غير صالحة');
      const contentWarnings = body.contentWarnings === undefined ? [] : parseStringArray(body.contentWarnings, MAX_WARNINGS, 100);
      if (contentWarnings === null) return jsonError('تحذيرات المحتوى غير صالحة');

      const contentRating = body.contentRating === undefined ? 'PG13' : body.contentRating;
      if (typeof contentRating !== 'string' || !CONTENT_RATINGS.includes(contentRating)) {
        return jsonError('تصنيف العمر غير صالح');
      }

      const productionYear = body.productionYear === undefined ? new Date().getFullYear() : body.productionYear;
      if (!isBoundedInt(productionYear, 1900, 2100)) return jsonError('سنة الإنتاج يجب أن تكون بين 1900 و 2100');

      const freeEpisodesCount = body.freeEpisodesCount === undefined ? 2 : body.freeEpisodesCount;
      if (!isBoundedInt(freeEpisodesCount, 0, 10)) return jsonError('عدد الحلقات المجانية يجب أن يكون بين 0 و 10');

      if (body.shareVideoUrl !== undefined && body.shareVideoUrl !== null && body.shareVideoUrl !== '') {
        if (typeof body.shareVideoUrl !== 'string' || !isSafeHttpUrl(body.shareVideoUrl.trim())) {
          return jsonError('رابط فيديو المشاركة غير صالح');
        }
      }

      const featured = body.featured === undefined ? false : body.featured === true;
      const isPublished = body.published === undefined ? true : body.published === true;

      const existing = await Series.exists({ slug });
      if (existing) return jsonError('المعرّف (slug) مستخدم مسبقاً لمسلسل آخر', 409);

      const series = await Series.create({
        title,
        slug,
        posterUrl: body.posterUrl.trim(),
        heroArtworkUrl: body.heroArtworkUrl.trim(),
        hook,
        description,
        genres,
        contentWarnings,
        contentRating,
        productionYear,
        freeEpisodesCount,
        featured,
        isCompleted: body.isCompleted === true,
        shareVideoUrl: typeof body.shareVideoUrl === 'string' && body.shareVideoUrl.trim() ? body.shareVideoUrl.trim() : undefined,
        publishedAt: isPublished ? new Date() : null,
      });

      await writeAudit({
        adminUserId: admin.userId,
        action: 'CREATE_SERIES',
        targetEntity: 'Series',
        entityId: series._id.toString(),
        newState: seriesSummary(series),
      });

      return jsonOk({ success: true, id: series._id.toString(), slug: series.slug }, 201);
    }

    // ---------- إنشاء موسم ----------
    if (entity === 'season') {
      const { seriesId } = body;
      if (typeof seriesId !== 'string' || !isValidObjectId(seriesId)) return jsonError('معرّف المسلسل غير صالح');
      const series = await Series.findById(seriesId);
      if (!series) return jsonError('المسلسل غير موجود', 404);

      if (!isBoundedInt(body.seasonNumber, 1, 100)) return jsonError('رقم الموسم يجب أن يكون بين 1 و 100');
      if (!isNonEmptyString(body.title, 1, MAX_SEASON_TITLE)) return jsonError('عنوان الموسم مطلوب (حتى 150 حرفاً)');
      const title = stripControlChars(body.title).trim();
      if (containsHtml(title)) return jsonError('العنوان يجب ألا يحتوي وسوم HTML');

      let description: string | undefined;
      if (body.description !== undefined && body.description !== null && body.description !== '') {
        if (!isNonEmptyString(body.description, 1, 2000)) return jsonError('وصف الموسم يجب أن يكون بين 1 و 2000 حرف');
        description = stripControlChars(body.description).trim();
        if (containsHtml(description)) return jsonError('الوصف يجب ألا يحتوي وسوم HTML');
      }

      const releaseStatus = body.releaseStatus === undefined ? 'AVAILABLE' : body.releaseStatus;
      if (typeof releaseStatus !== 'string' || !RELEASE_STATUSES.includes(releaseStatus)) {
        return jsonError('حالة الإصدار غير صالحة');
      }

      const price = body.price === undefined ? 0.5 : body.price;
      if (!isBoundedNumber(price, 0.01, 10000)) return jsonError('السعر يجب أن يكون بين 0.01 و 10000');

      const currency = body.currency === undefined ? 'USD' : body.currency;
      if (typeof currency !== 'string' || !CURRENCIES.includes(currency)) return jsonError('العملة غير مدعومة حالياً');

      const duplicate = await Season.exists({ seriesId: series._id, seasonNumber: body.seasonNumber });
      if (duplicate) return jsonError('يوجد موسم بنفس الرقم لهذا المسلسل', 409);

      const season = await Season.create({
        seriesId: series._id,
        seasonNumber: body.seasonNumber,
        title,
        description,
        price,
        currency,
        releaseStatus,
      });
      await syncSeriesCounters(series._id.toString());

      await writeAudit({
        adminUserId: admin.userId,
        action: 'CREATE_SEASON',
        targetEntity: 'Season',
        entityId: season._id.toString(),
        newState: { seriesId, seasonNumber: season.seasonNumber, title, price, releaseStatus },
      });

      return jsonOk({ success: true, id: season._id.toString() }, 201);
    }

    // ---------- إنشاء حلقة ----------
    if (entity === 'episode') {
      const { seasonId } = body;
      if (typeof seasonId !== 'string' || !isValidObjectId(seasonId)) return jsonError('معرّف الموسم غير صالح');
      const season = await Season.findById(seasonId);
      if (!season) return jsonError('الموسم غير موجود', 404);

      if (!isBoundedInt(body.episodeNumber, 1, 1000)) return jsonError('رقم الحلقة يجب أن يكون بين 1 و 1000');
      if (!isNonEmptyString(body.title, 1, MAX_EPISODE_TITLE)) return jsonError('عنوان الحلقة مطلوب (حتى 150 حرفاً)');
      const title = stripControlChars(body.title).trim();
      if (containsHtml(title)) return jsonError('العنوان يجب ألا يحتوي وسوم HTML');

      let teaser: string | undefined;
      if (body.teaser !== undefined && body.teaser !== null && body.teaser !== '') {
        if (!isNonEmptyString(body.teaser, 1, MAX_TEASER)) return jsonError(`النبذة يجب أن تكون بين 1 و ${MAX_TEASER} حرفاً`);
        teaser = stripControlChars(body.teaser).trim();
        if (containsHtml(teaser)) return jsonError('النبذة يجب ألا تحتوي وسوم HTML');
      }

      const durationMs = body.durationMs === undefined ? 0 : body.durationMs;
      if (!isBoundedInt(durationMs, 0, MAX_DURATION_MS)) return jsonError('مدة الحلقة غير صالحة');

      let publishDate: Date | undefined;
      if (body.publishDate !== undefined && body.publishDate !== null && body.publishDate !== '') {
        if (typeof body.publishDate !== 'string' || Number.isNaN(new Date(body.publishDate).getTime())) {
          return jsonError('تاريخ النشر غير صالح');
        }
        publishDate = new Date(body.publishDate);
      }

      if (body.artworkOverride !== undefined && body.artworkOverride !== null && body.artworkOverride !== '') {
        if (typeof body.artworkOverride !== 'string' || !isSafeHttpUrl(body.artworkOverride.trim())) {
          return jsonError('رابط صورة الحلقة غير صالح');
        }
      }

      const duplicate = await Episode.exists({
        seriesId: season.seriesId,
        seasonNumber: season.seasonNumber,
        episodeNumber: body.episodeNumber,
      });
      if (duplicate) return jsonError('يوجد حلقة بنفس الرقم في هذا الموسم', 409);

      // سياسة أول N حلقات مجانية: الحلقة ضمن النطاق تُفرض مجانية دائماً
      const parentSeries = await Series.findById(season.seriesId).select('freeEpisodesCount').lean();
      const freeCount = Number((parentSeries as any)?.freeEpisodesCount || 0);
      const isFree = body.isFree === true || body.episodeNumber <= freeCount;

      const episode = await Episode.create({
        seriesId: season.seriesId,
        seasonId: season._id,
        seasonNumber: season.seasonNumber,
        episodeNumber: body.episodeNumber,
        title,
        teaser,
        durationMs,
        isFree,
        publishDate,
        artworkOverride: typeof body.artworkOverride === 'string' && body.artworkOverride.trim() ? body.artworkOverride.trim() : undefined,
        audioStorageKey: typeof body.audioStorageKey === 'string' && body.audioStorageKey.trim() ? body.audioStorageKey.trim() : undefined,
        audioPublicUrl:
          typeof body.audioStorageKey === 'string' && body.audioStorageKey.trim()
            ? undefined
            : typeof body.audioPublicUrl === 'string' && body.audioPublicUrl.trim()
            ? body.audioPublicUrl.trim()
            : undefined,
      });
      await syncSeasonEpisodesCount(season._id.toString());
      await syncSeriesCounters(season.seriesId.toString());

      await writeAudit({
        adminUserId: admin.userId,
        action: 'CREATE_EPISODE',
        targetEntity: 'Episode',
        entityId: episode._id.toString(),
        newState: {
          seriesId: season.seriesId.toString(),
          seasonId,
          episodeNumber: episode.episodeNumber,
          title,
          isFree: episode.isFree,
          durationMs: episode.durationMs,
        },
      });

      return jsonOk({ success: true, id: episode._id.toString(), isFree: episode.isFree }, 201);
    }

    // ---------- حفظ النص المتزامن (upsert) ----------
    if (entity === 'transcript') {
      const { episodeId } = body;
      if (typeof episodeId !== 'string' || !isValidObjectId(episodeId)) return jsonError('معرّف الحلقة غير صالح');
      const episode = await Episode.findById(episodeId);
      if (!episode) return jsonError('الحلقة غير موجودة', 404);

      const validated = validateSegments(body.segments);
      if (!validated.ok) return jsonError(validated.error);

      await Transcript.findOneAndUpdate(
        { episodeId: new Types.ObjectId(episodeId) },
        { segments: validated.segments, format: 'JSON' },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );

      await writeAudit({
        adminUserId: admin.userId,
        action: 'UPSERT_TRANSCRIPT',
        targetEntity: 'Transcript',
        entityId: episodeId,
        newState: { segmentsCount: validated.segments.length, lastEndMs: validated.lastEndMs },
      });

      return jsonOk({ success: true, segmentsCount: validated.segments.length });
    }

    return jsonError('نوع الكيان غير معروف', 400);
  } catch (error: any) {
    if (error?.code === 11000) {
      return jsonError('قيمة مكررة: يوجد عنصر بنفس المعرفات المميزة', 409);
    }
    console.error('Admin create content error:', error);
    return jsonError('فشل إنشاء العنصر', 500);
  }
}

// ============================================================
// PATCH: تحديث العناصر (المسارات القديمة محفوظة + مسارات الكيانات)
// ============================================================

export async function PATCH(req: Request) {
  const admin = await getCurrentAdmin();
  if (!admin) return jsonError('غير مصرح لك', 401);
  if (!checkAdminRole(admin)) return jsonError('ليس لديك صلاحية تعديل المحتوى', 403);

  const conn = await connectDB();
  if (!conn) return jsonError('قاعدة البيانات غير متاحة', 503);

  const parsed = await parseJsonBody(req);
  if (!parsed.ok) return jsonError(parsed.error, parsed.status);
  const body = parsed.body;

  try {
    const entity = body.entity;

    // ---------- تحديث مسلسل ----------
    if (entity === 'series') {
      const { seriesId } = body;
      if (typeof seriesId !== 'string' || !isValidObjectId(seriesId)) return jsonError('معرّف المسلسل غير صالح');
      const series = await Series.findById(seriesId);
      if (!series) return jsonError('المسلسل غير موجود', 404);

      const before = seriesSummary(series);
      const updates: Record<string, unknown> = {};

      if (body.title !== undefined) {
        if (!isNonEmptyString(body.title, 1, MAX_SERIES_TITLE)) return jsonError('عنوان المسلسل مطلوب (حتى 150 حرفاً)');
        updates.title = stripControlChars(body.title).trim();
        if (containsHtml(updates.title as string)) return jsonError('العنوان يجب ألا يحتوي وسوم HTML');
      }

      if (body.slug !== undefined) {
        const slug = slugify(typeof body.slug === 'string' ? body.slug : '');
        if (!slug || slug.length > MAX_SLUG) return jsonError('المعرّف (slug) غير صالح');
        updates.slug = slug;
      }

      if (body.hook !== undefined) {
        if (!isNonEmptyString(body.hook, 1, MAX_HOOK)) return jsonError('الجملة التسويقية مطلوبة (حتى 300 حرف)');
        updates.hook = stripControlChars(body.hook).trim();
        if (containsHtml(updates.hook as string)) return jsonError('الجملة التسويقية يجب ألا تحتوي وسوم HTML');
      }

      if (body.description !== undefined) {
        if (!isNonEmptyString(body.description, 1, MAX_DESCRIPTION)) return jsonError('الوصف مطلوب (حتى 5000 حرف)');
        updates.description = stripControlChars(body.description).trim();
        if (containsHtml(updates.description as string)) return jsonError('الوصف يجب ألا يحتوي وسوم HTML');
      }

      if (body.posterUrl !== undefined) {
        if (typeof body.posterUrl !== 'string' || !isSafeHttpUrl(body.posterUrl.trim())) return jsonError('رابط صورة الغلاف غير صالح');
        updates.posterUrl = body.posterUrl.trim();
      }

      if (body.heroArtworkUrl !== undefined) {
        if (typeof body.heroArtworkUrl !== 'string' || !isSafeHttpUrl(body.heroArtworkUrl.trim())) return jsonError('رابط صورة الواجهة غير صالح');
        updates.heroArtworkUrl = body.heroArtworkUrl.trim();
      }

      if (body.shareVideoUrl !== undefined) {
        if (body.shareVideoUrl === null || body.shareVideoUrl === '') {
          updates.shareVideoUrl = undefined;
        } else if (typeof body.shareVideoUrl !== 'string' || !isSafeHttpUrl(body.shareVideoUrl.trim())) {
          return jsonError('رابط فيديو المشاركة غير صالح');
        } else {
          updates.shareVideoUrl = body.shareVideoUrl.trim();
        }
      }

      if (body.genres !== undefined) {
        const genres = parseStringArray(body.genres, MAX_GENRES, 50);
        if (genres === null) return jsonError('التصنيفات غير صالحة');
        updates.genres = genres;
      }

      if (body.contentWarnings !== undefined) {
        const contentWarnings = parseStringArray(body.contentWarnings, MAX_WARNINGS, 100);
        if (contentWarnings === null) return jsonError('تحذيرات المحتوى غير صالحة');
        updates.contentWarnings = contentWarnings;
      }

      if (body.contentRating !== undefined) {
        if (typeof body.contentRating !== 'string' || !CONTENT_RATINGS.includes(body.contentRating)) {
          return jsonError('تصنيف العمر غير صالح');
        }
        updates.contentRating = body.contentRating;
      }

      if (body.productionYear !== undefined) {
        if (!isBoundedInt(body.productionYear, 1900, 2100)) return jsonError('سنة الإنتاج يجب أن بين 1900 و 2100');
        updates.productionYear = body.productionYear;
      }

      if (body.freeEpisodesCount !== undefined) {
        if (!isBoundedInt(body.freeEpisodesCount, 0, 10)) return jsonError('عدد الحلقات المجانية يجب أن بين 0 و 10');
        updates.freeEpisodesCount = body.freeEpisodesCount;
      }

      if (body.featured !== undefined) {
        if (typeof body.featured !== 'boolean') return jsonError('قيمة الإبراز غير صالحة');
        updates.featured = body.featured;
      }

      if (body.isCompleted !== undefined) {
        if (typeof body.isCompleted !== 'boolean') return jsonError('قيمة الاكتمال غير صالحة');
        updates.isCompleted = body.isCompleted;
      }

      let publishAction: 'PUBLISH_SERIES' | 'UNPUBLISH_SERIES' | null = null;
      if (body.published !== undefined) {
        if (typeof body.published !== 'boolean') return jsonError('قيمة النشر غير صالحة');
        updates.publishedAt = body.published ? new Date() : null;
        publishAction = body.published ? 'PUBLISH_SERIES' : 'UNPUBLISH_SERIES';
      }

      if (Object.keys(updates).length === 0) return jsonError('لا توجد حقول للتحديث', 400);

      if (updates.slug !== undefined && updates.slug !== series.slug) {
        const duplicate = await Series.exists({ slug: updates.slug, _id: { $ne: series._id } });
        if (duplicate) return jsonError('المعرّف (slug) مستخدم مسبقاً لمسلسل آخر', 409);
      }

      for (const [key, value] of Object.entries(updates)) {
        (series as any)[key] = value;
      }
      await series.save();

      const after = seriesSummary(series);
      const diff = diffFields(before, after);
      await writeAudit({
        adminUserId: admin.userId,
        action: publishAction ?? 'UPDATE_SERIES',
        targetEntity: 'Series',
        entityId: seriesId,
        previousState: diff?.previousState ?? null,
        newState: diff?.newState ?? after,
      });

      return jsonOk({ success: true, series: seriesSummary(series) });
    }

    // ---------- تحديث موسم ----------
    if (entity === 'season') {
      const { seasonId } = body;
      if (typeof seasonId !== 'string' || !isValidObjectId(seasonId)) return jsonError('معرّف الموسم غير صالح');
      const season = await Season.findById(seasonId);
      if (!season) return jsonError('الموسم غير موجود', 404);

      const before = { seasonNumber: season.seasonNumber, title: season.title, description: season.description, price: season.price, currency: season.currency, releaseStatus: season.releaseStatus };
      const updates: Record<string, unknown> = {};

      if (body.seasonNumber !== undefined) {
        if (!isBoundedInt(body.seasonNumber, 1, 100)) return jsonError('رقم الموسم يجب أن بين 1 و 100');
        updates.seasonNumber = body.seasonNumber;
      }
      if (body.title !== undefined) {
        if (!isNonEmptyString(body.title, 1, MAX_SEASON_TITLE)) return jsonError('عنوان الموسم مطلوب (حتى 150 حرفاً)');
        updates.title = stripControlChars(body.title).trim();
        if (containsHtml(updates.title as string)) return jsonError('العنوان يجب ألا يحتوي وسوم HTML');
      }
      if (body.description !== undefined) {
        if (body.description === null || body.description === '') {
          updates.description = undefined;
        } else {
          if (!isNonEmptyString(body.description, 1, 2000)) return jsonError('وصف الموسم يجب أن بين 1 و 2000 حرف');
          updates.description = stripControlChars(body.description).trim();
          if (containsHtml(updates.description as string)) return jsonError('الوصف يجب ألا يحتوي وسوم HTML');
        }
      }
      if (body.releaseStatus !== undefined) {
        if (typeof body.releaseStatus !== 'string' || !RELEASE_STATUSES.includes(body.releaseStatus)) {
          return jsonError('حالة الإصدار غير صالحة');
        }
        updates.releaseStatus = body.releaseStatus;
      }
      if (body.price !== undefined) {
        if (!isBoundedNumber(body.price, 0.01, 10000)) return jsonError('السعر يجب أن يكون بين 0.01 و 10000');
        updates.price = body.price;
      }
      if (body.currency !== undefined) {
        if (typeof body.currency !== 'string' || !CURRENCIES.includes(body.currency)) return jsonError('العملة غير مدعومة حالياً');
        updates.currency = body.currency;
      }

      if (Object.keys(updates).length === 0) return jsonError('لا توجد حقول للتحديث', 400);

      if (updates.seasonNumber !== undefined && updates.seasonNumber !== season.seasonNumber) {
        const duplicate = await Season.exists({ seriesId: season.seriesId, seasonNumber: updates.seasonNumber, _id: { $ne: season._id } });
        if (duplicate) return jsonError('يوجد موسم بنفس الرقم لهذا المسلسل', 409);
      }

      for (const [key, value] of Object.entries(updates)) {
        (season as any)[key] = value;
      }
      await season.save();

      const diff = diffFields(before, {
        seasonNumber: season.seasonNumber,
        title: season.title,
        description: season.description,
        price: season.price,
        currency: season.currency,
        releaseStatus: season.releaseStatus,
      });
      await writeAudit({
        adminUserId: admin.userId,
        action: 'UPDATE_SEASON',
        targetEntity: 'Season',
        entityId: seasonId,
        previousState: diff?.previousState ?? null,
        newState: diff?.newState ?? null,
      });

      return jsonOk({ success: true, title: season.title, price: season.price });
    }

    // ---------- تحديث حلقة ----------
    if (entity === 'episode') {
      const { episodeId } = body;
      if (typeof episodeId !== 'string' || !isValidObjectId(episodeId)) return jsonError('معرّف الحلقة غير صالح');
      const episode = await Episode.findById(episodeId);
      if (!episode) return jsonError('الحلقة غير موجودة', 404);

      const before = {
        episodeNumber: episode.episodeNumber,
        title: episode.title,
        teaser: episode.teaser,
        durationMs: episode.durationMs,
        isFree: episode.isFree,
        artworkOverride: episode.artworkOverride,
        publishDate: episode.publishDate,
      };
      const updates: Record<string, unknown> = {};

      if (body.episodeNumber !== undefined) {
        if (!isBoundedInt(body.episodeNumber, 1, 1000)) return jsonError('رقم الحلقة يجب أن بين 1 و 1000');
        updates.episodeNumber = body.episodeNumber;
      }
      if (body.title !== undefined) {
        if (!isNonEmptyString(body.title, 1, MAX_EPISODE_TITLE)) return jsonError('عنوان الحلقة مطلوب (حتى 150 حرفاً)');
        updates.title = stripControlChars(body.title).trim();
        if (containsHtml(updates.title as string)) return jsonError('العنوان يجب ألا يحتوي وسوم HTML');
      }
      if (body.teaser !== undefined) {
        if (body.teaser === null || body.teaser === '') {
          updates.teaser = undefined;
        } else {
          if (!isNonEmptyString(body.teaser, 1, MAX_TEASER)) return jsonError(`النبذة يجب أن تكون بين 1 و ${MAX_TEASER} حرفاً`);
          updates.teaser = stripControlChars(body.teaser).trim();
          if (containsHtml(updates.teaser as string)) return jsonError('النبذة يجب ألا تحتوي وسوم HTML');
        }
      }
      if (body.durationMs !== undefined) {
        if (!isBoundedInt(body.durationMs, 0, MAX_DURATION_MS)) return jsonError('مدة الحلقة غير صالحة');
        updates.durationMs = body.durationMs;
      }
      if (body.artworkOverride !== undefined) {
        if (body.artworkOverride === null || body.artworkOverride === '') {
          updates.artworkOverride = undefined;
        } else if (typeof body.artworkOverride !== 'string' || !isSafeHttpUrl(body.artworkOverride.trim())) {
          return jsonError('رابط صورة الحلقة غير صالح');
        } else {
          updates.artworkOverride = body.artworkOverride.trim();
        }
      }
      if (body.publishDate !== undefined) {
        if (body.publishDate === null || body.publishDate === '') {
          updates.publishDate = new Date();
        } else {
          if (typeof body.publishDate !== 'string' || Number.isNaN(new Date(body.publishDate).getTime())) {
            return jsonError('تاريخ النشر غير صالح');
          }
          updates.publishDate = new Date(body.publishDate);
        }
      }

      // سياسة أول N حلقات مجانية محفوظة كما في المسار القديم
      if (body.isFree !== undefined) {
        if (typeof body.isFree !== 'boolean') return jsonError('قيمة المجانية غير صالحة');
        if (!body.isFree) {
          const parentSeries = await Series.findById(episode.seriesId).select('freeEpisodesCount').lean();
          const freeCount = Number((parentSeries as any)?.freeEpisodesCount || 0);
          const effectiveNumber = updates.episodeNumber !== undefined ? (updates.episodeNumber as number) : episode.episodeNumber;
          if (effectiveNumber <= freeCount) {
            return jsonError('هذه الحلقة ضمن العدد المجاني المحدد للمسلسل', 409);
          }
        }
        updates.isFree = body.isFree;
      }

      if (body.audioStorageKey !== undefined) {
        if (body.audioStorageKey === null || body.audioStorageKey === '') {
          updates.audioStorageKey = undefined;
        } else if (typeof body.audioStorageKey === 'string') {
          updates.audioStorageKey = body.audioStorageKey.trim();
          // حماية الصوت: الماستر الصوتي في التخزين محمي ولا يملك رابطاً عاماً
          updates.audioPublicUrl = undefined;
        }
      }

      if (body.audioPublicUrl !== undefined && !updates.audioStorageKey) {
        if (body.audioPublicUrl === null || body.audioPublicUrl === '') {
          updates.audioPublicUrl = undefined;
        } else if (typeof body.audioPublicUrl === 'string') {
          // إذا كانت الحلقة تمتلك معرف تخزين ولم يتم حذفه، يظل الرابط العام ملغياً
          if (!episode.audioStorageKey || updates.audioStorageKey === undefined && body.audioStorageKey === null) {
            updates.audioPublicUrl = body.audioPublicUrl.trim();
          }
        }
      }

      if (Object.keys(updates).length === 0) return jsonError('لا توجد حقول للتحديث', 400);

      if (updates.episodeNumber !== undefined && updates.episodeNumber !== episode.episodeNumber) {
        const duplicate = await Episode.exists({
          seriesId: episode.seriesId,
          seasonNumber: episode.seasonNumber,
          episodeNumber: updates.episodeNumber,
          _id: { $ne: episode._id },
        });
        if (duplicate) return jsonError('يوجد حلقة بنفس الرقم في هذا الموسم', 409);
      }

      for (const [key, value] of Object.entries(updates)) {
        (episode as any)[key] = value;
      }

      if (episode.seasonNumber === undefined || episode.seasonNumber === null) {
        const parentSeason: any = await Season.findById(episode.seasonId).select('seasonNumber').lean();
        episode.seasonNumber = typeof parentSeason?.seasonNumber === 'number' ? parentSeason.seasonNumber : 1;
      }

      await episode.save();

      const diff = diffFields(before, {
        episodeNumber: episode.episodeNumber,
        title: episode.title,
        teaser: episode.teaser,
        durationMs: episode.durationMs,
        isFree: episode.isFree,
        artworkOverride: episode.artworkOverride,
        publishDate: episode.publishDate,
      });
      await writeAudit({
        adminUserId: admin.userId,
        action: 'UPDATE_EPISODE',
        targetEntity: 'Episode',
        entityId: episodeId,
        previousState: diff?.previousState ?? null,
        newState: diff?.newState ?? null,
      });

      return jsonOk({ success: true, title: episode.title, isFree: episode.isFree });
    }

    // ---------- المسارات القديمة المحفوظة (بدون entity) ----------
    const { seriesId, seasonId, episodeId, freeEpisodesCount, isFree, price } = body;

    if (seasonId !== undefined) {
      if (seriesId !== undefined || episodeId !== undefined || freeEpisodesCount !== undefined || isFree !== undefined) {
        return jsonError('بيانات غير صالحة', 400);
      }
      if (typeof seasonId !== 'string' || !isValidObjectId(seasonId) || typeof price !== 'number' || !Number.isFinite(price) || price <= 0 || price > 10000) {
        return jsonError('بيانات غير صالحة', 400);
      }

      const season = await Season.findById(seasonId);
      if (!season) return jsonError('الموسم غير موجود', 404);

      const previousState = { price: season.price, currency: season.currency };
      season.price = price;
      await season.save();

      await AdminAuditLog.create({
        adminUserId: admin.userId,
        action: 'UPDATE_SEASON_PRICE',
        targetEntity: 'Season',
        entityId: seasonId,
        previousState,
        newState: { price: season.price, currency: season.currency },
      });

      return jsonOk({ success: true, title: season.title, price: season.price, currency: season.currency });
    }

    if (episodeId !== undefined) {
      if (seriesId !== undefined || freeEpisodesCount !== undefined) {
        return jsonError('بيانات غير صالحة', 400);
      }
      if (typeof episodeId !== 'string' || !isValidObjectId(episodeId) || typeof isFree !== 'boolean') {
        return jsonError('بيانات غير صالحة', 400);
      }

      const episode = await Episode.findById(episodeId);
      if (!episode) return jsonError('الحلقة غير موجودة', 404);

      if (!isFree) {
        const parentSeries = await Series.findById(episode.seriesId).select('freeEpisodesCount').lean();
        const freeCount = Number((parentSeries as any)?.freeEpisodesCount || 0);
        if (episode.episodeNumber <= freeCount) {
          return jsonError('هذه الحلقة ضمن العدد المجاني المحدد للمسلسل', 409);
        }
      }

      const previousState = { isFree: episode.isFree };
      episode.isFree = isFree;
      await episode.save();

      await AdminAuditLog.create({
        adminUserId: admin.userId,
        action: 'UPDATE_EPISODE_FREE',
        targetEntity: 'Episode',
        entityId: episodeId,
        previousState,
        newState: { isFree },
      });

      return jsonOk({ success: true, title: episode.title, isFree: episode.isFree });
    }

    const count = Number(freeEpisodesCount);
    if (typeof seriesId !== 'string' || !isValidObjectId(seriesId) || !Number.isInteger(count) || count < 0 || count > 10) {
      return jsonError('بيانات غير صالحة', 400);
    }

    const series = await Series.findById(seriesId);
    if (!series) return jsonError('المسلسل غير موجود', 404);

    const previousState = { freeEpisodesCount: series.freeEpisodesCount };
    series.freeEpisodesCount = count;
    await series.save();

    await AdminAuditLog.create({
      adminUserId: admin.userId,
      action: 'UPDATE_FREE_EPISODES_COUNT',
      targetEntity: 'Series',
      entityId: seriesId,
      previousState,
      newState: { freeEpisodesCount: count },
    });

    return jsonOk({ success: true, title: series.title });
  } catch (error: any) {
    if (error?.code === 11000) {
      return jsonError('قيمة مكررة: يوجد عنصر بنفس المعرفات المميزة', 409);
    }
    console.error('Admin patch content error:', error);
    return jsonError(error?.message || 'فشل تحديث العنصر', 500);
  }
}

// ============================================================
// DELETE: حذف مع قواعد منع التُّهم (أطفال يتامى) وشيوع صريح
// ============================================================

export async function DELETE(req: Request) {
  const admin = await getCurrentAdmin();
  if (!admin) return jsonError('غير مصرح لك', 401);
  if (!checkAdminRole(admin)) return jsonError('ليس لديك صلاحية تعديل المحتوى', 403);

  const conn = await connectDB();
  if (!conn) return jsonError('قاعدة البيانات غير متاحة', 503);

  const url = new URL(req.url);
  let entity = url.searchParams.get('entity');
  let id = url.searchParams.get('id');
  const cascade = url.searchParams.get('cascade') === 'true' || url.searchParams.get('cascade') === '1';
  const deleteTranscript = url.searchParams.get('deleteTranscript') === 'true' || url.searchParams.get('deleteTranscript') === '1' || cascade;

  if (!entity) {
    if (url.searchParams.get('seriesId')) {
      entity = 'series';
      id = url.searchParams.get('seriesId');
    } else if (url.searchParams.get('seasonId')) {
      entity = 'season';
      id = url.searchParams.get('seasonId');
    } else if (url.searchParams.get('episodeId')) {
      entity = 'episode';
      id = url.searchParams.get('episodeId');
    } else if (url.searchParams.get('transcriptId')) {
      entity = 'transcript';
      id = url.searchParams.get('transcriptId');
    }
  }

  try {
    // ---------- حذف مسلسل ----------
    if (entity === 'series') {
      if (!id || !isValidObjectId(id)) return jsonError('معرّف المسلسل غير صالح', 400);
      const series = await Series.findById(id);
      if (!series) return jsonError('المسلسل غير موجود', 404);

      const seasons = await Season.find({ seriesId: series._id }).select('_id').lean();
      if (seasons.length > 0 && !cascade) {
        return jsonError('لا يمكن حذف مسلسل يحتوي مواسم — فعّل الحذف الشامل', 409, { seasonsCount: seasons.length });
      }

      // السجلات المالية والاستحقاقات لا تُحذف مع المحتوى؛ امنع إزالة أصل
      // له التزامات مالية حتى لا نكسر سجل المشتريات أو حقوق المستخدمين.
      const [purchaseCount, entitlementCount] = await Promise.all([
        Purchase.countDocuments({ seriesId: series._id }),
        Entitlement.countDocuments({ targetSeriesId: series._id }),
      ]);
      if (purchaseCount > 0 || entitlementCount > 0) {
        return jsonError('لا يمكن حذف مسلسل له مشتريات أو استحقاقات — قم بإلغاء النشر بدلاً من ذلك', 409, {
          purchaseCount,
          entitlementCount,
        });
      }

      const seasonIds = seasons.map((s: any) => s._id);
      const episodes = await Episode.find({ seriesId: series._id }).select('_id').lean();
      const episodeIds = episodes.map((e: any) => e._id);
      const deletedTranscripts = await Transcript.deleteMany({ episodeId: { $in: episodeIds } });
      await Episode.deleteMany({ seriesId: series._id });
      await Season.deleteMany({ _id: { $in: seasonIds } });
      await series.deleteOne();

      await writeAudit({
        adminUserId: admin.userId,
        action: 'DELETE_SERIES',
        targetEntity: 'Series',
        entityId: id,
        previousState: seriesSummary(series),
        newState: { cascade, deletedSeasons: seasons.length, deletedEpisodes: episodeIds.length, deletedTranscripts: deletedTranscripts.deletedCount },
      });

      return jsonOk({ success: true });
    }

    // ---------- حذف موسم ----------
    if (entity === 'season') {
      if (!id || !isValidObjectId(id)) return jsonError('معرّف الموسم غير صالح', 400);
      const season = await Season.findById(id);
      if (!season) return jsonError('الموسم غير موجود', 404);

      const episodes = await Episode.find({ seasonId: season._id }).select('_id').lean();
      if (episodes.length > 0 && !cascade) {
        return jsonError('لا يمكن حذف موسم يحتوي حلقات — فعّل الحذف الشامل لإزالة الحلقات ونصوصها أيضاً', 409, { episodesCount: episodes.length });
      }

      const [purchaseCount, entitlementCount] = await Promise.all([
        Purchase.countDocuments({ seasonId: season._id }),
        Entitlement.countDocuments({ targetSeasonId: season._id }),
      ]);
      if (purchaseCount > 0 || entitlementCount > 0) {
        return jsonError('لا يمكن حذف موسم له مشتريات أو استحقاقات — اجعله غير متاح بدلاً من ذلك', 409, {
          purchaseCount,
          entitlementCount,
        });
      }

      const episodeIds = episodes.map((e: any) => e._id);
      const deletedTranscripts = await Transcript.deleteMany({ episodeId: { $in: episodeIds } });
      await Episode.deleteMany({ _id: { $in: episodeIds } });
      await season.deleteOne();
      await syncSeriesCounters(season.seriesId.toString());

      await writeAudit({
        adminUserId: admin.userId,
        action: episodes.length > 0 ? 'DELETE_SEASON_CASCADE' : 'DELETE_SEASON',
        targetEntity: 'Season',
        entityId: id,
        previousState: { seasonNumber: season.seasonNumber, title: season.title },
        newState: { seriesId: season.seriesId.toString(), deletedEpisodes: episodes.length, deletedTranscripts: deletedTranscripts.deletedCount },
      });

      return jsonOk({ success: true });
    }

    // ---------- حذف حلقة ----------
    if (entity === 'episode') {
      if (!id || !isValidObjectId(id)) return jsonError('معرّف الحلقة غير صالح', 400);
      const episode = await Episode.findById(id);
      if (!episode) return jsonError('الحلقة غير موجودة', 404);

      const transcript = await Transcript.findOne({ episodeId: episode._id }).select('_id').lean();
      if (transcript && !deleteTranscript) {
        return jsonError('هذه الحلقة لها نص متزامن — فعّل حذف النص معها لتجنب مرجع معلق', 409, { hasTranscript: true });
      }

      if (transcript) {
        await Transcript.deleteOne({ _id: (transcript as any)._id });
      }
      await episode.deleteOne();
      await syncSeasonEpisodesCount(episode.seasonId.toString());
      await syncSeriesCounters(episode.seriesId.toString());

      await writeAudit({
        adminUserId: admin.userId,
        action: 'DELETE_EPISODE',
        targetEntity: 'Episode',
        entityId: id,
        previousState: { episodeNumber: episode.episodeNumber, title: episode.title },
        newState: { deletedTranscript: Boolean(transcript) },
      });

      return jsonOk({ success: true });
    }

    // ---------- حذف النص المتزامن فقط ----------
    if (entity === 'transcript') {
      if (!id || !isValidObjectId(id)) return jsonError('معرّف الحلقة غير صالح', 400);
      const deleted = await Transcript.deleteMany({ episodeId: new Types.ObjectId(id) });
      if (deleted.deletedCount === 0) return jsonError('لا يوجد نص متزامن لهذه الحلقة', 404);

      await writeAudit({
        adminUserId: admin.userId,
        action: 'DELETE_TRANSCRIPT',
        targetEntity: 'Transcript',
        entityId: id,
        newState: { deletedCount: deleted.deletedCount },
      });

      return jsonOk({ success: true });
    }

    return jsonError('نوع الكيان غير معروف', 400);
  } catch (error) {
    console.error('Admin delete content error:', error);
    return jsonError('فشل حذف العنصر', 500);
  }
}
