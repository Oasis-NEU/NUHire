'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import type { Socket } from 'socket.io-client';
import type { ClassBoard, ClassInfo, Group, User } from '../../../types';
import { API_BASE_URL } from '../../../lib/api';
import { trailingThrottle } from '../../../lib/throttle';
import { fetchGroupJob, loadBoard } from './loadBoard';

// A reload is about three requests per group, and a class signing in sends one
// userAdded per student, so roster events reload the board at most this often.
const ROSTER_REFRESH_MS = 1500;

const EMPTY_BOARD: ClassBoard = { students: [], groupIds: [], groups: [] };

const sameIds = (a: number[], b: number[]) =>
  a.length === b.length && a.every((id, i) => id === b[i]);

// The teacher panel's class, roster and group data: what the class picker
// selects and what the group cards are drawn from.
export function useClassGroups(
  socket: Socket | null,
  user: User | null,
  setPopup: (popup: { headline: string; message: string } | null) => void
) {
  const [selectedClass, setSelectedClass] = useState<string>('');
  const [classes, setClasses] = useState<ClassInfo[]>([]);
  const [board, setBoard] = useState<ClassBoard>(EMPTY_BOARD);
  // Only a class's first load shows the spinner; later reloads keep the cards up.
  const [isLoadingGroups, setIsLoadingGroups] = useState(false);
  // Reloads overlap. Each takes a number, and once one has drawn the board an
  // older one still in flight is dropped, so the board never goes back in time.
  const loadSeq = useRef(0);
  const drawnLoad = useRef(0);

  // Changes only the cards: live progress below, and ManageGroupsTab marking
  // groups started before the next reload confirms it.
  const setGroups = useCallback(
    (update: (groups: Group[]) => Group[]) =>
      setBoard((prev) => ({ ...prev, groups: update(prev.groups) })),
    []
  );

  const refreshGroupsAndStudents = useCallback(async () => {
    if (!selectedClass) return;
    const loadId = ++loadSeq.current;

    try {
      const next = await loadBoard(selectedClass);
      if (loadId <= drawnLoad.current) return;
      drawnLoad.current = loadId;

      // A new array with the same ids would make useOffers refetch every offer.
      setBoard((prev) => ({
        ...next,
        groupIds: sameIds(prev.groupIds, next.groupIds) ? prev.groupIds : next.groupIds,
      }));
      setIsLoadingGroups(false);
    } catch (error) {
      console.error('Error loading groups and students:', error);
      if (loadId === loadSeq.current) setIsLoadingGroups(false);
    }
  }, [selectedClass]);

  // The callback changes with the class, so this loads each newly picked class.
  useEffect(() => {
    refreshGroupsAndStudents();
  }, [refreshGroupsAndStudents]);

  useEffect(() => {
    if (!socket) return;

    // A socket that dropped missed every roster change while it was down, so
    // reload the roster when it reconnects as well as when a student joins.
    const rosterChanged = trailingThrottle(() => refreshGroupsAndStudents(), ROSTER_REFRESH_MS);

    socket.on('userAdded', rosterChanged.trigger);
    socket.on('connect', rosterChanged.trigger);

    return () => {
      rosterChanged.cancel();
      socket.off('userAdded', rosterChanged.trigger);
      socket.off('connect', rosterChanged.trigger);
    };
  }, [socket, refreshGroupsAndStudents]);

  useEffect(() => {
    if (!socket || !selectedClass) return;

    const handleProgressUpdated = async (data: {
      crn: string;
      group_id: number;
      step: string;
      email: string;
    }) => {
      if (data.crn.toString() !== selectedClass) return;

      try {
        const jobAssignment = await fetchGroupJob(selectedClass, data.group_id);
        setGroups((prevGroups) =>
          prevGroups.map((group) =>
            group.group_id === data.group_id
              ? { ...group, progress: data.step, jobAssignment }
              : group
          )
        );
      } catch (error) {
        console.error('Error refreshing progress:', error);
      }
    };

    socket.on('progressUpdated', handleProgressUpdated);

    return () => {
      socket.off('progressUpdated', handleProgressUpdated);
    };
  }, [socket, selectedClass, setGroups]);

  useEffect(() => {
    const fetchClasses = async () => {
      if (!user?.email) return;

      try {
        const response = await fetch(`${API_BASE_URL}/moderator/classes-full/${user.email}`, {
          credentials: 'include',
        });

        if (response.ok) {
          const classData = await response.json();
          setClasses(classData);
        }
      } catch (error) {
        console.error('Error fetching classes:', error);
      }
    };

    fetchClasses();
  }, [user]);

  const handleClassChange = (classId: string) => {
    const hasAccess = classes.some((cls) => cls.crn.toString() === classId);

    if (!hasAccess && classId !== '') {
      setPopup({
        headline: 'Access Denied',
        message: 'You do not have permission to manage this class.',
      });
      return;
    }

    // A reload still running for the old class must not paint its cards here.
    drawnLoad.current = ++loadSeq.current;
    setIsLoadingGroups(classId !== '');
    setBoard(EMPTY_BOARD);
    setSelectedClass(classId);
  };

  return {
    selectedClass,
    classes,
    groups: board.groups,
    setGroups,
    students: board.students,
    availableGroups: board.groupIds,
    isLoadingGroups,
    refreshGroupsAndStudents,
    handleClassChange,
  };
}
