'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { API_BASE_URL } from '../../lib/api';
import { useAuth } from './AuthContext';
import { useSocket } from './socketContext';
import type { Note } from '../../types';

// The notes API reads the student from the session, so neither request names one.
export async function loadNotes(): Promise<Note[]> {
  const response = await fetch(`${API_BASE_URL}/notes`, { credentials: 'include' });
  if (!response.ok) throw new Error(`GET /notes returned ${response.status}`);
  return response.json();
}

export async function saveNote(content: string): Promise<Note> {
  const response = await fetch(`${API_BASE_URL}/notes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ content }),
  });
  if (!response.ok) throw new Error(`POST /notes returned ${response.status}`);
  return response.json();
}

export type NotesStatus = 'loading' | 'loaded' | 'failed';

// The signed-in student's notes, newest first, as the API returns them.
export const useNotes = () => {
  const { user } = useAuth();
  const socket = useSocket();
  const [notes, setNotes] = useState<Note[]>([]);
  const [status, setStatus] = useState<NotesStatus>('loading');

  // A reply for the previous student on a shared browser must not land on the next one.
  const latestRequest = useRef(0);
  const email = user?.email;

  const reload = useCallback(async () => {
    if (!email) return;
    const request = ++latestRequest.current;
    setStatus('loading');
    try {
      const loaded = await loadNotes();
      if (request !== latestRequest.current) return;
      setNotes(loaded);
      setStatus('loaded');
    } catch (err) {
      if (request !== latestRequest.current) return;
      console.error('Error fetching notes:', err);
      setStatus('failed');
    }
  }, [email]);

  useEffect(() => {
    reload();
  }, [reload]);

  // Resolves false when the note was not saved, so the caller can keep the draft.
  const add = useCallback(async (content: string): Promise<boolean> => {
    try {
      const note = await saveNote(content);
      setNotes((current) => [note, ...current]);
      return true;
    } catch (err) {
      console.error('Error saving note:', err);
      return false;
    }
  }, []);

  useEffect(() => {
    if (!socket) return;
    // Notes are only erased by a reset, so a plain job change leaves them alone.
    const onJobUpdated = ({ reset }: { reset?: boolean }) => {
      if (reset === false) return;
      setNotes([]);
    };
    socket.on('jobUpdated', onJobUpdated);
    return () => {
      socket.off('jobUpdated', onJobUpdated);
    };
  }, [socket]);

  return { notes, status, reload, add };
};
