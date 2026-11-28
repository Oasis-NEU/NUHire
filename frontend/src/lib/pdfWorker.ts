import { pdfjs } from 'react-pdf';

// Points react-pdf at the pdf.js worker. Import this module once from any file
// that renders a react-pdf <Document>; the step pages still set it themselves.
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString();
