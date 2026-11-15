'use client';

import { useState } from 'react';
import Popup from './popup';
import PanelMessage from './PanelMessage';
import { useNotes, type NotesStatus } from './useNotes';
import { useNotebook } from './NotebookContext';
import type { Note } from '../../types';

function NoteList({
  notes,
  status,
  onRetry,
}: {
  notes: Note[];
  status: NotesStatus;
  onRetry: () => void;
}) {
  if (notes.length > 0) {
    return (
      <ul className="flex flex-col gap-3.5">
        {notes.map((note) => (
          <li key={note.id} className="rounded-xl bg-gray-50 p-3">
            <p className="whitespace-pre-wrap break-words text-[13px] leading-5 text-gray-600">
              {note.content}
            </p>
          </li>
        ))}
      </ul>
    );
  }
  if (status === 'failed') {
    return (
      <div className="flex items-center gap-2">
        <PanelMessage>Couldn’t load your notes.</PanelMessage>
        <button
          type="button"
          onClick={onRetry}
          className="text-[13px] font-bold leading-5 text-neu-red hover:underline"
        >
          Retry
        </button>
      </div>
    );
  }
  if (status === 'loading') return <PanelMessage>Loading your notes…</PanelMessage>;
  return <PanelMessage>No notes yet. Write your first one below.</PanelMessage>;
}

// The student's notes and a box to add one: the notebook's Notes tab and the
// /notes page. The unsent draft is the notebook's, so both share it.
export default function NotesEditor() {
  const { draft, setDraft } = useNotebook();
  const { notes, status, reload, add } = useNotes();
  const [saving, setSaving] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);

  const canAdd = draft.trim().length > 0 && !saving;

  const handleAdd = async () => {
    if (!canAdd) return;
    setSaving(true);
    const saved = await add(draft);
    setSaving(false);
    if (saved) setDraft('');
    else setSaveFailed(true);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3.5">
      <p className="text-xs font-medium leading-4 tracking-[0.24px] text-gray-500">
        All notes · newest first
      </p>
      {/* Shrinks and scrolls once the notes outgrow the space, so the box stays in view. */}
      <div className="min-h-0 overflow-y-auto">
        <NoteList notes={notes} status={status} onRetry={reload} />
      </div>
      <textarea
        aria-label="New note"
        placeholder="Write a note…"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        className="h-[84px] w-full shrink-0 resize-none rounded-xl border border-gray-400 bg-white p-3 text-[13px] leading-5 text-gray-800 placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-neu-red"
      />
      <div className="flex shrink-0 justify-end">
        <button
          type="button"
          onClick={handleAdd}
          disabled={!canAdd}
          className="rounded-[10px] bg-neu-red px-4 py-2 text-[15px] font-bold leading-6 text-white transition-colors hover:bg-red-700 disabled:bg-gray-100 disabled:text-gray-400"
        >
          {saving ? 'Adding…' : 'Add note'}
        </button>
      </div>
      {saveFailed && (
        <Popup
          headline="Your note wasn't saved"
          message="Check your connection and try again. Your note is still in the box."
          onDismiss={() => setSaveFailed(false)}
        />
      )}
    </div>
  );
}
