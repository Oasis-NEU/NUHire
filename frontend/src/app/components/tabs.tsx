import React, { useState } from 'react';

type TabProps = {
  children: React.ReactElement<{ title: string }>[];
};

const Tabs: React.FC<TabProps> = ({ children }) => {
  const [selectedTab, setSelectedTab] = useState(0);

  return (
    <div>
      <div role="tablist" className="inline-flex gap-1 p-1 mb-4 rounded-xl bg-gray1/60">
        {children.map((tab, idx) => (
          <button
            key={idx}
            type="button"
            role="tab"
            aria-selected={selectedTab === idx}
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
      <div role="tabpanel">{children[selectedTab]}</div>
    </div>
  );
};

export default Tabs;
