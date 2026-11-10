import React from 'react';
import Image from 'next/image';

interface SpinnerProps {
  // Extra classes for spacing at the call site, e.g. "mb-4".
  className?: string;
  label?: string;
  // md is the design system's Spinner Circle; sm fits inside a button.
  size?: 'md' | 'sm';
}

const SPINNER_PX = { md: 56, sm: 20 };

// The Figma library's "Spinner Circle": a grey track with a dark arc a tenth of
// the way round. The paths are Figma's, drawn on a 56px box because the 48px
// ring's 8px stroke overflows it.
export const Spinner: React.FC<SpinnerProps> = ({
  className = '',
  label = 'Loading',
  size = 'md',
}) => (
  <svg
    role="status"
    aria-label={label}
    width={SPINNER_PX[size]}
    height={SPINNER_PX[size]}
    viewBox="0 0 56 56"
    fill="none"
    className={`animate-spin ${size === 'md' ? 'block mx-auto' : 'inline-block'} ${className}`}
  >
    <circle cx="28" cy="28" r="24" stroke="#D9D9D9" strokeWidth="8" />
    <path
      d="M36.6387 5.60865C41.3673 7.43297 45.397 10.7074 48.1502 14.9627"
      stroke="#2D2D2D"
      strokeWidth="8"
      strokeLinecap="round"
    />
  </svg>
);

const STRIPS = [0, 1, 2, 3, 4, 5];

// Full-screen loading state, shown while a page waits on auth. The design
// system's loader: a sheet of paper feeds into a shredder and comes out as
// strips. Positions are the Figma frame's; the motion is in globals.css.
export const PageLoader: React.FC = () => (
  <div className="flex items-center justify-center min-h-screen bg-white">
    <div
      role="status"
      aria-label="Loading"
      className="relative w-[236px] h-[287px] overflow-hidden"
    >
      {/* Strips show only once they are below the shredder. */}
      <div className="absolute left-[39px] top-[196px] w-[159px] h-[91px] overflow-hidden">
        {STRIPS.map((i) => (
          <Image
            key={i}
            src="/loader/strip.svg"
            alt=""
            width={18}
            height={122}
            className={`loader-strip loader-strip-${i} absolute top-[-114px] w-[18px] h-[122px] max-w-none`}
            style={{ left: 29 + 16 * i }}
          />
        ))}
      </div>
      <Image
        src="/loader/shredder.svg"
        alt=""
        width={168}
        height={98}
        className="absolute left-[34px] top-[106px] w-[168px] h-[98px] max-w-none"
      />
      {/* The paper shows only above the shredder's bottom edge. */}
      <div className="absolute left-[38px] top-0 w-[159px] h-[195px] overflow-hidden">
        <Image
          src="/loader/paper.svg"
          alt=""
          width={164}
          height={154}
          className="loader-paper absolute left-[26px] top-[-134px] w-[164px] h-[153.5px] max-w-none"
        />
      </div>
      {/* The shredder's front, drawn over the paper as it goes in. */}
      <div className="absolute left-[38px] top-[133px] w-[160px] h-[62px] bg-northeasternRed" />
    </div>
  </div>
);
