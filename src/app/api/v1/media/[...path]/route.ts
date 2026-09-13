// ============================================================
// Studio Protected Media Streaming Route
// استوديو منصة "يُتبع..." - بث وسائط المحتوى والملفات الصوتية في بيئة الاستوديو
// يدعم التخزين السحابي Cloudflare R2 والتخزين المحلي المحمي مع فحص التذاكر الموقعة
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { S3Client, GetObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { Readable } from 'stream';
import fs from 'fs';
import { isProductionRuntime, normalizeEnv } from '@/lib/config/runtime';
import { verifyLocalStreamTicket, getLocalStoragePath, isPathInsideDir } from '@/lib/storage';
import { validateMediaSegments, parseSingleRange } from '@/lib/storage/mediaSecurity';

export const dynamic = 'force-dynamic';

const R2_ACCOUNT_ID = normalizeEnv(process.env.CLOUDFLARE_R2_ACCOUNT_ID);
const R2_ACCESS_KEY_ID = normalizeEnv(process.env.CLOUDFLARE_R2_ACCESS_KEY_ID);
const R2_SECRET_ACCESS_KEY = normalizeEnv(process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY);
const R2_BUCKET_NAME = normalizeEnv(process.env.CLOUDFLARE_R2_BUCKET_NAME) || 'yotba-media';

let s3Client: S3Client | null = null;
if (R2_ACCOUNT_ID && R2_ACCESS_KEY_ID && R2_SECRET_ACCESS_KEY) {
  s3Client = new S3Client({
    region: 'auto',
    endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: R2_ACCESS_KEY_ID,
      secretAccessKey: R2_SECRET_ACCESS_KEY,
    },
  });
}

const MIME_TYPES: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  avif: 'image/avif',
  svg: 'image/svg+xml',
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  aac: 'audio/aac',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
  weba: 'audio/webm',
  mp4: 'video/mp4',
  webm: 'video/webm',
  mov: 'video/quicktime',
  json: 'application/json',
  vtt: 'text/vtt',
  srt: 'text/plain',
};

function getMimeType(key: string): string {
  const ext = key.split('.').pop()?.toLowerCase() || '';
  return MIME_TYPES[ext] || 'application/octet-stream';
}

function streamToReadableStream(stream: Readable): ReadableStream {
  return new ReadableStream({
    start(controller) {
      stream.on('data', (chunk) => controller.enqueue(chunk));
      stream.on('end', () => controller.close());
      stream.on('error', (err) => controller.error(err));
    },
  });
}

function createRangeNotSatisfiableResponse(totalSize: number | null, isAudio: boolean, isHead = false): NextResponse {
  const headers = new Headers();
  headers.set('Content-Range', `bytes */${totalSize !== null && totalSize > 0 ? totalSize : '*'}`);
  headers.set('Accept-Ranges', 'bytes');
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('Cache-Control', isAudio ? 'private, no-cache, no-store, must-revalidate' : 'no-cache');
  return new NextResponse(isHead ? null : 'Requested range not satisfiable', {
    status: 416,
    statusText: 'Range Not Satisfiable',
    headers,
  });
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  try {
    const { path } = await params;
    const pathValidation = validateMediaSegments(path);
    if (!pathValidation.ok) {
      return new NextResponse(pathValidation.error, {
        status: pathValidation.status,
        headers: { 'X-Content-Type-Options': 'nosniff' },
      });
    }
    const cleanKey = pathValidation.cleanKey;

    const isAudio = cleanKey.startsWith('audio/') || cleanKey.startsWith('episodes/');

    // حظر طلب ملفات الصوت المحمية دون تذكرة موثوقة في بيئة التطوير
    if (isAudio) {
      if (isProductionRuntime()) {
        return new NextResponse(
          'Protected audio cannot be accessed via public media route. Use signed R2 URLs.',
          { status: 403, headers: { 'X-Content-Type-Options': 'nosniff' } }
        );
      }
      const ticket = req.nextUrl.searchParams.get('ticket');
      if (!ticket || !verifyLocalStreamTicket(ticket, cleanKey)) {
        return new NextResponse('Forbidden: Invalid or missing stream authorization ticket', {
          status: 403,
          headers: { 'X-Content-Type-Options': 'nosniff' },
        });
      }
    }

    const mimeType = getMimeType(cleanKey);
    const rangeHeader = req.headers.get('range');

    // 1. محاولة جلب الملف من Cloudflare R2
    if (s3Client) {
      try {
        let r2Range: string | undefined;
        if (rangeHeader) {
          const trimmed = rangeHeader.trim();
          if (
            trimmed.includes(',') ||
            !/^bytes=\s*(?:(\d+)\s*-\s*(\d+)?|-\s*(\d+))$/.test(trimmed)
          ) {
            return createRangeNotSatisfiableResponse(0, isAudio);
          }
          r2Range = trimmed;
        }
        const getCommand = new GetObjectCommand({
          Bucket: R2_BUCKET_NAME,
          Key: cleanKey,
          Range: r2Range,
        });

        const s3Response = await s3Client.send(getCommand);
        if (!s3Response.Body) {
          return new NextResponse('Media not found', {
            status: 404,
            headers: { 'X-Content-Type-Options': 'nosniff' },
          });
        }

        const nodeStream = s3Response.Body as Readable;
        const webStream = streamToReadableStream(nodeStream);

        const headers = new Headers();
        headers.set('Content-Type', s3Response.ContentType || mimeType);
        headers.set('Accept-Ranges', 'bytes');
        headers.set('X-Content-Type-Options', 'nosniff');
        headers.set(
          'Cache-Control',
          isAudio ? 'private, no-cache, no-store, must-revalidate' : 'public, max-age=31536000, s-maxage=31536000, immutable'
        );

        if (s3Response.ETag) {
          headers.set('ETag', s3Response.ETag);
        }
        if (s3Response.ContentLength !== undefined) {
          headers.set('Content-Length', String(s3Response.ContentLength));
        }

        if (rangeHeader && s3Response.ContentRange) {
          if (/^bytes\s+\d+-\d+\/(\d+|\*)$/.test(s3Response.ContentRange)) {
            headers.set('Content-Range', s3Response.ContentRange);
            return new NextResponse(webStream, {
              status: 206,
              statusText: 'Partial Content',
              headers,
            });
          }
        }

        return new NextResponse(webStream, {
          status: 200,
          headers,
        });
      } catch (r2Err: any) {
        if (r2Err?.$metadata?.httpStatusCode === 416 || r2Err?.name === 'InvalidRange') {
          return createRangeNotSatisfiableResponse(0, isAudio);
        }
        if (r2Err?.$metadata?.httpStatusCode !== 404 && r2Err?.name !== 'NoSuchKey' && r2Err?.name !== 'NotFound') {
          console.warn('R2 media fetch error in studio:', r2Err);
        }
      }
    }

    // 2. فحص التخزين المحلي في بيئة التطوير
    const { filePath, baseDir } = getLocalStoragePath(cleanKey);
    if (!isPathInsideDir(filePath, baseDir)) {
      return new NextResponse('Access denied', {
        status: 403,
        headers: { 'X-Content-Type-Options': 'nosniff' },
      });
    }

    if (fs.existsSync(filePath)) {
      const stats = fs.statSync(filePath);
      if (!stats.isFile()) {
        return new NextResponse('Media file not found', {
          status: 404,
          headers: { 'X-Content-Type-Options': 'nosniff' },
        });
      }
      const totalSize = stats.size;

      if (rangeHeader) {
        const rangeResult = parseSingleRange(rangeHeader, totalSize);
        if (rangeResult.type === 'unsatisfiable') {
          return createRangeNotSatisfiableResponse(totalSize, isAudio);
        }
        if (rangeResult.type === 'valid') {
          const { start, end, chunkSize } = rangeResult.range;
          const fileStream = fs.createReadStream(filePath, { start, end });
          const webStream = streamToReadableStream(fileStream);
          const headers = new Headers();
          headers.set('Content-Range', `bytes ${start}-${end}/${totalSize}`);
          headers.set('Accept-Ranges', 'bytes');
          headers.set('Content-Length', String(chunkSize));
          headers.set('Content-Type', mimeType);
          headers.set('X-Content-Type-Options', 'nosniff');
          headers.set('Cache-Control', isAudio ? 'private, no-cache, no-store, must-revalidate' : 'public, max-age=86400');
          return new NextResponse(webStream, { status: 206, statusText: 'Partial Content', headers });
        }
      }

      const fileStream = fs.createReadStream(filePath);
      const webStream = streamToReadableStream(fileStream);

      return new NextResponse(webStream, {
        status: 200,
        headers: {
          'Content-Length': String(totalSize),
          'Content-Type': mimeType,
          'Accept-Ranges': 'bytes',
          'X-Content-Type-Options': 'nosniff',
          'Cache-Control': isAudio ? 'private, no-cache, no-store, must-revalidate' : 'public, max-age=86400',
        },
      });
    }

    return new NextResponse('Media file not found', {
      status: 404,
      headers: { 'X-Content-Type-Options': 'nosniff' },
    });
  } catch (err) {
    console.error('Studio media serving route error:', err);
    return new NextResponse('Internal Media Error', { status: 500 });
  }
}

export async function HEAD(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  try {
    const { path } = await params;
    const pathValidation = validateMediaSegments(path);
    if (!pathValidation.ok) {
      return new NextResponse(null, {
        status: pathValidation.status,
        headers: { 'X-Content-Type-Options': 'nosniff' },
      });
    }
    const cleanKey = pathValidation.cleanKey;

    const isAudio = cleanKey.startsWith('audio/') || cleanKey.startsWith('episodes/');
    if (isAudio) {
      if (isProductionRuntime()) {
        return new NextResponse(null, { status: 403, headers: { 'X-Content-Type-Options': 'nosniff' } });
      }
      const ticket = req.nextUrl.searchParams.get('ticket');
      if (!ticket || !verifyLocalStreamTicket(ticket, cleanKey)) {
        return new NextResponse(null, { status: 403, headers: { 'X-Content-Type-Options': 'nosniff' } });
      }
    }

    const mimeType = getMimeType(cleanKey);

    if (s3Client) {
      try {
        const headCommand = new HeadObjectCommand({
          Bucket: R2_BUCKET_NAME,
          Key: cleanKey,
        });
        const headRes = await s3Client.send(headCommand);

        const headers = new Headers();
        headers.set('Content-Type', headRes.ContentType || mimeType);
        headers.set('Accept-Ranges', 'bytes');
        headers.set('X-Content-Type-Options', 'nosniff');
        if (headRes.ContentLength !== undefined) {
          headers.set('Content-Length', String(headRes.ContentLength));
        }
        if (headRes.ETag) {
          headers.set('ETag', headRes.ETag);
        }
        return new NextResponse(null, { status: 200, headers });
      } catch (err: any) {
        if (err?.$metadata?.httpStatusCode === 404 || err?.name === 'NotFound') {
          return new NextResponse(null, { status: 404, headers: { 'X-Content-Type-Options': 'nosniff' } });
        }
      }
    }

    const { filePath, baseDir } = getLocalStoragePath(cleanKey);
    if (!isPathInsideDir(filePath, baseDir)) {
      return new NextResponse(null, { status: 403, headers: { 'X-Content-Type-Options': 'nosniff' } });
    }

    if (fs.existsSync(filePath)) {
      const stats = fs.statSync(filePath);
      return new NextResponse(null, {
        status: 200,
        headers: {
          'Content-Type': mimeType,
          'Content-Length': String(stats.size),
          'Accept-Ranges': 'bytes',
          'X-Content-Type-Options': 'nosniff',
        },
      });
    }

    return new NextResponse(null, { status: 404, headers: { 'X-Content-Type-Options': 'nosniff' } });
  } catch {
    return new NextResponse(null, { status: 500 });
  }
}
