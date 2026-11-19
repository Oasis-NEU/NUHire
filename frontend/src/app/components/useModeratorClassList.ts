'use client';
import { useCallback, useEffect, useState } from 'react';
import { API_BASE_URL } from '../../lib/api';
import type { ClassInfo } from '../../types';

// The classes a professor teaches. Waits, loading, until there is an email.
// A retry keeps the last list on screen while it reloads. Pages without their
// own error state pass showError, so a failed load is never only a log line.
export function useModeratorClassList(
  email: string | undefined,
  showError?: (popup: { headline: string; message: string }) => void
) {
  const [classes, setClasses] = useState<ClassInfo[]>([]);
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
        const rows: ClassInfo[] = await response.json();
        if (!cancelled) setClasses(rows);
      } catch (err) {
        console.error('Error loading classes:', err);
        if (!cancelled) {
          setError(true);
          showError?.({
            headline: 'Error',
            message: 'Your classes could not be loaded. Refresh the page to try again.',
          });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [email, attempt, showError]);

  return { classes, loading, error, retry };
}
