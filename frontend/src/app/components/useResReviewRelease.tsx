'use client';

import { useEffect, useState } from 'react';
import { API_BASE_URL } from '../../lib/api';
import { useSocket } from './socketContext';
import type { BarrierStatus, User } from '../../types';

const POLL_MS = 5000;

// Whether the student's group has been released from the resume-review barrier.
// The release arrives as one socket event, and a socket that stays connected can
// still miss it, which left the student waiting until they refreshed. So while
// `waiting`, also ask the barrier over HTTP.
export const useResReviewRelease = (user: User | null, waiting: boolean): boolean => {
  const socket = useSocket();
  const [released, setReleased] = useState(false);

  useEffect(() => {
    if (!socket) return;

    const handleGroupCompletedResReview = () => {
      setReleased(true);
    };

    socket.on('groupCompletedResReview', handleGroupCompletedResReview);

    return () => {
      socket.off('groupCompletedResReview', handleGroupCompletedResReview);
    };
  }, [socket]);

  const groupId = user?.group_id;
  const classId = user?.class;

  useEffect(() => {
    if (!waiting || released || !groupId || !classId) return;

    const checkBarrier = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/groups/barrier-status/${classId}/${groupId}`, {
          credentials: 'include',
        });
        if (!res.ok) return;
        const status: BarrierStatus = await res.json();
        if (status.released) setReleased(true);
      } catch {
        // The next tick asks again, and the waiting screen is already showing.
      }
    };

    void checkBarrier();
    const timer = setInterval(checkBarrier, POLL_MS);
    return () => clearInterval(timer);
  }, [waiting, released, groupId, classId]);

  return released;
};
