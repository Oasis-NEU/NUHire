'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { API_BASE_URL } from '../../lib/api';
import { useAuth } from './AuthContext';
import { useSocket } from './socketContext';
import type { Note } from '../../types';

export async function loadNotes(userEmail: string): Promise<Note[]> {
  const response = await fetch(
    `${API_BASE_URL}/notes?user_email=${encodeURIComponent(userEmail)}`,
    { credentials: 'include' }
  );
  if (!response.ok) throw new Error('Failed to fetch notes');
  return response.json();
}

export async function saveNote(userEmail: string, content: string): Promise<Note> {
  const response = await fetch(`${API_BASE_URL}/notes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ user_email: userEmail, content }),
  });
  if (!response.ok) throw new Error(`Failed to save note: ${userEmail}`);
  return response.json();
}

interface Options {
  // Called when a job reset erases the notes, so a caller can clear its draft too.
  onReset?: () => void;
}

// The signed-in student's notes, newest first, as the API returns them.
export const useNotes = ({ onReset }: Options = {}) => {
  const { user } = useAuth();
  const socket = useSocket();
  const [notes, setNotes] = useState<Note[]>([]);
  const email = user?.email ?? '';

  const onResetRef = useRef(onReset);
  useEffect(() => {
    onResetRef.current = onReset;
  }, [onReset]);

  const reload = useCallback(async () => {
    if (!email) return;
    try {
      setNotes(await loadNotes(email));
    } catch (err) {
      console.error('Error fetching notes:', err);
    }
  }, [email]);

  useEffect(() => {
    reload();
  }, [reload]);

  // Resolves false when the note was not saved, so the caller can keep the draft.
  const add = useCallback(
    async (content: string): Promise<boolean> => {
      try {
        const note = await saveNote(email, content);
        setNotes((current) => [...current, note]);
        reload();
        return true;
      } catch (err) {
        console.error('Error saving note:', err);
        return false;
      }
    },
    [email, reload]
  );

  useEffect(() => {
    if (!socket) return;
    // Notes are only erased by a reset, so a plain job change leaves them alone.
    const onJobUpdated = ({ reset }: { reset?: boolean }) => {
      if (reset === false) return;
      setNotes([]);
      onResetRef.current?.();
    };
    socket.on('jobUpdated', onJobUpdated);
    return () => {
      socket.off('jobUpdated', onJobUpdated);
    };
  }, [socket]);

  return { notes, add };
};
