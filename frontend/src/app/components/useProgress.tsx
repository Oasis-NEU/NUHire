'use client';

import { useEffect } from 'react';
import { useAuth } from './AuthContext';
import { useProgressManager } from './progress';

/**
 * Maps a Progress.step enum value to the route that renders it.
 *
 * These are three different vocabularies in this codebase (Progress.step,
 * Users.current_page, and route paths) and nothing else maps between them.
 * Until they are unified, this table is the one place that translates
 * step -> route. Do not inline a fourth version somewhere else.
 *
 * The API has its own copy, in api/src/controller/group.controller.ts, because
 * force-advance has to send a route path over the wire. Change both together.
 */
export const STEP_TO_ROUTE: Record<string, string> = {
  none: '/dashboard',
  job_description: '/jobdes',
  res_1: '/res-review',
  res_2: '/res-review-group',
  interview: '/interview-stage',
  offer: '/makeOffer',
  employer: '/employerPanel',
};

// The order a group walks the steps. Declared rather than derived from the keys
// above so that reordering that table for readability cannot silently change
// which step counts as "further along".
const STEP_ORDER = ['none', 'job_description', 'res_1', 'res_2', 'interview', 'offer', 'employer'];

const allowedRoutes: Record<string, string[]> = {
  '/jobdes': ['job_description', 'res_1', 'res_2', 'interview', 'offer', 'employer'],
  '/res-review': ['res_1', 'res_2', 'interview', 'offer', 'employer'],
  '/res-review-group': ['res_2', 'interview', 'offer', 'employer'],
  '/interview-stage': ['interview', 'offer', 'employer'],
  '/makeOffer': ['offer', 'employer'],
  '/employerPanel': ['employer'],
};

const furthestStep = (a: string, b: string): string =>
  STEP_ORDER.indexOf(b) > STEP_ORDER.indexOf(a) ? b : a;

export const useProgress = () => {
  const { user, loading } = useAuth();
  const { fetchProgress } = useProgressManager();

  useEffect(() => {
    const currentPath = window.location.pathname;
    if (!(currentPath in allowedRoutes)) return;

    // Nothing is decided until auth has resolved. This hook used to read
    // localStorage on mount and redirect immediately, which bounced a student
    // whose progress had not been cached on this device — a second browser, a
    // cleared cache — off the page their group was actually on.
    if (loading || !user) return;

    let cancelled = false;

    const check = async () => {
      const serverStep = await fetchProgress(user);
      if (cancelled) return;

      // fetchProgress returns 'none' both for "no Progress row yet" and for a
      // request that failed, so trusting it alone would throw a student to the
      // dashboard mid-activity over one bad response. Take whichever source is
      // further along: this guard exists to stop someone jumping AHEAD, and
      // over-trusting the cache at worst leaves them where they already are.
      const cachedStep = localStorage.getItem('progress') || 'none';
      const progress = furthestStep(serverStep, cachedStep);

      if (allowedRoutes[currentPath].includes(progress)) return;

      // Previously this did `replace('/' + progress)`, which produced paths
      // like "/res_1" that are not routes, so the guard itself 404'd. Fall back
      // to the dashboard for any step we do not recognise.
      window.location.replace(STEP_TO_ROUTE[progress] ?? '/dashboard');
    };

    check();

    return () => {
      cancelled = true;
    };
  }, [loading, user]);
};
