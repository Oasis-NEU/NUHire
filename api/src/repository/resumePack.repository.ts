import { PrismaDb } from '../config/database';
import { PackLoad, PackResumeWithText } from '../models/ResumePack';
import { withUniqueRetry } from './writes';

export interface ResumePackRepository {
  /**
   * Adds each pack resume the class does not have yet, with its candidate.
   * A title the class already has is left alone, so loading twice adds nothing.
   */
  load(classId: number, resumes: readonly PackResumeWithText[]): Promise<PackLoad>;
}

export function createResumePackRepository(db: PrismaDb): ResumePackRepository {
  return {
    // One transaction, so a failure never leaves a resume with no candidate,
    // which the review page would list with no name. Two loads at once both
    // see no rows; the second then loses on title_class_unique and the retry
    // finds the first one's resumes.
    load: (classId, resumes) =>
      withUniqueRetry(() =>
        db.$transaction(async (tx) => {
          const present = await tx.resume_pdfs.findMany({
            where: { class_id: classId, title: { in: resumes.map((resume) => resume.title) } },
            select: { title: true },
          });
          const have = new Set(present.map((row) => row.title));
          const missing = resumes.filter((resume) => !have.has(resume.title));
          for (const resume of missing) {
            const { id } = await tx.resume_pdfs.create({
              data: {
                title: resume.title,
                file_path: resume.file_path,
                class_id: classId,
                extracted_text: resume.extracted_text,
              },
              select: { id: true },
            });
            await tx.candidates.create({
              data: {
                resume_id: id,
                f_name: resume.f_name,
                l_name: resume.l_name,
                interview: resume.interview,
              },
            });
          }
          return { added: missing.length, alreadyLoaded: resumes.length - missing.length };
        })
      ),
  };
}
