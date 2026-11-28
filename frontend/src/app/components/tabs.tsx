'use client';

import { useId, useState, type ReactNode } from 'react';

export interface TabItem<Id extends string> {
  id: Id;
  label: string;
  content: ReactNode;
}

interface Props<Id extends string> {
  tabs: readonly TabItem<Id>[];
  selected: Id;
  onSelect: (id: Id) => void;
  // Keep a tab mounted after its first visit, so what it holds (a PDF's page, an
  // open resume) survives switching away. Off by default, so a tab that loads
  // its data on mount shows fresh data each time it is opened.
  keepMounted?: boolean;
}

// The segmented tabs from the Figma design system.
export default function Tabs<Id extends string>({
  tabs,
  selected,
  onSelect,
  keepMounted = false,
}: Props<Id>) {
  const idPrefix = useId();
  const [visited, setVisited] = useState<Id[]>([selected]);
  if (!visited.includes(selected)) setVisited([...visited, selected]);

  const mounted = tabs.filter(({ id }) => id === selected || (keepMounted && visited.includes(id)));

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3.5">
      <div role="tablist" className="flex shrink-0 gap-1 rounded-[10px] bg-gray-100 p-1">
        {tabs.map(({ id, label }) => {
          const isSelected = id === selected;
          return (
            <button
              key={id}
              type="button"
              role="tab"
              id={`${idPrefix}-tab-${id}`}
              aria-selected={isSelected}
              aria-controls={`${idPrefix}-panel-${id}`}
              onClick={() => onSelect(id)}
              className={`flex-1 rounded-lg py-1.5 text-[13px] leading-5 ${
                isSelected
                  ? 'bg-white font-bold text-gray-800'
                  : 'text-gray-500 hover:text-gray-800'
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>
      {mounted.map(({ id, content }) => (
        // The `hidden` class as well as the attribute: Tailwind's `flex` would
        // otherwise override the attribute's display: none.
        <div
          key={id}
          role="tabpanel"
          id={`${idPrefix}-panel-${id}`}
          aria-labelledby={`${idPrefix}-tab-${id}`}
          hidden={id !== selected}
          className={id === selected ? 'flex min-h-0 flex-1 flex-col' : 'hidden'}
        >
          {content}
        </div>
      ))}
    </div>
  );
}
