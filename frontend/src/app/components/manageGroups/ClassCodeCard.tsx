'use client';

import { useEffect, useState } from 'react';
import Popup from '../popup';
import { API_BASE_URL } from '../../../lib/api';
import type { ClassCode } from '../../../types';

interface ClassCodeCardProps {
  classId: string;
}

// The code students type to join the selected class. Regenerating it is how a
// professor retires a code that leaked, so it asks first: anyone holding the old
// code can no longer join with it.
export function ClassCodeCard({ classId }: ClassCodeCardProps) {
  const [code, setCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setCode(null);
    setError(null);
    fetch(`${API_BASE_URL}/classes/${classId}/code`, { credentials: 'include' })
      .then(async (response) => {
        const body = await response.json();
        if (cancelled) return;
        if (!response.ok) throw new Error(body.error ?? 'Could not load the class code');
        setCode((body as ClassCode).code);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        console.error('Could not load the class code:', err);
        setError('Could not load the class code. Refresh to try again.');
      });
    return () => {
      cancelled = true;
    };
  }, [classId]);

  const regenerate = async () => {
    setBusy(true);
    try {
      const response = await fetch(`${API_BASE_URL}/classes/${classId}/code/regenerate`, {
        method: 'POST',
        credentials: 'include',
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? 'Could not make a new class code');
      setCode((body as ClassCode).code);
    } catch (err) {
      console.error('Could not regenerate the class code:', err);
      setError('Could not make a new class code. The old one still works.');
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  };

  return (
    <div className="mb-6 flex flex-wrap items-center gap-4 rounded-lg border border-gray-200 bg-gray-50 p-4">
      <div>
        <p className="text-sm font-medium text-gray-700">Class code</p>
        <p className="font-mono text-3xl font-bold tracking-widest text-gray-900">
          {code ?? '······'}
        </p>
      </div>
      <p className="flex-1 text-sm text-gray-600">
        Students enter this code to join the class. Joining moves a student out of any other class.
      </p>
      <button
        onClick={() => setConfirming(true)}
        disabled={!code || busy}
        className="rounded-lg border-2 border-red-600 px-4 py-2 font-medium text-red-600 transition-colors hover:bg-red-600 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
      >
        New code
      </button>
      {confirming && (
        <Popup
          headline="Make a new class code?"
          message={`The current code, ${code}, will stop working. Students already in the class stay in it.`}
          onDismiss={() => setConfirming(false)}
          onConfirm={regenerate}
          confirmLabel="Make new code"
          busy={busy}
        />
      )}
      {error && <Popup headline="Class code" message={error} onDismiss={() => setError(null)} />}
    </div>
  );
}
