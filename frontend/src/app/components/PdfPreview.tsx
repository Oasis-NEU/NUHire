'use client';

import dynamic from 'next/dynamic';
import PanelMessage from './PanelMessage';

// makeOffer is the one step page that does not already load react-pdf, and the
// notebook renders on it, so the viewer loads only when a PDF is shown.
const PdfPreview = dynamic(() => import('./PdfPages'), {
  ssr: false,
  loading: () => <PanelMessage>Loading…</PanelMessage>,
});

export default PdfPreview;
