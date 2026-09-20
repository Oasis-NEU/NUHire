// ============================================
// src/controllers/interview.controller.ts
// ============================================

import { Response } from 'express';
import { AuthRequest } from '../models/types';
import { Pool } from 'mysql2';
import { dbErrorStatus } from '../config/database';

export class InterviewController {
  constructor(
    private db: Pool,
    private io: any
  ) {}

  submitVote = (req: AuthRequest, res: Response): void => {
    const {
      student_id,
      group_id,
      studentClass,
      question1,
      question2,
      question3,
      question4,
      candidate_id,
    } = req.body;

    if (
      !student_id ||
      !group_id ||
      !studentClass ||
      !question1 ||
      !question2 ||
      !question3 ||
      !question4 ||
      !candidate_id
    ) {
      res.status(400).json({ error: 'Missing required fields' });
      return;
    }

    const query = `
      INSERT INTO InterviewPage
        (student_id, group_id, class, question1, question2, question3, question4, candidate_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          question1 = VALUES(question1),
          question2 = VALUES(question2),
          question3 = VALUES(question3),
          question4 = VALUES(question4)
      `;

    this.db.query(
      query,
      [
        student_id,
        group_id,
        studentClass,
        question1,
        question2,
        question3,
        question4,
        candidate_id,
      ],
      (err) => {
        if (err) {
          console.error(err);
          res.status(500).json({ error: 'Database error' });
          return;
        }
        res.status(200).json({ message: 'Interview result updated successfully' });
      }
    );
  };

  getAllInterviews = (req: AuthRequest, res: Response): void => {
    this.db.query('SELECT * FROM InterviewPage', (err, results) => {
      if (err) {
        // err.message carried the failing table and column straight to the
        // browser. Log the real error, tell the client only that it failed.
        console.error('Error fetching interviews:', err);
        res.status(dbErrorStatus(err)).json({ error: 'Failed to fetch interviews' });
        return;
      }
      res.json(results);
    });
  };

  getFinishedCount = (req: AuthRequest, res: Response): void => {
    const { group_id, class_id } = req.query;

    if (!group_id || !class_id) {
      res.status(400).json({ error: 'group_id and class_id are required' });
      return;
    }

    const query = `
      SELECT COUNT(*) AS finishedCount
      FROM Interview_Status 
      WHERE group_id = ? AND class = ? AND finished = 1
    `;

    this.db.query(query, [group_id, class_id], (err, results: any[]) => {
      if (err) {
        console.error('Error counting finished interviews:', err);
        res.status(dbErrorStatus(err)).json({ error: 'Failed to fetch finished count' });
        return;
      }
      console.log(results);
      res.json({ finishedCount: results[0].finishedCount });
    });
  };

  updateFinishedStatus = (req: AuthRequest, res: Response): void => {
    const { student_id, finished, group_id, class: class_id } = req.body;

    if (
      typeof student_id === 'undefined' ||
      typeof finished === 'undefined' ||
      typeof group_id === 'undefined' ||
      typeof class_id === 'undefined'
    ) {
      res.status(400).json({ error: 'student_id, finished, group_id, and class are required' });
      return;
    }

    this.db.query(
      `INSERT INTO Interview_Status (student_id, finished, group_id, class)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE finished = VALUES(finished), group_id = VALUES(group_id), class = VALUES(class)`,
      [student_id, !!finished, group_id, class_id],
      (err) => {
        if (err) {
          console.error('Error recording interview finished status:', err);
          res.status(dbErrorStatus(err)).json({ error: 'Failed to update finished status' });
          return;
        }

        this.db.query(
          'SELECT COUNT(*) AS finishedCount FROM Interview_Status WHERE group_id = ? AND class = ? AND finished = 1',
          [group_id, class_id],
          (err2, finishedResults: any[]) => {
            if (err2) {
              console.error('Error counting finished interviews:', err2);
              res.status(dbErrorStatus(err2)).json({ error: 'Failed to update finished status' });
              return;
            }

            this.db.query(
              "SELECT COUNT(*) AS count FROM Users WHERE group_id = ? AND affiliation = 'student' AND class = ?",
              [group_id, class_id],
              (err3, groupResults: any[]) => {
                if (err3) {
                  console.error('Error counting group members:', err3);
                  res
                    .status(dbErrorStatus(err3))
                    .json({ error: 'Failed to update finished status' });
                  return;
                }

                const count = finishedResults[0].finishedCount;
                const total = groupResults[0].count;

                this.io
                  .to(`group_${group_id}_class_${class_id}`)
                  .emit('interviewStatusUpdated', { count, total });

                res.json({ success: true });
              }
            );
          }
        );
      }
    );
  };

  getGroupSize = (req: AuthRequest, res: Response): void => {
    const { group_id, class_id } = req.params;
    console.log('group id and class id', group_id, class_id);
    this.db.query(
      'SELECT COUNT(*) AS count FROM Users WHERE group_id = ? AND class = ?',
      [group_id, class_id],
      (err, results: any[]) => {
        if (err) {
          console.error('Error fetching group size:', err);
          res.status(dbErrorStatus(err)).json({ error: 'Failed to fetch group size' });
          return;
        }
        console.log('results from group api', results);
        res.json({ group_id, count: results[0].count });
      }
    );
  };

  getInterviewsByGroup = (req: AuthRequest, res: Response): void => {
    const { group_id } = req.params;
    const { class: studentClass } = req.query;

    let query = 'SELECT * FROM InterviewPage WHERE group_id = ?';
    let params: any[] = [group_id];

    if (studentClass) {
      query = `
        SELECT r.*, u.f_name, u.l_name
        FROM InterviewPage r
        JOIN Users u ON r.student_id = u.id
        WHERE r.group_id = ? AND u.class = ?
      `;
      params = [group_id, studentClass];
    }

    this.db.query(query, params, (err, results) => {
      if (err) {
        console.error(`Error fetching interviews for group ${group_id}:`, err);
        res.status(dbErrorStatus(err)).json({ error: 'Failed to fetch interviews' });
        return;
      }
      res.json(results);
    });
  };

  getInterviewPopup = (req: AuthRequest, res: Response): void => {
    const { resId, groupId, classId } = req.params;

    console.log(`Fetching popup votes for candidate ${resId}, group ${groupId}, class ${classId}`);

    const query =
      'SELECT * FROM InterviewPopup WHERE candidate_id = ? AND group_id = ? AND class = ?';

    this.db.query(query, [resId, groupId, classId], (err, results: any[]) => {
      if (err) {
        console.error('Error fetching interview popup votes:', err);
        res.status(500).json({ error: 'Failed to fetch interview popup votes' });
        return;
      }

      console.log(`Found ${results.length} popup vote records for candidate ${resId}`);

      const result = results[0] || {
        question1: 0,
        question2: 0,
        question3: 0,
        question4: 0,
      };

      console.log('Returning popup votes:', result);
      res.json(result);
    });
  };

  getAllInterviewVids = (req: AuthRequest, res: Response): void => {
    this.db.query('SELECT * FROM Interview_vids', (err, results) => {
      if (err) {
        console.error('Error fetching interview videos:', err);
        res.status(dbErrorStatus(err)).json({ error: 'Failed to fetch interview videos' });
        return;
      }
      res.json(results);
    });
  };

  batchVote = async (req: AuthRequest, res: Response): Promise<void> => {
    const { votes } = req.body;

    if (!Array.isArray(votes) || votes.length === 0) {
      res.status(400).json({ error: 'Invalid votes array' });
      return;
    }

    try {
      // Insert all votes in a single transaction
      const values = votes.map((vote) => [
        vote.student_id,
        vote.group_id,
        vote.studentClass,
        vote.question1,
        vote.question2,
        vote.question3,
        vote.question4,
        vote.candidate_id,
      ]);

      const query = `
        INSERT INTO InterviewPage (student_id, group_id, class, question1, question2, question3, question4, candidate_id)
        VALUES ?
        ON DUPLICATE KEY UPDATE
          question1 = VALUES(question1),
          question2 = VALUES(question2),
          question3 = VALUES(question3),
          question4 = VALUES(question4)
      `;

      this.db.query(query, [values], (err, result) => {
        if (err) {
          // `details` put the raw MySQL message, table and column names into
          // the response body. The same information is still logged here.
          console.error('Error saving batch interview votes:', err);
          console.error('SQL:', query);
          console.error('Values:', values);
          res.status(dbErrorStatus(err)).json({ error: 'Failed to save votes' });
          return;
        }

        console.log(`✅ Saved ${votes.length} interview votes successfully`);
        res.json({ success: true, votesCount: votes.length });
      });
    } catch (error) {
      console.error('Error in batchVote:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  };
}
