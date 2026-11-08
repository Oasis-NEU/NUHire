'use client';

import { useEffect, useState } from 'react';
import { useSocket } from './socketContext';

// Whether the student's group has been released from the resume-review barrier.
export const useResReviewRelease = (): boolean => {
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

  return released;
};
