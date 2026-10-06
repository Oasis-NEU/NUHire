'use client';
export const dynamic = 'force-dynamic';
const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL;
import React, { useEffect, useState } from 'react';
import NavbarAdmin from '../components/navbar-admin';
import Popup from '../components/popup';
import { useAuth } from '../components/AuthContext';
import { useSocket } from '../components/socketContext';
import { STEP_LABEL, STEP_ORDER } from '../components/useProgress';
import type { ClassInfo, LiveStudent, Step } from '../../types';

// The gates saved server-side. Offer confirmations live only in the browser.
const GATE_FIELD: Partial<Record<Step, 'review_completed_at' | 'confirmed_at'>> = {
  res_1: 'review_completed_at',
  res_2: 'confirmed_at',
};

const LiveClass = () => {
  const { user, loading: userloading } = useAuth();
  const socket = useSocket();
  const [classes, setClasses] = useState<ClassInfo[]>([]);
  const [selectedClass, setSelectedClass] = useState('');
  const [students, setStudents] = useState<LiveStudent[]>([]);
  const [groupSteps, setGroupSteps] = useState<Record<number, Step>>({});
  const [refreshKey, setRefreshKey] = useState(0);
  const [unstickGroup, setUnstickGroup] = useState<number | null>(null);
  const [unsticking, setUnsticking] = useState(false);
  const [popup, setPopup] = useState<{ headline: string; message: string } | null>(null);

  useEffect(() => {
    if (!user?.email) return;

    const fetchClasses = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/moderator/classes-full/${user.email}`, {
          credentials: 'include',
        });
        if (response.ok) {
          setClasses(await response.json());
        }
      } catch (error) {
        console.error('Error fetching classes:', error);
      }
    };

    fetchClasses();
  }, [user?.email]);

  // Polled as well as refreshed over the socket, so a dropped socket cannot leave the page stale.
  useEffect(() => {
    if (!selectedClass) return;
    let cancelled = false;

    const fetchLiveClass = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/groups/live/${selectedClass}`, {
          credentials: 'include',
        });
        if (!response.ok) return;
        const data: LiveStudent[] = await response.json();

        const groupIds = [...new Set(data.map((student) => student.group_id))];
        const steps = await Promise.all(
          groupIds.map(async (groupId) => {
            const progressResponse = await fetch(
              `${API_BASE_URL}/groups/getProgress/${selectedClass}/${groupId}`,
              { credentials: 'include' }
            );
            const { progress }: { progress: Step } = await progressResponse.json();
            return [groupId, progress] as const;
          })
        );

        if (cancelled) return;
        setStudents(data);
        setGroupSteps(Object.fromEntries(steps));
      } catch (error) {
        console.error('Error fetching live class:', error);
      }
    };

    fetchLiveClass();
    const timer = setInterval(fetchLiveClass, 10000);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [selectedClass, refreshKey]);

  // Re-join on every connect; a reconnected socket is in no rooms.
  useEffect(() => {
    if (!socket || !user?.email) return;

    const joinAdminRoom = () => socket.emit('adminOnline', { adminEmail: user.email });
    const handleProgressUpdated = () => setRefreshKey((key) => key + 1);

    if (socket.connected) joinAdminRoom();
    socket.on('connect', joinAdminRoom);
    socket.on('progressUpdated', handleProgressUpdated);

    return () => {
      socket.off('connect', joinAdminRoom);
      socket.off('progressUpdated', handleProgressUpdated);
    };
  }, [socket, user?.email]);

  const studentName = (student: LiveStudent) =>
    [student.f_name, student.l_name].filter(Boolean).join(' ') || student.email;

  const nextStep = (groupId: number) =>
    STEP_ORDER[STEP_ORDER.indexOf(groupSteps[groupId]) + 1] as Step | undefined;

  const waitingOn = (groupId: number) => {
    const gateField = GATE_FIELD[groupSteps[groupId]];
    return gateField
      ? students.filter((student) => student.group_id === groupId && student[gateField] === null)
      : [];
  };

  const handleUnstick = async () => {
    const targetStep = unstickGroup === null ? undefined : nextStep(unstickGroup);
    if (unstickGroup === null || !targetStep) return;

    setUnsticking(true);
    try {
      const response = await fetch(`${API_BASE_URL}/groups/force-advance`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          class_id: selectedClass,
          group_id: unstickGroup,
          target_step: targetStep,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (response.ok) {
        setPopup({
          headline: 'Success',
          message: `Group ${unstickGroup} moved to ${STEP_LABEL[targetStep]}.`,
        });
      } else {
        setPopup({ headline: 'Error', message: data.error || 'Failed to unstick group.' });
      }
    } catch (error) {
      console.error('Error unsticking group:', error);
      setPopup({ headline: 'Error', message: 'Failed to unstick group.' });
    } finally {
      setUnsticking(false);
      setUnstickGroup(null);
      setRefreshKey((key) => key + 1);
    }
  };

  if (userloading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-sand">
        <div className="text-center">
          <h2 className="text-2xl font-bold mb-4">Loading...</h2>
          <div className="w-16 h-16 border-t-4 border-navy border-solid rounded-full animate-spin mx-auto"></div>
        </div>
      </div>
    );
  }

  if (!user || user.affiliation !== 'admin') {
    return <div>This account is not authorized for this page</div>;
  }

  const groupIds = [...new Set(students.map((student) => student.group_id))];

  return (
    <div className="flex flex-col min-h-screen bg-sand font-rubik">
      <NavbarAdmin />
      <div className="flex justify-center items-center py-6">
        <h1 className="text-4xl font-bold text-northeasternBlack text-center drop-shadow-lg">
          Live Class
        </h1>
      </div>

      <div className="flex-1 p-6">
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">Select Class:</label>
          <select
            value={selectedClass}
            onChange={(e) => {
              setSelectedClass(e.target.value);
              setStudents([]);
              setGroupSteps({});
            }}
            className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="">Choose a class...</option>
            {classes.map((cls) => (
              <option key={cls.crn} value={cls.crn}>
                {cls.class_name} (CRN: {cls.crn})
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {groupIds.map((groupId) => {
            const members = students.filter((student) => student.group_id === groupId);
            const waiting = waitingOn(groupId);
            const next = nextStep(groupId);

            return (
              <div
                key={groupId}
                className={`bg-white rounded-lg shadow-sm p-6 flex flex-col ${waiting.length > 0 ? 'border-4 border-yellow-500' : 'border border-gray-200'}`}
              >
                <h3 className="text-lg font-semibold text-gray-900">Group {groupId}</h3>
                <p className="text-sm text-gray-600 mb-4">
                  {STEP_LABEL[groupSteps[groupId] ?? 'none']}
                </p>

                {waiting.length > 0 && (
                  <p className="text-sm text-yellow-800 mb-4">
                    Waiting on: {waiting.map(studentName).join(', ')}
                  </p>
                )}

                <ul className="flex-1 mb-4">
                  {members.map((member) => (
                    <li key={member.id} className="flex items-center gap-2 py-1 text-sm">
                      <span
                        className={`w-2.5 h-2.5 rounded-full ${member.online ? 'bg-green-500' : 'bg-gray-300'}`}
                        title={member.online ? 'Online' : 'Offline'}
                      />
                      <span>{studentName(member)}</span>
                      <span className="ml-auto text-gray-500">
                        {STEP_LABEL[member.step ?? 'none']}
                      </span>
                    </li>
                  ))}
                </ul>

                <button
                  onClick={() => setUnstickGroup(groupId)}
                  disabled={members[0].started !== 1 || !next}
                  className="px-4 py-2 rounded-lg font-medium transition-colors bg-red-600 text-white hover:bg-white hover:text-red-600 border-2 border-red-600 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {next ? `Unstick → ${STEP_LABEL[next]}` : 'At the last step'}
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {unstickGroup !== null && (
        <Popup
          headline={`Unstick Group ${unstickGroup}?`}
          message={`Everyone in the group is marked done with ${STEP_LABEL[groupSteps[unstickGroup] ?? 'none']} and moved on. No work is deleted.${
            waitingOn(unstickGroup).length > 0
              ? ` Not finished yet: ${waitingOn(unstickGroup).map(studentName).join(', ')}.`
              : ''
          }`}
          onDismiss={() => setUnstickGroup(null)}
          onConfirm={handleUnstick}
          confirmLabel={unsticking ? 'Moving...' : 'Unstick'}
          busy={unsticking}
        />
      )}

      {popup && (
        <Popup headline={popup.headline} message={popup.message} onDismiss={() => setPopup(null)} />
      )}
    </div>
  );
};

export default LiveClass;
