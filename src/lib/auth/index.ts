import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { cookies } from 'next/headers';
import { User, AdminUser } from '@/lib/db/models';
import { connectDB } from '@/lib/db/connect';
import { isDemoMode, isProductionRuntime, normalizeEnv } from '@/lib/config/runtime';

const JWT_SECRET = normalizeEnv(process.env.JWT_SECRET);

if (isProductionRuntime() && !JWT_SECRET) {
  throw new Error('JWT_SECRET must be configured in production');
}

const resolvedJwtSecret = JWT_SECRET || 'development-only-secret-do-not-use-in-production';
export const AUTH_COOKIE_NAME = 'yotba_session';
export const ADMIN_AUTH_COOKIE_NAME = 'yotba_admin_session';

export interface TokenPayload {
  userId: string;
  email: string;
  displayName: string;
  role: 'USER' | 'SUPER_ADMIN' | 'ADMIN' | 'CONTENT_EDITOR' | 'MODERATOR' | 'ANALYTICS_VIEWER';
  isAdmin?: boolean;
}

/**
 * تشفير آمن لكلمات المرور (Cost Factor = 12)
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = await bcrypt.genSalt(12);
  return bcrypt.hash(password, salt);
}

/**
 * التحقق من مطابقة كلمة المرور
 */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

/**
 * توليد رمز عشوائي مشفر للبريد وإعادة التعيين
 */
export function generateSecureToken(): { token: string; hashedToken: string } {
  const token = crypto.randomBytes(32).toString('hex');
  const hashedToken = crypto.createHash('sha256').update(token).digest('hex');
  return { token, hashedToken };
}

/**
 * إنشاء توكن الجلسة المشفر (JWT)
 */
export function signSessionToken(payload: TokenPayload, expiresIn: string | number = '7d'): string {
  return jwt.sign(payload, resolvedJwtSecret, { expiresIn: expiresIn as any });
}

/**
 * التحقق من توكن الجلسة
 */
export function verifySessionToken(token: string): TokenPayload | null {
  try {
    return jwt.verify(token, resolvedJwtSecret) as TokenPayload;
  } catch {
    return null;
  }
}

/**
 * ضبط ملف تعريف الارتباط الآمن للجلسة (Secure HttpOnly Cookie)
 */
export async function setAuthCookie(token: string, isAdmin: boolean = false) {
  const cookieStore = await cookies();
  const cookieName = isAdmin ? ADMIN_AUTH_COOKIE_NAME : AUTH_COOKIE_NAME;
  const isProduction = process.env.NODE_ENV === 'production';

  cookieStore.set(cookieName, token, {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    path: '/',
    maxAge: 7 * 24 * 60 * 60, // 7 days
  });
}

/**
 * إزالة كوكي الجلسة عند تسجيل الخروج (Session Revocation)
 */
export async function clearAuthCookie(isAdmin: boolean = false) {
  const cookieStore = await cookies();
  const cookieName = isAdmin ? ADMIN_AUTH_COOKIE_NAME : AUTH_COOKIE_NAME;
  cookieStore.delete(cookieName);
}

/**
 * استخراج المستخدم الحالي من الكوكي الآمن في الخادم (Server-side Session Retrieval)
 */
export async function getCurrentUser(): Promise<TokenPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(AUTH_COOKIE_NAME)?.value;
  if (!token) return null;
  const payload = verifySessionToken(token);
  if (!payload || payload.isAdmin) return null;

  // إعادة فحص حالة الحساب تمنع استمرار جلسة مستخدم بعد تعليقه أو حظره.
  try {
    const conn = await connectDB();
    if (!conn) return isDemoMode() ? payload : null;
    const user = await User.findById(payload.userId).select('status email displayName role');
    if (!user || user.status === 'BANNED' || user.status === 'SUSPENDED') return null;
    return {
      ...payload,
      email: user.email,
      displayName: user.displayName,
      role: user.role,
    };
  } catch {
    return isDemoMode() ? payload : null;
  }
}

/**
 * استخراج المشرف الحالي من الكوكي الآمن مع التحقق من الصلاحيات
 */
export async function getCurrentAdmin(): Promise<TokenPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(ADMIN_AUTH_COOKIE_NAME)?.value;
  if (!token) return null;
  
  const payload = verifySessionToken(token);
  if (!payload || !payload.isAdmin) return null;
  try {
    const conn = await connectDB();
    if (!conn) return isDemoMode() ? payload : null;
    const admin = await AdminUser.findById(payload.userId).select('status email displayName role');
    if (!admin || admin.status !== 'ACTIVE') return null;
    return { ...payload, email: admin.email, displayName: admin.displayName, role: admin.role };
  } catch {
    return isDemoMode() ? payload : null;
  }
}

/**
 * التحقق من الهجمات الغاشمة وقفل الحساب المؤقت (Brute-Force Guard)
 */
export async function checkBruteForceAndLock(user: any): Promise<{ isLocked: boolean; remainingMinutes?: number }> {
  if (user.lockUntil && user.lockUntil > new Date()) {
    const diff = Math.ceil((user.lockUntil.getTime() - Date.now()) / 60000);
    return { isLocked: true, remainingMinutes: diff };
  }
  return { isLocked: false };
}

export async function handleFailedLogin(userId: string) {
  await connectDB();
  const user = await User.findById(userId);
  if (!user) return;

  const attempts = (user.failedLoginAttempts || 0) + 1;
  const updateData: any = { failedLoginAttempts: attempts };

  // بعد 5 محاولات خاطئة متتالية يتم قفل الحساب لمدة 15 دقيقة
  if (attempts >= 5) {
    updateData.lockUntil = new Date(Date.now() + 15 * 60 * 1000);
  }

  await User.findByIdAndUpdate(userId, updateData);
}

export async function resetFailedLoginAttempts(userId: string) {
  await connectDB();
  await User.findByIdAndUpdate(userId, {
    failedLoginAttempts: 0,
    lockUntil: null,
  });
}
