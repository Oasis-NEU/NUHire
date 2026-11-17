'use client';
import { useCallback, useEffect, useState } from 'react';
import { API_BASE_URL } from '../../lib/api';
import type { ClassOverview, JobOption, ResumePdf, Student } from '../../types';

async function listOf<T>(url: string): Promise<T[] | null> {
  try {
    const response = await fetch(url, { credentials: 'include' });
    if (!response.ok) return null;
    const rows: unknown = await response.json();
    return Array.isArray(rows) ? (rows as T[]) : null;
  } catch (error) {
    console.error(`Error loading ${url}:`, error);
    return null;
  }
}

// One failed list shows as unknown on its own class instead of failing the page.
export function useModeratorClasses(email: string | undefined) {
  const [classes, setClasses] = useState<ClassOverview[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  useEffect(() => {
    if (!email) return;
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError(false);
      try {
        const response = await fetch(
          `${API_BASE_URL}/moderator/classes-full/${encodeURIComponent(email)}`,
          { credentials: 'include' }
        );
        if (!response.ok) throw new Error(`classes-full ${response.status}`);
        const rows: { crn: number }[] = await response.json();

        const overviews = await Promise.all(
          rows.map(async ({ crn }) => {
            const [students, groups, jobs, resumes] = await Promise.all([
              listOf<Student>(`${API_BASE_URL}/groups/students-by-class/${crn}`),
              listOf<number>(`${API_BASE_URL}/groups?class=${crn}`),
              listOf<JobOption>(`${API_BASE_URL}/jobs?class_id=${crn}`),
              listOf<ResumePdf>(`${API_BASE_URL}/resume_pdf?class_id=${crn}`),
            ]);
            return {
              crn: Number(crn),
              students: students?.filter((s) => s.affiliation !== 'admin') ?? null,
              groups: groups?.map(Number) ?? null,
              jobs,
              resumes,
            };
          })
        );
        if (!cancelled) setClasses(overviews.sort((a, b) => a.crn - b.crn));
      } catch (err) {
        console.error('Error loading classes:', err);
        if (!cancelled) setError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [email, attempt]);

  return { classes, loading, error, retry };
}
