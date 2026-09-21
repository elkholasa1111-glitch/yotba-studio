'use client';

import { FormEvent, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ShieldCheck, ArrowUpRight, Loader2, Eye, EyeOff } from 'lucide-react';
import Link from 'next/link';
import { resolvePublicPlatformUrl } from '@/lib/config/public-platform';
import { safeAdminReturnTo } from '@/lib/admin/access';

function AdminLoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [capsLock, setCapsLock] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    setIsSubmitting(true);
    try {
      const response = await fetch('/api/v1/admin/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        const retrySeconds = Number(response.headers.get('Retry-After'));
        setError(response.status === 429 && retrySeconds > 0
          ? `محاولات دخول كثيرة. انتظر ${Math.ceil(retrySeconds / 60)} دقيقة ثم أعد المحاولة.`
          : result.error || 'تعذر تسجيل الدخول. أعد المحاولة بعد قليل.');
        return;
      }
      const sessionResponse = await fetch('/api/v1/admin/auth/me', { cache: 'no-store', credentials: 'same-origin' });
      const session = await sessionResponse.json().catch(() => ({}));
      if (!sessionResponse.ok || !session.admin) {
        setError('تعذر تثبيت جلسة الدخول. تأكد من السماح بملفات تعريف الارتباط وافتح رابط الاستوديو عبر HTTPS، ثم أعد المحاولة.');
        return;
      }
      const returnTo = safeAdminReturnTo(params.get('returnTo'));
      router.replace(returnTo);
      router.refresh();
    } catch {
      setError('تعذر الاتصال بالخادم. أعد المحاولة.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form
      onSubmit={submit}
      className="rounded-2xl border border-border-subtle bg-surface p-6 sm:p-8 shadow-cinematic space-y-5"
    >
      <div className="flex items-center gap-2 pb-2 border-b border-border-subtle text-editorial-muted text-xs font-semibold">
        <ShieldCheck className="text-crimson" size={18} aria-hidden="true" />
        <span>دخول إداري مصادق</span>
      </div>

      {error && (
        <p
          role="alert"
          className="rounded-lg border border-red-700/60 bg-red-950/40 p-3 text-sm text-red-200"
        >
          {error}
        </p>
      )}

      <label className="block space-y-2 text-sm text-editorial-secondary">
        <span>البريد الإلكتروني للإدارة</span>
        <input
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          type="email"
          name="email"
          dir="ltr"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          autoComplete="username"
          required
          placeholder="name@example.com"
          className="w-full min-h-11 rounded-lg border border-border-subtle bg-obsidian-900 px-3 py-3 text-editorial-ivory focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#E85A65]"
        />
      </label>

      <div className="space-y-2 text-sm text-editorial-secondary">
        <label htmlFor="admin-password" className="block">كلمة المرور</label>
        <div className="relative">
        <input
          id="admin-password"
          name="password"
          dir="ltr"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          onKeyUp={(event) => setCapsLock(event.getModifierState('CapsLock'))}
          onKeyDown={(event) => setCapsLock(event.getModifierState('CapsLock'))}
          onBlur={() => setCapsLock(false)}
          type={showPassword ? 'text' : 'password'}
          autoComplete="current-password"
          required
          className="w-full min-h-11 rounded-lg border border-border-subtle bg-obsidian-900 pl-3 pr-12 py-3 text-editorial-ivory focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#E85A65]"
        />
        <button type="button" onClick={() => setShowPassword(value => !value)} aria-label={showPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'} aria-pressed={showPassword} className="absolute right-0 top-0 h-full min-w-11 flex items-center justify-center rounded-lg text-editorial-secondary hover:text-editorial-ivory focus-visible:ring-2 focus-visible:ring-crimson focus-visible:outline-none">
          {showPassword ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
        </button>
        </div>
        {capsLock && <p role="status" className="text-xs text-amber-300">زر Caps Lock مفعّل؛ تأكد من الحروف الكبيرة والصغيرة.</p>}
      </div>

      <button
        type="submit"
        disabled={isSubmitting}
        aria-busy={isSubmitting}
        className="min-h-11 w-full rounded-lg bg-crimson hover:bg-crimson-bright px-4 py-3 font-semibold text-white shadow-halo focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#E85A65] disabled:cursor-not-allowed disabled:opacity-60 transition-colors flex items-center justify-center gap-2"
      >
        {isSubmitting ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>جارٍ التحقق…</span>
          </>
        ) : (
          <span>تسجيل الدخول للاستوديو</span>
        )}
      </button>
      <p className="text-xs leading-6 text-editorial-muted">استخدم حساب فريق الاستوديو، وليس حساب الاستماع. إذا لم يُضف حسابك بعد، اطلب من صاحب المنصة إضافتك من «فريق العمل».</p>
    </form>
  );
}

export default function AdminLoginPage() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-4 py-12 font-ui bg-obsidian text-editorial-ivory relative">
      <div className="w-full max-w-md space-y-6">
        {/* Brand Header */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-crimson shadow-halo mb-2">
            <span className="text-white font-black font-display text-2xl">يـ</span>
          </div>
          <h1 className="text-2xl font-black font-display text-editorial-ivory">
            استوديو <span className="text-crimson">يُتبع...</span>
          </h1>
          <p className="text-xs text-editorial-secondary">
            بوابة التحكم والإدارة المركزية لمنصة الإنتاج الصوتي
          </p>
        </div>

        {/* Login Form with Suspense */}
        <Suspense
          fallback={
            <div className="rounded-2xl border border-border-subtle bg-surface p-12 text-center text-editorial-muted">
              <Loader2 className="w-6 h-6 animate-spin mx-auto text-crimson" />
            </div>
          }
        >
          <AdminLoginForm />
        </Suspense>

        {/* Link to Live Public Platform */}
        <div className="text-center pt-2">
          <Link
            href={resolvePublicPlatformUrl('/')}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs text-editorial-muted hover:text-editorial-ivory transition-colors"
          >
            <span>الانتقال إلى منصة الاستماع العامة</span>
            <ArrowUpRight size={14} />
          </Link>
        </div>
      </div>
    </main>
  );
}
