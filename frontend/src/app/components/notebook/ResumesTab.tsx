'use client';

import { useState } from 'react';
import { API_BASE_URL } from '../../../lib/api';
import type { ResumeListing } from '../../../types';
import { useAuth } from '../AuthContext';
import PanelMessage from '../PanelMessage';
import PdfPreview from '../PdfPreview';
import { useResumes } from '../useResumes';

const displayName = (resume: ResumeListing) =>
  [resume.first_name, resume.last_name].filter(Boolean).join(' ') || resume.title;

export default function ResumesTab() {
  const { user } = useAuth();
  const { resumes, failed } = useResumes(user?.class);
  const [selectedId, setSelectedId] = useState<number | null>(null);

  if (failed) return <PanelMessage>Couldn’t load the resumes.</PanelMessage>;
  if (!resumes) return <PanelMessage>Loading resumes…</PanelMessage>;
  if (resumes.length === 0) return <PanelMessage>No resumes in this class yet.</PanelMessage>;

  const selected = resumes.find((resume) => resume.id === selectedId);
  if (selected) {
    const url = `${API_BASE_URL}/${selected.file_path}`;
    return (
      <div className="flex min-h-0 flex-1 flex-col gap-2">
        <button
          type="button"
          onClick={() => setSelectedId(null)}
          className="self-start text-[13px] leading-5 text-gray-500 hover:text-gray-800"
        >
          ‹ All resumes
        </button>
        <PdfPreview key={url} url={url} title={displayName(selected)} />
      </div>
    );
  }

  return (
    <ul className="-mx-2 flex min-h-0 flex-col gap-1.5 overflow-y-auto">
      {resumes.map((resume) => {
        const name = displayName(resume);
        return (
          <li key={resume.id}>
            <button
              type="button"
              onClick={() => setSelectedId(resume.id)}
              className="flex w-full items-center gap-2.5 rounded-[10px] p-2 text-left hover:bg-gray-50"
            >
              <span
                aria-hidden="true"
                className="flex size-7 shrink-0 items-center justify-center rounded-full bg-gray-100 text-[13px] font-bold leading-5 text-gray-500"
              >
                {name.charAt(0).toUpperCase()}
              </span>
              <span className="truncate text-[13px] font-bold leading-5 text-gray-800">{name}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
