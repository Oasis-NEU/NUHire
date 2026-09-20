import { useEffect } from 'react';

/**
 * Maps a Progress.step enum value to the route that renders it.
 *
 * These are three different vocabularies in this codebase (Progress.step,
 * Users.current_page, and route paths) and nothing else maps between them.
 * Until they are unified, this table is the one place that translates
 * step -> route. Do not inline a fourth version somewhere else.
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

const allowedRoutes: Record<string, string[]> = {
  '/jobdes': ['job_description', 'res_1', 'res_2', 'interview', 'offer', 'employer'],
  '/res-review': ['res_1', 'res_2', 'interview', 'offer', 'employer'],
  '/res-review-group': ['res_2', 'interview', 'offer', 'employer'],
  '/interview-stage': ['interview', 'offer', 'employer'],
  '/makeOffer': ['offer', 'employer'],
  '/employerPanel': ['employer'],
};

export const useProgress = () => {
  useEffect(() => {
    const progress = localStorage.getItem('progress') || 'none';
    const currentPath = window.location.pathname;

    if (!(currentPath in allowedRoutes)) return;
    if (allowedRoutes[currentPath].includes(progress)) return;

    // Previously this did `replace('/' + progress)`, which produced paths like
    // "/res_1" that are not routes, so the guard itself 404'd. Fall back to the
    // dashboard for any step we do not recognise.
    window.location.replace(STEP_TO_ROUTE[progress] ?? '/dashboard');
  }, []);
};
