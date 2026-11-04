import React from 'react';

// The surfaces the Figma screens use: the dashboard's white cards, the
// session banner's red-bordered one, and the landing page's grey panel.
const TONE = {
  default: 'bg-white p-4',
  highlighted: 'bg-white border-2 border-northeasternRed p-4',
  panel: 'bg-gray0 p-8',
};

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  tone?: keyof typeof TONE;
  title?: string;
}

export const Card: React.FC<CardProps> = ({
  tone = 'default',
  title,
  className = '',
  children,
  ...rest
}) => (
  <div className={`rounded-2xl shadow-raised ${TONE[tone]} ${className}`} {...rest}>
    {title && <h2 className="text-2xl font-bold text-black mb-2">{title}</h2>}
    {children}
  </div>
);
