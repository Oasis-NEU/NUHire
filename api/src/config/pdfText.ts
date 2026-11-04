// src/config/pdfText.ts

import fs from 'fs/promises';
import path from 'path';
import type { Pool as PromisePool, RowDataPacket } from 'mysql2/promise';
import { extractText, getDocumentProxy } from 'unpdf';
import { UPLOADS_ROOT, UPLOAD_DIRS } from '../middleware/upload.middleware';

// The tables that store a PDF, and the upload directory each one's files are in.
// Table names are constants, never user input, which is why they are
// interpolated below.
const PDF_DIRS = {
  Resume_pdfs: UPLOAD_DIRS.resume,
  job_descriptions: UPLOAD_DIRS.jobDescription,
};

export type PdfTable = keyof typeof PDF_DIRS;

async function readPdfText(dir: string, filePath: unknown): Promise<string | null> {
  try {
    // file_path reaches the create endpoints in the request body, so only its
    // name is used, and only inside this table's upload directory.
    const name = path.basename(String(filePath));
    if (!name || name === '.' || name === '..') return null;

    const data = await fs.readFile(path.join(UPLOADS_ROOT, dir, name));
    const { text } = await extractText(await getDocumentProxy(new Uint8Array(data)), {
      mergePages: true,
    });
    return text.trim();
  } catch (error) {
    // A missing file is counted by backfillPdfText; anything else is a PDF that
    // will not parse, worth one line each.
    if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) {
      console.warn(`Could not extract text from ${dir}/${String(filePath)}:`, error);
    }
    return null;
  }
}

/**
 * The text of a stored PDF, or null when the file is missing or will not parse.
 * A scanned PDF with no text layer gives '', which counts as done; null leaves
 * the row for backfillPdfText to retry, so the upload itself never fails on it.
 */
export const extractPdfText = (table: PdfTable, filePath: string): Promise<string | null> =>
  readPdfText(PDF_DIRS[table], filePath);

/**
 * Stores the text of every PDF row that has none: rows from before migration
 * 008, the defaults seeded at boot and on class creation, and any whose
 * extraction failed. Safe to run any number of times, and never throws, so a
 * caller that has already committed its own work is not turned into a failure.
 */
export async function backfillPdfText(db: PromisePool, classId?: number): Promise<void> {
  let missing = 0;
  try {
    for (const [table, dir] of Object.entries(PDF_DIRS)) {
      const [rows] = await db.query<RowDataPacket[]>(
        `SELECT id, file_path FROM ${table} WHERE extracted_text IS NULL` +
          (classId === undefined ? '' : ' AND class_id = ?'),
        classId === undefined ? [] : [classId]
      );
      for (const row of rows) {
        const text = await readPdfText(dir, row.file_path);
        if (text === null) {
          missing++;
          continue;
        }
        await db.query(
          `UPDATE ${table} SET extracted_text = ? WHERE id = ? AND extracted_text IS NULL`,
          [text, row.id]
        );
      }
    }
  } catch (error) {
    console.error('PDF text backfill stopped early:', error);
  }
  if (missing > 0) {
    console.warn(`${missing} PDF row(s) still have no text: the file is missing or unreadable`);
  }
}
