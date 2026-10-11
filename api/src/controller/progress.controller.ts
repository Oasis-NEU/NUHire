// ============================================
// src/controllers/progress.controller.ts
// ============================================

import { Response } from 'express';
import { AuthRequest } from '../models/AuthRequest';
import { Pool, RowDataPacket } from 'mysql2';
import { emitToClassModerators } from '../config/socket';
import { STEP_ORDER, isStep, decideStep } from '../config/steps';

export class ProgressController {
  constructor(
    private db: Pool,
    private io: any
  ) {}

  getProgressByGroup = (req: AuthRequest, res: Response): void => {
    const { crn, group_id } = req.params;

    this.db.query(
      'SELECT * FROM Progress WHERE crn = ? AND group_id = ?',
      [crn, group_id],
      (err, results) => {
        if (err) {
          console.error('Error fetching group progress:', err);
          res.status(500).json({ error: err.message });
          return;
        }
        res.json(results);
      }
    );
  };

  getProgressByUser = (req: AuthRequest, res: Response): void => {
    const { email } = req.params;

    this.db.query('SELECT * FROM Progress WHERE email = ?', [email], (err, results: any[]) => {
      if (err) {
        console.error('Error fetching user progress:', err);
        res.status(500).json({ error: err.message });
        return;
      }
      res.json(results[0] || null);
    });
  };

  updateProgress = (req: AuthRequest, res: Response): void => {
    const { step } = req.body;

    // Identity comes from the session
    const email = req.user?.email;
    const group_id = req.user?.group_id;
    const crn = req.user?.class;

    if (!email || !group_id || !crn) {
      res.status(400).json({ error: 'You are not assigned to a group yet' });
      return;
    }
    if (!isStep(step)) {
      res.status(400).json({ error: `Invalid step: ${step}` });
      return;
    }

    this.db.query('SELECT step FROM Progress WHERE email = ?', [email], (selErr, rows) => {
      if (selErr) {
        console.error('Error reading progress:', selErr);
        res.status(500).json({ error: selErr.message });
        return;
      }

      const stored: string | null = (rows as RowDataPacket[])[0]?.step ?? null;
      const decision = decideStep(stored, step);

      if (decision === 'reject') {
        res.status(409).json({ error: 'Step not allowed yet', currentStep: stored ?? 'none' });
        return;
      }

      if (decision === 'noop') {
        res.json({ success: true, message: 'Progress unchanged', step: stored ?? 'none' });
        return;
      }

      // Two racing requests can't both advance step
      const fromIndex = STEP_ORDER.indexOf(stored ?? 'none') + 1;

      this.db.query(
        `INSERT INTO Progress (crn, group_id, step, email)
          VALUES (?, ?, ?, ?)
          ON DUPLICATE KEY UPDATE step = IF(step IS NULL OR step + 0 = ?, VALUES(step), step)`,
        [crn, group_id, step, email, fromIndex],
        (err) => {
          if (err) {
            console.error('Error updating progress:', err);
            res.status(500).json({ error: err.message });
            return;
          }

          const payload = { crn, group_id, step, email };
          this.io.to(`group_${group_id}_class_${crn}`).emit('progressUpdated', payload);

          emitToClassModerators(this.io, this.db, crn, 'progressUpdated', payload);

          res.json({ success: true, message: 'Progress updated successfully', step });
        }
      );
    });
  };

  // --- Group-selection confirmations (res-review-group) -------------------
  //
  // These used to live only in React state. A refresh reset the tally to 0 and
  // left the already-confirmed student with a disabled Confirm button, so the
  // group deadlocked unless every member reloaded in the same instant. The
  // table is the record; the socket events below are only a live nudge, and the
  // GET is the fallback a client can poll after a reconnect.

  // Identity comes from the session, never the request. A client-supplied
  // group_id or student_id would let one student confirm on a teammate's behalf
  // and push a group past the barrier without them.
  private sessionGroup(
    req: AuthRequest
  ): { studentId: number; groupId: number; classId: number } | null {
    const studentId = req.user?.id;
    const groupId = req.user?.group_id;
    const classId = req.user?.class;

    if (!studentId || !groupId || !classId) {
      return null;
    }

    return { studentId, groupId, classId };
  }

  // Scoped by group_id AND class. Scoping by group_id alone counts a student
  // from another course section towards this group's confirmation tally.
  private readConfirmations(
    groupId: number,
    classId: number,
    done: (err: Error | null, confirmations: string[]) => void
  ): void {
    // Joined to the current roster on purpose. A confirmation row outlives a
    // mid-class reassignment or removal, so without this a group could pass
    // the gate on rows from students who are no longer in it, while a member
    // added five minutes ago never confirmed and nobody could tell.
    this.db.query(
      `SELECT gc.student_id
         FROM GroupConfirmations gc
         JOIN Users u
           ON u.id = gc.student_id
          AND u.group_id = gc.group_id
          AND u.class = gc.class
          AND u.affiliation = 'student'
        WHERE gc.group_id = ? AND gc.class = ?`,
      [groupId, classId],
      (err, results) => {
        if (err) {
          done(err, []);
          return;
        }

        const rows = results as RowDataPacket[];
        done(
          null,
          rows.map((row) => String(row.student_id))
        );
      }
    );
  }

  getGroupConfirmations = (req: AuthRequest, res: Response): void => {
    const identity = this.sessionGroup(req);
    if (!identity) {
      res.status(400).json({ error: 'You are not assigned to a group yet' });
      return;
    }

    this.readConfirmations(identity.groupId, identity.classId, (err, confirmations) => {
      if (err) {
        console.error('Error fetching group confirmations:', err);
        res.status(500).json({ error: err.message });
        return;
      }
      res.json({ confirmations });
    });
  };

  confirmGroupSelection = (req: AuthRequest, res: Response): void => {
    const identity = this.sessionGroup(req);
    if (!identity) {
      res.status(400).json({ error: 'You are not assigned to a group yet' });
      return;
    }

    const { studentId, groupId, classId } = identity;

    this.db.query(
      `INSERT INTO GroupConfirmations (group_id, class, student_id)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE confirmed_at = CURRENT_TIMESTAMP`,
      [groupId, classId, studentId],
      (err) => {
        if (err) {
          console.error('Error recording group confirmation:', err);
          res.status(500).json({ error: err.message });
          return;
        }
        this.announceConfirmationChange(res, 'teamConfirmSelection', identity);
      }
    );
  };

  unconfirmGroupSelection = (req: AuthRequest, res: Response): void => {
    const identity = this.sessionGroup(req);
    if (!identity) {
      res.status(400).json({ error: 'You are not assigned to a group yet' });
      return;
    }

    const { studentId, groupId, classId } = identity;

    this.db.query(
      'DELETE FROM GroupConfirmations WHERE group_id = ? AND class = ? AND student_id = ?',
      [groupId, classId, studentId],
      (err) => {
        if (err) {
          console.error('Error removing group confirmation:', err);
          res.status(500).json({ error: err.message });
          return;
        }
        this.announceConfirmationChange(res, 'teamUnconfirmSelection', identity);
      }
    );
  };

  // Broadcast after the write, so a teammate who refetches on the event always
  // reads a database that already contains it. The reply carries the full list
  // as well, so the acting client does not depend on receiving its own event.
  private announceConfirmationChange(
    res: Response,
    event: 'teamConfirmSelection' | 'teamUnconfirmSelection',
    { studentId, groupId, classId }: { studentId: number; groupId: number; classId: number }
  ): void {
    const roomId = `group_${groupId}_class_${classId}`;

    // Room, not io.emit: a bare broadcast reaches every class on the server.
    this.io.to(roomId).emit(event, {
      groupId,
      classId,
      studentId: String(studentId),
      roomId,
    });

    this.readConfirmations(groupId, classId, (err, confirmations) => {
      if (err) {
        console.error('Error reading back group confirmations:', err);
        res.status(500).json({ error: err.message });
        return;
      }
      res.json({ success: true, confirmations });
    });
  }
}
