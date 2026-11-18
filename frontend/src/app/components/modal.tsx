'use client';

import React, { useEffect } from 'react';

interface ModalProps {
  // Called on Escape or a click on the backdrop. Leave it out while a request
  // is in flight, so a stray click cannot cancel it.
  onDismiss?: () => void;
  // The dialog's name for screen readers, usually its headline.
  label: string;
  children: React.ReactNode;
}

// A dialog over the page: dims everything behind it and blocks clicks there.
export const Modal: React.FC<ModalProps> = ({ onDismiss, label, children }) => {
  useEffect(() => {
    if (!onDismiss) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onDismiss();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onDismiss]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onDismiss}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={label}
        onClick={(event) => event.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
};
