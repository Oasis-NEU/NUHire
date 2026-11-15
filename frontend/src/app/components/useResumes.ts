'use client';

import { useEffect, useState } from 'react';
import { API_BASE_URL } from '../../lib/api';
import type { ResumeListing } from '../../types';

export async function loadResumes(classId: number): Promise<ResumeListing[]> {
  const response = await fetch(`${API_BASE_URL}/resume_pdf?class_id=${classId}`, {
    credentials: 'include',
  });
  if (!response.ok) throw new Error(`GET /resume_pdf returned ${response.status}`);
  return response.json();
}

// The class's resumes in upload order. `resumes` is null until they arrive.
export const useResumes = (classId: number | undefined) => {
  const [resumes, setResumes] = useState<ResumeListing[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!classId) return;
    // A reply for a class the student has since left must not land.
    let current = true;
    setFailed(false);
    loadResumes(classId)
      .then((rows) => {
        if (current) setResumes(rows);
      })
      .catch((err) => {
        console.error('Error fetching resumes:', err);
        if (current) setFailed(true);
      });
    return () => {
      current = false;
    };
  }, [classId]);

  return { resumes, failed };
};
