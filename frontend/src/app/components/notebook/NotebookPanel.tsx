'use client';

import type { ReactNode } from 'react';
import NotesEditor from '../NotesEditor';
import Tabs from '../tabs';
import { NOTEBOOK_TABS, useNotebook, type NotebookTab } from './NotebookContext';
import JobTab from './JobTab';
import ResumesTab from './ResumesTab';

const CONTENT: Record<NotebookTab, ReactNode> = {
  notes: <NotesEditor />,
  job: <JobTab />,
  resumes: <ResumesTab />,
};

const TABS = NOTEBOOK_TABS.map(({ id, label }) => ({ id, label, content: CONTENT[id] }));

// The Notebook card from the Figma (Dashboards, "Step 2 · Resume review").
export default function NotebookPanel() {
  const { tab, setTab, setOpen } = useNotebook();

  return (
    <section
      aria-label="Notebook"
      className="flex h-full flex-col gap-3.5 rounded-2xl border border-gray-200 bg-white p-5 shadow-[0_6px_18px_rgba(20,22,27,0.06),0_1px_2px_rgba(20,22,27,0.04)]"
    >
      <div className="flex items-center">
        <h2 className="text-base font-bold leading-6 text-gray-800">Notebook</h2>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="ml-auto text-[13px] leading-5 text-gray-500 hover:text-gray-800"
        >
          Hide
        </button>
      </div>
      {/* Kept mounted, so flipping to Notes and back keeps the job PDF's page and the open resume. */}
      <Tabs keepMounted tabs={TABS} selected={tab} onSelect={setTab} />
    </section>
  );
}
