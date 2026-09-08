'use client';

import React, { useState } from 'react';
import { Loader2, AlertTriangle } from 'lucide-react';
import { ModalDialog } from './ModalDialog';

interface ConfirmDialogProps {
  title: string;
  message: string;
  confirmLabel: string;
  onConfirm: () => Promise<void>;
  onCancel: () => void;
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({ title, message, confirmLabel, onConfirm, onCancel }) => {
  const [busy, setBusy] = useState(false);

  return (
    <ModalDialog title={title} onClose={onCancel}>
      <div className="space-y-5">
        <div className="flex items-start gap-3 text-crimson">
          <AlertTriangle size={20} className="flex-shrink-0 mt-0.5" />
          <p className="text-sm text-editorial-secondary leading-relaxed" role="alert">
            {message}
          </p>
        </div>
        <div className="flex justify-start gap-2 pt-2 border-t border-border-subtle">
          <button
            type="button"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await onConfirm();
              } finally {
                setBusy(false);
              }
            }}
            className="min-h-11 px-4 py-2 bg-crimson hover:bg-crimson-bright text-white text-xs font-bold rounded transition-colors disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-crimson-glow focus-visible:ring-offset-2 focus-visible:ring-offset-obsidian"
          >
            {busy ? <Loader2 size={14} className="animate-spin" aria-label="جارٍ التنفيذ" /> : confirmLabel}
          </button>
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="min-h-11 px-4 py-2 bg-surface-elevated hover:bg-border-subtle text-editorial-secondary text-xs font-semibold rounded transition-colors disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-crimson-glow"
          >
            إلغاء
          </button>
        </div>
      </div>
    </ModalDialog>
  );
};
