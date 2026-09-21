import { NextResponse } from 'next/server';
import { AdminUser } from '@/lib/db/models';
import { connectDB } from '@/lib/db/connect';
import { setAuthCookie, signSessionToken, verifyPassword } from '@/lib/auth';
import { normalizeEnv } from '@/lib/config/runtime';

/**
 * ترويسات منع التخزين المؤقت للاستجابات الحساسة
 */
const NO_STORE_HEADERS = {
  'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
  Pragma: 'no-cache',
  Expires: '0',
} as const;

// معايير حماية مسار تسجيل دخول الإدارة ومحددات المعدل (Rate Limiting)
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000; // نافذة زمنية: 15 دقيقة
const MAX_ATTEMPTS_PER_ACCOUNT = 5; // أقصى محاولات لكل (IP + بريد مطبع)
const MAX_ATTEMPTS_PER_IP = 25; // أقصى محاولات لكل عنوان IP عموماً
const MAX_STORE_ENTRIES = 2000; // حد أقصى لحجم الذاكرة لمنع تسريب الذاكرة في serverless
const CLEANUP_INTERVAL_MS = 60 * 1000; // دورة تنظيف دوري للبيانات المنتهية كل 60 ثانية

// حدود أطوال المدخلات لتفادي هجمات تجاوز السعة وحقن الحزم الضخمة
const MAX_EMAIL_LENGTH = 254; // الحد الأقصى القياسي لطول البريد الإلكتروني (RFC 5321)
const MAX_PASSWORD_LENGTH = 256; // حد أقصى معقول لطول كلمة المرور
const MAX_BODY_BYTES = 64 * 1024; // حد أقصى لجسم الطلب (64 كيلوبايت)

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const rateLimitStore = new Map<string, RateLimitEntry>();
let lastCleanupTime = Date.now();

/**
 * تنظيف دوري للذاكرة مع إخلاء FIFO عند بلوغ الحد الأقصى لتناسب بيئات serverless / Node
 */
function cleanupExpiredStore(now: number) {
  if (now - lastCleanupTime < CLEANUP_INTERVAL_MS && rateLimitStore.size < MAX_STORE_ENTRIES) {
    return;
  }
  lastCleanupTime = now;

  for (const [key, entry] of rateLimitStore.entries()) {
    if (now >= entry.resetAt) {
      rateLimitStore.delete(key);
    }
  }

  // إذا تجاوزت الذاكرة الحد الأقصى حتى بعد تنظيف المنتهي، نحذف أقدم العناصر (FIFO)
  if (rateLimitStore.size >= MAX_STORE_ENTRIES) {
    const targetSize = Math.floor(MAX_STORE_ENTRIES * 0.75);
    for (const key of rateLimitStore.keys()) {
      rateLimitStore.delete(key);
      if (rateLimitStore.size <= targetSize) {
        break;
      }
    }
  }
}

/**
 * استخراج عنوان IP الحقيقي للعميل بدون الاعتماد على جلسات أو كوكيز مسبقة
 */
function getClientIp(request: Request): string {
  const forwardedFor = request.headers.get('x-forwarded-for');
  if (forwardedFor) {
    const firstIp = forwardedFor.split(',')[0]?.trim();
    if (firstIp) return firstIp;
  }

  const realIp = request.headers.get('x-real-ip')?.trim();
  if (realIp) return realIp;

  const cfConnectingIp = request.headers.get('cf-connecting-ip')?.trim();
  if (cfConnectingIp) return cfConnectingIp;

  return '127.0.0.1';
}

/**
 * فحص ما إذا كان العنوان أو الحساب قد تجاوز حد المحاولات المسموح به
 */
function checkRateLimit(
  clientIp: string,
  normalizedEmail?: string,
  now: number = Date.now()
): { limited: boolean; retryAfter: number } {
  cleanupExpiredStore(now);

  // 1. حد العنوان العام (IP)
  const ipKey = `ip:${clientIp}`;
  const ipEntry = rateLimitStore.get(ipKey);
  if (ipEntry && now < ipEntry.resetAt && ipEntry.count >= MAX_ATTEMPTS_PER_IP) {
    const retryAfter = Math.max(1, Math.ceil((ipEntry.resetAt - now) / 1000));
    return { limited: true, retryAfter };
  }

  // 2. حد الحساب المشترك (IP + البريد المطبع)
  if (normalizedEmail) {
    const accountKey = `acc:${clientIp}:${normalizedEmail}`;
    const accountEntry = rateLimitStore.get(accountKey);
    if (accountEntry && now < accountEntry.resetAt && accountEntry.count >= MAX_ATTEMPTS_PER_ACCOUNT) {
      const retryAfter = Math.max(1, Math.ceil((accountEntry.resetAt - now) / 1000));
      return { limited: true, retryAfter };
    }
  }

  return { limited: false, retryAfter: 0 };
}

/**
 * تسجيل محاولة دخول للعنوان والحساب
 */
function recordAttempt(
  clientIp: string,
  normalizedEmail: string,
  now: number = Date.now()
) {
  cleanupExpiredStore(now);

  const ipKey = `ip:${clientIp}`;
  const accountKey = `acc:${clientIp}:${normalizedEmail}`;

  const ipEntry = rateLimitStore.get(ipKey);
  if (!ipEntry || now >= ipEntry.resetAt) {
    rateLimitStore.set(ipKey, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
  } else {
    ipEntry.count += 1;
  }

  const accountEntry = rateLimitStore.get(accountKey);
  if (!accountEntry || now >= accountEntry.resetAt) {
    rateLimitStore.set(accountKey, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
  } else {
    accountEntry.count += 1;
  }
}

/**
 * تصفير العداد عند نجاح الدخول بشكل آمن
 */
function clearRateLimitOnSuccess(clientIp: string, normalizedEmail: string) {
  const ipKey = `ip:${clientIp}`;
  const accountKey = `acc:${clientIp}:${normalizedEmail}`;

  const accountEntry = rateLimitStore.get(accountKey);
  const accountAttempts = accountEntry ? accountEntry.count : 1;

  // تصفير عداد هذا الحساب بالكامل فور النجاح
  rateLimitStore.delete(accountKey);

  // خصم محاولات هذا الحساب من عداد IP العام إن وجد، وحذفه إذا انتهت المحاولات
  const ipEntry = rateLimitStore.get(ipKey);
  if (ipEntry) {
    ipEntry.count = Math.max(0, ipEntry.count - accountAttempts);
    if (ipEntry.count === 0) {
      rateLimitStore.delete(ipKey);
    }
  }
}

/**
 * إلغاء احتساب المحاولة في حال فشل الاتصال بقاعدة البيانات أو وقوع خطأ خادم داخلي
 */
function rollbackAttempt(clientIp: string, normalizedEmail: string) {
  const ipKey = `ip:${clientIp}`;
  const accountKey = `acc:${clientIp}:${normalizedEmail}`;

  const accountEntry = rateLimitStore.get(accountKey);
  if (accountEntry) {
    accountEntry.count = Math.max(0, accountEntry.count - 1);
    if (accountEntry.count === 0) {
      rateLimitStore.delete(accountKey);
    }
  }

  const ipEntry = rateLimitStore.get(ipKey);
  if (ipEntry) {
    ipEntry.count = Math.max(0, ipEntry.count - 1);
    if (ipEntry.count === 0) {
      rateLimitStore.delete(ipKey);
    }
  }
}

export async function POST(request: Request) {
  const clientIp = getClientIp(request);

  // 1. فحص مبدئي سريع لعنوان IP قبل معالجة أي محتوى
  const ipLimitCheck = checkRateLimit(clientIp);
  if (ipLimitCheck.limited) {
    return NextResponse.json(
      { error: 'تم تجاوز عدد المحاولات المسموح بها. يُرجى المحاولة لاحقاً.' },
      {
        status: 429,
        headers: {
          ...NO_STORE_HEADERS,
          'Retry-After': String(ipLimitCheck.retryAfter),
        },
      }
    );
  }

  // 2. التحقق من حجم الطلب
  const contentLength = Number(request.headers.get('content-length') || '0');
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
    return NextResponse.json(
      { error: 'حجم الطلب يتجاوز الحد المسموح به' },
      { status: 413, headers: NO_STORE_HEADERS }
    );
  }

  // 3. قراءة والتحقق من صحة جسم طلب JSON
  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json(
      { error: 'صيغة بيانات JSON غير صالحة' },
      { status: 400, headers: NO_STORE_HEADERS }
    );
  }

  if (!rawBody || typeof rawBody !== 'object' || Array.isArray(rawBody)) {
    return NextResponse.json(
      { error: 'بيانات الطلب يجب أن تكون كائناً صالحاً' },
      { status: 400, headers: NO_STORE_HEADERS }
    );
  }

  const { email, password } = rawBody as Record<string, unknown>;

  if (typeof email !== 'string' || typeof password !== 'string') {
    return NextResponse.json(
      { error: 'أدخل البريد الإلكتروني وكلمة المرور' },
      { status: 400, headers: NO_STORE_HEADERS }
    );
  }

  const normalizedEmail = email.toLowerCase().trim();

  if (!normalizedEmail || !password) {
    return NextResponse.json(
      { error: 'أدخل البريد الإلكتروني وكلمة المرور' },
      { status: 400, headers: NO_STORE_HEADERS }
    );
  }

  if (normalizedEmail.length > MAX_EMAIL_LENGTH || password.length > MAX_PASSWORD_LENGTH) {
    return NextResponse.json(
      { error: 'البيانات المدخلة تتجاوز الحد المسموح به' },
      { status: 400, headers: NO_STORE_HEADERS }
    );
  }

  // 4. فحص محدد المعدل للحساب المشترك (IP + البريد المطبع)
  const accountLimitCheck = checkRateLimit(clientIp, normalizedEmail);
  if (accountLimitCheck.limited) {
    return NextResponse.json(
      { error: 'تم تجاوز عدد المحاولات المسموح بها. يُرجى المحاولة لاحقاً.' },
      {
        status: 429,
        headers: {
          ...NO_STORE_HEADERS,
          'Retry-After': String(accountLimitCheck.retryAfter),
        },
      }
    );
  }

  // 5. تسجيل احتساب المحاولة
  recordAttempt(clientIp, normalizedEmail);

  // 6. التحقق من المصادقة والمشرف
  try {
    const conn = await connectDB();
    if (!conn) {
      rollbackAttempt(clientIp, normalizedEmail);
      return NextResponse.json(
        { error: 'تسجيل دخول الإدارة غير متاح حالياً' },
        { status: 503, headers: NO_STORE_HEADERS }
      );
    }

    let admin = await AdminUser.findOne({ email: normalizedEmail });

    // مزامنة أو تهيئة المشرف الأولي حصرياً من متغيرات البيئة الآمنة (بدون أي قيم افتراضية في الكود)
    const envAdminEmail = normalizeEnv(process.env.INITIAL_ADMIN_EMAIL)?.toLowerCase();
    const envAdminPassword = normalizeEnv(process.env.INITIAL_ADMIN_PASSWORD);
    const isEnvAdminMatch =
      Boolean(envAdminEmail && envAdminPassword) &&
      normalizedEmail === envAdminEmail &&
      password === envAdminPassword;

    if (!admin && isEnvAdminMatch) {
      const { hashPassword } = await import('@/lib/auth');
      const passwordHash = await hashPassword(password);
      admin = await AdminUser.create({
        email: envAdminEmail,
        passwordHash,
        displayName: 'مشرف يُتبع الأول',
        role: 'SUPER_ADMIN',
        status: 'ACTIVE',
      });
    } else if (!admin || !(await verifyPassword(password, admin.passwordHash))) {
      return NextResponse.json(
        { error: 'بيانات الدخول غير صحيحة' },
        { status: 401, headers: NO_STORE_HEADERS }
      );
    }

    if (admin.status !== 'ACTIVE') {
      return NextResponse.json(
        { error: 'حساب الإدارة غير نشط' },
        { status: 403, headers: NO_STORE_HEADERS }
      );
    }

    await AdminUser.updateOne({ _id: admin._id }, { $set: { lastLoginAt: new Date() } });
    const token = signSessionToken({
      userId: admin._id.toString(),
      email: admin.email,
      displayName: admin.displayName,
      role: admin.role,
      isAdmin: true,
      sessionVersion: admin.sessionVersion ?? 0,
    });
    await setAuthCookie(token, true);

    // تصفير عداد المحاولات عند تسجيل الدخول الناجح
    clearRateLimitOnSuccess(clientIp, normalizedEmail);

    return NextResponse.json({ success: true }, { headers: NO_STORE_HEADERS });
  } catch (error) {
    rollbackAttempt(clientIp, normalizedEmail);
    console.error('Admin login error:', error);
    return NextResponse.json(
      { error: 'تعذر تسجيل دخول الإدارة' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
