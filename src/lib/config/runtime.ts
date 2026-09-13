/**
 * Runtime configuration helpers.
 *
 * Demo data is useful while developing locally, but it must never become an
 * accidental production fallback. Keep the decision in one place so every
 * service follows the same rule.
 */

/** Return a trimmed environment value, treating quoted/blank values as absent. */
export function normalizeEnv(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  let normalized = value.trim();
  if (!normalized) return undefined;
  while (
    normalized.length >= 2 &&
    ((normalized.startsWith('"') && normalized.endsWith('"')) ||
      (normalized.startsWith("'") && normalized.endsWith("'")))
  ) {
    normalized = normalized.slice(1, -1).trim();
  }
  return normalized || undefined;
}

export const normalizeEnvValue = normalizeEnv;

export function isProductionRuntime(): boolean {
  return normalizeEnv(process.env.NODE_ENV)?.toLowerCase() === 'production';
}

export function isDemoMode(): boolean {
  const explicit = normalizeEnv(process.env.DEMO_MODE)?.toLowerCase();
  if (explicit === 'true' || explicit === '1' || explicit === 'yes') return true;
  if (explicit === 'false' || explicit === '0' || explicit === 'no') return false;

  // Local development without infrastructure may use the curated demo catalog.
  // Production always requires an explicit opt-in to demo mode.
  return !isProductionRuntime() && !normalizeEnv(process.env.MONGODB_URI);
}

export function hasMongoConfiguration(): boolean {
  return Boolean(normalizeEnv(process.env.MONGODB_URI));
}

export function hasR2Configuration(): boolean {
  return Boolean(
    normalizeEnv(process.env.CLOUDFLARE_R2_ACCOUNT_ID) &&
      normalizeEnv(process.env.CLOUDFLARE_R2_ACCESS_KEY_ID) &&
      normalizeEnv(process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY) &&
      normalizeEnv(process.env.CLOUDFLARE_R2_BUCKET_NAME)
  );
}

export function isDemoPaymentsAllowed(): boolean {
  const explicit = normalizeEnv(process.env.ALLOW_DEMO_PAYMENTS)?.toLowerCase();
  return explicit === 'true' || explicit === '1' || explicit === 'yes';
}

export function hasResendConfiguration(): boolean {
  return Boolean(
    normalizeEnv(process.env.EMAIL_PROVIDER_TYPE)?.toLowerCase() === 'resend' &&
      normalizeEnv(process.env.RESEND_API_KEY) &&
      normalizeEnv(process.env.EMAIL_FROM)
  );
}

export function hasStripeConfiguration(): boolean {
  return Boolean(
    normalizeEnv(process.env.PAYMENT_PROVIDER_TYPE)?.toLowerCase() === 'stripe' &&
      normalizeEnv(process.env.STRIPE_SECRET_KEY) &&
      normalizeEnv(process.env.STRIPE_WEBHOOK_SECRET)
  );
}
