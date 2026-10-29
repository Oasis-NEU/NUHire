import { Response } from 'express';
import { AuthRequest } from '../models/AuthRequest';
import { Pool } from 'mysql2';
import fs from 'fs';
import path from 'path';

export class ResumeController {
  constructor(
    private db: Pool,
    private io: any
  ) {}

  getFinishedCount = (req: AuthRequest, res: Response): void => {
    const { group_id, class_id } = req.params;

    if (!group_id || !class_id) {
      res.status(400).json({ error: 'group_id and class_id are required' });
      return;
    }

    // A student has finished once they have voted on all 10 resumes.
    const query = `
      SELECT COUNT(DISTINCT student_id) as finishedCount
      FROM Resume
      WHERE group_id = ? AND class = ?
      GROUP BY student_id
      HAVING COUNT(*) >= 10
    `;

    this.db.query(query, [group_id, class_id], (err, results: any[]) => {
      if (err) {
        console.error('❌ [GET-FINISHED-COUNT] Database error:', err);
        res.status(500).json({ error: 'Database error' });
        return;
      }

      // One row per finished student.
      const finishedCount = results.length;

      res.json({ finishedCount });
    });
  };

  submitVote = (req: AuthRequest, res: Response): void => {
    const { student_id, group_id, class: classId, timespent, resume_number, vote } = req.body;

    if (
      !student_id ||
      !group_id ||
      !classId ||
      !resume_number ||
      timespent === undefined ||
      timespent === null ||
      !vote
    ) {
      res.status(400).json({
        error: 'student_id, group_id, class, resume_number, timespent, and vote are required',
      });
      return;
    }

    // Read the old vote first, because voteUpdated carries it.
    this.db.query(
      'SELECT vote FROM Resume WHERE student_id = ? AND resume_number = ? AND group_id = ? AND class = ?',
      [student_id, resume_number, group_id, classId],
      (err, results: any[]) => {
        const oldVote = results && results.length > 0 ? results[0].vote : 'unanswered';

        // `checked` is the group's shortlist flag, kept on every vote row. A new
        // row takes the group's current value in the same statement, because at
        // the column default of 0 a teammate voting after the shortlist would
        // un-tick the resume for the whole group. A re-vote leaves its flag alone.
        const query = `INSERT INTO Resume (student_id, group_id, class, timespent, resume_number, vote, checked)
          SELECT ?, ?, ?, ?, ?, ?, COALESCE(MAX(checked), 0)
          FROM Resume WHERE group_id = ? AND class = ? AND resume_number = ?
          ON DUPLICATE KEY UPDATE timespent = VALUES(timespent), vote = VALUES(vote);`;

        this.db.query(
          query,
          [
            student_id,
            group_id,
            classId,
            timespent,
            resume_number,
            vote,
            group_id,
            classId,
            resume_number,
          ],
          (err) => {
            if (err) {
              console.error('❌ [BACKEND-VOTE] Error saving vote:', err);
              res.status(500).json({ error: 'Database error' });
              return;
            }

            const roomId = `group_${group_id}_class_${classId}`;
            this.io.to(roomId).emit('voteUpdated', {
              resume_number,
              oldVote,
              newVote: vote,
              student_id,
            });

            res.status(200).json({ message: 'Resume review updated successfully' });
          }
        );
      }
    );
  };

  getResumesByStudent = (req: AuthRequest, res: Response): void => {
    const { student_id } = req.params;
    this.db.query('SELECT * FROM Resume WHERE student_id = ?', [student_id], (err, results) => {
      if (err) {
        res.status(500).json({ error: err.message });
        return;
      }
      res.json(results);
    });
  };

  getResumesByGroup = (req: AuthRequest, res: Response): void => {
    const { group_id } = req.params;
    const { class: studentClass } = req.query;

    if (!studentClass) {
      res.status(400).json({ error: 'class query parameter is required' });
      return;
    }

    // Every member's vote row, not merged per resume.
    const getVotesQuery = `
      SELECT 
        res.resume_number,
        res.vote,
        res.checked
      FROM Resume res
      JOIN Users u ON res.student_id = u.id
      WHERE res.group_id = ? AND u.class = ?
    `;

    this.db.query(getVotesQuery, [group_id, studentClass], (err, votes: any[]) => {
      if (err) {
        console.error('❌ [BACKEND-GET-VOTES] Error fetching votes:', err);
        res.status(500).json({ error: err.message });
        return;
      }

      res.json(votes);
    });
  };

  getAllResumePdfs = (req: AuthRequest, res: Response): void => {
    const { class_id } = req.query;

    if (!class_id) {
      res.status(400).json({ error: 'class_id is required' });
      return;
    }

    const query = `
      SELECT 
        r.id, 
        r.title, 
        r.file_path,
        r.class_id,
        c.f_name as first_name,
        c.l_name as last_name,
        c.interview
      FROM Resume_pdfs r
      LEFT JOIN Candidates c ON r.id = c.resume_id
      WHERE r.class_id = ?
      ORDER BY r.id ASC
    `;

    this.db.query(query, [class_id], (err, results) => {
      if (err) {
        res.status(500).json({ error: err.message });
        return;
      }
      res.json(results);
    });
  };

  createResumePdf = (req: AuthRequest, res: Response): void => {
    const { resTitle, filePath, f_name, l_name, vid, class_id } = req.body;

    if (!resTitle || !filePath || !f_name || !l_name || !vid || !class_id) {
      res.status(400).json({
        error: 'Missing fields (resTitle, filePath, f_name, l_name, vid, class_id required)',
      });
      return;
    }

    const resumeSql = 'INSERT INTO Resume_pdfs (title, file_path, class_id) VALUES (?, ?, ?)';
    this.db.query(resumeSql, [resTitle, filePath, class_id], (err, resumeResult: any) => {
      if (err) {
        console.error('Error inserting resume:', err);

        if (err.code === 'ER_DUP_ENTRY') {
          res.status(409).json({
            error:
              'A resume with this title already exists in this class. Please choose a different title.',
          });
          return;
        }

        res.status(500).json({ error: 'Database error' });
        return;
      }

      const resumeId = resumeResult.insertId;

      const candidateSql =
        'INSERT INTO Candidates (resume_id, interview, f_name, l_name) VALUES (?, ?, ?, ?)';
      this.db.query(candidateSql, [resumeId, vid, f_name, l_name], (err2) => {
        if (err2) {
          console.error('Error inserting candidate:', err2);
          res.status(500).json({ error: 'Database error' });
          return;
        }

        res.json({
          message: 'Resume and candidate added successfully!',
          resumeId: resumeId,
        });
      });
    });
  };

  deleteResumeFile = (req: AuthRequest, res: Response): void => {
    // Express matches the route before decoding, so "..%2F..%2Fconfig" arrives
    // here as a param containing separators and the fs.unlinkSync below would
    // follow it out of uploads/resumes. Same containment as
    // upload.controller.serveUploadedFile.
    const fileName = path.basename(req.params.fileName ?? '');
    const classId = req.query.class_id;

    if (!fileName || fileName === '.' || fileName === '..') {
      res.status(400).json({ error: 'Invalid file name' });
      return;
    }

    if (!classId) {
      res.status(400).json({ error: 'class_id is required' });
      return;
    }

    const filePath = path.join(__dirname, '../../uploads/resumes', fileName);

    this.db.query(
      'SELECT id FROM Resume_pdfs WHERE file_path = ? AND class_id = ?',
      [`uploads/resumes/${fileName}`, classId],
      (err, resumeResults: any[]) => {
        if (err) {
          console.error('Database lookup error:', err);
          res.status(500).json({ error: 'Database lookup failed' });
          return;
        }

        if (resumeResults.length === 0) {
          res.status(404).json({ error: 'Resume not found in database for this class' });
          return;
        }

        const resumeId = resumeResults[0].id;

        // Explicit even though the foreign key cascades, so the response can say
        // whether a candidate was deleted.
        this.db.query(
          'DELETE FROM Candidates WHERE resume_id = ?',
          [resumeId],
          (err, candidateResult: any) => {
            if (err) {
              console.error('Candidate deletion error:', err);
              res.status(500).json({ error: 'Candidate deletion failed' });
              return;
            }

            this.db.query(
              'DELETE FROM Resume_pdfs WHERE id = ? AND class_id = ?',
              [resumeId, classId],
              (err, resumeResult: any) => {
                if (err) {
                  console.error('Resume deletion error:', err);
                  res.status(500).json({ error: 'Resume deletion failed' });
                  return;
                }

                this.db.query(
                  'SELECT COUNT(*) as count FROM Resume_pdfs WHERE file_path = ?',
                  [`uploads/resumes/${fileName}`],
                  (err, results: any[]) => {
                    if (err) {
                      console.error('Error checking file usage:', err);
                      res.json({
                        message: `Resume and candidate deleted for class ${classId}. Physical file not removed.`,
                        deletedResume: resumeResult.affectedRows > 0,
                        deletedCandidate: candidateResult.affectedRows > 0,
                      });
                      return;
                    }

                    // Only delete the physical file if no other classes are using it
                    if (results[0].count === 0 && fs.existsSync(filePath)) {
                      fs.unlinkSync(filePath);
                      res.json({
                        message: `File "${fileName}", resume, and associated candidate deleted successfully.`,
                        deletedResume: resumeResult.affectedRows > 0,
                        deletedCandidate: candidateResult.affectedRows > 0,
                        deletedPhysicalFile: true,
                      });
                    } else {
                      res.json({
                        message: `Resume and candidate deleted for class ${classId}. File still in use by other classes.`,
                        deletedResume: resumeResult.affectedRows > 0,
                        deletedCandidate: candidateResult.affectedRows > 0,
                        deletedPhysicalFile: false,
                      });
                    }
                  }
                );
              }
            );
          }
        );
      }
    );
  };

  getResumePdfById = (req: AuthRequest, res: Response): void => {
    const { id } = req.params;
    this.db.query('SELECT * FROM Resume_pdfs WHERE id = ?', [id], (err, results) => {
      if (err) {
        res.status(500).json({ error: err.message });
        return;
      }
      res.json(results);
    });
  };
}
