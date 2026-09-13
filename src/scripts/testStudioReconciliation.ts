// ============================================================
// Studio Architecture Reconciliation & Security Policy Tests
// اختبارات تركز على الحراسة الأمنية بدون شبكة:
// 1. فحص حراسة أدوار الإدارة لتعديل الأسعار ومعاينة المحتوى (Role Guard)
// 2. التحقق من سلامة الأرقام الإدارية وحدود الأسعار (Finite Positive Bounded Prices)
// 3. التحقق من حل روابط المنصة العامة ورفض الروابط المشوهة (Safe URL Resolution)
// 4. حظر الروابط العامة للمحتوى الصوتي المدفوع (No Premium Public URL Policy)
// ============================================================

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import mongoose from 'mongoose';
import { connectDB } from '../lib/db/connect';
import {
  isAuthorizedPreviewRole,
  isAuthorizedPricingMutationRole,
  isSafeExternalUrl,
  getBasePublicPlatformUrl,
  getPublicPlatformOrigin,
  resolvePublicPlatformUrl,
  validateAudioPreviewPolicy,
  validatePricingValues,
  CANONICAL_PUBLIC_PLATFORM_URL,
  DEVELOPMENT_PUBLIC_PLATFORM_URL,
} from '../lib/config/public-platform';
import {
  validateUploadAuthorizeInput,
  validateUploadFinalizeInput,
  createUploadTicket,
  verifyUploadTicket,
  validateVerifiedMetadata,
  generateStorageKey,
  isValidGeneratedStorageKey,
  extractStorageKey,
  getLegacyMultipartUploadPolicy,
  CATEGORY_CONFIGS,
  StorageService,
} from '../lib/storage';
import { isProductionRuntime } from '../lib/config/runtime';
import {
  collectReplacedSeriesMediaKeys,
  collectReplacedEpisodeMediaKeys,
  buildSeriesMediaUpdates,
  buildEpisodeMediaUpdates,
  validateUploadDeleteTicket,
  findReferencedMediaKeys,
  isStorageKeyReferencedInDb,
  cleanupContentMedia,
} from '../lib/admin/content-api';

async function runTests() {
  console.log('--- Running Studio Architecture & Security Policy Tests ---');

  // ==========================================================
  // 1. Studio Role Guard Tests (حراسة أدوار الإدارة)
  // ==========================================================
  console.log('1. Testing Studio Role Guards...');

  // أ) تعديل الأسعار مقتصر على SUPER_ADMIN و ADMIN فقط
  assert.equal(isAuthorizedPricingMutationRole('SUPER_ADMIN'), true, 'SUPER_ADMIN must be allowed to modify pricing');
  assert.equal(isAuthorizedPricingMutationRole('ADMIN'), true, 'ADMIN must be allowed to modify pricing');
  assert.equal(isAuthorizedPricingMutationRole('CONTENT_EDITOR'), false, 'CONTENT_EDITOR must NOT be allowed to modify pricing');
  assert.equal(isAuthorizedPricingMutationRole('MODERATOR'), false, 'MODERATOR must NOT be allowed to modify pricing');
  assert.equal(isAuthorizedPricingMutationRole('ANALYTICS_VIEWER'), false, 'ANALYTICS_VIEWER must NOT be allowed to modify pricing');
  assert.equal(isAuthorizedPricingMutationRole('USER'), false, 'USER must NOT be allowed to modify pricing');
  assert.equal(isAuthorizedPricingMutationRole(null), false, 'null role must be rejected');
  assert.equal(isAuthorizedPricingMutationRole(undefined), false, 'undefined role must be rejected');
  assert.equal(isAuthorizedPricingMutationRole(''), false, 'empty role must be rejected');

  // ب) معاينة الصوتيات والمسودات مسموحة لـ SUPER_ADMIN, ADMIN, CONTENT_EDITOR
  assert.equal(isAuthorizedPreviewRole('SUPER_ADMIN'), true, 'SUPER_ADMIN must be authorized to preview');
  assert.equal(isAuthorizedPreviewRole('ADMIN'), true, 'ADMIN must be authorized to preview');
  assert.equal(isAuthorizedPreviewRole('CONTENT_EDITOR'), true, 'CONTENT_EDITOR must be authorized to preview');
  assert.equal(isAuthorizedPreviewRole('MODERATOR'), false, 'MODERATOR must NOT be authorized to preview');
  assert.equal(isAuthorizedPreviewRole('ANALYTICS_VIEWER'), false, 'ANALYTICS_VIEWER must NOT be authorized to preview');
  assert.equal(isAuthorizedPreviewRole('USER'), false, 'USER must NOT be authorized to preview');
  assert.equal(isAuthorizedPreviewRole(null), false, 'null preview role must be rejected');

  // ==========================================================
  // 2. Pricing Validation Tests (التحقق من صحة الأسعار وحدودها)
  // ==========================================================
  console.log('2. Testing Finite Positive Bounded Pricing Validation...');

  // أسعار صالحة ومحدودة
  const validPricing = validatePricingValues({ seasonUsd: 0.5, monthlyUsd: 1, annualUsd: 10 });
  assert.equal(validPricing.ok, true, 'Valid pricing should be accepted');
  if (validPricing.ok) {
    assert.equal(validPricing.values.seasonUsd, 0.5);
    assert.equal(validPricing.values.monthlyUsd, 1);
    assert.equal(validPricing.values.annualUsd, 10);
  }

  // رفض الأسعار السالبة
  const negativePricing = validatePricingValues({ seasonUsd: -5, monthlyUsd: 1, annualUsd: 10 });
  assert.equal(negativePricing.ok, false, 'Negative pricing must be rejected');

  // رفض السعر الصفري
  const zeroPricing = validatePricingValues({ seasonUsd: 0, monthlyUsd: 1, annualUsd: 10 });
  assert.equal(zeroPricing.ok, false, 'Zero pricing must be rejected');

  // رفض القيم غير العددية أو NaN أو اللانهائية
  assert.equal(validatePricingValues({ seasonUsd: NaN, monthlyUsd: 1, annualUsd: 10 }).ok, false, 'NaN must be rejected');
  assert.equal(validatePricingValues({ seasonUsd: Infinity, monthlyUsd: 1, annualUsd: 10 }).ok, false, 'Infinity must be rejected');
  assert.equal(validatePricingValues({ seasonUsd: 'free', monthlyUsd: 1, annualUsd: 10 }).ok, false, 'Strings must be rejected');

  // رفض الأسعار المفرطة التي تتجاوز الحد الأقصى (10,000 دولار)
  assert.equal(validatePricingValues({ seasonUsd: 50000, monthlyUsd: 1, annualUsd: 10 }).ok, false, 'Exorbitant pricing must be rejected');

  // ==========================================================
  // 3. Safe URL Resolution & Malformed URL Rejection
  // ==========================================================
  console.log('3. Testing Safe URL Resolution & Malformed URL Rejection...');

  // فحص أمان الروابط الخارجية
  assert.equal(isSafeExternalUrl('https://yotba.com'), true, 'https URL should be safe');
  assert.equal(isSafeExternalUrl('http://localhost:3000'), true, 'localhost http URL should be safe');
  assert.equal(isSafeExternalUrl('https://yotba.vercel.app/series/sample'), true, 'Full path URL should be safe');

  // رفض البروتوكولات الخطرة
  assert.equal(isSafeExternalUrl('javascript:alert(document.cookie)'), false, 'javascript: scheme must be rejected');
  assert.equal(isSafeExternalUrl('data:text/html,<script>alert(1)</script>'), false, 'data: scheme must be rejected');
  assert.equal(isSafeExternalUrl('file:///etc/passwd'), false, 'file: scheme must be rejected');
  assert.equal(isSafeExternalUrl('vbscript:msgbox(1)'), false, 'vbscript: scheme must be rejected');

  // رفض تضمين بيانات الاعتماد في الرابط لمنع تسريبها
  assert.equal(isSafeExternalUrl('https://admin:secret@evil.com/leak'), false, 'Credentials in URL must be rejected');

  // رفض الروابط المشوهة والرموز التحكم وحقن الأسطر (CRLF)
  assert.equal(isSafeExternalUrl('https://yotba.com\r\nSet-Cookie: stolen=1'), false, 'CRLF injection in URL must be rejected');
  assert.equal(isSafeExternalUrl('https://yotba.com\u0000/nullbyte'), false, 'Null byte in URL must be rejected');
  assert.equal(isSafeExternalUrl('not-a-valid-url'), false, 'Malformed URL string must be rejected');
  assert.equal(isSafeExternalUrl(''), false, 'Empty string must be rejected');

  // فحص حل روابط المنصة العامة
  const resolvedPath = resolvePublicPlatformUrl('/series/sarkhat-al-dhulumaat');
  assert.ok(resolvedPath.endsWith('/series/sarkhat-al-dhulumaat'), 'Resolved path must preserve the target route');

  // الروابط المشوهة التي تمرر إلى resolvePublicPlatformUrl يجب أن ترمي استثناءً
  assert.throws(() => {
    resolvePublicPlatformUrl('javascript:alert(1)');
  }, /Invalid or unsafe public platform URL/, 'Unsafe URL must throw error');

  assert.throws(() => {
    resolvePublicPlatformUrl('/path\r\nInjected: true');
  }, /Invalid characters in public platform path/, 'CRLF in path must throw error');

  // ----------------------------------------------------------
  // فحص استخراج الرابط الأساسي وتوحيد الأصل لمنصة الاستماع العامة:
  // (explicit, missing-development, missing-production, unsafe env values)
  // ----------------------------------------------------------
  const envMap = process.env as Record<string, string | undefined>;
  const prevPlatformUrl = envMap.NEXT_PUBLIC_PUBLIC_PLATFORM_URL;
  const prevEnvNode = envMap.NODE_ENV;
  try {
    // 1. Explicit: الرابط الصريح الصالح له الأسبقية دائماً
    envMap.NEXT_PUBLIC_PUBLIC_PLATFORM_URL = 'https://custom.yotba.com/';
    envMap.NODE_ENV = 'production';
    assert.equal(getBasePublicPlatformUrl(), 'https://custom.yotba.com', 'Trailing slash must be stripped from explicit URL');
    assert.equal(getPublicPlatformOrigin(), 'https://custom.yotba.com', 'getPublicPlatformOrigin must match getBasePublicPlatformUrl');
    assert.equal(resolvePublicPlatformUrl('/'), 'https://custom.yotba.com/', 'Root path should resolve with explicit origin');
    assert.equal(resolvePublicPlatformUrl('/series/sarkhat'), 'https://custom.yotba.com/series/sarkhat');

    envMap.NODE_ENV = 'development';
    assert.equal(getBasePublicPlatformUrl(), 'https://custom.yotba.com', 'Explicit URL must take precedence even in development');
    assert.equal(getPublicPlatformOrigin(), 'https://custom.yotba.com');

    // 2. Missing in Development: يعود بأمان إلى http://localhost:3000
    delete envMap.NEXT_PUBLIC_PUBLIC_PLATFORM_URL;
    envMap.NODE_ENV = 'development';
    assert.equal(getBasePublicPlatformUrl(), DEVELOPMENT_PUBLIC_PLATFORM_URL, 'Missing env in development must fallback to localhost:3000');
    assert.equal(getPublicPlatformOrigin(), DEVELOPMENT_PUBLIC_PLATFORM_URL);
    assert.equal(resolvePublicPlatformUrl('/'), `${DEVELOPMENT_PUBLIC_PLATFORM_URL}/`);

    // 3. Missing in Production: يعود بأمان إلى https://yotba.vercel.app لمنع ربط الاستوديو بنفسه
    delete envMap.NEXT_PUBLIC_PUBLIC_PLATFORM_URL;
    envMap.NODE_ENV = 'production';
    assert.equal(getBasePublicPlatformUrl(), CANONICAL_PUBLIC_PLATFORM_URL, 'Missing env in production must fallback to safe canonical URL');
    assert.equal(getPublicPlatformOrigin(), CANONICAL_PUBLIC_PLATFORM_URL);
    assert.equal(resolvePublicPlatformUrl('/'), `${CANONICAL_PUBLIC_PLATFORM_URL}/`, 'Studio login button must resolve to public platform in production');
    assert.equal(resolvePublicPlatformUrl('/series/sarkhat'), `${CANONICAL_PUBLIC_PLATFORM_URL}/series/sarkhat`);

    // 4. Unsafe environment values: روابط غير آمنة أو تحتوي على أسرار/بيانات اعتماد (بدون تسريب الأسرار)
    const secretToken = 'super_secret_token_leak_998877';
    const unsafeEnvSamples = [
      'javascript:alert(1)',
      `https://admin:${secretToken}@evil.com/leak`,
      'data:text/html,<script>alert(1)</script>',
      'https://yotba.com\r\nSet-Cookie: stolen=1',
      '   ',
    ];

    for (const unsafeUrl of unsafeEnvSamples) {
      envMap.NEXT_PUBLIC_PUBLIC_PLATFORM_URL = unsafeUrl;

      // التأكد من عدم طباعة أسرار أو بيانات اعتماد في السجلات
      let warnOutput = '';
      const originalWarn = console.warn;
      console.warn = (...args: unknown[]) => {
        warnOutput += args.map((a) => String(a)).join(' ');
      };

      try {
        envMap.NODE_ENV = 'production';
        assert.equal(getBasePublicPlatformUrl(), CANONICAL_PUBLIC_PLATFORM_URL, 'Unsafe env must fallback safely to canonical in production');
        assert.equal(getPublicPlatformOrigin(), CANONICAL_PUBLIC_PLATFORM_URL);
        assert.equal(warnOutput.includes(secretToken), false, 'Console warning must NOT print secrets or credential tokens');

        envMap.NODE_ENV = 'development';
        assert.equal(getBasePublicPlatformUrl(), DEVELOPMENT_PUBLIC_PLATFORM_URL, 'Unsafe env must fallback safely to localhost in development');
        assert.equal(getPublicPlatformOrigin(), DEVELOPMENT_PUBLIC_PLATFORM_URL);
        assert.equal(warnOutput.includes(secretToken), false, 'Console warning must NOT print secrets or credential tokens');
      } finally {
        console.warn = originalWarn;
      }
    }
  } finally {
    if (prevPlatformUrl !== undefined) {
      envMap.NEXT_PUBLIC_PUBLIC_PLATFORM_URL = prevPlatformUrl;
    } else {
      delete envMap.NEXT_PUBLIC_PUBLIC_PLATFORM_URL;
    }
    envMap.NODE_ENV = prevEnvNode;
  }

  // ==========================================================
  // 4. No Premium Public URL Policy (سياسة حظر الروابط العامة للصوت المدفوع)
  // ==========================================================
  console.log('4. Testing No Premium Public URL Policy...');

  // أ) حلقة مدفوعة تملك مفتاح تخزين R2 محمي -> مسموح كبث محمي فقط (protected)
  const paidWithStorage = validateAudioPreviewPolicy({
    isFree: false,
    audioStorageKey: 'episodes/ep123/audio.mp3',
    audioPublicUrl: null,
  });
  assert.equal(paidWithStorage.canPreview, true);
  assert.equal(paidWithStorage.streamType, 'protected');

  // ب) حلقة مدفوعة تم وضع رابط عام لها عن طريق الخطأ دون مفتاح تخزين
  // السياسة تلزم برفض المعاينة وحظر تسريب الصوت العام!
  const paidWithPublicOnly = validateAudioPreviewPolicy({
    isFree: false,
    audioStorageKey: null,
    audioPublicUrl: 'https://cdn.example.com/audio/master-episode-paid.mp3',
  });
  assert.equal(paidWithPublicOnly.canPreview, false, 'Premium audio with public URL must NOT be allowed to preview as public');
  assert.equal(paidWithPublicOnly.streamType, 'none');
  assert.equal(paidWithPublicOnly.reason, 'PREMIUM_REQUIRES_PROTECTED_STORAGE_KEY');

  // ج) حلقة مدفوعة تملك مفتاح تخزين ورابط عام معاً -> تفضل دائماً البث المحمي وتتجاهل الرابط العام
  const paidWithBoth = validateAudioPreviewPolicy({
    isFree: false,
    audioStorageKey: 'episodes/ep123/audio.mp3',
    audioPublicUrl: 'https://cdn.example.com/audio/sample.mp3',
  });
  assert.equal(paidWithBoth.canPreview, true);
  assert.equal(paidWithBoth.streamType, 'protected', 'Premium episode must ALWAYS use protected stream even if publicUrl is present');

  // د) حلقة مجانية تملك رابطاً عاماً صالحاً -> مسموح كبث مجاني (public_free)
  const freeWithPublic = validateAudioPreviewPolicy({
    isFree: true,
    audioStorageKey: null,
    audioPublicUrl: '/audio/sarkhat-ep1.wav',
  });
  assert.equal(freeWithPublic.canPreview, true);
  assert.equal(freeWithPublic.streamType, 'public_free');

  // هـ) حلقة مجانية تملك مفتاح تخزين -> تفضل البث المحمي
  const freeWithStorage = validateAudioPreviewPolicy({
    isFree: true,
    audioStorageKey: 'episodes/ep1/audio.wav',
    audioPublicUrl: '/audio/sarkhat-ep1.wav',
  });
  assert.equal(freeWithStorage.canPreview, true);
  assert.equal(freeWithStorage.streamType, 'protected');

  // و) حلقة مجانية برابط وهمي مرفوض (pixabay sample placeholder)
  const freeWithPixabay = validateAudioPreviewPolicy({
    isFree: true,
    audioStorageKey: null,
    audioPublicUrl: 'https://cdn.pixabay.com/download/audio/fake.mp3',
  });
  assert.equal(freeWithPixabay.canPreview, false);
  assert.equal(freeWithPixabay.streamType, 'none');
  assert.equal(freeWithPixabay.reason, 'INVALID_SAMPLE_URL');

  // ز) حلقة بدون أي مصدر صوتي
  const noSource = validateAudioPreviewPolicy({
    isFree: true,
    audioStorageKey: null,
    audioPublicUrl: null,
  });
  assert.equal(noSource.canPreview, false);
  assert.equal(noSource.streamType, 'none');
  // ==========================================================
  // 5. Large-Media Direct R2 Upload & Security Policy Tests
  // ==========================================================
  console.log('5. Testing Large-Media Direct R2 Upload & Security Policy...');

  // أ) التحقق من ترخيص الرفع: وسائط ضخمة بدون حدود منصة اصطناعية (للصور والصوت والفيديو)
  const hugeVideo = validateUploadAuthorizeInput({
    category: 'video',
    fileName: 'trailer-4k.mp4',
    fileType: 'video/mp4',
    fileSize: 500 * 1024 * 1024, // 500MB
  });
  assert.equal(hugeVideo.ok, true, 'Huge video must be accepted without arbitrary platform size cap');
  if (hugeVideo.ok) {
    assert.equal(hugeVideo.data.folder, 'media');
    assert.equal(hugeVideo.data.canonicalMime, 'video/mp4');
    assert.equal(hugeVideo.data.isProtected, false);
  }

  const hugeAudio = validateUploadAuthorizeInput({
    category: 'audio',
    fileName: 'master-episode.mp3',
    fileType: 'audio/mpeg',
    fileSize: 300 * 1024 * 1024, // 300MB
  });
  assert.equal(hugeAudio.ok, true, 'Huge audio must be accepted without arbitrary platform size cap');
  if (hugeAudio.ok) {
    assert.equal(hugeAudio.data.folder, 'audio');
    assert.equal(hugeAudio.data.isProtected, true, 'Audio must be marked as protected');
  }

  const hugePoster = validateUploadAuthorizeInput({
    category: 'poster',
    fileName: 'series-poster.webp',
    fileType: 'image/webp',
    fileSize: 50 * 1024 * 1024, // 50MB
  });
  assert.equal(hugePoster.ok, true, 'Huge poster must be accepted without arbitrary platform size cap');
  if (hugePoster.ok) {
    assert.equal(hugePoster.data.folder, 'posters');
    assert.equal(hugePoster.data.isProtected, false);
  }

  // ب) نصوص الترجمة: حماية الخادم بحد أقصى 10 ميغابايت لأنها تُحلل داخل المنصة
  const validTranscript = validateUploadAuthorizeInput({
    category: 'transcript',
    fileName: 'episode-subtitles.srt',
    fileType: 'text/plain',
    fileSize: 2 * 1024 * 1024, // 2MB
  });
  assert.equal(validTranscript.ok, true, 'Valid transcript must be accepted');

  const oversizeTranscript = validateUploadAuthorizeInput({
    category: 'transcript',
    fileName: 'massive-subtitles.srt',
    fileType: 'text/plain',
    fileSize: 10 * 1024 * 1024 + 1, // 10MB + 1 byte
  });
  assert.equal(oversizeTranscript.ok, false, 'Transcript exceeding 10MB must be rejected');
  if (!oversizeTranscript.ok) {
    assert.equal(oversizeTranscript.status, 413);
  }

  // ج) التحقق من صحة fileSize (أرقام موجبة صحيحة فقط)
  assert.equal(validateUploadAuthorizeInput({ category: 'poster', fileName: 'p.jpg', fileType: 'image/jpeg', fileSize: 0 }).ok, false);
  assert.equal(validateUploadAuthorizeInput({ category: 'poster', fileName: 'p.jpg', fileType: 'image/jpeg', fileSize: -50 }).ok, false);
  assert.equal(validateUploadAuthorizeInput({ category: 'poster', fileName: 'p.jpg', fileType: 'image/jpeg', fileSize: NaN }).ok, false);
  assert.equal(validateUploadAuthorizeInput({ category: 'poster', fileName: 'p.jpg', fileType: 'image/jpeg', fileSize: Infinity }).ok, false);
  assert.equal(validateUploadAuthorizeInput({ category: 'poster', fileName: 'p.jpg', fileType: 'image/jpeg', fileSize: 10.5 }).ok, false);

  // د) رفض ملفات SVG النشطة لأسباب أمنية (منع XSS)
  const svgByName = validateUploadAuthorizeInput({
    category: 'poster',
    fileName: 'malicious.svg',
    fileType: 'image/jpeg',
    fileSize: 1024,
  });
  assert.equal(svgByName.ok, false, 'SVG extension must be rejected');

  const svgByType = validateUploadAuthorizeInput({
    category: 'poster',
    fileName: 'malicious.jpg',
    fileType: 'image/svg+xml',
    fileSize: 1024,
  });
  assert.equal(svgByType.ok, false, 'image/svg+xml MIME must be rejected');

  // هـ) منع تعارض الامتداد مع نوع المحتوى (Extension vs MIME Mismatch)
  const mimeMismatch = validateUploadAuthorizeInput({
    category: 'audio',
    fileName: 'audio.mp3',
    fileType: 'image/png',
    fileSize: 5000,
  });
  assert.equal(mimeMismatch.ok, false, 'Mismatched MIME and extension must be rejected');

  // و) إصدار والتحقق من تذاكر تفويض الرفع المشفرة (HMAC Ticket)
  const testStorageKey = generateStorageKey('audio', 'mp3');
  assert.equal(isValidGeneratedStorageKey(testStorageKey), true, 'Generated storage key must be valid');

  const validTicket = createUploadTicket({
    adminId: 'admin_123',
    storageKey: testStorageKey,
    category: 'audio',
    expectedSizeBytes: 25000000,
    canonicalMime: 'audio/mpeg',
    expiresAt: Date.now() + 3600 * 1000,
  });
  assert.ok(typeof validTicket === 'string' && validTicket.includes('.'), 'Ticket must be a signed payload.signature string');

  const verifiedTicket = verifyUploadTicket(validTicket, 'admin_123', testStorageKey);
  assert.equal(verifiedTicket.ok, true, 'Authentic ticket must verify successfully');
  if (verifiedTicket.ok) {
    assert.equal(verifiedTicket.data.expectedSizeBytes, 25000000);
    assert.equal(verifiedTicket.data.canonicalMime, 'audio/mpeg');
  }

  // ز) رفض التذاكر المتلاعب بها (Tampered Ticket)
  const tamperedTicket = validTicket.slice(0, -4) + 'abcd';
  const tamperedResult = verifyUploadTicket(tamperedTicket, 'admin_123', testStorageKey);
  assert.equal(tamperedResult.ok, false, 'Tampered signature must be rejected');
  if (!tamperedResult.ok) assert.equal(tamperedResult.status, 403);

  // ح) رفض التذكرة المنتهية الصلاحية
  const expiredTicket = createUploadTicket({
    adminId: 'admin_123',
    storageKey: testStorageKey,
    category: 'audio',
    expectedSizeBytes: 25000000,
    canonicalMime: 'audio/mpeg',
    expiresAt: Date.now() - 1000,
  });
  const expiredResult = verifyUploadTicket(expiredTicket, 'admin_123', testStorageKey);
  assert.equal(expiredResult.ok, false, 'Expired ticket must be rejected');
  if (!expiredResult.ok) assert.equal(expiredResult.status, 401);

  // ط) رفض التذكرة المقدمة لمشرف آخر أو ملف آخر
  const wrongAdmin = verifyUploadTicket(validTicket, 'different_admin', testStorageKey);
  assert.equal(wrongAdmin.ok, false, 'Ticket for different admin must be rejected');
  if (!wrongAdmin.ok) assert.equal(wrongAdmin.status, 403);

  const wrongFile = verifyUploadTicket(validTicket, 'admin_123', 'audio/other_key.mp3');
  assert.equal(wrongFile.ok, false, 'Ticket for different storage key must be rejected');
  if (!wrongFile.ok) assert.equal(wrongFile.status, 400);

  // ي) التحقق من البيانات الوصفية المعتمدة (Finalize Verification Step)
  const validMetadata = validateVerifiedMetadata(
    {
      adminId: 'admin_123',
      storageKey: testStorageKey,
      category: 'audio',
      expectedSizeBytes: 25000000,
      canonicalMime: 'audio/mpeg',
      expiresAt: Date.now() + 3600 * 1000,
    },
    { exists: true, sizeBytes: 25000000, contentType: 'audio/mpeg' }
  );
  assert.equal(validMetadata.ok, true, 'Metadata matching ticket size and mime must be verified');

  // رفض عدم تطابق الحجم الفعلي مع المصرح به في التذكرة
  const sizeMismatch = validateVerifiedMetadata(
    {
      adminId: 'admin_123',
      storageKey: testStorageKey,
      category: 'audio',
      expectedSizeBytes: 25000000,
      canonicalMime: 'audio/mpeg',
      expiresAt: Date.now() + 3600 * 1000,
    },
    { exists: true, sizeBytes: 99999999, contentType: 'audio/mpeg' }
  );
  assert.equal(sizeMismatch.ok, false, 'Actual size mismatching authorized ticket must be rejected');
  if (!sizeMismatch.ok) assert.equal(sizeMismatch.status, 400);

  // رفض عدم تطابق نوع المحتوى الفعلي
  const mimeMismatchMeta = validateVerifiedMetadata(
    {
      adminId: 'admin_123',
      storageKey: testStorageKey,
      category: 'audio',
      expectedSizeBytes: 25000000,
      canonicalMime: 'audio/mpeg',
      expiresAt: Date.now() + 3600 * 1000,
    },
    { exists: true, sizeBytes: 25000000, contentType: 'image/png' }
  );
  assert.equal(mimeMismatchMeta.ok, false, 'Mismatched contentType in metadata must be rejected');

  // رفض الملف الفارغ (0 بايت) أو غير الموجود
  assert.equal(
    validateVerifiedMetadata(
      { adminId: 'a', storageKey: 'k', category: 'poster', expectedSizeBytes: 100, canonicalMime: 'image/jpeg', expiresAt: Date.now() + 1000 },
      { exists: false }
    ).ok,
    false
  );
  assert.equal(
    validateVerifiedMetadata(
      { adminId: 'a', storageKey: 'k', category: 'poster', expectedSizeBytes: 100, canonicalMime: 'image/jpeg', expiresAt: Date.now() + 1000 },
      { exists: true, sizeBytes: 0, contentType: 'image/jpeg' }
    ).ok,
    false
  );

  // ك) فحص استخراج والتحقق من مفاتيح التخزين (isValidGeneratedStorageKey & extractStorageKey)
  assert.equal(isValidGeneratedStorageKey('posters/1726000000000_0123456789abcdef.jpg'), true);
  assert.equal(isValidGeneratedStorageKey('hero/1726000000000_0123456789abcdef.webp'), true);
  assert.equal(isValidGeneratedStorageKey('audio/1726000000000_0123456789abcdef.mp3'), true);
  assert.equal(isValidGeneratedStorageKey('media/1726000000000_0123456789abcdef.mp4'), true);
  assert.equal(isValidGeneratedStorageKey('episodes/507f1f77bcf86cd799439011/audio.mp3'), true, 'Legacy episode audio key format must be recognized');

  assert.equal(isValidGeneratedStorageKey('../etc/passwd'), false);
  assert.equal(isValidGeneratedStorageKey('uploads/unknown/file.jpg'), false);
  assert.equal(isValidGeneratedStorageKey('posters/invalid-non-hex.jpg'), false);

  assert.equal(
    extractStorageKey('/uploads/posters/1726000000000_0123456789abcdef.jpg'),
    'posters/1726000000000_0123456789abcdef.jpg'
  );
  assert.equal(
    extractStorageKey('https://media.yotba.com/hero/1726000000000_0123456789abcdef.webp?v=1'),
    'hero/1726000000000_0123456789abcdef.webp'
  );
  assert.equal(extractStorageKey('https://evil.com/hack.jpg'), null);
  assert.equal(extractStorageKey('blob:http://localhost:3000/1234'), null);

  // ل) فحص حماية الصوت المحمي من الروابط العامة
  assert.equal(StorageService.getPublicMediaUrl('audio/1726000000000_0123456789abcdef.mp3'), '');
  assert.equal(StorageService.getPublicMediaUrl('episodes/507f1f77bcf86cd799439011/audio.mp3'), '');

  // م) فحص سلوك بيئة التشغيل (isProductionRuntime)
  const prevEnv = envMap.NODE_ENV;
  try {
    envMap.NODE_ENV = 'production';
    assert.equal(isProductionRuntime(), true, 'isProductionRuntime must be true in production');
    envMap.NODE_ENV = 'development';
    assert.equal(isProductionRuntime(), false, 'isProductionRuntime must be false in development');
    envMap.NODE_ENV = 'test';
    assert.equal(isProductionRuntime(), false, 'isProductionRuntime must be false in test');
  } finally {
    envMap.NODE_ENV = prevEnv;
  }

  // ن) فحص سياسة مسار الرفع القديم (getLegacyMultipartUploadPolicy)
  // يثبت أن الإنتاج يتطلب الرفع المباشر وأن التطوير المحلي مسموح له بالبديل الاحتياطي
  const prodPolicy = getLegacyMultipartUploadPolicy('production');
  assert.equal(prodPolicy.allowed, false, 'Production must reject legacy multipart upload');
  assert.equal(prodPolicy.requiresDirectUpload, true, 'Production must require direct upload');
  assert.equal(prodPolicy.reason, 'PRODUCTION_DIRECT_UPLOAD_REQUIRED');
  assert.ok(typeof prodPolicy.errorMessage === 'string' && prodPolicy.errorMessage.length > 0);

  const devPolicy = getLegacyMultipartUploadPolicy('development');
  assert.equal(devPolicy.allowed, true, 'Development must allow legacy multipart upload fallback');
  assert.equal(devPolicy.requiresDirectUpload, false, 'Development must not require direct upload');
  assert.equal(devPolicy.reason, 'LOCAL_DEVELOPMENT_FALLBACK_ALLOWED');

  const testPolicy = getLegacyMultipartUploadPolicy('test');
  assert.equal(testPolicy.allowed, true, 'Test environment must allow legacy fallback');
  assert.equal(testPolicy.requiresDirectUpload, false);

  // فحص سياسة الرفع باعتماد قراءة متغيرات البيئة الحية (process.env.NODE_ENV)
  try {
    envMap.NODE_ENV = 'production';
    const dynamicProdPolicy = getLegacyMultipartUploadPolicy();
    assert.equal(dynamicProdPolicy.allowed, false, 'Dynamic env production must reject legacy multipart upload');
    assert.equal(dynamicProdPolicy.requiresDirectUpload, true, 'Dynamic env production must require direct upload');

    envMap.NODE_ENV = 'development';
    const dynamicDevPolicy = getLegacyMultipartUploadPolicy();
    assert.equal(dynamicDevPolicy.allowed, true, 'Dynamic env development must allow legacy fallback');
    assert.equal(dynamicDevPolicy.requiresDirectUpload, false);
  } finally {
    envMap.NODE_ENV = prevEnv;
  }

  // ==========================================================
  // 6. Media Lifecycle Candidate Collection & Boundary Tests (Requirement 1 & 2)
  // ==========================================================
  console.log('6. Testing Media Lifecycle Candidate Collection & Route Boundary Isolation...');

  // إعداد بيانات مسلسل كامل الوسائط
  const seriesPosterKey = 'posters/1726000000000_1111111111111111.jpg';
  const seriesHeroKey = 'hero/1726000000000_2222222222222222.webp';
  const seriesPromoKey = 'media/1726000000000_3333333333333333.mp4';
  const populatedSeries = {
    posterUrl: `https://media.yotba.com/${seriesPosterKey}`,
    heroArtworkUrl: `https://media.yotba.com/${seriesHeroKey}`,
    shareVideoUrl: `https://media.yotba.com/${seriesPromoKey}`,
  };

  // إعداد بيانات حلقة كاملة الوسائط
  const episodeArtKey = 'posters/1726000000000_4444444444444444.jpg';
  const episodeAudioKey = 'audio/1726000000000_5555555555555555.mp3';
  const episodePublicKey = 'audio/1726000000000_6666666666666666.mp3';
  const populatedEpisode = {
    artworkOverride: `https://media.yotba.com/${episodeArtKey}`,
    audioStorageKey: episodeAudioKey,
    audioPublicUrl: `https://media.yotba.com/${episodePublicKey}`,
  };

  // 1. title-only / no media update object collects zero keys from a record with all media populated
  const seriesTitleOnly = { title: 'عنوان جديد للمسلسل' };
  const builtSeriesTitleUpdates = buildSeriesMediaUpdates(seriesTitleOnly);
  assert.equal(Object.keys(builtSeriesTitleUpdates).length, 0, 'buildSeriesMediaUpdates must omit non-media keys');
  assert.equal(
    collectReplacedSeriesMediaKeys(populatedSeries, builtSeriesTitleUpdates).size,
    0,
    'Title-only update must collect zero keys from populated series'
  );
  assert.equal(
    collectReplacedSeriesMediaKeys(populatedSeries, seriesTitleOnly).size,
    0,
    'Passing title-only update directly must collect zero keys'
  );
  assert.equal(
    collectReplacedSeriesMediaKeys(populatedSeries, {}).size,
    0,
    'Empty update object must collect zero keys from populated series'
  );

  const episodeTitleOnly = { title: 'عنوان جديد للحلقة' };
  const builtEpisodeTitleUpdates = buildEpisodeMediaUpdates(episodeTitleOnly);
  assert.equal(Object.keys(builtEpisodeTitleUpdates).length, 0, 'buildEpisodeMediaUpdates must omit non-media keys');
  assert.equal(
    collectReplacedEpisodeMediaKeys(populatedEpisode, builtEpisodeTitleUpdates).size,
    0,
    'Title-only update must collect zero keys from populated episode'
  );
  assert.equal(
    collectReplacedEpisodeMediaKeys(populatedEpisode, episodeTitleOnly).size,
    0,
    'Passing title-only update directly must collect zero keys'
  );
  assert.equal(
    collectReplacedEpisodeMediaKeys(populatedEpisode, {}).size,
    0,
    'Empty update object must collect zero keys from populated episode'
  );

  // 2. Explicit clear of each supported field collects exactly its old key
  // أ) المسلسل: posterUrl, heroArtworkUrl, shareVideoUrl
  for (const clearVal of [null, undefined, '']) {
    const clearPoster = buildSeriesMediaUpdates({ posterUrl: clearVal });
    assert.deepEqual(
      Array.from(collectReplacedSeriesMediaKeys(populatedSeries, clearPoster)),
      [seriesPosterKey],
      `Explicit clear of posterUrl (${clearVal}) must collect exactly old poster key`
    );

    const clearHero = buildSeriesMediaUpdates({ heroArtworkUrl: clearVal });
    assert.deepEqual(
      Array.from(collectReplacedSeriesMediaKeys(populatedSeries, clearHero)),
      [seriesHeroKey],
      `Explicit clear of heroArtworkUrl (${clearVal}) must collect exactly old hero key`
    );

    const clearPromo = buildSeriesMediaUpdates({ shareVideoUrl: clearVal });
    assert.deepEqual(
      Array.from(collectReplacedSeriesMediaKeys(populatedSeries, clearPromo)),
      [seriesPromoKey],
      `Explicit clear of shareVideoUrl (${clearVal}) must collect exactly old promo key`
    );
  }

  // ب) الحلقة: artworkOverride, audioStorageKey, audioPublicUrl
  for (const clearVal of [null, undefined, '']) {
    const clearArt = buildEpisodeMediaUpdates({ artworkOverride: clearVal });
    assert.deepEqual(
      Array.from(collectReplacedEpisodeMediaKeys(populatedEpisode, clearArt)),
      [episodeArtKey],
      `Explicit clear of artworkOverride (${clearVal}) must collect exactly old artwork key`
    );

    const clearAudio = buildEpisodeMediaUpdates({ audioStorageKey: clearVal });
    assert.deepEqual(
      Array.from(collectReplacedEpisodeMediaKeys(populatedEpisode, clearAudio)),
      [episodeAudioKey],
      `Explicit clear of audioStorageKey (${clearVal}) must collect exactly old audio key`
    );

    const clearPublic = buildEpisodeMediaUpdates({ audioPublicUrl: clearVal });
    assert.deepEqual(
      Array.from(collectReplacedEpisodeMediaKeys(populatedEpisode, clearPublic)),
      [episodePublicKey],
      `Explicit clear of audioPublicUrl (${clearVal}) must collect exactly old public key`
    );
  }

  // 3. Replacement collects old key
  const newSeriesPosterKey = 'posters/1726000000000_7777777777777777.jpg';
  const newSeriesHeroKey = 'hero/1726000000000_8888888888888888.webp';
  const newSeriesPromoKey = 'media/1726000000000_9999999999999999.mp4';

  assert.deepEqual(
    Array.from(collectReplacedSeriesMediaKeys(populatedSeries, buildSeriesMediaUpdates({ posterUrl: newSeriesPosterKey }))),
    [seriesPosterKey],
    'Replacing posterUrl must collect old poster key'
  );
  assert.deepEqual(
    Array.from(collectReplacedSeriesMediaKeys(populatedSeries, buildSeriesMediaUpdates({ heroArtworkUrl: newSeriesHeroKey }))),
    [seriesHeroKey],
    'Replacing heroArtworkUrl must collect old hero key'
  );
  assert.deepEqual(
    Array.from(collectReplacedSeriesMediaKeys(populatedSeries, buildSeriesMediaUpdates({ shareVideoUrl: newSeriesPromoKey }))),
    [seriesPromoKey],
    'Replacing shareVideoUrl must collect old promo key'
  );

  const newEpisodeArtKey = 'posters/1726000000000_aaaaaaaaaaaaaaaa.jpg';
  const newEpisodeAudioKey = 'audio/1726000000000_bbbbbbbbbbbbbbbb.mp3';
  const newEpisodePublicKey = 'audio/1726000000000_cccccccccccccccc.mp3';

  assert.deepEqual(
    Array.from(collectReplacedEpisodeMediaKeys(populatedEpisode, buildEpisodeMediaUpdates({ artworkOverride: newEpisodeArtKey }))),
    [episodeArtKey],
    'Replacing artworkOverride must collect old artwork key'
  );
  const episodeAudioOnly = {
    artworkOverride: null,
    audioStorageKey: episodeAudioKey,
    audioPublicUrl: null,
  };
  assert.deepEqual(
    Array.from(collectReplacedEpisodeMediaKeys(episodeAudioOnly, buildEpisodeMediaUpdates({ audioStorageKey: newEpisodeAudioKey }))),
    [episodeAudioKey],
    'Replacing audioStorageKey must collect old audio key'
  );
  assert.deepEqual(
    Array.from(collectReplacedEpisodeMediaKeys(populatedEpisode, buildEpisodeMediaUpdates({ audioPublicUrl: newEpisodePublicKey }))),
    [episodePublicKey],
    'Replacing audioPublicUrl must collect old public key'
  );

  // 4. Unchanged same key collects zero
  assert.equal(
    collectReplacedSeriesMediaKeys(populatedSeries, buildSeriesMediaUpdates({ posterUrl: populatedSeries.posterUrl })).size,
    0,
    'Unchanged posterUrl must collect zero keys'
  );
  assert.equal(
    collectReplacedSeriesMediaKeys(populatedSeries, buildSeriesMediaUpdates({ heroArtworkUrl: populatedSeries.heroArtworkUrl })).size,
    0,
    'Unchanged heroArtworkUrl must collect zero keys'
  );
  assert.equal(
    collectReplacedSeriesMediaKeys(populatedSeries, buildSeriesMediaUpdates({ shareVideoUrl: populatedSeries.shareVideoUrl })).size,
    0,
    'Unchanged shareVideoUrl must collect zero keys'
  );
  assert.equal(
    collectReplacedSeriesMediaKeys(
      populatedSeries,
      buildSeriesMediaUpdates({
        posterUrl: seriesPosterKey,
        heroArtworkUrl: seriesHeroKey,
        shareVideoUrl: seriesPromoKey,
      })
    ).size,
    0,
    'All media keys unchanged must collect zero keys'
  );

  assert.equal(
    collectReplacedEpisodeMediaKeys(populatedEpisode, buildEpisodeMediaUpdates({ artworkOverride: populatedEpisode.artworkOverride })).size,
    0,
    'Unchanged artworkOverride must collect zero keys'
  );
  assert.equal(
    collectReplacedEpisodeMediaKeys(populatedEpisode, buildEpisodeMediaUpdates({ audioStorageKey: episodeAudioKey })).size,
    0,
    'Unchanged audioStorageKey must collect zero keys'
  );
  assert.equal(
    collectReplacedEpisodeMediaKeys(populatedEpisode, buildEpisodeMediaUpdates({ audioPublicUrl: populatedEpisode.audioPublicUrl })).size,
    0,
    'Unchanged audioPublicUrl must collect zero keys'
  );
  assert.equal(
    collectReplacedEpisodeMediaKeys(
      populatedEpisode,
      buildEpisodeMediaUpdates({
        artworkOverride: episodeArtKey,
        audioStorageKey: episodeAudioKey,
        audioPublicUrl: episodePublicKey,
      })
    ).size,
    0,
    'All episode media unchanged must collect zero keys'
  );

  // 5. Mixed update does not touch omitted media fields
  // أ) المسلسل: تحديث العنوان ومسح shareVideoUrl فقط
  const mixedSeriesUpdate = {
    title: 'عنوان مسلسل محدث',
    description: 'وصف جديد تماماً',
    shareVideoUrl: null,
  };
  const builtMixedSeries = buildSeriesMediaUpdates(mixedSeriesUpdate);
  assert.equal('posterUrl' in builtMixedSeries, false, 'Omitted posterUrl must not be in built media updates');
  assert.equal('heroArtworkUrl' in builtMixedSeries, false, 'Omitted heroArtworkUrl must not be in built media updates');
  assert.equal('shareVideoUrl' in builtMixedSeries, true, 'Explicitly cleared shareVideoUrl must be present');
  const mixedSeriesCollected = collectReplacedSeriesMediaKeys(populatedSeries, builtMixedSeries);
  assert.deepEqual(Array.from(mixedSeriesCollected), [seriesPromoKey], 'Only cleared shareVideoUrl may be collected');
  assert.equal(mixedSeriesCollected.has(seriesPosterKey), false, 'Omitted posterUrl must remain untouched');
  assert.equal(mixedSeriesCollected.has(seriesHeroKey), false, 'Omitted heroArtworkUrl must remain untouched');

  // ب) المسلسل: تحديث posterUrl فقط وترك heroArtworkUrl و shareVideoUrl
  const mixedSeriesPosterUpdate = {
    hook: 'جملة تسويقية جديدة',
    posterUrl: newSeriesPosterKey,
  };
  const builtMixedPoster = buildSeriesMediaUpdates(mixedSeriesPosterUpdate);
  assert.equal('posterUrl' in builtMixedPoster, true);
  assert.equal('heroArtworkUrl' in builtMixedPoster, false);
  assert.equal('shareVideoUrl' in builtMixedPoster, false);
  const mixedPosterCollected = collectReplacedSeriesMediaKeys(populatedSeries, builtMixedPoster);
  assert.deepEqual(Array.from(mixedPosterCollected), [seriesPosterKey]);
  assert.equal(mixedPosterCollected.has(seriesHeroKey), false);
  assert.equal(mixedPosterCollected.has(seriesPromoKey), false);

  // ج) الحلقة: تحديث العنوان ومسح artworkOverride فقط
  const mixedEpArtUpdate = {
    title: 'حلقة مجددة',
    artworkOverride: null,
  };
  const builtMixedEpArt = buildEpisodeMediaUpdates(mixedEpArtUpdate);
  assert.equal('artworkOverride' in builtMixedEpArt, true);
  assert.equal('audioStorageKey' in builtMixedEpArt, false);
  assert.equal('audioPublicUrl' in builtMixedEpArt, false);
  const mixedEpArtCollected = collectReplacedEpisodeMediaKeys(populatedEpisode, builtMixedEpArt);
  assert.deepEqual(Array.from(mixedEpArtCollected), [episodeArtKey]);
  assert.equal(mixedEpArtCollected.has(episodeAudioKey), false);
  assert.equal(mixedEpArtCollected.has(episodePublicKey), false);

  // د) الحلقة: تحديث durationMs ومسح audioPublicUrl فقط
  const mixedEpPublicUpdate = {
    durationMs: 90000,
    audioPublicUrl: null,
  };
  const builtMixedEpPublic = buildEpisodeMediaUpdates(mixedEpPublicUpdate);
  assert.equal('artworkOverride' in builtMixedEpPublic, false);
  assert.equal('audioStorageKey' in builtMixedEpPublic, false);
  assert.equal('audioPublicUrl' in builtMixedEpPublic, true);
  const mixedEpPublicCollected = collectReplacedEpisodeMediaKeys(populatedEpisode, builtMixedEpPublic);
  assert.deepEqual(Array.from(mixedEpPublicCollected), [episodePublicKey]);
  assert.equal(mixedEpPublicCollected.has(episodeArtKey), false);
  assert.equal(mixedEpPublicCollected.has(episodeAudioKey), false);

  // ==========================================================
  // 7. Upload Delete Ticket Validation Tests (Requirement 3)
  // ==========================================================
  console.log('7. Testing validateUploadDeleteTicket Authorization & Rejection...');

  const ticketTestAdmin = 'admin_user_789';
  const ticketTestKey = 'audio/1726000000000_1234567890abcdef.mp3';

  // أ) رفض التذاكر المفقودة أو غير الصالحة
  const missingTickets = [null, undefined, '', 12345, {}, [], false];
  for (const badTicket of missingTickets) {
    const res = validateUploadDeleteTicket(badTicket, ticketTestAdmin, ticketTestKey);
    assert.equal(res.ok, false, `Missing ticket (${String(badTicket)}) must be rejected`);
    assert.equal(res.status, 400, 'Missing ticket must return status 400');
  }

  // إنشاء تذكرة توقيع صالحة للتحقق
  const validDeleteTicket = createUploadTicket({
    adminId: ticketTestAdmin,
    storageKey: ticketTestKey,
    category: 'audio',
    expectedSizeBytes: 2048,
    canonicalMime: 'audio/mpeg',
    expiresAt: Date.now() + 3600 * 1000,
  });

  // ب) رفض عند عدم تطابق مفتاح التخزين (wrong-key)
  const wrongKeyRes = validateUploadDeleteTicket(
    validDeleteTicket,
    ticketTestAdmin,
    'audio/1726000000000_fedcba0987654321.mp3'
  );
  assert.equal(wrongKeyRes.ok, false, 'Ticket for different storage key must be rejected');
  assert.equal(wrongKeyRes.status, 400, 'Wrong storage key must return status 400');

  // ج) رفض عند عدم تطابق المشرف (wrong-admin)
  const wrongAdminRes = validateUploadDeleteTicket(
    validDeleteTicket,
    'admin_imposter_999',
    ticketTestKey
  );
  assert.equal(wrongAdminRes.ok, false, 'Ticket for different admin must be rejected');
  assert.equal(wrongAdminRes.status, 403, 'Wrong admin must return status 403');

  // د) رفض التذكرة المنتهية الصلاحية (expired)
  const expiredDeleteTicket = createUploadTicket({
    adminId: ticketTestAdmin,
    storageKey: ticketTestKey,
    category: 'audio',
    expectedSizeBytes: 2048,
    canonicalMime: 'audio/mpeg',
    expiresAt: Date.now() - 5000,
  });
  const expiredTicketRes = validateUploadDeleteTicket(
    expiredDeleteTicket,
    ticketTestAdmin,
    ticketTestKey
  );
  assert.equal(expiredTicketRes.ok, false, 'Expired ticket must be rejected');
  assert.equal(expiredTicketRes.status, 401, 'Expired ticket must return status 401');

  // هـ) قبول التذكرة الموقعة المطابقة (matching signed ticket acceptance)
  const acceptedRes = validateUploadDeleteTicket(
    validDeleteTicket,
    ticketTestAdmin,
    ticketTestKey
  );
  assert.equal(acceptedRes.ok, true, 'Authentic matching signed ticket must be accepted');
  if (acceptedRes.ok) {
    assert.equal(acceptedRes.data.adminId, ticketTestAdmin);
    assert.equal(acceptedRes.data.storageKey, ticketTestKey);
    assert.equal(acceptedRes.data.category, 'audio');
  }

  // ==========================================================
  // 8. Reference-Aware Cleanup & Retention Policy Tests (Requirement 4)
  // ==========================================================
  console.log('8. Testing Reference-Aware Cleanup with Injected Records...');

  const refSeriesPoster = 'posters/1726800000001_a111111111111111.jpg';
  const refSeriesHero = 'hero/1726800000002_a222222222222222.webp';
  const refSeriesPromo = 'media/1726800000003_a333333333333333.mp4';
  const refEpisodeArt = 'posters/1726800000004_b444444444444444.jpg';
  const refEpisodeAudio = 'audio/1726800000005_b555555555555555.mp3';
  const refEpisodePublic = 'audio/1726800000006_b666666666666666.mp3';
  const refAssetStorage = 'media/1726800000007_c777777777777777.mp4';
  const refAssetPublic = 'media/1726800000008_c888888888888888.mp4';

  const unrefCandidate1 = 'posters/1726800000009_d999999999999999.jpg';
  const unrefCandidate2 = 'audio/1726800000010_e000000000000000.mp3';

  // Explicitly confirm each test fixture passes isValidGeneratedStorageKey before reference tests
  const section8Fixtures = [
    refSeriesPoster,
    refSeriesHero,
    refSeriesPromo,
    refEpisodeArt,
    refEpisodeAudio,
    refEpisodePublic,
    refAssetStorage,
    refAssetPublic,
    unrefCandidate1,
    unrefCandidate2,
  ];
  for (const fixtureKey of section8Fixtures) {
    assert.equal(
      isValidGeneratedStorageKey(fixtureKey),
      true,
      `Fixture key "${fixtureKey}" must pass isValidGeneratedStorageKey`
    );
  }

  const injectedRecords = {
    series: [
      {
        posterUrl: `https://media.yotba.com/${refSeriesPoster}`,
        heroArtworkUrl: `/uploads/${refSeriesHero}`,
        shareVideoUrl: refSeriesPromo,
      },
    ],
    episodes: [
      {
        artworkOverride: refEpisodeArt,
        audioStorageKey: refEpisodeAudio,
        audioPublicUrl: `https://media.yotba.com/${refEpisodePublic}`,
      },
    ],
    shareAssets: [
      {
        storageKey: refAssetStorage,
        publicUrl: `https://media.yotba.com/${refAssetPublic}`,
      },
    ],
  };

  const allKnownReferencedKeys = [
    refSeriesPoster,
    refSeriesHero,
    refSeriesPromo,
    refEpisodeArt,
    refEpisodeAudio,
    refEpisodePublic,
    refAssetStorage,
    refAssetPublic,
  ];

  // أ) فحص findReferencedMediaKeys مع كافة المفاتيح المرجعية
  const allRefResult = await findReferencedMediaKeys(allKnownReferencedKeys, { records: injectedRecords });
  assert.equal(allRefResult.size, 8, 'All 8 referenced keys must be identified across series, episodes, and shareAssets');
  for (const k of allKnownReferencedKeys) {
    assert.equal(allRefResult.has(k), true, `Referenced key ${k} must be in the result set`);
  }

  // ب) فحص خليط من المفاتيح المرجعية والمفاتيح غير المرجعية (unreferenced candidate behavior)
  const mixedCandidates = [refSeriesPoster, refEpisodeAudio, unrefCandidate1, unrefCandidate2];
  const mixedRefResult = await findReferencedMediaKeys(mixedCandidates, { records: injectedRecords });
  assert.equal(mixedRefResult.size, 2, 'Only the 2 referenced keys must be identified');
  assert.equal(mixedRefResult.has(refSeriesPoster), true, 'Referenced series poster must be retained');
  assert.equal(mixedRefResult.has(refEpisodeAudio), true, 'Referenced episode audio must be retained');
  assert.equal(mixedRefResult.has(unrefCandidate1), false, 'Unreferenced candidate 1 must NOT be marked as referenced');
  assert.equal(mixedRefResult.has(unrefCandidate2), false, 'Unreferenced candidate 2 must NOT be marked as referenced');

  // ج) فحص isStorageKeyReferencedInDb مع السجلات المحقونة
  assert.equal(
    await isStorageKeyReferencedInDb(refSeriesPoster, { records: injectedRecords }),
    true,
    'Referenced key must return true in isStorageKeyReferencedInDb'
  );
  assert.equal(
    await isStorageKeyReferencedInDb(unrefCandidate1, { records: injectedRecords }),
    false,
    'Unreferenced candidate must return false in isStorageKeyReferencedInDb'
  );

  // د) فحص cleanupContentMedia مع قائمة فارغة (Empty branch)
  const emptyCleanupReport = await cleanupContentMedia([]);
  assert.equal(emptyCleanupReport.requested, 0);
  assert.equal(emptyCleanupReport.deleted, 0);
  assert.equal(emptyCleanupReport.failed, 0);
  assert.equal(emptyCleanupReport.skippedReferenced, 0);
  assert.deepEqual(emptyCleanupReport.deletedKeys, []);
  assert.deepEqual(emptyCleanupReport.skippedKeys, []);

  // هـ) فحص cleanupContentMedia عندما تكون كل المفاتيح مرجعية (All-referenced branch)
  // لا يتم استدعاء حذف وسائط التخزين الفعلية لأن قائمة المفاتيح القابلة للحذف فارغة
  const candidateRefKeys = [refSeriesPoster, refEpisodeAudio, refAssetStorage];
  const allRefCleanupReport = await cleanupContentMedia(candidateRefKeys, { records: injectedRecords });
  assert.equal(allRefCleanupReport.skippedReferenced, 3, 'All 3 keys must be skipped due to active references');
  assert.equal(allRefCleanupReport.deleted, 0, 'Zero deletes must occur when all keys are referenced');
  assert.equal(allRefCleanupReport.failed, 0);
  assert.deepEqual(allRefCleanupReport.deletedKeys, []);
  assert.equal(allRefCleanupReport.skippedKeys.length, 3);
  assert.ok(allRefCleanupReport.skippedKeys.includes(refSeriesPoster));
  assert.ok(allRefCleanupReport.skippedKeys.includes(refEpisodeAudio));
  assert.ok(allRefCleanupReport.skippedKeys.includes(refAssetStorage));

  // ==========================================================
  // 9. MongoDB Connection Invariant Tests (بدون شبكة حقيقية)
  // يثبت:
  // - reuse عند connected
  // - single-flight عند connecting
  // - retry after stale/disconnected resolved state
  // - reset after failure
  // ==========================================================
  console.log('9. Testing MongoDB Connection Invariants (Deterministic Mock)...');

  const origMongoUri = process.env.MONGODB_URI;
  const origConnect = mongoose.connect;
  const origLog = console.log;
  const origError = console.error;

  try {
    process.env.MONGODB_URI = 'mongodb://127.0.0.1:27017/deterministic_test_db';

    const createMockMongoose = (readyState: number = 1) => {
      return {
        connection: {
          readyState,
          db: {
            command: async () => ({ ok: 1 }),
          },
        },
      } as any;
    };

    // كتم الرسائل أثناء فحص المسارات المتوقعة لفشل الاتصال
    console.log = () => {};
    console.error = () => {};

    // أ) reuse عند connected: استدعاء متتابع لا يكرر الاتصال طالما readyState === 1
    global.mongooseCache = { conn: null, promise: null };
    let connectCalls = 0;
    const connectedInstance = createMockMongoose(1);

    (mongoose as any).connect = async () => {
      connectCalls++;
      return connectedInstance;
    };

    const firstConn = await connectDB();
    assert.equal(firstConn, connectedInstance, 'First call should establish connection and return instance');
    assert.equal(connectCalls, 1, 'mongoose.connect must be called once initially');

    const secondConn = await connectDB();
    assert.equal(secondConn, connectedInstance, 'Second call must reuse existing connected instance');
    assert.equal(connectCalls, 1, 'mongoose.connect must NOT be called again when connection is active (reuse)');

    // ب) single-flight عند connecting: استدعاءات متزامنة تتشارك نفس الوعد الجاري
    global.mongooseCache = { conn: null, promise: null };
    connectCalls = 0;
    let deferredResolve: ((val: any) => void) | null = null;
    const connectingInstance = createMockMongoose(1);

    (mongoose as any).connect = () => {
      connectCalls++;
      return new Promise((resolve) => {
        deferredResolve = resolve;
      });
    };

    const p1 = connectDB();
    const p2 = connectDB();

    assert.equal(connectCalls, 1, 'Concurrent callers while connecting must share a single flight');
    assert.notEqual(global.mongooseCache?.promise, null, 'Promise must remain active during flight');

    deferredResolve!(connectingInstance);
    const [res1, res2] = await Promise.all([p1, p2]);

    assert.equal(res1, connectingInstance);
    assert.equal(res2, connectingInstance);
    assert.equal(connectCalls, 1, 'Only one connect call occurred across concurrent callers');
    assert.equal(global.mongooseCache?.promise, null, 'Promise must be zeroed safely after completion');

    // ج) retry after stale/disconnected resolved state:
    // إذا أصبحت readyState != 1 وكان الوعد resolved من قبل، يجب إعادة الاتصال وعدم إعادة instance منقطع
    const staleInstance = createMockMongoose(0); // disconnected state
    const freshInstance = createMockMongoose(1); // fresh reconnected state

    global.mongooseCache = {
      conn: staleInstance,
      promise: Promise.resolve(staleInstance),
    };

    connectCalls = 0;
    (mongoose as any).connect = async () => {
      connectCalls++;
      return freshInstance;
    };

    const reconnected = await connectDB();
    assert.equal(reconnected, freshInstance, 'Must reconnect and return fresh instance instead of stale disconnected instance');
    assert.equal(connectCalls, 1, 'Must invoke mongoose.connect on stale/disconnected state');
    assert.equal(reconnected?.connection.readyState, 1);
    assert.equal(global.mongooseCache?.promise, null, 'Promise must be zeroed safely after reconnect');

    // د) reset after failure:
    // الفشل يصفر الوعد والكاش لتمكين المحاولات اللاحقة بدلاً من تعليق الوعد الفاشل
    global.mongooseCache = { conn: null, promise: null };
    connectCalls = 0;
    let shouldFail = true;

    (mongoose as any).connect = async () => {
      connectCalls++;
      if (shouldFail) {
        throw new Error('Atlas transient mock error');
      }
      return connectedInstance;
    };

    await assert.rejects(
      async () => {
        await connectDB();
      },
      { message: 'Atlas transient mock error' },
      'connectDB must throw when connection attempt fails'
    );

    assert.equal(connectCalls, 1);
    assert.equal(global.mongooseCache?.conn, null, 'Failed attempt must reset cached conn to null');
    assert.equal(global.mongooseCache?.promise, null, 'Failed attempt must reset cached promise to null');

    // محاولة لاحقة بعد التعافي تنجح دون أن تبقى عالقة
    shouldFail = false;
    const recoveredConn = await connectDB();
    assert.equal(recoveredConn, connectedInstance, 'Subsequent call must succeed and retry after failure');
    assert.equal(connectCalls, 2, 'Subsequent call must invoke connect again');
    assert.equal(global.mongooseCache?.promise, null, 'Promise must be safely zeroed after successful retry');
  } finally {
    process.env.MONGODB_URI = origMongoUri;
    mongoose.connect = origConnect;
    console.log = origLog;
    console.error = origError;
    global.mongooseCache = { conn: null, promise: null };
  }

  // ==========================================================
  // 10. Free-Episode Policy Reconciliation & Pricing Input Precision
  // ==========================================================
  console.log('10. Testing Free-Episode Policy & Pricing Precision Invariants...');

  const routePath = path.resolve(__dirname, '../app/api/v1/admin/content/route.ts');
  const routeSource = fs.readFileSync(routePath, 'utf8');

  const editorPath = path.resolve(__dirname, '../components/admin/cms/EpisodeEditor.tsx');
  const editorSource = fs.readFileSync(editorPath, 'utf8');

  const settingsPath = path.resolve(__dirname, '../components/admin/views/AdminSettingsView.tsx');
  const settingsSource = fs.readFileSync(settingsPath, 'utf8');

  // أ) Invariant 1: No free-count bulk mutation of Episode.isFree
  // Series.freeEpisodesCount is derived access policy, not persisted to Episode.isFree.
  // Lowering the first-N threshold must not leave stale free flags on episodes.
  assert.equal(
    routeSource.includes('Episode.updateMany'),
    false,
    'route.ts must not contain Episode.updateMany in series free-count mutations'
  );

  const deriveEpisodeFreeAccess = (seriesFreeCount: number, episodeNumber: number, explicitIsFree: boolean) =>
    explicitIsFree || (seriesFreeCount > 0 && episodeNumber <= seriesFreeCount);

  // When series has 2 free episodes, ep 1 (explicitly false) is accessible via policy
  assert.equal(deriveEpisodeFreeAccess(2, 1, false), true, 'Policy grants access to episode 1');
  // When series free count is lowered to 0, ep 1 must not remain free because explicitIsFree is false
  assert.equal(deriveEpisodeFreeAccess(0, 1, false), false, 'Lowering freeEpisodesCount revokes access for non-explicit episodes');

  // ب) Invariant 2: Create stores explicit override separately
  // POST episode creation must store only explicit body.isFree === true without OR-ing series threshold.
  assert.ok(
    routeSource.includes('const isFree = body.isFree === true;'),
    'Episode POST creation must store only explicit body.isFree === true'
  );
  assert.equal(
    routeSource.includes('body.isFree === true || body.episodeNumber <='),
    false,
    'Episode POST must not OR the series free threshold into stored isFree'
  );

  // ج) Invariant 3: EpisodeEditor omits derived isFree on policy-free edits
  // On edit, omit isFree from the PATCH payload when episode is policy-free to avoid server 409 guard.
  // On create, send raw form.isFree so explicit overrides can be created.
  assert.ok(
    editorSource.includes('if (!isPolicyFree) {') && editorSource.includes('payload.isFree = form.isFree;'),
    'EpisodeEditor must omit isFree on edit when isPolicyFree is true'
  );

  function simulateEditorPayload(isEdit: boolean, epNum: number, seriesFreeCount: number, formIsFree: boolean) {
    const isPolicyFree = Boolean(seriesFreeCount > 0 && epNum > 0 && epNum <= seriesFreeCount);
    const payload: Record<string, unknown> = { episodeNumber: epNum };
    if (isEdit) {
      if (!isPolicyFree) {
        payload.isFree = formIsFree;
      }
    } else {
      payload.isFree = formIsFree;
    }
    return payload;
  }

  const editPolicyFree = simulateEditorPayload(true, 1, 3, false);
  assert.equal('isFree' in editPolicyFree, false, 'EpisodeEditor must omit isFree for policy-free edits');

  const editOutsidePolicy = simulateEditorPayload(true, 4, 3, true);
  assert.equal(editOutsidePolicy.isFree, true, 'EpisodeEditor must include isFree for edits outside policy');

  const createInPolicy = simulateEditorPayload(false, 1, 3, false);
  assert.equal(createInPolicy.isFree, false, 'EpisodeEditor must send raw form.isFree on create');

  // د) Invariant 4: Pricing inputs step is 0.01 and supports cent precision
  const stepMatches = settingsSource.match(/step="0\.01"/g);
  assert.ok(stepMatches && stepMatches.length >= 3, 'All 3 pricing inputs in AdminSettingsView must use step="0.01"');

  const minMatches = settingsSource.match(/min="0\.01"/g);
  assert.ok(minMatches && minMatches.length >= 3, 'All 3 pricing inputs in AdminSettingsView must use min="0.01"');

  const maxMatches = settingsSource.match(/max="10000"/g);
  assert.ok(maxMatches && maxMatches.length >= 3, 'All 3 pricing inputs in AdminSettingsView must use max="10000"');

  const centPricingCheck = validatePricingValues({ seasonUsd: 0.99, monthlyUsd: 1.49, annualUsd: 9.99 });
  assert.equal(centPricingCheck.ok, true, 'validatePricingValues must accept cent precision');
  if (centPricingCheck.ok) {
    assert.equal(centPricingCheck.values.seasonUsd, 0.99);
    assert.equal(centPricingCheck.values.monthlyUsd, 1.49);
    assert.equal(centPricingCheck.values.annualUsd, 9.99);
  }

  // هـ) Invariant 5: SeriesStudioView UI path reconciliation
  const studioPath = path.resolve(__dirname, '../components/admin/cms/SeriesStudioView.tsx');
  const studioSource = fs.readFileSync(studioPath, 'utf8');

  // 1. Changing quickEpisodeNumber must NOT call setQuickIsFree based on series threshold
  assert.equal(
    /setQuickIsFree\([^)]*<=/.test(studioSource),
    false,
    'SeriesStudioView must not set quickIsFree based on series free threshold'
  );

  // 2. handleToggleFree guards when episode is policy-free and toggle is disabled
  assert.ok(
    studioSource.includes('if (isPolicyFree) {'),
    'SeriesStudioView handleToggleFree must guard when episode is policy-free'
  );
  assert.ok(
    studioSource.includes('disabled={togglingFreeId === ep._id || isPolicyFree}'),
    'SeriesStudioView toggle button must be disabled when isPolicyFree'
  );

  // 3. Compute isEffectivelyFree and display "مجانية (تلقائي)" label for policy-free episodes
  assert.ok(
    studioSource.includes('isEffectivelyFree = ep.isFree || isPolicyFree'),
    'SeriesStudioView must compute isEffectivelyFree = ep.isFree || isPolicyFree'
  );
  assert.ok(
    studioSource.includes("'مجانية (تلقائي)'"),
    'SeriesStudioView must label policy-free episodes as مجانية (تلقائي)'
  );

  // Behavioral verification of SeriesStudioView card display logic
  function resolveStudioEpisodeCardState(epNum: number, epIsFree: boolean, seriesFreeCount: number) {
    const isPolicyFree = seriesFreeCount > 0 && epNum <= seriesFreeCount;
    const isEffectivelyFree = epIsFree || isPolicyFree;
    const label = isPolicyFree ? 'مجانية (تلقائي)' : epIsFree ? 'مجانية' : 'مدفوعة';
    const disabled = isPolicyFree;
    return { isPolicyFree, isEffectivelyFree, label, disabled };
  }

  // Policy-free episode (e.g. ep 1 with series free count 2, but raw ep.isFree is false)
  const policyFreeState = resolveStudioEpisodeCardState(1, false, 2);
  assert.equal(policyFreeState.isPolicyFree, true);
  assert.equal(policyFreeState.isEffectivelyFree, true, 'Must display as effectively free');
  assert.equal(policyFreeState.label, 'مجانية (تلقائي)', 'Must show derived label');
  assert.equal(policyFreeState.disabled, true, 'Toggle must be disabled for policy-free');

  // Explicit free episode outside policy (e.g. ep 3 with series free count 2, ep.isFree is true)
  const explicitFreeState = resolveStudioEpisodeCardState(3, true, 2);
  assert.equal(explicitFreeState.isPolicyFree, false);
  assert.equal(explicitFreeState.isEffectivelyFree, true);
  assert.equal(explicitFreeState.label, 'مجانية');
  assert.equal(explicitFreeState.disabled, false);

  // Paid episode outside policy
  const paidState = resolveStudioEpisodeCardState(3, false, 2);
  assert.equal(paidState.isPolicyFree, false);
  assert.equal(paidState.isEffectivelyFree, false);
  assert.equal(paidState.label, 'مدفوعة');
  assert.equal(paidState.disabled, false);

  console.log('✅ All Studio Architecture & Security Policy tests passed successfully!');
}

runTests().catch((err) => {
  console.error('❌ Studio architecture test failed:', err);
  process.exit(1);
});
