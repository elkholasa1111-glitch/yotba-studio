import { Loader2 } from 'lucide-react';

export default function Loading() {
  return (
    <main
      className="min-h-screen bg-obsidian text-editorial-ivory flex items-center justify-center px-4"
      aria-busy="true"
      aria-live="polite"
    >
      <div className="flex items-center gap-3 rounded-xl border border-border-subtle bg-surface px-5 py-4 text-sm text-editorial-secondary">
        <Loader2 className="h-5 w-5 animate-spin text-crimson" aria-hidden="true" />
        <span>جارٍ تحميل الاستوديو...</span>
      </div>
    </main>
  );
}
