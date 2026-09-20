// ============================================
// src/controllers/job.controller.ts
// ============================================

import { Response } from 'express';
import { AuthRequest } from '../models/types';
import { Pool } from 'mysql2';
import fs from 'fs';
import path from 'path';

export class JobController {
  constructor(
    private db: Pool,
    private io: any,
    private onlineStudents: Record<string, string>
  ) {}

  getAllJobs = (req: AuthRequest, res: Response): void => {
    const { class_id } = req.query; // Get class_id from query params

    if (!class_id) {
      res.status(400).json({ error: 'class_id is required' });
      return;
    }

    this.db.query(
      'SELECT * FROM job_descriptions WHERE class_id = ?',
      [class_id],
      (err, results) => {
        if (err) {
          res.status(500).json({ error: err.message });
          return;
        }
        res.json(results);
      }
    );
  };

  createJob = async (req: AuthRequest, res: Response): Promise<void> => {
    const { title, filePath, class_id } = req.body; // Add class_id

    if (!title || !filePath || !class_id) {
      res.status(400).json({ error: 'Missing title, filePath, or class_id' });
      return;
    }

    try {
      const sql = 'INSERT INTO job_descriptions (title, file_path, class_id) VALUES (?, ?, ?)';
      this.db.query(sql, [title, filePath, class_id], (err) => {
        if (err) {
          console.error('Error inserting into DB:', err);
          res.status(500).json({ error: 'Database error' });
          return;
        }
        res.json({ message: 'Job description added successfully!' });
      });
    } catch (error) {
      console.error('Error inserting into DB:', error);
      res.status(500).json({ error: 'Database error' });
    }
  };

  getJobByTitle = (req: AuthRequest, res: Response): void => {
    const { title, class_id } = req.query; // Add class_id

    if (!title || !class_id) {
      res.status(400).json({ error: 'Title and class_id are required' });
      return;
    }

    this.db.query(
      'SELECT * FROM job_descriptions WHERE title = ? AND class_id = ?',
      [title, class_id],
      (err, results: any[]) => {
        if (err) {
          res.status(500).json({ error: err.message });
          return;
        }

        if (results.length === 0) {
          res.status(404).json({ error: 'Job description not found' });
          return;
        }

        res.json(results[0]);
      }
    );
  };

  deleteJobFile = (req: AuthRequest, res: Response): void => {
    const fileName = req.params.fileName;
    const classId = req.query.class_id;

    if (!classId) {
      res.status(400).json({ error: 'class_id is required' });
      return;
    }

    const filePath = path.join(__dirname, '../../uploads/jobdescription', fileName);

    this.db.query(
      'DELETE FROM job_descriptions WHERE file_path = ? AND class_id = ?',
      [`uploads/jobdescription/${fileName}`, classId],
      (err, result: any) => {
        if (err) {
          console.error('Database deletion error:', err);
          res.status(500).json({ error: 'Database deletion failed' });
          return;
        }

        if (result.affectedRows === 0) {
          res.status(404).json({ error: 'Job description not found for this class' });
          return;
        }

        this.db.query(
          'SELECT COUNT(*) as count FROM job_descriptions WHERE file_path = ?',
          [`uploads/jobdescription/${fileName}`],
          (err, results: any[]) => {
            if (err) {
              console.error('Error checking file usage:', err);
              res.json({
                message: `Database entry deleted successfully for class ${classId}. Physical file not removed.`,
              });
              return;
            }

            if (results[0].count === 0 && fs.existsSync(filePath)) {
              fs.unlinkSync(filePath);
              res.json({
                message: `File "${fileName}" and database entry deleted successfully.`,
              });
            } else {
              res.json({
                message: `Database entry deleted for class ${classId}. File still in use by other classes.`,
              });
            }
          }
        );
      }
    );
  };

  assignJobToAllGroups = async (req: AuthRequest, res: Response): Promise<void> => {
    const { class_id, job_title } = req.body;

    console.log('Assigning job to all groups in class:', { class_id, job_title });

    if (!class_id || !job_title) {
      res.status(400).json({
        error: 'Missing required fields: class_id, job_title',
      });
      return;
    }

    const classIdInt = parseInt(class_id);
    if (isNaN(classIdInt) || classIdInt <= 0) {
      console.log('❌ Invalid class_id:', class_id);
      res.status(400).json({ error: 'class_id must be a valid positive integer.' });
      return;
    }

    // This runs every DELETE below inside one real transaction. It used to send
    // START TRANSACTION through the pool, which hands each query whichever
    // connection is free, so the statements ran on different connections, every
    // DELETE auto-committed on its own, the ROLLBACK in the catch applied to a
    // connection that had done nothing, and a connection went back to the pool
    // with a transaction still open on it. A failure halfway through this loop
    // left one group's votes deleted and the next group's intact, permanently.
    // Acquiring is outside the try below on purpose: there is no connection to
    // release yet. But it must not be bare either. When the pool is saturated
    // or the DB is down the acquire rejects, Express 4 does not catch a
    // rejected async handler, and the request hangs with no response while
    // the process-level handler only logs. Answer 503 so the advisor sees it.
    let conn;
    try {
      conn = await this.db.promise().getConnection();
    } catch (acquireErr) {
      console.error('Could not get a database connection for assignJobToAllGroups:', acquireErr);
      res.status(503).json({ error: 'Database is busy, please try again' });
      return;
    }

    try {
      // Get all groups for the class
      const [groupsResult] = (await conn.query(
        'SELECT DISTINCT group_id FROM `GroupsInfo` WHERE class_id = ? ORDER BY group_id',
        [class_id]
      )) as any[];

      if (groupsResult.length === 0) {
        res.status(404).json({ error: 'No groups found for this class' });
        return;
      }

      const groupIds = groupsResult.map((group: any) => group.group_id);
      console.log(`Found ${groupIds.length} groups for class ${class_id}:`, groupIds);

      await conn.beginTransaction();

      // Process each group
      for (const groupId of groupIds) {
        // Insert/update job assignment
        await conn.query(
          `INSERT INTO Job_Assignment (\`group\`, \`class\`, job)
          VALUES (?, ?, ?)
          ON DUPLICATE KEY UPDATE job = VALUES(job)`,
          [groupId, class_id, job_title]
        );

        // Update students' current page
        await conn.query(
          "UPDATE Users SET `current_page` = 'jobdes' WHERE group_id = ? AND class = ? AND affiliation = 'student'",
          [groupId, class_id]
        );

        // Update progress
        await conn.query(
          "UPDATE Progress SET step = 'job_description' WHERE crn = ? AND group_id = ?",
          [class_id, groupId]
        );

        // Clear all related data for this group
        await conn.query('DELETE FROM InterviewPage WHERE class = ? AND group_id = ?', [
          class_id,
          groupId,
        ]);
        await conn.query('DELETE FROM Resume WHERE class = ? AND group_id = ?', [
          class_id,
          groupId,
        ]);
        await conn.query('DELETE FROM Interview_Status WHERE class = ? AND group_id = ?', [
          class_id,
          groupId,
        ]);
        await conn.query('DELETE FROM InterviewPopup WHERE class = ? AND group_id = ?', [
          class_id,
          groupId,
        ]);

        // Get students in this group and clear their data
        const [students] = (await conn.query(
          "SELECT email FROM Users WHERE group_id = ? AND class = ? AND affiliation = 'student'",
          [groupId, class_id]
        )) as any[];

        const emails = students.map(({ email }: any) => email);

        if (emails.length > 0) {
          const placeholders = emails.map(() => '?').join(',');
          await conn.query(`DELETE FROM Notes WHERE user_email IN (${placeholders})`, emails);
        }

        // The barrier now lives in Step_Completion, not in process memory. The
        // Resume rows above were just wiped, so a completion left behind here
        // would mark this group as already finished with zero decisions in the
        // table and the barrier would release into an empty review. Clear it in
        // the same transaction as the work it describes.
        await conn.query('DELETE FROM Step_Completion WHERE class = ? AND group_id = ?', [
          class_id,
          groupId,
        ]);
      }

      await conn.commit();

      // Only after the commit. These used to fire inside the loop, so a failure
      // partway through told the earlier groups their job had changed and then
      // rolled the change back underneath them.
      for (const groupId of groupIds) {
        this.io.to(`group_${groupId}_class_${class_id}`).emit('jobUpdated', {
          job: job_title,
        });
      }

      console.log(
        `✅ Successfully assigned job "${job_title}" to ${groupIds.length} groups in class ${class_id}`
      );

      res.json({
        message: 'Job assigned to all groups successfully',
        class_id: classIdInt,
        job_title,
        groups_updated: groupIds.length,
        group_ids: groupIds,
        cleared_tables: ['InterviewPage', 'Resume', 'Interview_Status', 'InterviewPopup', 'Notes'],
      });
    } catch (error: any) {
      try {
        await conn.rollback();
      } catch (rollbackError) {
        console.error('Rollback failed:', rollbackError);
      }

      console.error('Error assigning job to all groups:', error);
      res.status(500).json({
        error: 'Database error occurred while assigning job to all groups',
        details: error.message,
      });
    } finally {
      conn.release();
    }
  };

  updateJob = async (req: AuthRequest, res: Response): Promise<void> => {
    const { job_group_id, class_id, job } = req.body;

    if (!job_group_id || !class_id || !job || job.length === 0) {
      res.status(400).json({ error: 'Group ID, class ID, and job are required.' });
      return;
    }

    const groupIdInt = parseInt(job_group_id);
    if (isNaN(groupIdInt) || groupIdInt <= 0) {
      console.log('❌ Invalid job_group_id:', job_group_id);
      res.status(400).json({ error: 'job_group_id must be a valid positive integer.' });
      return;
    }

    const classIdInt = parseInt(class_id);
    if (isNaN(classIdInt) || classIdInt <= 0) {
      console.log('❌ Invalid class_id:', class_id);
      res.status(400).json({ error: 'class_id must be a valid positive integer.' });
      return;
    }

    console.log('Updating job for group:', { job_group_id: groupIdInt, class_id: classIdInt, job });

    // Same fix as assignJobToAllGroups: one connection, a real transaction, and
    // a release in `finally`. Through the pool the four DELETEs below each
    // committed on their own and the ROLLBACK did nothing.
    // See assignJobToAllGroups for why the acquire has its own catch.
    let conn;
    try {
      conn = await this.db.promise().getConnection();
    } catch (acquireErr) {
      console.error('Could not get a database connection for updateJob:', acquireErr);
      res.status(503).json({ error: 'Database is busy, please try again' });
      return;
    }

    try {
      await conn.beginTransaction();

      const jobTitle = Array.isArray(job) ? job[0] : job;
      await conn.query(
        `INSERT INTO Job_Assignment (\`group\`, \`class\`, job)
         VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE job = VALUES(job)`,
        [job_group_id, class_id, jobTitle]
      );

      await conn.query(
        "UPDATE Users SET `current_page` = 'jobdes' WHERE group_id = ? AND class = ? AND affiliation = 'student'",
        [job_group_id, class_id]
      );

      await conn.query(
        "UPDATE Progress SET step = 'job_description' WHERE crn = ? AND group_id = ?",
        [class_id, job_group_id]
      );

      await conn.query('DELETE FROM InterviewPage WHERE class = ? AND group_id = ?', [
        class_id,
        job_group_id,
      ]);
      await conn.query('DELETE FROM Resume WHERE class = ? AND group_id = ?', [
        class_id,
        job_group_id,
      ]);
      await conn.query('DELETE FROM Interview_Status WHERE class = ? AND group_id = ?', [
        class_id,
        job_group_id,
      ]);
      await conn.query('DELETE FROM InterviewPopup WHERE class = ? AND group_id = ?', [
        class_id,
        job_group_id,
      ]);

      const [students] = (await conn.query(
        "SELECT email FROM Users WHERE group_id = ? AND class = ? AND affiliation = 'student'",
        [job_group_id, class_id]
      )) as any[];

      const emails = students.map(({ email }: any) => email);

      if (emails.length > 0) {
        const placeholders = emails.map(() => '?').join(',');
        await conn.query(`DELETE FROM Notes WHERE user_email IN (${placeholders})`, emails);
      }

      // Same reason as assignJobToAllGroups: the group's work was just wiped,
      // so its barrier completions must go with it or the group reads as done.
      await conn.query('DELETE FROM Step_Completion WHERE class = ? AND group_id = ?', [
        class_id,
        job_group_id,
      ]);

      await conn.commit();

      console.log('Emitting jobUpdated event via Socket.IO to online students in the group/class');
      console.log('Online students record:', this.onlineStudents);
      console.log('this is the emails', emails);
      const roomID = `group_${job_group_id}_class_${class_id}`;
      this.io.to(roomID).emit('jobUpdated', {
        job: jobTitle,
      });

      console.log(
        `Job "${jobTitle}" assigned to Group ${job_group_id} in Class ${class_id}. All related data cleared.`
      );

      res.json({
        message: 'Group job updated and all related data cleared successfully!',
        job_group_id,
        class_id,
        job: jobTitle,
        cleared_tables: ['InterviewPage', 'Resume', 'Interview_Status', 'InterviewPopup', 'Notes'],
        students_affected: emails.length,
        job_assignment_updated: true,
      });
    } catch (error: any) {
      try {
        await conn.rollback();
      } catch (rollbackError) {
        console.error('Rollback failed:', rollbackError);
      }

      console.error('Error updating job and clearing data:', error);
      res.status(500).json({
        error: 'Database error occurred while updating job and clearing data',
        details: error.message,
      });
    } finally {
      conn.release();
    }
  };

  getJobAssignment = (req: AuthRequest, res: Response): void => {
    const { groupId, classId } = req.params;

    this.db.query(
      'SELECT job FROM Job_Assignment WHERE `group` = ? AND `class` = ?',
      [groupId, classId],
      (err, results: any[]) => {
        if (err) {
          console.error('Error fetching job assignment:', err);
          res.status(500).json({ error: err.message });
          return;
        }

        if (results.length === 0) {
          res.status(201).json({ message: 'No job assignment found for this group' });
          return;
        }

        res.json({ job: results[0].job });
      }
    );
  };
}
