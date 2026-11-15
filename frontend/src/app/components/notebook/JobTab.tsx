'use client';

import { API_BASE_URL } from '../../../lib/api';
import { useAuth } from '../AuthContext';
import PanelMessage from '../PanelMessage';
import PdfPreview from '../PdfPreview';
import { useJobDescription } from '../useJobDescription';

export default function JobTab() {
  const { user } = useAuth();
  // A job change without a reset leaves students on their step, so follow it here.
  const { job, loading, error } = useJobDescription(user, { refetchOnJobUpdated: true });

  if (job?.filePath) {
    const url = `${API_BASE_URL}/${job.filePath}`;
    return <PdfPreview key={url} url={url} title={job.title} />;
  }
  if (loading) return <PanelMessage>Loading the job description…</PanelMessage>;
  if (error === 'none') return <PanelMessage>Your group doesn’t have a job yet.</PanelMessage>;
  return <PanelMessage>Couldn’t load the job description.</PanelMessage>;
}
