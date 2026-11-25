'use client';

import type { ReactNode } from 'react';
import Navbar from '../components/navbar';
import Chip from '../components/chip';
import ScreenerCard from '../components/screenerCard';
import { useAuth } from '../components/AuthContext';
import { useJobDescription } from '../components/useJobDescription';
import { useProgress } from '../components/useProgress';
import { orderForScreen, useScreeningResults } from '../components/useScreeningResults';

// Not a step: opened in its own tab from the navbar, from the group review on.
// useProgress sends a student who has not reached it back to their step.

const FOCUS =
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neu-red';

function Notice({
  title,
  chip,
  children,
  action,
}: {
  title: string;
  chip?: ReactNode;
  children: ReactNode;
  action?: { label: string; onClick: () => void };
}) {
  return (
    <section className="flex max-w-[560px] flex-col gap-3.5 rounded-2xl border border-gray-200 bg-white p-6 shadow-card">
      <div className="flex items-center gap-2">
        <h2 className="flex-1 text-base font-bold leading-6 text-gray-800">{title}</h2>
        {chip}
      </div>
      <p className="text-[0.8125rem] leading-5 text-gray-600">{children}</p>
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          className={`min-h-11 self-start rounded-[10px] border border-neu-red bg-white px-5 py-2.5 text-[0.9375rem] font-bold leading-6 text-neu-red hover:bg-red-50 ${FOCUS}`}
        >
          {action.label}
        </button>
      )}
    </section>
  );
}

function LoadingCards() {
  return (
    <div aria-busy="true" className="grid gap-4 md:grid-cols-2">
      <p className="sr-only" role="status">
        Loading screener results
      </p>
      {[0, 1, 2, 3].map((n) => (
        <div
          key={n}
          aria-hidden="true"
          className="flex flex-col gap-3.5 rounded-2xl border border-gray-200 bg-white p-5 shadow-card motion-safe:animate-pulse"
        >
          <div className="flex items-center gap-2.5">
            <div className="h-10 w-10 rounded-full bg-gray-100" />
            <div className="h-4 w-1/3 rounded bg-gray-100" />
          </div>
          <div className="h-2 rounded-full bg-gray-100" />
          <div className="h-3 w-11/12 rounded bg-gray-100" />
          <div className="h-3 w-2/3 rounded bg-gray-100" />
        </div>
      ))}
    </div>
  );
}

const Screener = () => {
  useProgress();
  const { user, loading: authLoading } = useAuth();
  const {
    job,
    loading: jobLoading,
    error: jobError,
    refetch: refetchJob,
  } = useJobDescription(user);
  const { candidates, loading, error, refetch } = useScreeningResults(user, job?.id ?? null);

  const screened = candidates?.filter((c) => c.status !== 'pending').length ?? 0;
  const total = candidates?.length ?? 0;
  const subtitle = [job?.title, user?.group_id ? `Group ${user.group_id}` : null]
    .filter(Boolean)
    .join(' · ');

  let body: ReactNode;
  if (authLoading || jobLoading || (job?.id && loading && !candidates)) {
    body = <LoadingCards />;
  } else if (!user?.group_id || !user.class) {
    body = (
      <Notice title="You’re not in a group yet">
        Screener results belong to a group. They show up here once your professor puts you in one.
      </Notice>
    );
  } else if (jobError === 'none') {
    body = (
      <Notice title="Your group doesn’t have a job yet">
        The screener scores resumes against your group’s job. Results show up here once your
        professor assigns one.
      </Notice>
    );
  } else if (jobError || !job?.id) {
    body = (
      <Notice
        title="Couldn’t load your group’s job"
        chip={<Chip kind="warning">Couldn’t load</Chip>}
        action={{ label: 'Try again', onClick: refetchJob }}
      >
        Check your connection and try again. Your work in the activity is not affected.
      </Notice>
    );
  } else if (error === 'forbidden') {
    body = (
      <Notice title="These results aren’t available to you">
        You can only see your own group’s screener results. If you just changed groups, reload the
        page.
      </Notice>
    );
  } else if (!candidates) {
    body = (
      <Notice
        title="Couldn’t load the screener results"
        chip={<Chip kind="warning">Couldn’t load</Chip>}
        action={{ label: 'Try again', onClick: refetch }}
      >
        Check your connection and try again. Your work in the activity is not affected.
      </Notice>
    );
  } else if (candidates.length === 0) {
    body = (
      <Notice title="No screener results yet">
        Results appear once your professor sets the keywords for {job.title}. This page checks again
        on its own.
      </Notice>
    );
  } else {
    body = (
      <>
        {error && (
          <p role="status" className="text-[0.8125rem] leading-5 text-warning-700">
            Couldn’t refresh just now. These are the last results loaded.{' '}
            <button
              type="button"
              onClick={refetch}
              className={`font-bold underline underline-offset-4 ${FOCUS}`}
            >
              Try again
            </button>
          </p>
        )}
        <ul className="grid gap-4 md:grid-cols-2">
          {orderForScreen(candidates).map((candidate) => (
            <li key={candidate.resume_id} className="h-full">
              <ScreenerCard candidate={candidate} />
            </li>
          ))}
        </ul>
      </>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 selection:bg-red-100 selection:text-gray-800">
      <Navbar />
      <main className="mx-auto flex w-full max-w-[1200px] flex-col gap-5 px-4 py-6 sm:px-6 sm:py-9">
        <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex flex-col gap-1.5">
            <h1 className="text-[1.75rem] font-bold leading-9 tracking-[-0.01em] text-gray-800 sm:text-[2.5rem] sm:leading-[3rem]">
              Screener results
            </h1>
            {subtitle && <p className="text-[0.9375rem] leading-6 text-gray-500">{subtitle}</p>}
          </div>
          {total > 0 && (
            <div className="sm:pb-1" aria-live="polite">
              {screened < total ? (
                <Chip kind="info">
                  Screening · {screened} of {total} done
                </Chip>
              ) : (
                <Chip kind="success">All {total} screened</Chip>
              )}
            </div>
          )}
        </header>
        <p className="max-w-[70ch] text-[0.8125rem] leading-5 text-gray-500">
          Each score is the share of your job’s keywords found in that resume. AI wrote the notes
          from the resume text, so they can be wrong. Check the resume before you rely on them.
        </p>
        {body}
      </main>
    </div>
  );
};

export default Screener;
