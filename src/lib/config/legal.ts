/**
 * Public legal copy is configurable at build time so the site never ships
 * bracketed template tokens. Keep the neutral fallbacks honest until the
 * owner supplies the final registered entity and support contacts.
 */
const publicValue = (name: string, fallback: string) => process.env[name]?.trim() || fallback;

export const LEGAL_CONFIG = {
  entityName: publicValue('NEXT_PUBLIC_LEGAL_ENTITY_NAME', 'الجهة المشغلة لمنصة «يُتبع...»'),
  country: publicValue('NEXT_PUBLIC_LEGAL_COUNTRY', 'بلد التسجيل المعتمد'),
  registeredAddress: publicValue('NEXT_PUBLIC_REGISTERED_ADDRESS', 'العنوان المسجل الذي سيُعلن قبل الإطلاق العام'),
  governingLaw: publicValue('NEXT_PUBLIC_GOVERNING_LAW', 'القانون المحلي المعمول به'),
  minimumAge: publicValue('NEXT_PUBLIC_MINIMUM_AGE', 'السن القانوني المعمول به في بلدك'),
  supportEmail: publicValue('NEXT_PUBLIC_SUPPORT_EMAIL', 'قناة الدعم الرسمية التي ستُعلن قبل الإطلاق العام'),
  privacyEmail: publicValue('NEXT_PUBLIC_PRIVACY_EMAIL', 'قناة الخصوصية الرسمية التي ستُعلن قبل الإطلاق العام'),
  paymentProvider: publicValue('NEXT_PUBLIC_PAYMENT_PROVIDER_DISPLAY', 'بوابة الدفع المعتمدة عند الإطلاق'),
} as const;
