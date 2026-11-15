import { Response } from 'express';
import { Pool, ResultSetHeader, RowDataPacket } from 'mysql2';
import { Server as SocketIOServer } from 'socket.io';
import { AuthRequest } from '../models/AuthRequest';
import { ClassCode, JoinClassConfirmNeeded } from '../models/ClassCode';
import { isAdmin } from '../models/User';
import { generateClassCode, normalizeClassCode } from '../config/classCode';
import { dbErrorStatus, dbNow } from '../config/database';
import {
  RES_REVIEW_BARRIER_STEP,
  broadcastGroupBarrier,
  emitToClassModerators,
} from '../config/socket';
import { RESTAMP_ON_MOVE } from './group.controller';

// 31^6 is close to 900 million codes, so even one collision is rare; a few
// retries only guard against bad luck, and running out means something is wrong.
const MAX_CODE_ATTEMPTS = 5;

const isDuplicate = (err: unknown): boolean =>
  (err as { code?: string } | null)?.code === 'ER_DUP_ENTRY';

export class ClassCodeController {
  constructor(
    private db: Pool,
    private io: SocketIOServer
  ) {}

  private async findCodeForClass(crn: number): Promise<string | undefined> {
    const [rows] = await this.db
      .promise()
      .query<(RowDataPacket & Pick<ClassCode, 'code'>)[]>(
        'SELECT code FROM ClassCodes WHERE crn = ?',
        [crn]
      );
    return rows[0]?.code;
  }

  // Classes get a code the first time their professor asks, so the classes that
  // existed before codes did need no backfill.
  private async getOrCreateCode(crn: number): Promise<string> {
    const existing = await this.findCodeForClass(crn);
    if (existing) return existing;

    for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt++) {
      const code = generateClassCode();
      try {
        await this.db
          .promise()
          .query('INSERT INTO ClassCodes (crn, code, created_at) VALUES (?, ?, ?)', [
            crn,
            code,
            dbNow(),
          ]);
        return code;
      } catch (err) {
        if (!isDuplicate(err)) throw err;
        // A duplicate crn means a second request for this class got there first
        // (a page that fetches twice on load). Show that code rather than
        // replacing it, or the first tab would be showing a dead one.
        const created = await this.findCodeForClass(crn);
        if (created) return created;
      }
    }
    throw new Error(`Could not find an unused class code for ${crn}`);
  }

  // Replacing the row's code is what makes the old one stop working.
  private async replaceCode(crn: number): Promise<string> {
    for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt++) {
      const code = generateClassCode();
      try {
        const [updated] = await this.db
          .promise()
          .query<ResultSetHeader>('UPDATE ClassCodes SET code = ?, created_at = ? WHERE crn = ?', [
            code,
            dbNow(),
            crn,
          ]);
        if (updated.affectedRows === 0) {
          await this.db
            .promise()
            .query('INSERT INTO ClassCodes (crn, code, created_at) VALUES (?, ?, ?)', [
              crn,
              code,
              dbNow(),
            ]);
        }
        return code;
      } catch (err) {
        if (!isDuplicate(err)) throw err;
      }
    }
    throw new Error(`Could not find an unused class code for ${crn}`);
  }

  // requireClassModerator has already checked the caller teaches this class.
  getClassCode = async (req: AuthRequest, res: Response): Promise<void> => {
    const crn = Number(req.params.class_id);
    try {
      const code = await this.getOrCreateCode(crn);
      res.json({ classId: crn, code });
    } catch (err) {
      console.error(`Could not get the class code for ${crn}:`, err);
      res.status(dbErrorStatus(err)).json({ error: 'Could not load the class code' });
    }
  };

  regenerateClassCode = async (req: AuthRequest, res: Response): Promise<void> => {
    const crn = Number(req.params.class_id);
    try {
      const code = await this.replaceCode(crn);
      res.json({ classId: crn, code });
    } catch (err) {
      console.error(`Could not regenerate the class code for ${crn}:`, err);
      res.status(dbErrorStatus(err)).json({ error: 'Could not make a new class code' });
    }
  };

  // A student moves themself into the class a code belongs to, ungrouped, so the
  // professor places them. One class at a time: leaving the old class needs an
  // explicit confirm, because it also takes them out of their group.
  joinClass = async (req: AuthRequest, res: Response): Promise<void> => {
    const me = req.user!;
    if (isAdmin(me)) {
      res.status(403).json({ error: 'Only students can join a class with a code.' });
      return;
    }

    const code = normalizeClassCode(req.body?.code);
    if (!code) {
      res.status(400).json({ error: 'Enter the 6-character class code your professor gave you.' });
      return;
    }
    const confirmed = req.body?.confirm === true;

    try {
      const [rows] = await this.db
        .promise()
        .query<(RowDataPacket & Pick<ClassCode, 'crn'>)[]>(
          'SELECT crn FROM ClassCodes WHERE code = ?',
          [code]
        );
      if (rows.length === 0) {
        res.status(404).json({
          error:
            'That class code is not valid. It may have been replaced; ask your professor for the current code.',
        });
        return;
      }
      const newClass = Number(rows[0].crn);
      const oldClass = me.class == null ? null : Number(me.class);
      const oldGroup = me.group_id == null ? null : Number(me.group_id);

      if (oldClass === newClass) {
        // Rows imported before the CSV set `affiliation` sit at 'none' with a
        // class (see createUser). Grant the role but keep their group.
        if (me.affiliation !== 'student') {
          await this.db
            .promise()
            .query("UPDATE Users SET affiliation = 'student' WHERE id = ?", [me.id]);
        }
        res.json({ message: 'You are already in this class.', classId: newClass, changed: false });
        return;
      }

      if (oldClass !== null && oldClass !== newClass && !confirmed) {
        const body: JoinClassConfirmNeeded = {
          error: `You are in class ${oldClass}. Joining this class removes you from that class and from your group.`,
          requiresConfirm: true,
          currentClass: oldClass,
        };
        res.status(409).json(body);
        return;
      }

      const conn = await this.db.promise().getConnection();
      try {
        await conn.beginTransaction();
        // Same cleanup as a professor moving a student: these rows describe the
        // group being left, and kept they would read as already confirmed or
        // already finished if the student ever came back to it. Their votes,
        // ratings and notes are kept.
        await conn.query('DELETE FROM GroupConfirmations WHERE student_id = ?', [me.id]);
        await conn.query('DELETE FROM Step_Completion WHERE student_id = ?', [me.id]);
        // A code is how a student with no roster row gets into a class, so it
        // also grants the student role that the CSV import would have.
        await conn.query(
          `UPDATE Users SET class = ?, group_id = NULL, affiliation = 'student', ${RESTAMP_ON_MOVE}
            WHERE id = ?`,
          [newClass, dbNow(), me.id]
        );
        await conn.commit();
      } catch (err) {
        await conn.rollback();
        throw err;
      } finally {
        conn.release();
      }

      this.announceMove(me.email, oldClass, oldGroup, newClass);
      res.json({ message: 'You joined the class.', classId: newClass, changed: true });
    } catch (err) {
      console.error(`Could not join ${me.email} to a class by code:`, err);
      res.status(dbErrorStatus(err)).json({ error: 'Could not join the class. Try again.' });
    }
  };

  // Fire-and-forget, like GroupController.recountBarrier: the move is committed
  // and the student told, so a failed notification must not become a 500.
  private announceMove(
    email: string,
    oldClass: number | null,
    oldGroup: number | null,
    newClass: number
  ): void {
    if (oldClass !== null && oldGroup !== null) {
      this.io
        .to(`group_${oldGroup}_class_${oldClass}`)
        .emit('studentRemovedFromGroup', { email, groupId: oldGroup, classId: oldClass });
      // The old group may have been waiting only on this student.
      broadcastGroupBarrier(this.io, this.db, oldClass, oldGroup, RES_REVIEW_BARRIER_STEP).catch(
        (err) => {
          console.error(`Error recounting the barrier for group ${oldGroup}/${oldClass}:`, err);
        }
      );
    }
    if (oldClass !== null && oldClass !== newClass) {
      emitToClassModerators(this.io, this.db, oldClass, 'userAdded');
    }
    emitToClassModerators(this.io, this.db, newClass, 'userAdded');
  }
}
