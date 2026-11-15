'use client'; // Declares that this page is a client component
import React, { useState } from 'react';
import { useNotes } from './useNotes';

const NotesPage = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [note, setNote] = useState('');
  const { notes, add } = useNotes({ onReset: () => setNote('') });

  const saveNote = async () => {
    if (!note.trim()) return;
    if (await add(note)) setNote('');
  };

  return (
    <div className="relative p-4">
      {/* Toggle Notes Button */}
      <button
        className="bg-neu-red text-white px-4 py-2 rounded-md hover:bg-white border-4 border-black transition"
        onClick={() => setIsOpen(!isOpen)}
      >
        ☰ Notes
      </button>

      {isOpen && (
        <div className="absolute top-14 right-4 w-80 bg-white opacity-100 shadow-lg rounded-lg p-4 border border-gray-300 z-50">
          {/* Note Input Section */}
          <div className="mb-4">
            <textarea
              placeholder="Enter your notes..."
              className="w-full p-2 border border-gray-300 bg-white text-black rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
            <button
              onClick={saveNote}
              className="mt-2 w-full bg-white border border-gray-300 text-black py-2 rounded-md hover:bg-white transition"
            >
              Save Note
            </button>
          </div>

          {/* Display Saved Notes */}
          <div className="mt-4">
            <h2 className="font-bold text-black">Saved Notes:</h2>
            <div className="max-h-60 overflow-y-auto pr-1">
              {notes.length > 0 ? (
                notes.map((n) => (
                  <div key={n.id} className="mt-2 border border-gray-200 rounded-md bg-gray-50">
                    <p className="text-black p-2 max-h-24 overflow-y-auto break-words">
                      {n.content}
                    </p>
                  </div>
                ))
              ) : (
                <p className="text-black mt-2">No notes found.</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default NotesPage;
