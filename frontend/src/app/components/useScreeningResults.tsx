'use client';

import { useCallback, useEffect, useState } from 'react';
import { API_BASE_URL } from '../../lib/api';
import type { ScreeningResult, User } from '../../types';

/** One resume's result with the candidate it belongs to, as a card shows it. */
export interface ScreenedCandidate extends ScreeningResult {
  name: string;
  filePath: string | null;
}

// `forbidden` the API refused this group (403 or 401), `failed` any other
// error status, `network` a request threw.
export type ScreeningLoadError = 'forbidden' | 'failed' | 'network';

// The worker screens about ten resumes a minute, so a pending card is worth
// checking again on this cadence rather than waiting for a socket event.
export const SCREENING_POLL_MS = 15_000;

interface ResumeRow {
  id: number;
  file_path?: string | null;
  first_name?: string | null;
  last_name?: string | null;
}

/** Results joined to the class's resumes; a resume with no name reads as its number. */
export function joinCandidates(
  results: readonly ScreeningResult[],
  resumes: readonly ResumeRow[]
): ScreenedCandidate[] {
  const byId = new Map(resumes.map((resume) => [resume.id, resume]));
  return results.map((result) => {
    const resume = byId.get(result.resume_id);
    const name = [resume?.first_name, resume?.last_name].filter(Boolean).join(' ').trim();
    return {
      ...result,
      name: name || `Resume ${result.resume_id}`,
      filePath: resume?.file_path ?? null,
    };
  });
}

const STATUS_ORDER = { done: 0, pending: 1, failed: 2 } as const;

/** Screened resumes first, highest score first, then those still screening, then failures. */
export function orderForScreen(candidates: readonly ScreenedCandidate[]): ScreenedCandidate[] {
  return [...candidates].sort(
    (a, b) =>
      STATUS_ORDER[a.status] - STATUS_ORDER[b.status] ||
      (b.score ?? -1) - (a.score ?? -1) ||
      a.name.localeCompare(b.name)
  );
}

/** A group's screening results for its posting, with each candidate's name. */
export async function loadScreening(
  classId: number,
  groupId: number,
  jobId: number
): Promise<{ candidates: ScreenedCandidate[] | null; error: ScreeningLoadError | null }> {
  try {
    const [resultsResponse, resumesResponse] = await Promise.all([
      fetch(`${API_BASE_URL}/screening/${classId}/${groupId}/jobs/${jobId}`, {
        credentials: 'include',
      }),
      fetch(`${API_BASE_URL}/resume_pdf?class_id=${classId}`, { credentials: 'include' }),
    ]);
    if (resultsResponse.status === 401 || resultsResponse.status === 403) {
      return { candidates: null, error: 'forbidden' };
    }
    if (!resultsResponse.ok) return { candidates: null, error: 'failed' };

    const results: ScreeningResult[] = await resultsResponse.json();
    // Names are a nicety: without them the cards still show every result.
    const resumes: ResumeRow[] = resumesResponse.ok ? await resumesResponse.json() : [];
    return {
      candidates: joinCandidates(results, Array.isArray(resumes) ? resumes : []),
      error: null,
    };
  } catch (err) {
    console.error('Error loading screening results:', err);
    return { candidates: null, error: 'network' };
  }
}

export const useScreeningResults = (
  user: Pick<User, 'group_id' | 'class'> | null,
  jobId: number | null
) => {
  const [candidates, setCandidates] = useState<ScreenedCandidate[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ScreeningLoadError | null>(null);

  const groupId = user?.group_id;
  const classId = user?.class;

  const refetch = useCallback(async () => {
    // Nothing to ask for yet; the page shows why from the user and job state.
    if (!groupId || !classId || !jobId) {
      setLoading(false);
      return;
    }
    const result = await loadScreening(classId, groupId, jobId);
    // A failed poll keeps the cards already on screen.
    if (result.candidates) setCandidates(result.candidates);
    setError(result.error);
    setLoading(false);
  }, [groupId, classId, jobId]);

  useEffect(() => {
    setLoading(true);
    refetch();
  }, [refetch]);

  // Keep checking while a resume is still screening, and while there are no
  // rows yet: they appear once the professor sets the posting's keywords.
  const keepChecking =
    candidates !== null &&
    (candidates.length === 0 || candidates.some((candidate) => candidate.status === 'pending'));
  useEffect(() => {
    if (!keepChecking) return;
    const timer = setInterval(refetch, SCREENING_POLL_MS);
    return () => clearInterval(timer);
  }, [keepChecking, refetch]);

  return { candidates, loading, error, refetch };
};
