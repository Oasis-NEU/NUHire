import React from 'react';
import { Spinner } from './spinner';

// The variants of the Figma library's BTN components, plus the ones the
// screens use. Rect variants have 8px corners, pill variants are fully round.
export type ButtonVariant =
  | 'primary' // red fill
  | 'secondary' // red outline
  | 'outline' // grey outline, e.g. "Not now"
  | 'neutral' // grey pill
  | 'neutralActive' // the selected grey pill
  | 'outlineRed'; // red outline pill, e.g. "Help"

const PILL: ButtonVariant[] = ['neutral', 'neutralActive', 'outlineRed'];

const COLORS: Record<ButtonVariant, string> = {
  primary: 'bg-northeasternRed text-white shadow-raised',
  secondary: 'border-2 border-northeasternRed text-northeasternRed',
  outline: 'border-2 border-gray3 bg-white text-gray3 shadow-raised',
  neutral: 'border-2 border-gray4 text-gray4 shadow-pill',
  neutralActive: 'border-2 border-gray3 bg-gray4 text-white',
  outlineRed: 'border-2 border-northeasternRed bg-white text-northeasternRed shadow-raised',
};

// A disabled button of any variant is greyed out, as the screens draw "View".
const DISABLED = 'bg-gray1 text-gray2 cursor-not-allowed';

// md is the library's 40px button with 24px text; sm is the compact one the
// screens use inside cards ("+ Resume").
const SIZE = {
  md: 'h-10 px-4 text-2xl',
  sm: 'p-2.5 text-base',
};

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: keyof typeof SIZE;
  // Drawn 16px from the label, as in the library's BTN Main.
  icon?: React.ReactNode;
  // Disables the button and shows a spinner, for a request in flight.
  busy?: boolean;
}

export const Button: React.FC<ButtonProps> = ({
  variant = 'primary',
  size = 'md',
  icon,
  busy = false,
  disabled,
  type = 'button',
  className = '',
  children,
  ...rest
}) => {
  const shape = PILL.includes(variant) ? 'rounded-full' : 'rounded-lg';
  // A busy button keeps its colours; it is working, not unavailable. The
  // library draws hover and pressed as an inset shadow in place of the raised one.
  const state = disabled
    ? DISABLED
    : `${COLORS[variant]} ${busy ? 'cursor-wait' : 'hover:shadow-pressed active:shadow-pressed'}`;
  return (
    <button
      type={type}
      disabled={disabled || busy}
      className={`inline-flex items-center justify-center gap-4 font-medium whitespace-nowrap transition-shadow ${shape} ${SIZE[size]} ${state} ${className}`}
      {...rest}
    >
      {busy ? <Spinner size="sm" label="Working" /> : icon}
      {children}
    </button>
  );
};

export type IconButtonIcon = 'question' | 'info' | 'lock' | 'user';

const LETTER: Partial<Record<IconButtonIcon, string>> = { question: '?', info: 'i' };

// The library's open-lock glyph, 16x21, in the button's text colour.
export const LockIcon: React.FC<{ className?: string }> = ({ className = '' }) => (
  <svg viewBox="0 0 16 21" fill="currentColor" className={`w-4 h-[21px] ${className}`} aria-hidden>
    <path d="M2 7H11V5C11 4.16667 10.7083 3.45833 10.125 2.875C9.54167 2.29167 8.83333 2 8 2C7.16667 2 6.45833 2.29167 5.875 2.875C5.29167 3.45833 5 4.16667 5 5H3C3 3.61667 3.48767 2.43767 4.463 1.463C5.43833 0.488334 6.61733 0.000667349 8 6.82594e-07C9.38267 -0.000665984 10.562 0.487001 11.538 1.463C12.514 2.439 13.0013 3.618 13 5V7H14C14.55 7 15.021 7.196 15.413 7.588C15.805 7.98 16.0007 8.45067 16 9V19C16 19.55 15.8043 20.021 15.413 20.413C15.0217 20.805 14.5507 21.0007 14 21H2C1.45 21 0.979333 20.8043 0.588 20.413C0.196666 20.0217 0.000666667 19.5507 0 19V9C0 8.45 0.196 7.97933 0.588 7.588C0.98 7.19667 1.45067 7.00067 2 7ZM9.413 15.413C9.80433 15.021 10 14.55 10 14C10 13.45 9.80433 12.9793 9.413 12.588C9.02167 12.1967 8.55067 12.0007 8 12C7.44933 11.9993 6.97867 12.1953 6.588 12.588C6.19733 12.9807 6.00133 13.4513 6 14C5.99867 14.5487 6.19467 15.0197 6.588 15.413C6.98133 15.8063 7.452 16.002 8 16C8.548 15.998 9.019 15.8023 9.413 15.413Z" />
  </svg>
);

interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  // One of the library's four icons, or a letter (e.g. an avatar initial).
  icon: IconButtonIcon | string;
  // The button has no visible text, so it needs a name.
  label: string;
}

// The library's BTN Icons: a 40px white circle around a 32px red ring.
export const IconButton: React.FC<IconButtonProps> = ({
  icon,
  label,
  type = 'button',
  className = '',
  ...rest
}) => {
  let glyph: React.ReactNode;
  if (icon === 'lock') glyph = <LockIcon className="!w-3 !h-4" />;
  else if (icon === 'user')
    glyph = (
      <span className="flex flex-col items-center gap-0.5 pt-[9px]" aria-hidden>
        <span className="block size-2.5 rounded-full bg-current" />
        <span className="block w-4 h-5 rounded-[10px] bg-current" />
      </span>
    );
  else
    glyph = (
      <span className="text-2xl font-black leading-none" aria-hidden>
        {LETTER[icon as IconButtonIcon] ?? icon}
      </span>
    );

  return (
    <button
      type={type}
      aria-label={label}
      className={`flex items-center justify-center size-10 rounded-full bg-white shadow-raised hover:shadow-pressed active:shadow-pressed ${className}`}
      {...rest}
    >
      <span className="flex items-center justify-center size-8 rounded-full border-2 border-northeasternRed text-northeasternRed overflow-hidden">
        {glyph}
      </span>
    </button>
  );
};
