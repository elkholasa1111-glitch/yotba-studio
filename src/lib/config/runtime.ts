/**
 * Runtime configuration helpers.
 *
 * Demo data is useful while developing locally, but it must never become an
 * accidental production fallback. Keep the decision in one place so every
 * service follows the same rule.
 */
export function isProductionRuntime(): boolean {
  return process.env.NODE_ENV === 'production';
}

export function isDemoMode(): boolean {
  const explicit = process.env.DEMO_MODE?.trim().toLowerCase();
  if (explicit === 'true' || explicit === '1' || explicit === 'yes') return true;
  if (explicit === 'false' || explicit === '0' || explicit === 'no') return false;

  // Local development without infrastructure may use the curated demo catalog.
  // Production always requires an explicit opt-in to demo mode.
  return !isProductionRuntime() && !process.env.MONGODB_URI;
}

export function hasMongoConfiguration(): boolean {
  return Boolean(process.env.MONGODB_URI?.trim());
}

export function hasR2Configuration(): boolean {
  return Boolean(
    process.env.CLOUDFLARE_R2_ACCOUNT_ID?.trim() &&
      process.env.CLOUDFLARE_R2_ACCESS_KEY_ID?.trim() &&
      process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY?.trim() &&
      process.env.CLOUDFLARE_R2_BUCKET_NAME?.trim()
  );
}

export function isDemoPaymentsAllowed(): boolean {
  const explicit = process.env.ALLOW_DEMO_PAYMENTS?.trim().toLowerCase();
  return explicit === 'true' || explicit === '1' || explicit === 'yes';
}

export function hasResendConfiguration(): boolean {
  return Boolean(
    process.env.EMAIL_PROVIDER_TYPE?.trim().toLowerCase() === 'resend' &&
      process.env.RESEND_API_KEY?.trim() &&
      process.env.EMAIL_FROM?.trim()
  );
}

export function hasStripeConfiguration(): boolean {
  return Boolean(
    process.env.PAYMENT_PROVIDER_TYPE?.trim().toLowerCase() === 'stripe' &&
      process.env.STRIPE_SECRET_KEY?.trim() &&
      process.env.STRIPE_WEBHOOK_SECRET?.trim()
  );
}
