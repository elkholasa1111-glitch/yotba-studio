'use client';

import { AlertCircle, RefreshCw } from 'lucide-react';

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="min-h-screen bg-obsidian text-editorial-ivory flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md rounded-2xl border border-red-800/50 bg-surface p-6 text-center space-y-4">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-950/50 text-red-300">
          <AlertCircle className="h-6 w-6" aria-hidden="true" />
        </div>
        <div className="space-y-1">
          <h1 className="text-lg font-bold">تعذر فتح الاستوديو</h1>
          <p className="text-sm text-editorial-secondary">حدث خطأ مؤقت. أعد المحاولة، وإذا استمر تواصل مع الدعم.</p>
        </div>
        <button
          type="button"
          onClick={() => reset()}
          className="min-h-11 w-full rounded-lg bg-crimson px-4 py-2 text-sm font-bold text-white shadow-halo transition-colors hover:bg-crimson-bright focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-crimson"
        >
          <span className="inline-flex items-center justify-center gap-2">
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            إعادة المحاولة
          </span>
        </button>
      </div>
    </main>
  );
}
