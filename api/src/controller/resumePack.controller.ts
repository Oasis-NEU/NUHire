// src/controller/resumePack.controller.ts

import { Response } from 'express';
import { dbErrorStatus } from '../config/database';
import { extractPdfText } from '../config/pdfText';
import { RESUME_PACK } from '../config/resumePack';
import { queueScreens, Screens } from '../config/screeningQueue';
import { AuthRequest } from '../models/AuthRequest';
import { PackResumeWithText } from '../models/ResumePack';
import { ResumePackRepository } from '../repository/resumePack.repository';

export class ResumePackController {
  constructor(
    private packs: ResumePackRepository,
    private screens: Screens,
    private readText = extractPdfText
  ) {}

  // POST /resume_pdf/sample-pack  { class_id }. requireClassModerator has
  // already checked class_id and that the caller teaches it.
  load = async (req: AuthRequest, res: Response): Promise<void> => {
    const classId = Number(req.body?.class_id);
    try {
      // Read before writing: a pack file deleted from disk would otherwise be
      // stored as a resume students cannot open and the screener cannot read.
      const texts = await Promise.all(
        RESUME_PACK.map((resume) => this.readText('Resume_pdfs', resume.file_path))
      );
      const resumes: PackResumeWithText[] = [];
      const unreadable: string[] = [];
      RESUME_PACK.forEach((resume, i) => {
        const text = texts[i];
        if (text) resumes.push({ ...resume, extracted_text: text });
        else unreadable.push(resume.file_path);
      });
      if (unreadable.length > 0) {
        console.error(`Sample resume files missing or unreadable: ${unreadable.join(', ')}`);
        res.status(500).json({ error: 'The sample resume files are missing on the server' });
        return;
      }

      const loaded = await this.packs.load(classId, resumes);
      if (loaded.added > 0) await queueScreens(this.screens, classId);
      res.json(loaded);
    } catch (err) {
      console.error(`Could not load the sample resumes into class ${classId}:`, err);
      res.status(dbErrorStatus(err)).json({ error: 'Could not load the sample resumes' });
    }
  };
}
