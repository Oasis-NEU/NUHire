'use client';
const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL;
import React, { useState, useCallback, useEffect } from 'react';
import { useAuth } from './AuthContext';
import { useSocket } from './socketContext';
import type { Note } from '../../types';
const NotesPage = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [note, setNote] = useState('');

  const [notes, setNotes] = useState<Note[]>([]);
  const [userEmail, setUserEmail] = useState('');
  const { user } = useAuth();
  // The app-wide socket, not a new io(): the navbar renders this on every page,
  // so a connection of its own would double the class's connection count.
  const socket = useSocket();

  useEffect(() => {
    if (user && user.email) {
      setUserEmail(user.email);
    }
  }, [user]);

  const fetchNotes = useCallback(async () => {
    if (!userEmail) return;
    try {
      const response = await fetch(
        `${API_BASE_URL}/notes?user_email=${encodeURIComponent(userEmail)}`,
        {
          credentials: 'include',
        }
      );
      if (!response.ok) throw new Error('Failed to fetch notes');
      const data = await response.json();
      setNotes(data);
    } catch (error) {
      console.error('Error fetching notes:', error);
    }
  }, [userEmail]);

  useEffect(() => {
    fetchNotes();
  }, [fetchNotes]);

  useEffect(() => {
    if (!socket) return;
    // Notes are only erased by a reset, so a plain job change leaves them alone.
    const onJobUpdated = ({ reset }: { reset?: boolean }) => {
      if (reset === false) return;
      setNotes([]);
      setNote('');
    };
    socket.on('jobUpdated', onJobUpdated);
    return () => {
      socket.off('jobUpdated', onJobUpdated);
    };
  }, [socket]);

  const saveNote = async () => {
    if (!note.trim()) return;

    try {
      const response = await fetch(`${API_BASE_URL}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ user_email: userEmail, content: note }),
      });

      if (!response.ok) throw new Error(`Failed to save note: ${userEmail}`);
      const newNote = await response.json();
      setNotes([...notes, newNote]);
      fetchNotes();
      setNote('');
    } catch (error) {
      console.error('Error saving note:', error);
    }
  };

  return (
    <div className="relative p-4">
      <button
        className="bg-northeasternRed text-northeasternWhite px-4 py-2 rounded-md hover:bg-sand border-4 border-navy transition"
        onClick={() => setIsOpen(!isOpen)}
      >
        ☰ Notes
      </button>

      {isOpen && (
        <div className="absolute top-14 right-4 w-80 bg-northeasternWhite opacity-100 shadow-lg rounded-lg p-4 border border-gray-300 z-50">
          <div className="mb-4">
            <textarea
              placeholder="Enter your notes..."
              className="w-full p-2 border border-gray-300 bg-northeasternWhite text-northeasternBlack rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
            <button
              onClick={saveNote}
              className="mt-2 w-full bg-northeasternWhite border border-gray-300 text-northeasternBlack py-2 rounded-md hover:bg-sand transition"
            >
              Save Note
            </button>
          </div>

          <div className="mt-4">
            <h2 className="font-bold text-navy">Saved Notes:</h2>
            <div className="max-h-60 overflow-y-auto pr-1">
              {notes.length > 0 ? (
                notes.map((n) => (
                  <div key={n.id} className="mt-2 border border-gray-200 rounded-md bg-springWater">
                    <p className="text-northeasternBlack p-2 max-h-24 overflow-y-auto break-words">
                      {n.content}
                    </p>
                  </div>
                ))
              ) : (
                <p className="text-navy mt-2">No notes found.</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default NotesPage;
