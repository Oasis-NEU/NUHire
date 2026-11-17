import React, { useId, useRef, useState } from 'react';

type TabProps = {
  children: React.ReactElement<{ title: string }>[];
};

const Tabs: React.FC<TabProps> = ({ children }) => {
  const [selectedTab, setSelectedTab] = useState(0);
  const id = useId();
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const select = (idx: number) => {
    setSelectedTab(idx);
    tabRefs.current[idx]?.focus();
  };

  const handleKeyDown = (event: React.KeyboardEvent) => {
    const last = children.length - 1;
    const next = {
      ArrowRight: selectedTab === last ? 0 : selectedTab + 1,
      ArrowLeft: selectedTab === 0 ? last : selectedTab - 1,
      Home: 0,
      End: last,
    }[event.key];
    if (next === undefined) return;
    event.preventDefault();
    select(next);
  };

  return (
    <div>
      <div
        role="tablist"
        onKeyDown={handleKeyDown}
        className="inline-flex gap-1 p-1 mb-4 rounded-xl bg-gray1/60"
      >
        {children.map((tab, idx) => (
          <button
            key={idx}
            ref={(el) => {
              tabRefs.current[idx] = el;
            }}
            id={`${id}-tab-${idx}`}
            type="button"
            role="tab"
            aria-selected={selectedTab === idx}
            aria-controls={selectedTab === idx ? `${id}-panel` : undefined}
            tabIndex={selectedTab === idx ? 0 : -1}
            className={`px-4 py-2 rounded-lg text-sm transition-colors ${
              selectedTab === idx
                ? 'bg-white font-semibold text-black shadow-raised'
                : 'text-gray4 hover:text-black'
            }`}
            onClick={() => setSelectedTab(idx)}
          >
            {tab.props.title}
          </button>
        ))}
      </div>
      <div
        role="tabpanel"
        id={`${id}-panel`}
        aria-labelledby={`${id}-tab-${selectedTab}`}
        tabIndex={0}
      >
        {children[selectedTab]}
      </div>
    </div>
  );
};

export default Tabs;
