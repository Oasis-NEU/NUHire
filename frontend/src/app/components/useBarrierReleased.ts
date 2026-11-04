'use client';

import { useEffect, useState } from 'react';
import { API_BASE_URL } from '../../lib/api';
import type { BarrierStatus, Step } from '../../types';

const POLL_MS = 5000;

// Whether the group's barrier for `step` is open, asked over HTTP every few
// seconds while `enabled`. A release event is one emit at one instant, and a
// socket that is down then never sees it; this is how the page recovers
// without one (GET /groups/barrier-status).
export const useBarrierReleased = (
  step: Step,
  classId: number | null | undefined,
  groupId: number | null | undefined,
  enabled: boolean
): boolean => {
  const [released, setReleased] = useState(false);

  useEffect(() => {
    if (!enabled || released || !classId || !groupId) return;

    const check = async () => {
      try {
        const response = await fetch(
          `${API_BASE_URL}/groups/barrier-status/${classId}/${groupId}?step=${step}`,
          { credentials: 'include' }
        );
        if (!response.ok) return;
        const status = (await response.json()) as BarrierStatus;
        if (status.released) setReleased(true);
      } catch (error) {
        console.error(`Failed to read the ${step} barrier:`, error);
      }
    };

    check();
    const poll = setInterval(check, POLL_MS);
    return () => clearInterval(poll);
  }, [step, classId, groupId, enabled, released]);

  return released;
};
