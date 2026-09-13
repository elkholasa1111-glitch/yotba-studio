// Shared media-route validation for the studio runtime.

export interface ParsedRange {
  start: number;
  end: number;
  chunkSize: number;
}

export type RangeResult =
  | { type: 'none' }
  | { type: 'valid'; range: ParsedRange }
  | { type: 'unsatisfiable' };

export type PathValidationResult =
  | { ok: true; cleanKey: string }
  | { ok: false; error: string; status: number };

/** Parse one RFC 9110 byte range without ever producing an unsafe fs range. */
export function parseSingleRange(
  rangeHeader: string | null | undefined,
  totalSize: number
): RangeResult {
  if (!rangeHeader || !rangeHeader.trim()) return { type: 'none' };
  const trimmed = rangeHeader.trim();
  if (
    totalSize <= 0 ||
    !Number.isFinite(totalSize) ||
    trimmed.includes(',') ||
    !trimmed.startsWith('bytes=')
  ) {
    return { type: 'unsatisfiable' };
  }

  const match = trimmed.match(/^bytes=\s*(?:(\d+)\s*-\s*(\d+)?|-\s*(\d+))$/);
  if (!match) return { type: 'unsatisfiable' };
  const [, startText, endText, suffixText] = match;

  if (suffixText !== undefined) {
    const suffix = Number.parseInt(suffixText, 10);
    if (!Number.isFinite(suffix) || suffix <= 0) return { type: 'unsatisfiable' };
    const start = Math.max(0, totalSize - suffix);
    const end = totalSize - 1;
    return { type: 'valid', range: { start, end, chunkSize: end - start + 1 } };
  }

  const start = Number.parseInt(startText, 10);
  if (!Number.isFinite(start) || start < 0 || start >= totalSize) {
    return { type: 'unsatisfiable' };
  }
  const requestedEnd = endText === undefined ? totalSize - 1 : Number.parseInt(endText, 10);
  if (!Number.isFinite(requestedEnd) || requestedEnd < start) return { type: 'unsatisfiable' };
  const end = Math.min(requestedEnd, totalSize - 1);
  const chunkSize = end - start + 1;
  return chunkSize > 0
    ? { type: 'valid', range: { start, end, chunkSize } }
    : { type: 'unsatisfiable' };
}

/**
 * Validate route segments before they become an R2 key or filesystem path.
 * Reject invalid input instead of deleting traversal markers and continuing.
 */
export function validateMediaSegments(rawSegments: unknown): PathValidationResult {
  if (!Array.isArray(rawSegments) || rawSegments.length === 0) {
    return { ok: false, error: 'Media path required', status: 400 };
  }

  const decodedSegments: string[] = [];
  for (const rawSegment of rawSegments) {
    if (typeof rawSegment !== 'string' || !rawSegment || !rawSegment.trim()) {
      return { ok: false, error: 'Invalid media path', status: 400 };
    }
    if (
      rawSegment === '.' ||
      rawSegment === '..' ||
      rawSegment.includes('/') ||
      rawSegment.includes('\\') ||
      /[\x00-\x1F\x7F]/.test(rawSegment)
    ) {
      return { ok: false, error: 'Invalid media path', status: 400 };
    }

    let decoded: string;
    try {
      decoded = decodeURIComponent(rawSegment);
    } catch {
      return { ok: false, error: 'Invalid media path encoding', status: 400 };
    }
    if (
      !decoded ||
      !decoded.trim() ||
      decoded === '.' ||
      decoded === '..' ||
      decoded.includes('/') ||
      decoded.includes('\\') ||
      decoded.includes('..') ||
      /[\x00-\x1F\x7F]/.test(decoded) ||
      /%(?:2e|2f|5c|00)/i.test(decoded)
    ) {
      return { ok: false, error: 'Invalid media path traversal', status: 400 };
    }
    decodedSegments.push(decoded);
  }

  const cleanKey = decodedSegments.join('/');
  if (!cleanKey || cleanKey.startsWith('/') || cleanKey.includes('//')) {
    return { ok: false, error: 'Invalid media path', status: 400 };
  }
  return { ok: true, cleanKey };
}
