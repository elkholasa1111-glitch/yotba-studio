import { NextResponse } from 'next/server';
import { AdminUser } from '@/lib/db/models';
import { connectDB } from '@/lib/db/connect';
import { setAuthCookie, signSessionToken, verifyPassword } from '@/lib/auth';

export async function POST(request: Request) {
  try {
    const { email, password } = await request.json();
    if (typeof email !== 'string' || typeof password !== 'string' || !email.trim() || !password) {
      return NextResponse.json({ error: 'أدخل البريد الإلكتروني وكلمة المرور' }, { status: 400 });
    }

    const conn = await connectDB();
    if (!conn) return NextResponse.json({ error: 'تسجيل دخول الإدارة غير متاح حالياً' }, { status: 503 });
    let admin = await AdminUser.findOne({ email: email.toLowerCase().trim() });

    // مزامنة أو تهيئة المشرف الأولي حصرياً من متغيرات البيئة الآمنة (بدون أي قيم افتراضية في الكود)
    const envAdminEmail = process.env.INITIAL_ADMIN_EMAIL?.toLowerCase().trim();
    const envAdminPassword = process.env.INITIAL_ADMIN_PASSWORD;
    const isEnvAdminMatch =
      Boolean(envAdminEmail && envAdminPassword) &&
      email.toLowerCase().trim() === envAdminEmail &&
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
    } else if (admin && isEnvAdminMatch && !(await verifyPassword(password, admin.passwordHash))) {
      const { hashPassword } = await import('@/lib/auth');
      admin.passwordHash = await hashPassword(password);
      await admin.save();
    } else if (!admin || !(await verifyPassword(password, admin.passwordHash))) {
      return NextResponse.json({ error: 'بيانات الدخول غير صحيحة' }, { status: 401 });
    }

    if (admin.status !== 'ACTIVE') {
      return NextResponse.json({ error: 'حساب الإدارة غير نشط' }, { status: 403 });
    }

    const token = signSessionToken({
      userId: admin._id.toString(),
      email: admin.email,
      displayName: admin.displayName,
      role: admin.role,
      isAdmin: true,
    });
    setAuthCookie(token, true);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Admin login error:', error);
    return NextResponse.json({ error: 'تعذر تسجيل دخول الإدارة' }, { status: 500 });
  }
}
