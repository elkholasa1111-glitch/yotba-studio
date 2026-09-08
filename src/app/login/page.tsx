'use client';

import { FormEvent, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ShieldCheck, ArrowUpRight, Loader2 } from 'lucide-react';
import Link from 'next/link';

function AdminLoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

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
      const result = await response.json();
      if (!response.ok) {
        setError(result.error || 'تعذر تسجيل الدخول');
        return;
      }
      const returnTo = params.get('returnTo');
      router.replace(returnTo || '/');
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
      noValidate
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
          autoComplete="username"
          required
          placeholder="admin@yotba.com"
          className="w-full min-h-11 rounded-lg border border-border-subtle bg-obsidian-900 px-3 py-3 text-editorial-ivory focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#E85A65]"
        />
      </label>

      <label className="block space-y-2 text-sm text-editorial-secondary">
        <span>كلمة المرور</span>
        <input
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          type="password"
          autoComplete="current-password"
          required
          className="w-full min-h-11 rounded-lg border border-border-subtle bg-obsidian-900 px-3 py-3 text-editorial-ivory focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#E85A65]"
        />
      </label>

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
            href="https://yotba.vercel.app"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs text-editorial-muted hover:text-editorial-ivory transition-colors"
          >
            <span>الانتقال إلى منصة الاستماع العامة (yotba.vercel.app)</span>
            <ArrowUpRight size={14} />
          </Link>
        </div>
      </div>
    </main>
  );
}
