'use client';
import { useEffect, useState } from 'react';
import { API_BASE_URL } from '../../lib/api';
import type { ClassInfo, ClassOverview, JobOption, ResumePdf, Student } from '../../types';
import { useModeratorClassList } from './useModeratorClassList';

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

const overviewOf = async ({ crn }: ClassInfo): Promise<ClassOverview> => {
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
};

// One failed list shows as unknown on its own class instead of failing the page.
export function useModeratorClasses(email: string | undefined) {
  const list = useModeratorClassList(email);
  // Which class list these overviews were built from, so a new list reads as loading.
  const [loaded, setLoaded] = useState<{ from: ClassInfo[]; classes: ClassOverview[] } | null>(
    null
  );

  useEffect(() => {
    if (list.loading || list.error) return;
    let cancelled = false;
    Promise.all(list.classes.map(overviewOf)).then((overviews) => {
      if (!cancelled) {
        setLoaded({ from: list.classes, classes: overviews.sort((a, b) => a.crn - b.crn) });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [list.classes, list.loading, list.error]);

  return {
    classes: loaded?.classes ?? [],
    loading: list.loading || (!list.error && loaded?.from !== list.classes),
    error: list.error,
    retry: list.retry,
  };
}
