import { Response } from 'express';
import { AuthRequest } from '../models/types';
import { Pool } from 'mysql2';
import { dbErrorStatus } from '../config/database';

export class NoteController {
  constructor(private db: Pool) {}

  getNotes = (req: AuthRequest, res: Response): void => {
    // Notes are private. Always use the authenticated identity; a client-supplied
    // user_email let any student read any other student's notes.
    const userEmail = req.user?.email;
    if (!userEmail) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }
    this.db.query(
      'SELECT * FROM Notes WHERE user_email = ? ORDER BY created_at DESC',
      [userEmail],
      (err, results) => {
        if (err) {
          // err.message names the table and column that failed, which handed
          // any student a map of the schema. Log it, return nothing useful.
          console.error('Error fetching notes:', err);
          res.status(dbErrorStatus(err)).json({ error: 'Failed to fetch notes' });
          return;
        }
        res.json(results);
      }
    );
  };

  createNote = (req: AuthRequest, res: Response): void => {
    const { content } = req.body;
    // Ignore any client-supplied email; notes belong to the caller.
    const user_email = req.user?.email;

    if (!user_email) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }
    if (!content) {
      res.status(400).json({ error: 'Note content is required' });
      return;
    }

    this.db.query(
      'INSERT INTO Notes (user_email, content, created_at) VALUES (?, ?, NOW())',
      [user_email, content],
      (err, result: any) => {
        if (err) {
          console.error('Error creating note:', err);
          res.status(dbErrorStatus(err)).json({ error: 'Failed to save note' });
          return;
        }
        res.status(200).json({ content, id: result.insertId });
      }
    );
  };
}
