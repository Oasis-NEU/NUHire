import type { ReactNode } from 'react';

// The Figma "Chip" atom (NUHire UI > Atoms): a pill label in one of six tones.
export type ChipKind = 'neutral' | 'brand' | 'success' | 'warning' | 'solid' | 'info';

const KIND: Record<ChipKind, string> = {
  neutral: 'bg-gray-100 text-gray-600',
  brand: 'bg-red-50 text-red-700',
  success: 'bg-success-50 text-success-700',
  warning: 'bg-warning-50 text-warning-700',
  solid: 'bg-neu-red text-white',
  info: 'bg-blue-50 text-blue-500',
};

const Chip = ({ kind = 'neutral', children }: { kind?: ChipKind; children: ReactNode }) => (
  <span
    className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium leading-4 tracking-[0.02em] ${KIND[kind]}`}
  >
    {children}
  </span>
);

export default Chip;
