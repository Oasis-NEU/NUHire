'use client';

import type { JobOption } from '../../../types';

interface AssignJobModalProps {
  groupId: number | null;
  jobs: JobOption[];
  selectedJobId: number | null;
  onSelectJob: (jobId: number) => void;
  groupCount: number;
  isAssigning: boolean;
  onAssign: () => void;
  onCancel: () => void;
}

export function AssignJobModal({
  groupId,
  jobs,
  selectedJobId,
  onSelectJob,
  groupCount,
  isAssigning,
  onAssign,
  onCancel,
}: AssignJobModalProps) {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-96">
        <h3 className="text-lg font-semibold mb-4">
          {groupId ? `Assign Job to Group ${groupId}` : 'Assign Job to All Groups'}
        </h3>
        <label className="block text-sm font-medium text-gray-700 mb-2">Select Job:</label>
        <select
          value={selectedJobId || ''}
          onChange={(e) => onSelectJob(parseInt(e.target.value))}
          className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 mb-4"
        >
          <option value="">-- Select a Job --</option>
          {jobs.map((job) => (
            <option key={job.id} value={job.id}>
              {job.title}
            </option>
          ))}
        </select>
        {!groupId && (
          <p className="text-sm text-gray-600 mb-4">
            This will assign the selected job to all {groupCount} groups in this class.
          </p>
        )}
        <div className="flex space-x-3">
          <button
            onClick={onAssign}
            disabled={isAssigning || !selectedJobId}
            className={`flex-1 bg-red-600 text-white py-2 px-4 rounded-lg hover:bg-red-700 ${isAssigning ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            {isAssigning ? 'Assigning...' : 'Assign Job'}
          </button>
          <button
            onClick={onCancel}
            className="flex-1 bg-gray-300 text-gray-700 py-2 px-4 rounded-lg hover:bg-gray-400"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
