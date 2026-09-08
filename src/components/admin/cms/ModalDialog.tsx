'use client';

import React, { useEffect, useId, useRef, useState } from 'react';
import { X, AlertTriangle } from 'lucide-react';

interface ModalDialogProps {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  /** وجود تغييرات غير محفوظة يجعل الإغلاق يتطلب تأكيداً */
  isDirty?: boolean;
  wide?: boolean;
}

export const ModalDialog: React.FC<ModalDialogProps> = ({ title, onClose, children, isDirty = false, wide = false }) => {
  const dialogRef = useRef<HTMLDivElement>(null);
  const [confirmingClose, setConfirmingClose] = useState(false);
  const titleId = `cms-modal-title-${useId().replace(/:/g, '')}`;

  const requestClose = React.useCallback(() => {
    if (isDirty) {
      setConfirmingClose(true);
    } else {
      onClose();
    }
  }, [isDirty, onClose]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        requestClose();
        return;
      }
      if (event.key !== 'Tab' || !dialogRef.current) return;
      const focusable = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )
      );
      if (focusable.length === 0) {
        event.preventDefault();
        dialogRef.current.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [requestClose]);

  useEffect(() => {
    dialogRef.current?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/70 backdrop-blur-sm motion-safe:animate-fade-in"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) requestClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={`relative w-full ${wide ? 'max-w-3xl' : 'max-w-xl'} max-h-[90vh] overflow-y-auto bg-surface-modal border border-border-strong rounded-lg shadow-cinematic focus:outline-none focus-visible:ring-2 focus-visible:ring-crimson-glow motion-safe:animate-slide-up`}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 p-4 bg-surface-modal border-b border-border-subtle">
          <h2 id={titleId} className="text-base font-bold text-editorial-ivory">
            {title}
          </h2>
          <button
            type="button"
            onClick={requestClose}
            aria-label="إغلاق النافذة"
            className="flex min-w-11 min-h-11 items-center justify-center rounded text-editorial-secondary hover:text-editorial-ivory hover:bg-surface-elevated transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-crimson-glow"
          >
            <X size={18} />
          </button>
        </div>

        <div className="p-4 sm:p-6">{children}</div>

        {confirmingClose && (
          <div
            role="alertdialog"
            aria-labelledby="cms-close-confirm-title"
            className="absolute inset-0 z-20 flex items-center justify-center bg-black/80 p-4"
          >
            <div className="w-full max-w-sm bg-surface-modal border border-border-strong rounded-lg p-5 space-y-4 text-right">
              <div className="flex items-center gap-2 text-crimson">
                <AlertTriangle size={18} />
                <h3 id="cms-close-confirm-title" className="text-sm font-bold">
                  تغييرات غير محفوظة
                </h3>
              </div>
              <p className="text-xs text-editorial-secondary leading-relaxed">
                لديك تعديلات لم تُحفظ بعد. إذا خرجت الآن ستفقد هذه التغييرات.
              </p>
              <div className="flex justify-start gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="min-h-11 px-4 py-2 bg-crimson hover:bg-crimson-bright text-white text-xs font-bold rounded transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-crimson-glow focus-visible:ring-offset-2 focus-visible:ring-offset-obsidian"
                >
                  خروج بدون حفظ
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmingClose(false)}
                  className="min-h-11 px-4 py-2 bg-surface-elevated hover:bg-border-subtle text-editorial-secondary text-xs font-semibold rounded transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-crimson-glow"
                >
                  متابعة التعديل
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
