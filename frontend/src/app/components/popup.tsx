'use client';

import React from 'react';
import { Button } from './button';
import { Card } from './card';
import { Modal } from './modal';

interface PopupProps {
  headline: string;
  message: string;
  onDismiss: () => void;
  onConfirm?: () => void;
  confirmLabel?: string;
  busy?: boolean;
}

// The Figma library has no popup yet, so this is built from its parts: the
// highlighted card, a sub-header, body text and the library's buttons.
const Popup = ({
  headline,
  message,
  onDismiss,
  onConfirm,
  confirmLabel = 'Confirm',
  busy = false,
}: PopupProps) => (
  <Modal label={headline} onDismiss={busy ? undefined : onDismiss}>
    <Card tone="highlighted" className="w-96 max-w-full !p-8">
      <h2 className="text-subheader font-medium text-black mb-4">{headline}</h2>
      <p className="text-base text-black mb-6">{message}</p>
      {onConfirm ? (
        <div className="flex gap-4">
          <Button variant="secondary" className="flex-1" onClick={onDismiss} disabled={busy}>
            Cancel
          </Button>
          <Button className="flex-1" onClick={onConfirm} busy={busy}>
            {confirmLabel}
          </Button>
        </div>
      ) : (
        <Button className="w-full" onClick={onDismiss}>
          Dismiss
        </Button>
      )}
    </Card>
  </Modal>
);

export default Popup;
