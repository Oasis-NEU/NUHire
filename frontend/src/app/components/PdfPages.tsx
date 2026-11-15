'use client';

import { useEffect, useRef, useState } from 'react';
import { Document, Page } from 'react-pdf';
import 'react-pdf/dist/esm/Page/AnnotationLayer.css';
import 'react-pdf/dist/esm/Page/TextLayer.css';
import '../../lib/pdfWorker';
import { pdfSource } from '../../lib/pdfSource';
import PanelMessage from './PanelMessage';

interface Props {
  url: string;
  title: string;
}

// A PDF one page at a time, at the width of whatever holds it. Load it through
// PdfPreview. The caller keys it by url, so a new document starts on page 1.
export default function PdfPages({ url, title }: Props) {
  const frame = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState<number | null>(null);
  const [numPages, setNumPages] = useState<number | null>(null);
  const [page, setPage] = useState(1);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const element = frame.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      const measured = Math.floor(entry.contentRect.width);
      // A hidden tab measures 0. Keep the last width so the page is still drawn
      // when the tab comes back.
      if (measured > 0) setWidth(measured);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <div className="flex items-center gap-2">
        <span className="truncate text-[13px] font-bold leading-5 text-gray-800">{title}</span>
        {/* A link, unlike pdf.js, sends the session cookie to the API on its own. */}
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="ml-auto shrink-0 text-xs font-medium leading-4 text-steel-blue hover:underline"
        >
          Open full size
        </a>
      </div>
      <div
        ref={frame}
        className="min-h-0 flex-1 overflow-y-auto rounded-xl border border-gray-200 bg-gray-50"
      >
        {failed ? (
          <div className="p-3">
            <PanelMessage>Couldn’t show this PDF here. Try Open full size.</PanelMessage>
          </div>
        ) : (
          <Document
            file={pdfSource(url)}
            onLoadSuccess={({ numPages: total }) => setNumPages(total)}
            onLoadError={(err) => {
              console.error(`Error loading PDF ${url}:`, err);
              setFailed(true);
            }}
            loading={
              <div className="p-3">
                <PanelMessage>Loading…</PanelMessage>
              </div>
            }
          >
            {width !== null && <Page pageNumber={page} width={width} />}
          </Document>
        )}
      </div>
      {numPages !== null && numPages > 1 && (
        <div className="flex items-center justify-center gap-3 text-xs font-medium leading-4 text-gray-500">
          <button
            type="button"
            aria-label="Previous page"
            disabled={page <= 1}
            onClick={() => setPage((current) => current - 1)}
            className="rounded px-2 py-0.5 hover:bg-gray-100 disabled:opacity-40"
          >
            ‹
          </button>
          <span>
            Page {page} / {numPages}
          </span>
          <button
            type="button"
            aria-label="Next page"
            disabled={page >= numPages}
            onClick={() => setPage((current) => current + 1)}
            className="rounded px-2 py-0.5 hover:bg-gray-100 disabled:opacity-40"
          >
            ›
          </button>
        </div>
      )}
    </div>
  );
}
