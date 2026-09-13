import assert from 'node:assert/strict';
import {
  getBasePublicPlatformUrl,
  getPublicPlatformOrigin,
  resolvePublicPlatformUrl,
  isSafeExternalUrl,
  CANONICAL_PUBLIC_PLATFORM_URL,
  DEVELOPMENT_PUBLIC_PLATFORM_URL,
} from '../public-platform';

const env = process.env as Record<string, string | undefined>;
const savedUrl = env.NEXT_PUBLIC_PUBLIC_PLATFORM_URL;
const savedNodeEnv = env.NODE_ENV;

try {
  // ==========================================================
  // 1. Explicit Environment URL (الأولوية للرابط الصريح الصالح)
  // ==========================================================
  env.NEXT_PUBLIC_PUBLIC_PLATFORM_URL = 'https://custom-platform.yotba.com';
  env.NODE_ENV = 'production';
  assert.equal(getBasePublicPlatformUrl(), 'https://custom-platform.yotba.com');
  assert.equal(getPublicPlatformOrigin(), 'https://custom-platform.yotba.com');
  assert.equal(resolvePublicPlatformUrl('/'), 'https://custom-platform.yotba.com/');
  assert.equal(resolvePublicPlatformUrl('series/drama-1'), 'https://custom-platform.yotba.com/series/drama-1');

  // إزالة السلاش الزائد في نهاية الرابط الصريح
  env.NEXT_PUBLIC_PUBLIC_PLATFORM_URL = 'https://custom-platform.yotba.com///';
  assert.equal(getBasePublicPlatformUrl(), 'https://custom-platform.yotba.com');

  // الرابط الصريح الصالح يعمل أيضاً في بيئة التطوير
  env.NODE_ENV = 'development';
  assert.equal(getBasePublicPlatformUrl(), 'https://custom-platform.yotba.com');

  // ==========================================================
  // 2. Missing URL in Development (الغياب في بيئة التطوير)
  // ==========================================================
  delete env.NEXT_PUBLIC_PUBLIC_PLATFORM_URL;
  env.NODE_ENV = 'development';
  assert.equal(getBasePublicPlatformUrl(), DEVELOPMENT_PUBLIC_PLATFORM_URL);
  assert.equal(getPublicPlatformOrigin(), 'http://localhost:3000');
  assert.equal(resolvePublicPlatformUrl('/'), 'http://localhost:3000/');
  assert.equal(resolvePublicPlatformUrl('/series/sample'), 'http://localhost:3000/series/sample');

  // ==========================================================
  // 3. Missing URL in Production (الغياب في بيئة الإنتاج)
  // ==========================================================
  delete env.NEXT_PUBLIC_PUBLIC_PLATFORM_URL;
  env.NODE_ENV = 'production';
  assert.equal(getBasePublicPlatformUrl(), CANONICAL_PUBLIC_PLATFORM_URL);
  assert.equal(getPublicPlatformOrigin(), 'https://yotba.vercel.app');
  assert.equal(resolvePublicPlatformUrl('/'), 'https://yotba.vercel.app/');
  assert.equal(resolvePublicPlatformUrl('/series/sarkhat'), 'https://yotba.vercel.app/series/sarkhat');

  // ==========================================================
  // 4. Unsafe Environment Values without printing secrets
  // ==========================================================
  const sensitiveCredential = 'super_secret_token_alpha_numeric_9876';
  const unsafeSamples = [
    'javascript:alert(1)',
    `https://user:${sensitiveCredential}@evil.com/callback`,
    'data:text/html,<script>alert(1)</script>',
    'file:///etc/secrets',
    'https://yotba.com\r\nSet-Cookie: pwned=true',
    'http://:80',
    'https://',
    'not-a-valid-url',
    '',
    '   ',
  ];

  for (const sample of unsafeSamples) {
    env.NEXT_PUBLIC_PUBLIC_PLATFORM_URL = sample;

    let warningCaptured = '';
    const origWarn = console.warn;
    console.warn = (...messages: unknown[]) => {
      warningCaptured += messages.map((m) => String(m)).join(' ');
    };

    try {
      // فحص الإنتاج: الرجوع الآمن للنطاق القياسي دون طباعة السر
      env.NODE_ENV = 'production';
      assert.equal(getBasePublicPlatformUrl(), CANONICAL_PUBLIC_PLATFORM_URL);
      assert.equal(getPublicPlatformOrigin(), CANONICAL_PUBLIC_PLATFORM_URL);
      assert.equal(
        warningCaptured.includes(sensitiveCredential),
        false,
        'Console warning must not leak sensitive credentials'
      );

      // فحص التطوير: الرجوع الآمن إلى localhost دون طباعة السر
      env.NODE_ENV = 'development';
      assert.equal(getBasePublicPlatformUrl(), DEVELOPMENT_PUBLIC_PLATFORM_URL);
      assert.equal(getPublicPlatformOrigin(), DEVELOPMENT_PUBLIC_PLATFORM_URL);
      assert.equal(
        warningCaptured.includes(sensitiveCredential),
        false,
        'Console warning must not leak sensitive credentials'
      );
    } finally {
      console.warn = origWarn;
    }
  }

  // ==========================================================
  // 5. URL Safety Helper Verification
  // ==========================================================
  assert.equal(isSafeExternalUrl('https://yotba.com'), true);
  assert.equal(isSafeExternalUrl('http://localhost:3000'), true);
  assert.equal(isSafeExternalUrl('javascript:void(0)'), false);
  assert.equal(isSafeExternalUrl('https://user:pass@example.com'), false);
  assert.equal(isSafeExternalUrl('not-a-url'), false);
  assert.equal(isSafeExternalUrl(null), false);
  assert.equal(isSafeExternalUrl(undefined), false);

} finally {
  if (savedUrl !== undefined) {
    env.NEXT_PUBLIC_PUBLIC_PLATFORM_URL = savedUrl;
  } else {
    delete env.NEXT_PUBLIC_PUBLIC_PLATFORM_URL;
  }
  env.NODE_ENV = savedNodeEnv;
}

console.log('Public platform configuration & origin tests passed successfully.');
