import React from 'react';

// The surfaces the Figma screens use: the dashboard's white cards, the
// session banner's red-bordered one, and the landing page's grey panel.
const TONE = {
  default: 'bg-white',
  highlighted: 'bg-white border-2 border-northeasternRed',
  panel: 'bg-gray0',
};

// 16px on the dashboard's cards, 32px on the landing panel.
const PADDING = { md: 'p-4', lg: 'p-8' };

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  tone?: keyof typeof TONE;
  // Defaults to the tone's own: lg for panel, md otherwise.
  padding?: keyof typeof PADDING;
  title?: string;
}

export const Card: React.FC<CardProps> = ({
  tone = 'default',
  padding = tone === 'panel' ? 'lg' : 'md',
  title,
  className = '',
  children,
  ...rest
}) => (
  <div
    className={`rounded-2xl shadow-raised ${TONE[tone]} ${PADDING[padding]} ${className}`}
    {...rest}
  >
    {title && <h2 className="text-2xl font-bold text-black mb-2">{title}</h2>}
    {children}
  </div>
);
