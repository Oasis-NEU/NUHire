'use client';

import { useEffect, useState } from 'react';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL;
const CONFIRM_WORD = 'ERASE';

interface GroupResetPreview {
  group_id: number;
  students: number;
  counts: Record<string, number>;
  offer_status: 'pending' | 'accepted' | 'rejected' | null;
}

interface ResetWorkConfirmModalProps {
  classId: string;
  // null means every group in the class
  groupId: number | null;
  jobTitle: string;
  isWorking: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

// The last step before a reset erases a group's work. It reads what would be
// lost from GET /jobs/reset-preview rather than listing tables from memory, and
// it will not confirm until the professor types ERASE. Cancel takes focus so a
// stray Enter backs out instead of wiping the class.
export function ResetWorkConfirmModal({
  classId,
  groupId,
  jobTitle,
  isWorking,
  onConfirm,
  onCancel,
}: ResetWorkConfirmModalProps) {
  const [preview, setPreview] = useState<GroupResetPreview[] | null>(null);
  const [previewFailed, setPreviewFailed] = useState(false);
  const [typed, setTyped] = useState('');

  useEffect(() => {
    const params = new URLSearchParams({ class_id: classId });
    if (groupId !== null) params.set('group_id', String(groupId));

    let cancelled = false;
    fetch(`${API_BASE_URL}/jobs/reset-preview?${params}`, { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : Promise.reject(res.status)))
      .then((data: { groups: GroupResetPreview[] }) => {
        if (!cancelled) setPreview(data.groups);
      })
      .catch(() => {
        if (!cancelled) setPreviewFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [classId, groupId]);

  const totals: Record<string, number> = {};
  for (const group of preview ?? []) {
    for (const [label, count] of Object.entries(group.counts)) {
      totals[label] = (totals[label] ?? 0) + count;
    }
  }
  const lostItems = Object.entries(totals).filter(([, count]) => count > 0);
  const studentCount = (preview ?? []).reduce((sum, g) => sum + g.students, 0);
  const groupsWithOffers = (preview ?? []).filter(
    (g) => g.offer_status === 'pending' || g.offer_status === 'accepted'
  );

  const scope =
    groupId !== null
      ? `Group ${groupId}`
      : preview
        ? `all ${preview.length} groups in this class`
        : 'every group in this class';
  const canConfirm = typed === CONFIRM_WORD && !isWorking;

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60]"
      onKeyDown={(e) => {
        if (e.key === 'Escape' && !isWorking) onCancel();
      }}
    >
      <div
        role="alertdialog"
        aria-labelledby="reset-work-title"
        className="bg-white rounded-lg p-6 w-[28rem] max-h-[90vh] overflow-y-auto"
      >
        <h3 id="reset-work-title" className="text-lg font-semibold text-red-700 mb-2">
          Erase work for {scope}?
        </h3>
        <p className="text-sm text-gray-700 mb-3">
          Assigning <span className="font-semibold">{jobTitle}</span> resets {scope}. Their students
          go back to the job description, and this permanently deletes:
        </p>

        {!preview && !previewFailed && (
          <p className="text-sm text-gray-500 mb-3">Checking what would be erased...</p>
        )}

        {previewFailed && (
          <p className="text-sm text-gray-700 mb-3">
            Could not load the exact counts. Everything the group has saved will be deleted: resume
            votes, interview ratings, notes, confirmations and any offer.
          </p>
        )}

        {preview &&
          (lostItems.length > 0 ? (
            <ul className="list-disc pl-5 text-sm text-gray-800 mb-3">
              {lostItems.map(([label, count]) => (
                <li key={label}>
                  {label}: {count}
                </li>
              ))}
              <li>progress for students: {studentCount}</li>
            </ul>
          ) : (
            <p className="text-sm text-gray-700 mb-3">
              Nothing has been saved yet, so no work will be lost.
            </p>
          ))}

        {groupsWithOffers.length > 0 && (
          <div className="border-2 border-red-600 bg-red-50 rounded-lg p-3 mb-3 text-sm text-red-800">
            <p className="font-semibold mb-1">These groups have already made an offer:</p>
            <ul className="list-disc pl-5">
              {groupsWithOffers.map((g) => (
                <li key={g.group_id}>
                  Group {g.group_id}: {g.offer_status}
                </li>
              ))}
            </ul>
            <p className="mt-1">The offer is deleted and the group has to start over.</p>
          </div>
        )}

        <label htmlFor="reset-work-confirm" className="block text-sm text-gray-700 mb-1">
          Type <span className="font-mono font-semibold">{CONFIRM_WORD}</span> to confirm:
        </label>
        <input
          id="reset-work-confirm"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          autoComplete="off"
          className="w-full p-2 border border-gray-300 rounded-lg mb-4 font-mono"
        />

        <div className="flex space-x-3">
          <button
            autoFocus
            onClick={onCancel}
            disabled={isWorking}
            className="flex-1 bg-gray-300 text-gray-700 py-2 px-4 rounded-lg hover:bg-gray-400"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={!canConfirm}
            className={`flex-1 bg-red-600 text-white py-2 px-4 rounded-lg ${canConfirm ? 'hover:bg-red-700' : 'opacity-50 cursor-not-allowed'}`}
          >
            {isWorking ? 'Erasing...' : 'Erase and assign'}
          </button>
        </div>
      </div>
    </div>
  );
}
