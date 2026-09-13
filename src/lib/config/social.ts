// ============================================================
// Social links configuration shared by the admin form and API
// إعدادات روابط المنصات الاجتماعية مع تحقق موحد وآمن
// ============================================================

export const SOCIAL_PLATFORMS = ['instagram', 'facebook', 'tiktok', 'x', 'youtube'] as const;
export type SocialPlatform = (typeof SOCIAL_PLATFORMS)[number];
export type SocialLinks = Record<SocialPlatform, string | null>;

export const SOCIAL_PLATFORM_LABELS: Record<SocialPlatform, string> = {
  instagram: 'إنستجرام',
  facebook: 'فيسبوك',
  tiktok: 'تيك توك',
  x: 'إكس',
  youtube: 'يوتيوب',
};

export function emptySocialLinks(): SocialLinks {
  return {
    instagram: null,
    facebook: null,
    tiktok: null,
    x: null,
    youtube: null,
  };
}

/** يقبل روابط HTTP(S) فقط، بلا بيانات دخول أو محارف تحكم أو طول زائد. */
export function sanitizeSocialUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 500 || /[\u0000-\u001F\u007F]/.test(trimmed)) return null;

  try {
    const url = new URL(trimmed);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    if (!url.hostname || url.username || url.password) return null;
    return trimmed;
  } catch {
    return null;
  }
}

export function sanitizeSocialLinks(value: unknown): SocialLinks {
  const links = emptySocialLinks();
  if (!value || typeof value !== 'object' || Array.isArray(value)) return links;

  const record = value as Record<string, unknown>;
  for (const platform of SOCIAL_PLATFORMS) {
    links[platform] = sanitizeSocialUrl(record[platform]);
  }
  return links;
}

