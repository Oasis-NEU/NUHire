'use client';
export const dynamic = 'force-dynamic';
import React, { useState } from 'react';
import Navbar from '../components/navbar';
import { useAuth } from '../components/AuthContext';
import { PageLoader } from '../components/spinner';
import { useNotes } from '../components/useNotes';

const NotesPage: React.FC = () => {
  const [newNote, setNewNote] = useState('');
  const { notes, add } = useNotes({ onReset: () => setNewNote('') });
  const { loading: userloading } = useAuth();

  const handleAddNote = async () => {
    if (!newNote.trim()) return;
    if (await add(newNote)) setNewNote('');
  };

  if (userloading) {
    return <PageLoader />;
  }

  return (
    <div className="min-h-screen bg-white">
      <Navbar />
      <div className="container mx-auto py-8 px-4">
        <div className="bg-gray-50 rounded-lg shadow-lg p-6 border-2 border-neu-red">
          <h1 className="text-3xl font-bold text-neu-red mb-6 text-center">My Notes</h1>

          <div className="mb-6 bg-white p-4 rounded-md border border-black">
            <h2 className="text-xl font-semibold text-neu-red mb-3">Add a New Note</h2>
            <textarea
              value={newNote}
              onChange={(e) => setNewNote(e.target.value)}
              placeholder="Write your note here..."
              className="w-full p-3 border-2 border-black rounded-md focus:outline-none focus:ring-2 focus:ring-neu-red min-h-[120px] mb-3 bg-gray-50 text-black"
            />
            <button
              onClick={handleAddNote}
              className="w-full bg-neu-red text-white py-2 px-4 rounded-md hover:bg-red-700 transition-colors font-bold border-2 border-black"
            >
              Add Note
            </button>
          </div>

          <div className="bg-white p-4 rounded-md border border-black">
            <h2 className="text-xl font-semibold text-neu-red mb-4">My Saved Notes</h2>

            {notes.length > 0 ? (
              <ul className="space-y-3 max-h-[400px] overflow-y-auto pr-2">
                {notes.map((note) => (
                  <li
                    key={note.id}
                    className="bg-gray-50 p-4 rounded-md shadow border border-black"
                  >
                    <p className="text-black whitespace-pre-wrap break-words text-center">
                      {note.content}
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-black text-center py-4">
                No notes yet. Add your first note above!
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default NotesPage;
