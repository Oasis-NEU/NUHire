'use client';

import { useId, useState, type ReactNode } from 'react';
import { API_BASE_URL } from '../../lib/api';
import Chip from './chip';
import type { ScreenedCandidate } from './useScreeningResults';

// One resume's screening result, built from the Figma card (NUHire UI >
// Molecules > Finalist card) and the bars on the Results screen.

const FOCUS =
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neu-red';

const Icon = ({ path }: { path: string }) => (
  <svg viewBox="0 0 16 16" className="h-3 w-3" fill="none" aria-hidden="true">
    <path
      d={path}
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);
const CHECK = 'M3.5 8.5l3 3 6-7';
const DASH = 'M4 8h8';

const Avatar = ({ name, muted }: { name: string; muted: boolean }) => (
  <span
    aria-hidden="true"
    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[0.9375rem] font-bold leading-6 ${
      muted ? 'bg-gray-100 text-gray-500' : 'bg-red-100 text-red-700'
    }`}
  >
    {name.trim().charAt(0).toUpperCase() || '?'}
  </span>
);

const KeywordGroup = ({
  label,
  words,
  kind,
}: {
  label: string;
  words: string[];
  kind: 'success' | 'neutral';
}) => (
  <div className="flex flex-col gap-1.5">
    <h4 className="text-xs font-medium leading-4 tracking-[0.02em] text-gray-500">{label}</h4>
    {words.length > 0 ? (
      <ul className="flex flex-wrap gap-1.5">
        {words.map((word) => (
          <li key={word}>
            <Chip kind={kind}>{word}</Chip>
          </li>
        ))}
      </ul>
    ) : (
      <p className="text-[0.8125rem] leading-5 text-gray-500">None</p>
    )}
  </div>
);

const NoteList = ({
  label,
  items,
  marker,
}: {
  label: string;
  items: string[];
  marker: 'fit' | 'gap';
}) => (
  <div className="flex flex-col gap-2">
    <h4 className="text-xs font-medium leading-4 tracking-[0.02em] text-red-700">{label}</h4>
    {items.length > 0 ? (
      <ul className="flex flex-col gap-2">
        {items.map((item, i) => (
          <li key={i} className="flex gap-2.5 text-[0.8125rem] leading-5 text-gray-800">
            <span
              aria-hidden="true"
              className={`mt-px flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[5px] ${
                marker === 'fit'
                  ? 'bg-neu-red text-white'
                  : 'border-[1.5px] border-gray-400 text-gray-500'
              }`}
            >
              <Icon path={marker === 'fit' ? CHECK : DASH} />
            </span>
            <span>{item}</span>
          </li>
        ))}
      </ul>
    ) : (
      <p className="text-[0.8125rem] leading-5 text-gray-600">Nothing noted.</p>
    )}
  </div>
);

const OpenResume = ({ filePath }: { filePath: string | null }) =>
  filePath ? (
    <a
      href={`${API_BASE_URL}/${filePath.replace(/^\//, '')}`}
      target="_blank"
      rel="noopener noreferrer"
      className={`inline-flex min-h-11 items-center self-start rounded-[10px] text-[0.9375rem] font-bold leading-6 text-neu-red underline-offset-4 hover:underline ${FOCUS}`}
    >
      Open resume
      <span className="sr-only"> (opens in a new tab)</span>
    </a>
  ) : null;

const Shell = ({ children }: { children: ReactNode }) => (
  <article className="flex h-full flex-col gap-3.5 rounded-2xl border border-gray-200 bg-white p-5 shadow-card">
    {children}
  </article>
);

function Header({ candidate, aside }: { candidate: ScreenedCandidate; aside: ReactNode }) {
  return (
    <header className="flex items-center gap-2.5">
      <Avatar name={candidate.name} muted={candidate.status !== 'done'} />
      <h3 className="min-w-0 flex-1 truncate text-base font-bold leading-6 text-gray-800">
        {candidate.name}
      </h3>
      {aside}
    </header>
  );
}

function PendingCard({ candidate }: { candidate: ScreenedCandidate }) {
  return (
    <Shell>
      <Header candidate={candidate} aside={<Chip kind="info">Screening</Chip>} />
      <div aria-hidden="true" className="flex flex-col gap-2 motion-safe:animate-pulse">
        <div className="h-2 rounded-full bg-gray-100" />
        <div className="h-3 w-11/12 rounded bg-gray-100" />
        <div className="h-3 w-3/4 rounded bg-gray-100" />
      </div>
      <p className="text-[0.8125rem] leading-5 text-gray-500">
        Still screening. This card fills in when it’s done.
      </p>
    </Shell>
  );
}

function FailedCard({ candidate }: { candidate: ScreenedCandidate }) {
  return (
    <Shell>
      <Header candidate={candidate} aside={<Chip kind="warning">Couldn’t screen</Chip>} />
      <p className="text-[0.8125rem] leading-5 text-gray-600">
        The screener couldn’t finish this resume. Read it yourself to decide.
      </p>
      <OpenResume filePath={candidate.filePath} />
    </Shell>
  );
}

function DoneCard({ candidate }: { candidate: ScreenedCandidate }) {
  const [open, setOpen] = useState(false);
  const notesId = useId();
  const score = Math.max(0, Math.min(100, Math.round(candidate.score ?? 0)));
  const found = candidate.matched_keywords.length;
  const total = found + candidate.missed_keywords.length;
  const summary = candidate.summary;

  return (
    <Shell>
      <Header
        candidate={candidate}
        aside={
          <p className="shrink-0 text-right">
            <span className="text-[1.75rem] font-bold leading-9 tracking-[-0.005em] text-gray-800 tabular-nums">
              {score}
            </span>
            <span className="text-[0.8125rem] leading-5 text-gray-500"> / 100</span>
          </p>
        }
      />

      <div className="flex flex-col gap-1.5">
        <div aria-hidden="true" className="h-2 overflow-hidden rounded-full bg-gray-100">
          <div className="h-full rounded-full bg-neu-red" style={{ width: `${score}%` }} />
        </div>
        <p className="text-[0.8125rem] leading-5 text-gray-500">
          {total === 0 ? 'No keywords set' : `${found} of ${total} keywords found`}
        </p>
      </div>

      <p className="text-[0.9375rem] leading-6 text-gray-600">
        {summary?.score_explanation ?? 'No AI notes for this resume.'}
      </p>

      <div className="flex flex-col gap-3">
        <KeywordGroup label="Found" words={candidate.matched_keywords} kind="success" />
        <KeywordGroup label="Missing" words={candidate.missed_keywords} kind="neutral" />
      </div>

      {summary && (
        <>
          <div className="h-px bg-gray-100" />
          <button
            type="button"
            aria-expanded={open}
            aria-controls={notesId}
            onClick={() => setOpen((value) => !value)}
            className={`-my-1.5 flex min-h-11 items-center justify-between rounded-[10px] text-left text-[0.9375rem] font-medium leading-6 text-gray-600 hover:text-neu-red ${FOCUS}`}
          >
            {open ? 'Hide line-by-line notes' : 'Show line-by-line notes'}
            <svg
              viewBox="0 0 16 16"
              className={`h-4 w-4 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
              fill="none"
              aria-hidden="true"
            >
              <path
                d="M4 6l4 4 4-4"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
          <div
            id={notesId}
            className={`${open ? 'flex' : 'hidden'} flex-col gap-4 rounded-xl bg-gray-50 p-3`}
          >
            <NoteList label="What fits" items={summary.strengths} marker="fit" />
            <NoteList label="What’s missing" items={summary.gaps} marker="gap" />
          </div>
        </>
      )}

      <OpenResume filePath={candidate.filePath} />
    </Shell>
  );
}

const ScreenerCard = ({ candidate }: { candidate: ScreenedCandidate }) => {
  if (candidate.status === 'pending') return <PendingCard candidate={candidate} />;
  if (candidate.status === 'failed') return <FailedCard candidate={candidate} />;
  return <DoneCard candidate={candidate} />;
};

export default ScreenerCard;
