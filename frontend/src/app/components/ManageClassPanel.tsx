'use client';
import React from 'react';
import { useRouter } from 'next/navigation';
import Tabs from './tabs';
import { Button } from './button';
import { Card } from './card';
import type { ClassOverview, Student } from '../../types';

export const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

const fullName = (s: Student) => [s.f_name, s.l_name].filter(Boolean).join(' ') || s.email;

interface RetryProps {
  onRetry: () => void;
  refreshing: boolean;
}

function Unavailable({ what, onRetry, refreshing }: RetryProps & { what: string }) {
  return (
    <div className="flex flex-col items-center gap-3 py-8 text-center">
      <p className="text-black">{what} could not be loaded.</p>
      <Button size="sm" busy={refreshing} onClick={onRetry}>
        Retry
      </Button>
    </div>
  );
}

function GroupTile({
  title,
  students,
  dashed,
}: {
  title: string;
  students: Student[];
  dashed?: boolean;
}) {
  const shown = students.slice(0, 3);
  return (
    <div
      className={`p-4 rounded-xl border ${dashed ? 'border-dashed border-gray2' : 'border-gray1'}`}
    >
      <p className="font-semibold text-black">
        {title} · {students.length}
      </p>
      {students.length === 0 ? (
        <p className="text-sm text-gray3">No students yet</p>
      ) : (
        <ul className="text-sm text-gray4">
          {shown.map((s) => (
            <li key={s.id} className="truncate">
              {fullName(s)}
            </li>
          ))}
          {students.length > shown.length && <li>+{students.length - shown.length} more</li>}
        </ul>
      )}
    </div>
  );
}

function StudentsAndGroups({
  overview,
  onRetry,
  refreshing,
}: RetryProps & { overview: ClassOverview }) {
  const router = useRouter();
  const { students, groups } = overview;
  if (!students || !groups)
    return <Unavailable what="The roster" onRetry={onRetry} refreshing={refreshing} />;

  const byName = (a: Student, b: Student) => (a.f_name || '').localeCompare(b.f_name || '');
  const unassigned = students.filter((s) => s.group_id === null).sort(byName);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-4">
        <p className="text-gray4">
          {plural(students.length, 'student')} · {plural(groups.length, 'group')} ·{' '}
          {unassigned.length} unassigned
        </p>
        <Button size="sm" variant="secondary" onClick={() => router.push('/grouping')}>
          Edit groups
        </Button>
      </div>
      {groups.length === 0 && unassigned.length === 0 ? (
        <p className="py-6 text-center text-gray3">No groups yet.</p>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {groups.map((id) => (
            <GroupTile
              key={id}
              title={`Group ${id}`}
              students={students.filter((s) => s.group_id === id).sort(byName)}
            />
          ))}
          {unassigned.length > 0 && <GroupTile title="Unassigned" students={unassigned} dashed />}
        </div>
      )}
    </div>
  );
}

function JobsAndResumes({
  overview,
  onRetry,
  refreshing,
}: RetryProps & { overview: ClassOverview }) {
  const router = useRouter();
  const { jobs, resumes } = overview;
  if (!jobs || !resumes)
    return <Unavailable what="Jobs and résumés" onRetry={onRetry} refreshing={refreshing} />;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-4">
        <p className="text-gray4">
          {plural(jobs.length, 'job')} · {plural(resumes.length, 'résumé')} in this class
        </p>
        <Button size="sm" variant="secondary" onClick={() => router.push('/new-pdf')}>
          Manage jobs &amp; résumés
        </Button>
      </div>
      {jobs.length === 0 ? (
        <p className="py-6 text-center text-gray3">No jobs yet.</p>
      ) : (
        <ul className="divide-y divide-gray1 border-y border-gray1">
          {jobs.map((job) => (
            <li key={job.id} className="py-3 font-semibold text-black">
              {job.title}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function SettingRow({
  label,
  detail,
  action,
}: {
  label: string;
  detail: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <div>
        <p className="font-semibold text-black">{label}</p>
        <p className="text-sm text-gray3">{detail}</p>
      </div>
      {action}
    </div>
  );
}

export function ManageClassPanel({
  overview,
  onRetry,
  refreshing,
}: RetryProps & { overview: ClassOverview }) {
  const router = useRouter();
  return (
    <Card id="manage-class" className="mt-6 p-6 border border-gray1">
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <p className="text-sm text-gray3">Managing</p>
          <h2 className="text-2xl font-semibold text-black">Class {overview.crn}</h2>
        </div>
        <Button size="sm" onClick={() => router.push(`/live-class?class=${overview.crn}`)}>
          Open live view
        </Button>
      </div>
      <Tabs>
        <div title="Students & groups">
          <StudentsAndGroups overview={overview} onRetry={onRetry} refreshing={refreshing} />
        </div>
        <div title="Sessions">
          <p className="text-gray4">Set up sessions ahead of time, then start one during class.</p>
          <p className="py-6 text-center text-gray3">No sessions yet.</p>
        </div>
        <div title="Jobs & résumés">
          <JobsAndResumes overview={overview} onRetry={onRetry} refreshing={refreshing} />
        </div>
        <div title="Settings">
          <div className="divide-y divide-gray1 border-y border-gray1">
            <SettingRow label="Class number" detail={`CRN ${overview.crn}`} />
            <SettingRow
              label="Waiting facts"
              detail="What students read while they wait for their group"
              action={
                <Button size="sm" variant="secondary" onClick={() => router.push('/adminFacts')}>
                  Edit facts
                </Button>
              }
            />
          </div>
        </div>
      </Tabs>
    </Card>
  );
}
