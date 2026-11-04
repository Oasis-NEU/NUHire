'use client';

import { useEffect, useState } from 'react';
import type { Socket } from 'socket.io-client';
import { useBarrierReleased } from './useBarrierReleased';

// Whether the teacher has let this group make its offer without every member
// confirming (POST /groups/release-offer-gate). Heard as offerGateReleased, and
// polled from the offer barrier while `enabled` in case the socket was down
// when it was sent.
export const useOfferGateReleased = (
  socket: Socket | null,
  classId: number | null | undefined,
  groupId: number | null | undefined,
  enabled: boolean
): boolean => {
  const [heard, setHeard] = useState(false);
  const polled = useBarrierReleased('offer', classId, groupId, enabled && !heard);

  useEffect(() => {
    if (!socket) return;
    const handleReleased = (payload: { groupId: number; classId: number }) => {
      if (payload.groupId === groupId && payload.classId === classId) setHeard(true);
    };
    socket.on('offerGateReleased', handleReleased);
    return () => {
      socket.off('offerGateReleased', handleReleased);
    };
  }, [socket, classId, groupId]);

  return heard || polled;
};
