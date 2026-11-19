'use client';

import { useState } from 'react';
import { API_BASE_URL } from '../../lib/api';
import type { SamplePackLoad } from '../../types';

interface SamplePackButtonProps {
  classId: string;
  /** Called once the request settles, with what to tell the professor. */
  onResult: (popup: { headline: string; message: string }, loaded: boolean) => void;
}

/** Loads the made-up sample resumes into a class in one click. */
const SamplePackButton = ({ classId, onResult }: SamplePackButtonProps) => {
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/resume_pdf/sample-pack`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ class_id: Number(classId) }),
        credentials: 'include',
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        onResult(
          { headline: 'Error', message: body?.error ?? 'Could not load the sample resumes.' },
          false
        );
        return;
      }
      const { added, alreadyLoaded } = body as SamplePackLoad;
      onResult(
        added > 0
          ? {
              headline: 'Sample resumes loaded',
              message:
                `Added ${added} sample resume${added === 1 ? '' : 's'} to class ${classId}.` +
                (alreadyLoaded > 0 ? ` ${alreadyLoaded} were already there.` : ''),
            }
          : {
              headline: 'Already loaded',
              message: `Class ${classId} already has every sample resume.`,
            },
        added > 0
      );
    } catch (error) {
      console.error('Could not load the sample resumes:', error);
      onResult(
        { headline: 'Error', message: 'Could not reach the server. Please try again.' },
        false
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mt-6 border-t border-gray-200 pt-6">
      <p className="text-sm text-gray-700 mb-3">
        Add a set of made-up resumes, each marked as fictional, to this class. Students review them
        along with the class&apos;s other resumes.
      </p>
      <button
        onClick={load}
        disabled={loading || !classId}
        className="w-full border-2 border-navy text-navy py-3 rounded-md hover:bg-navy hover:text-white transition duration-200 disabled:opacity-50"
      >
        {loading ? 'Loading sample resumes...' : 'Load sample resumes'}
      </button>
    </div>
  );
};

export default SamplePackButton;
