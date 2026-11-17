'use client';
export const dynamic = 'force-dynamic';
import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import NavbarAdmin from '../components/navbar-admin';
import { useSocket } from '../components/socketContext';
import { useAuth } from '../components/AuthContext';
import { PageLoader, Spinner } from '../components/spinner';
import { Button } from '../components/button';
import { Card } from '../components/card';
import { useModeratorClasses } from '../components/useModeratorClasses';
import { ManageClassPanel, plural } from '../components/ManageClassPanel';
import type { ClassOverview } from '../../types';

const count = (list: unknown[] | null, word: string) =>
  list ? plural(list.length, word) : `— ${word}s`;

function ClassCard({
  overview,
  selected,
  onManage,
}: {
  overview: ClassOverview;
  selected: boolean;
  onManage: () => void;
}) {
  const router = useRouter();
  return (
    <Card
      tone={selected ? 'highlighted' : 'default'}
      aria-current={selected ? 'true' : undefined}
      className={`flex flex-col gap-4 p-6 ${selected ? '' : 'border border-gray1'}`}
    >
      <div className="flex items-center justify-between">
        <span className="px-2.5 py-0.5 rounded-full bg-gray0 border border-gray1 text-xs text-gray4">
          No session
        </span>
        <span className="px-2.5 py-0.5 rounded-full bg-gray0 border border-gray1 text-xs text-gray4">
          CRN {overview.crn}
        </span>
      </div>
      <div>
        <h2 className="text-xl font-semibold text-black">Class {overview.crn}</h2>
        <p className="text-sm text-gray3">
          {count(overview.students, 'student')} · {count(overview.groups, 'group')}
        </p>
      </div>
      <div className="flex flex-col gap-2">
        <Button
          size="sm"
          className="w-full"
          onClick={() => router.push(`/live-class?class=${overview.crn}`)}
        >
          Open live view
        </Button>
        <Button size="sm" variant="outline" className="w-full" onClick={onManage}>
          Manage class
        </Button>
      </div>
    </Card>
  );
}

const Dashboard = () => {
  const router = useRouter();
  const socket = useSocket();
  const { user, loading: userloading } = useAuth();
  const isAdmin = user?.affiliation === 'admin';
  const { classes, loading, error, retry } = useModeratorClasses(isAdmin ? user?.email : undefined);
  const [selectedCrn, setSelectedCrn] = useState<number | null>(null);
  const selected = classes.find((c) => c.crn === selectedCrn) ?? classes[0];

  const manage = (crn: number) => {
    setSelectedCrn(crn);
    document.getElementById('manage-class')?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (!socket || !user?.email) return;

    socket.emit('adminOnline', { adminEmail: user.email });

    return () => {
      socket.emit('adminOffline', { adminEmail: user.email });
    };
  }, [socket, user?.email]);

  useEffect(() => {
    if (!userloading && !isAdmin) router.push('/');
  }, [userloading, isAdmin, router]);

  if (userloading || !isAdmin) {
    return <PageLoader />;
  }

  return (
    <div className="min-h-screen bg-gray0 font-rubik">
      <NavbarAdmin />
      <main className="max-w-[1248px] mx-auto px-6 pt-10 pb-16">
        <h1 className="text-[40px] leading-[48px] font-bold text-black">Your classes</h1>
        <p className="mt-1.5 text-gray4">One live session per class. Past sessions are saved.</p>

        <section aria-label="Classes" className="mt-6">
          {loading && classes.length === 0 ? (
            <Card className="flex flex-col items-center gap-3 py-12 border border-gray1">
              <Spinner label="Loading your classes" />
              <p className="text-gray3">Loading your classes…</p>
            </Card>
          ) : error ? (
            <Card className="flex flex-col items-center gap-4 py-12 border border-gray1 text-center">
              <p className="text-black font-semibold">Your classes could not be loaded.</p>
              <p className="text-sm text-gray3">Check your connection and try again.</p>
              <Button size="sm" onClick={retry}>
                Retry
              </Button>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {classes.map((overview) => (
                <ClassCard
                  key={overview.crn}
                  overview={overview}
                  selected={overview.crn === selected?.crn}
                  onManage={() => manage(overview.crn)}
                />
              ))}
              <div className="flex flex-col items-center justify-center gap-1 p-6 min-h-[200px] rounded-2xl border-2 border-dashed border-gray1 text-center">
                <span className="text-2xl text-gray2" aria-hidden>
                  +
                </span>
                <p className="font-semibold text-gray3">
                  {classes.length === 0 ? 'No classes yet' : 'Add a class'}
                </p>
                <p className="text-sm text-gray3">A NUHire admin adds new classes for you.</p>
              </div>
            </div>
          )}
        </section>

        {!error && selected && (
          <ManageClassPanel overview={selected} onRetry={retry} refreshing={loading} />
        )}

        <Card className="mt-6 p-6 border border-gray1">
          <h2 className="text-lg font-semibold text-black">Past sessions</h2>
          <div className="mt-3 border-t border-gray1 pt-6 pb-2 text-center">
            <p className="text-gray3">No past sessions yet.</p>
            <p className="text-sm text-gray2">Finished sessions will be listed here.</p>
          </div>
        </Card>
      </main>
    </div>
  );
};

export default Dashboard;
