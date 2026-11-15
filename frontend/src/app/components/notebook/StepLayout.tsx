'use client';

import type { ReactNode } from 'react';
import { useNotebook } from '../NotebookContext';
import NotebookPanel from './NotebookPanel';

// Each student step's layout.tsx renders this, which docks the notebook beside
// the page without editing the page itself.
export default function StepLayout({ children }: { children: ReactNode }) {
  const { ready, open } = useNotebook();
  return (
    <div className="flex min-h-screen">
      <div className="min-w-0 flex-1">{children}</div>
      {ready && open && (
        // Sticky so the panel stays in view on the steps whose page scrolls.
        <aside className="sticky top-0 h-screen w-[344px] shrink-0 p-3">
          <NotebookPanel />
        </aside>
      )}
    </div>
  );
}
