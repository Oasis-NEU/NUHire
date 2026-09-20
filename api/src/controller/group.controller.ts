// src/controllers/group.controller.ts

import { Response } from 'express';
import { AuthRequest } from '../models/types';
import { Pool, RowDataPacket } from 'mysql2';
import { PoolConnection } from 'mysql2/promise';
import {
  RES_REVIEW_BARRIER_STEP,
  broadcastGroupBarrier,
  evaluateGroupBarrier,
} from '../config/socket';

// The `Progress`.`step` values, in the order a group walks them. Shared by
// getProgress (which wants the group's leftmost member) and forceAdvance (which
// needs to know what comes before the step it is pushing the group to).
const STEP_ORDER = [
  'none',
  'job_description',
  'res_1',
  'res_2',
  'interview',
  'offer',
  'employer',
] as const;

// Where each step is rendered. This duplicates STEP_TO_ROUTE in
// frontend/src/app/components/useProgress.tsx because the two live in different
// processes; they have to be changed together. It exists here only because
// moveGroup carries a route path, which is what every page's handler compares
// against — sending a step name instead would be silently ignored by all of
// them and the group would stay put.
const STEP_TO_ROUTE: Record<string, string> = {
  none: '/dashboard',
  job_description: '/jobdes',
  res_1: '/res-review',
  res_2: '/res-review-group',
  interview: '/interview-stage',
  offer: '/makeOffer',
  employer: '/employerPanel',
};

// A group is wherever its slowest member is. Rows at 'none' are members who
// have not started and do not hold the group back; an unknown value sorts
// first, so a bad row surfaces as the group's step rather than vanishing.
//
// One function for both readers on purpose. getProgress is what the advisor
// dashboard shows the professor, and forceAdvance decides what it will accept
// from that same number; if the two computed it differently the professor
// would be refused a move the screen in front of them said was next.
function leftmostStep(steps: string[]): string {
  const order: readonly string[] = STEP_ORDER;
  const started = steps.filter((step) => step !== 'none');
  if (started.length === 0) return 'none';
  return started.reduce((earliest, current) =>
    order.indexOf(current) < order.indexOf(earliest) ? current : earliest
  );
}

export class GroupController {
  constructor(
    private db: Pool,
    private io: any
  ) {}

  // Re-evaluate a group's barrier after its roster changed, and release the
  // group if that change completed it. Fire-and-forget on purpose: the caller
  // has already told the student their change succeeded, and a failure to
  // recount must not turn that into a 500.
  private recountBarrier(classId: number | string, groupId: number | string): void {
    broadcastGroupBarrier(this.io, this.db, classId, groupId, RES_REVIEW_BARRIER_STEP).catch(
      (error) => {
        console.error(`Error recounting the barrier for group ${groupId}/${classId}:`, error);
      }
    );
  }

  getGroups = async (req: AuthRequest, res: Response): Promise<void> => {
    const { class: classId } = req.query;

    try {
      const promiseDb = this.db.promise();
      const [groupsResult] = (await promiseDb.query(
        'SELECT DISTINCT group_id FROM `GroupsInfo` WHERE class_id = ? ORDER BY group_id',
        [classId]
      )) as any[];

      const groupIds = groupsResult.map((group: any) => group.group_id);
      res.json(groupIds);
    } catch (error) {
      console.error('Error fetching groups:', error);
      res.status(500).json({ error: 'Failed to fetch groups' });
    }
  };

  updateGroup = (req: AuthRequest, res: Response): void => {
    const { group_id, students } = req.body;

    if (!group_id || students.length === 0) {
      res.status(400).json({ error: 'Group ID and students are required.' });
      return;
    }

    const queries = students.map((email: string) => {
      return new Promise((resolve, reject) => {
        this.db.query(
          'UPDATE Users SET `group_id` = ? WHERE email = ?',
          [group_id, email],
          (err, result) => {
            if (err) reject(err);
            resolve(result);
          }
        );
      });
    });

    Promise.all(queries)
      .then(() => res.json({ message: 'Group updated successfully!' }))
      .catch((error) => res.status(500).json({ error: (error as any).message }));
  };

  createGroups = (req: AuthRequest, res: Response): void => {
    const { class_id, num_groups } = req.body;

    if (!class_id || !num_groups) {
      res.status(400).json({
        error: 'Missing required fields: class_id, num_groups',
      });
      return;
    }

    this.db.query(
      'SELECT COUNT(*) as group_count FROM `GroupsInfo` WHERE class_id = ?',
      [class_id],
      (err, result: any[]) => {
        if (err) {
          console.error('Error checking existing groups:', err);
          res.status(500).json({ error: 'Failed to check existing groups' });
          return;
        }

        const existingGroupCount = result[0].group_count;

        if (existingGroupCount > 0) {
          res.status(400).json({
            error: 'Groups already exist for this class',
            existing_groups: existingGroupCount,
          });
          return;
        }

        const insertPromises = [];
        for (let i = 1; i <= num_groups; i++) {
          const insertPromise = new Promise((resolve, reject) => {
            const query = `
            INSERT INTO GroupsInfo (class_id, group_id, started)
            VALUES (?, ?, 0)
          `;

            this.db.query(query, [class_id, i], (insertErr, insertResult: any) => {
              if (insertErr) {
                reject({ id: i, error: insertErr.message });
              } else {
                resolve({
                  id: i,
                  insertId: insertResult.insertId,
                });
              }
            });
          });

          insertPromises.push(insertPromise);
        }

        Promise.allSettled(insertPromises).then((results) => {
          const successful = results
            .filter((r) => r.status === 'fulfilled')
            .map((r) => (r as any).value);
          const failed = results
            .filter((r) => r.status === 'rejected')
            .map((r) => (r as any).reason);

          if (failed.length > 0) {
            console.error(`Failed to create ${failed.length} groups:`, failed);
          }

          res.json({
            message: 'Groups created successfully',
            class_id: parseInt(class_id),
            groups_created: successful.length,
            groups_failed: failed.length,
            groups: successful,
          });
        });
      }
    );
  };

  getStudentsByClass = (req: AuthRequest, res: Response): void => {
    const { classId } = req.params;

    const query = `SELECT * FROM Users WHERE class = ?`;

    this.db.query(query, [classId], (err, results) => {
      if (err) {
        console.error('Error fetching students by class:', err);
        res.status(500).json({ error: 'Failed to fetch students' });
        return;
      }

      res.json(results);
    });
  };

  reassignStudent = (req: AuthRequest, res: Response): void => {
    const { email, new_group_id, class_id } = req.body;

    if (!email || !new_group_id || !class_id) {
      res.status(400).json({
        error: 'Missing required fields: email, new_group_id, class_id',
      });
      return;
    }

    const updateQuery = 'UPDATE Users SET group_id = ? WHERE email = ? AND class = ?';

    this.db.query(updateQuery, [new_group_id, email, class_id], (err, result: any) => {
      if (err) {
        console.error('Error reassigning student to new group:', err);
        res.status(500).json({ error: 'Failed to reassign student' });
        return;
      }

      if (result.affectedRows === 0) {
        res.status(404).json({ error: 'Student not found in this class' });
        return;
      }

      // Emit socket event to notify the NEW group
      const roomId = `group_${new_group_id}_class_${class_id}`;
      this.io.to(roomId).emit('studentAddedToGroup', {
        groupId: new_group_id,
        classId: class_id,
      });

      // A moved student's confirmation and step-completion rows describe the
      // group they LEFT. Left in place they are ignored by the current-member
      // joins, but the moment the student is moved back (a mis-click, undone)
      // they would reappear as already confirmed and already finished for a
      // selection they never saw. Clear them before recounting.
      const clearStale = (cb: () => void) => {
        this.db.query(
          'DELETE gc FROM GroupConfirmations gc JOIN Users u ON u.id = gc.student_id WHERE u.email = ? AND u.class = ?',
          [email, class_id],
          (e1) => {
            if (e1) console.error('Could not clear stale confirmations on reassign:', e1);
            this.db.query(
              'DELETE sc FROM Step_Completion sc JOIN Users u ON u.id = sc.student_id WHERE u.email = ? AND u.class = ?',
              [email, class_id],
              (e2) => {
                if (e2) console.error('Could not clear stale completions on reassign:', e2);
                cb();
              }
            );
          }
        );
      };

      clearStale(() => {
        // The roster is what the barrier counts against, so a change to it can
        // open or close the gate. Re-evaluating here is what stops a group that
        // was waiting on somebody who has just been moved out from waiting
        // forever. (The OLD group is not recounted: this handler never learns
        // which group the student came from. That is TCH-16.)
        this.recountBarrier(class_id, new_group_id);

        res.json({
          message: 'Student reassigned successfully',
          email,
          new_group_id,
          class_id,
        });
      });
    });
  };

  removeFromGroup = (req: AuthRequest, res: Response): void => {
    const { email, class_id } = req.body;

    if (!email || !class_id) {
      res.status(400).json({
        error: 'Missing required fields: email, class_id',
      });
      return;
    }

    // First get the student's group_id before removing them
    const getGroupQuery = 'SELECT group_id FROM Users WHERE email = ? AND class = ?';

    this.db.query(getGroupQuery, [email, class_id], (err, results: any) => {
      if (err) {
        console.error('Error fetching student group:', err);
        res.status(500).json({ error: 'Failed to fetch student information' });
        return;
      }

      const studentGroupId = results[0]?.group_id;

      const updateQuery = 'UPDATE Users SET group_id = NULL WHERE email = ? AND class = ?';

      this.db.query(updateQuery, [email, class_id], (err, result: any) => {
        if (err) {
          console.error('Error removing student from group:', err);
          res.status(500).json({ error: 'Failed to remove student from group' });
          return;
        }

        if (result.affectedRows === 0) {
          res.status(404).json({ error: 'Student not found in this class' });
          return;
        }

        // Emit socket event to notify the group
        if (studentGroupId && this.io) {
          const roomId = `group_${studentGroupId}_class_${class_id}`;
          this.io.to(roomId).emit('studentRemovedFromGroup', {
            email,
            groupId: studentGroupId,
            classId: class_id,
          });
        }

        // Same reason as reassignStudent: rows for the group this student just
        // left would come back as "already confirmed / already finished" the
        // moment an advisor re-adds them. Clear, then recount.
        this.db.query(
          'DELETE gc FROM GroupConfirmations gc JOIN Users u ON u.id = gc.student_id WHERE u.email = ? AND u.class = ?',
          [email, class_id],
          (e1) => {
            if (e1) console.error('Could not clear stale confirmations on remove:', e1);
            this.db.query(
              'DELETE sc FROM Step_Completion sc JOIN Users u ON u.id = sc.student_id WHERE u.email = ? AND u.class = ?',
              [email, class_id],
              (e2) => {
                if (e2) console.error('Could not clear stale completions on remove:', e2);

                // Removing the member a group was waiting on can complete it.
                // The barrier is a count against the roster, and nothing else
                // recounts it, so without this the remaining members stay
                // blocked on someone who is no longer in their group.
                if (studentGroupId) this.recountBarrier(class_id, studentGroupId);

                res.json({
                  message: 'Student removed from group successfully',
                  email,
                  class_id,
                });
              }
            );
          }
        );
      });
    });
  };

  startAllGroups = (req: AuthRequest, res: Response): void => {
    const { class_id } = req.body;

    if (!class_id) {
      res.status(400).json({
        error: 'Missing required field: class_id',
      });
      return;
    }

    const updateQuery = 'UPDATE `GroupsInfo` SET started = 1 WHERE class_id = ?';

    this.db.query(updateQuery, [class_id], (err) => {
      if (err) {
        console.error('Error starting all groups:', err);
        res.status(500).json({ error: 'Failed to start all groups' });
        return;
      }

      this.io.to(`class_${class_id}`).emit('groupStartedClass');

      res.json({
        message: 'All groups started successfully',
        class_id,
      });
    });
  };

  startGroup = (req: AuthRequest, res: Response): void => {
    const { class_id, group_id } = req.body;

    if (!class_id || !group_id) {
      res.status(400).json({
        error: 'Missing required fields: class_id, group_id',
      });
      return;
    }

    const updateQuery = 'UPDATE `GroupsInfo` SET started = 1 WHERE class_id = ? AND group_id = ?';
    this.db.query(updateQuery, [class_id, group_id], (err) => {
      if (err) {
        console.error('Error starting group:', err);
        res.status(500).json({ error: 'Failed to start group' });
        return;
      }

      this.io.to(`class_${class_id}`).emit('groupStartedGroup', { group_id });

      res.json({
        message: 'Group started successfully',
        class_id,
        group_id,
      });
    });
  };

  getGroupStarted = (req: AuthRequest, res: Response): void => {
    const { classId, groupId } = req.params;

    const query = 'SELECT started FROM `GroupsInfo` WHERE class_id = ? AND group_id = ?';

    this.db.query(query, [classId, groupId], (err, results: any[]) => {
      if (err) {
        console.error('Error checking if group is started:', err);
        res.status(500).json({ error: 'Failed to check group status' });
        return;
      }

      if (results.length === 0) {
        res.status(404).json({ error: 'Group not found' });
        return;
      }

      res.json({ started: results[0].started });
    });
  };

  getGroupStatus = (req: AuthRequest, res: Response): void => {
    const { classId, groupId } = req.params;

    const query = 'SELECT started FROM `GroupsInfo` WHERE class_id = ? AND group_id = ?';

    this.db.query(query, [classId, groupId], (err, results: any[]) => {
      if (err) {
        console.error('Error fetching group status:', err);
        res.status(500).json({ error: 'Failed to fetch group status' });
        return;
      }

      if (results.length === 0) {
        res.status(404).json({ error: 'Group not found' });
        return;
      }

      res.json({ started: results[0].started });
    });
  };

  getGroupsSeen = (req: AuthRequest, res: Response): void => {
    const { email } = req.query;

    const query = `SELECT seen FROM Users WHERE email = ?`;

    this.db.query(query, [email], (err, results: any[]) => {
      if (err) {
        console.error('Error fetching groups seen status:', err);
        res.status(500).json({ error: 'Failed to fetch groups seen status' });
        return;
      }

      if (results.length === 0) {
        res.status(404).json({ error: 'User not found' });
        return;
      }

      res.json({ seen: results[0].seen });
    });
  };

  createSingleGroup = (req: AuthRequest, res: Response): void => {
    const { class_id, group_id } = req.body;

    if (!class_id || !group_id) {
      res.status(400).json({
        error: 'Missing required fields: class_id, group_id',
      });
      return;
    }

    const query = `
      INSERT INTO GroupsInfo (class_id, group_id, started)
      VALUES (?, ?, 0)
    `;

    this.db.query(query, [class_id, group_id], (err) => {
      if (err) {
        if (err.code === 'ER_DUP_ENTRY') {
          res.status(409).json({ error: 'Group already exists' });
          return;
        }
        console.error('Error creating group:', err);
        res.status(500).json({ error: 'Failed to create group' });
        return;
      }

      res.json({
        message: 'Group created successfully',
        class_id: parseInt(class_id),
        group_id: parseInt(group_id),
      });
    });
  };

  addStudent = (req: AuthRequest, res: Response): void => {
    const { email, class_id, group_id, f_name, l_name } = req.body;

    if (!email || !class_id || !group_id) {
      res.status(400).json({
        error: 'Missing required fields: email, class_id, group_id',
      });
      return;
    }

    // Check if the student exists in the database
    const checkStudentQuery = 'SELECT * FROM Users WHERE email = ?';

    this.db.query(checkStudentQuery, [email], (checkErr, checkResults: any[]) => {
      if (checkErr) {
        console.error('Error checking student:', checkErr);
        res.status(500).json({ error: 'Failed to check student' });
        return;
      }

      // If student doesn't exist, create them
      if (!checkResults || checkResults.length === 0) {
        const insertQuery = `
          INSERT INTO Users (email, affiliation, class, group_id)
          VALUES (?, 'student', ?, ?)
        `;

        this.db.query(insertQuery, [email, class_id, group_id], (insertErr) => {
          if (insertErr) {
            console.error('Error creating student:', insertErr);
            res.status(500).json({ error: 'Failed to create student' });
            return;
          }

          // Emit socket event to notify the group
          const roomId = `group_${group_id}_class_${class_id}`;
          this.io.to(roomId).emit('studentAddedToGroup', {
            groupId: group_id,
            classId: class_id,
          });

          // A new member raises the group's total, so the barrier has to be
          // recounted against the roster it now has.
          this.recountBarrier(class_id, group_id);

          res.status(201).json({
            message: 'Student created and added to group successfully',
            email,
            group_id,
            class_id,
            f_name,
            l_name,
            action: 'created',
          });
        });
        return;
      }

      // Student exists, check if they're already in this specific class
      const existingStudent = checkResults[0];

      if (existingStudent.class === class_id) {
        res.status(409).json({ error: 'Student already exists in this class' });
        return;
      }

      // Student exists but not in this class, update their class and group
      const updateQuery = 'UPDATE Users SET class = ?, group_id = ? WHERE email = ?';

      this.db.query(updateQuery, [class_id, group_id, email], (updateErr, updateResult: any) => {
        if (updateErr) {
          console.error('Error updating student:', updateErr);
          res.status(500).json({ error: 'Failed to add student to class and group' });
          return;
        }

        if (updateResult.affectedRows === 0) {
          res.status(404).json({ error: 'Student not added' });
          return;
        }

        // Emit socket event to notify the group
        const roomId = `group_${group_id}_class_${class_id}`;
        this.io.to(roomId).emit('studentAddedToGroup', {
          groupId: group_id,
          classId: class_id,
        });

        this.recountBarrier(class_id, group_id);

        res.json({
          message: 'Student added to group successfully',
          email,
          group_id,
          class_id,
          action: 'updated',
        });
      });
    });
  };

  deleteStudent = (req: AuthRequest, res: Response): void => {
    const { email, class_id } = req.body;

    if (!email || !class_id) {
      res.status(400).json({ error: 'Missing required fields: email, class_id' });
      return;
    }

    this.db.query(
      'DELETE FROM Users WHERE email = ? AND class = ?',
      [email, class_id],
      (err, result: any) => {
        if (err) {
          res.status(500).json({ error: 'Failed to delete student' });
          return;
        }
        if (result.affectedRows === 0) {
          res.status(404).json({ error: 'Student not found' });
          return;
        }
        res.json({ message: 'Student deleted successfully', email, class_id });
      }
    );
  };

  getProgress = (req: AuthRequest, res: Response): void => {
    const { classId, groupId } = req.params;

    const query = `
      SELECT step
      FROM Progress
      WHERE crn = ? AND group_id = ?
    `;

    this.db.query(query, [classId, groupId], (err, results: any[]) => {
      if (err) {
        console.error('Error fetching group progress:', err);
        res.status(500).json({ error: 'Failed to fetch group progress' });
        return;
      }

      const leftmost = leftmostStep(results.map((row: any) => row.step));

      res.json({ progress: leftmost });
    });
  };

  // How many members of this group have finished a step, answered over HTTP.
  //
  // The release used to reach a client as one socket event at one instant. A
  // student whose socket had dropped — the client gives up after five retries —
  // never got it and had no other way to ask, so they sat on a page their group
  // had left. This is that question without a socket: a client can poll it and
  // recover on its own.
  getBarrierStatus = async (req: AuthRequest, res: Response): Promise<void> => {
    const { classId, groupId } = req.params;
    const step = typeof req.query.step === 'string' ? req.query.step : RES_REVIEW_BARRIER_STEP;

    if (!(STEP_ORDER as readonly string[]).includes(step)) {
      res.status(400).json({ error: `Unknown step: ${step}` });
      return;
    }

    // A student may only read their own group. The params are client-supplied,
    // and without this check anyone could walk another section's group numbers
    // and watch who in it has finished.
    if (req.user?.affiliation !== 'admin') {
      const ownGroup =
        String(req.user?.group_id) === String(groupId) &&
        String(req.user?.class) === String(classId);
      if (!ownGroup) {
        res.status(403).json({ error: 'Forbidden: that is not your group' });
        return;
      }
    }

    try {
      const status = await evaluateGroupBarrier(this.db, classId, groupId, step);
      res.json(status);
    } catch (error) {
      console.error('Error evaluating group barrier:', error);
      res.status(500).json({ error: 'Failed to evaluate group barrier' });
    }
  };

  // The professor's way past a stuck group.
  //
  // `moveGroup` is otherwise emitted only by students, so when a group
  // deadlocked the only recourse was editing the database mid-class. This
  // writes the step for every member, records the barrier behind it as
  // satisfied so nothing pulls them back, and then emits moveGroup to the room.
  //
  // `target_step` must be the step immediately after the group's current one
  // (its slowest member's, the same number getProgress shows the professor).
  // That is not a policy choice; it is the only move the clients can follow.
  // Each page's moveGroup handler navigates only to ITS OWN successor and
  // drops any other targetPage (res-review takes /res-review-group,
  // res-review-group takes the next page and writes 'interview', interview-
  // stage takes /makeOffer), and useProgress redirects only a student who is
  // AHEAD of their server step, never one who is behind. So a group pushed two
  // steps at once would sit on a page that ignored the emit, with a 200 in the
  // professor's hand saying it worked, and a reload would not move them
  // either. Refusing anything but the next step keeps what was written and
  // what the room will do in agreement.
  //
  // Two next-step moves still land silently: /jobdes and /makeOffer register
  // no moveGroup listener at all, so job_description -> res_1 and offer ->
  // employer write the rows and nobody navigates. That is a frontend gap this
  // handler cannot close from here.
  //
  // Works with nobody connected: the Progress and Step_Completion rows are
  // what the barrier reads, and it is re-evaluated when a socket joins the
  // room, so a member who reconnects later is released by that rather than by
  // having heard the emit. They are not teleported; their button unlocks.
  forceAdvance = async (req: AuthRequest, res: Response): Promise<void> => {
    const { class_id, group_id, target_step } = req.body;

    if (!class_id || !group_id || !target_step) {
      res.status(400).json({
        error: 'Missing required fields: class_id, group_id, target_step',
      });
      return;
    }

    const stepOrder: readonly string[] = STEP_ORDER;
    const targetIndex = stepOrder.indexOf(target_step);
    if (targetIndex <= 0) {
      // 'none' is index 0 and is not somewhere to send a group.
      res.status(400).json({
        error: `target_step must be one of: ${STEP_ORDER.slice(1).join(', ')}`,
      });
      return;
    }

    // Declared outside the try so `finally` can release it, but checked out
    // INSIDE the try. This is an async handler under Express 4, which does not
    // catch a rejected promise; with getConnection() ahead of the try, a full
    // pool or a DB that is down rejected past every handler here, the process
    // logged an unhandledRejection, and the professor's request never got a
    // response at all, in front of a class, with nothing to click.
    let conn: PoolConnection | undefined;

    try {
      conn = await this.db.promise().getConnection();
      await conn.beginTransaction();

      const [members] = await conn.query<RowDataPacket[]>(
        "SELECT id, email FROM Users WHERE group_id = ? AND class = ? AND affiliation = 'student'",
        [group_id, class_id]
      );

      if (members.length === 0) {
        // Not an error the professor can fix by retrying, so say what is
        // actually wrong rather than reporting a success that moved nobody.
        await conn.rollback();
        res.status(404).json({
          error: `No students on the roster for group ${group_id} in class ${class_id}`,
        });
        return;
      }

      // Where the group is now, read in the same transaction as the write so
      // the step this decision is based on is the step that gets overwritten.
      // Same query and same reduction as getProgress, deliberately: the
      // advisor dashboard shows the professor that number, and what this
      // accepts has to line up with what they were just looking at.
      const [progressRows] = await conn.query<RowDataPacket[]>(
        'SELECT step FROM Progress WHERE crn = ? AND group_id = ?',
        [class_id, group_id]
      );
      const currentStep = leftmostStep(progressRows.map((row) => row.step));
      const nextStep: string | undefined = stepOrder[stepOrder.indexOf(currentStep) + 1];

      if (target_step !== nextStep) {
        // See the header comment: any other target writes rows the connected
        // clients will not act on, and reports success anyway. Say where the
        // group actually is and what the one accepted move is, so the advisor
        // can act on the refusal instead of pressing the same button again.
        await conn.rollback();
        res.status(400).json({
          error:
            nextStep === undefined
              ? `Group ${group_id} in class ${class_id} is already at the final step (${currentStep})`
              : `Group ${group_id} in class ${class_id} is at ${currentStep}; the only step it can be forced to is ${nextStep}`,
          current_step: currentStep,
          next_step: nextStep ?? null,
        });
        return;
      }

      // One multi-row upsert rather than a query per member: this runs while a
      // class waits, and Progress is keyed on email so the whole group lands in
      // the same statement.
      const progressPlaceholders = members.map(() => '(?, ?, ?, ?)').join(', ');
      const progressValues = members.flatMap((member) => [
        class_id,
        group_id,
        target_step,
        member.email,
      ]);
      await conn.query(
        `INSERT INTO Progress (crn, group_id, step, email)
         VALUES ${progressPlaceholders}
         ON DUPLICATE KEY UPDATE crn = VALUES(crn), group_id = VALUES(group_id), step = VALUES(step)`,
        progressValues
      );

      // Mark every barrier behind the target satisfied, for every member.
      //
      // Deleting the completions instead would make those barriers MORE closed:
      // a client that re-polls barrier-status, or rejoins the room, would read
      // 0/4 and disable the button the professor just pressed. Recording them
      // as done is what "past this gate" means, and it holds across a restart.
      const priorSteps = STEP_ORDER.slice(1, targetIndex);
      if (priorSteps.length > 0) {
        const completionRows = members.flatMap((member) =>
          priorSteps.map((step) => [member.id, class_id, group_id, step])
        );
        const completionPlaceholders = completionRows.map(() => '(?, ?, ?, ?)').join(', ');
        await conn.query(
          `INSERT IGNORE INTO Step_Completion (student_id, class, group_id, step)
           VALUES ${completionPlaceholders}`,
          completionRows.flat()
        );
      }

      await conn.commit();
    } catch (error) {
      // `conn` is undefined when getConnection() itself was what failed, and
      // rollback can reject in its own right when the connection is the thing
      // that broke. Neither may escape this block: the whole point of the try
      // is that the professor gets a response, so the rollback failure is
      // logged and the 500 below still goes out.
      if (conn) {
        await conn.rollback().catch((rollbackError) => {
          console.error('Rollback failed after force-advance error:', rollbackError);
        });
      }
      console.error('Error force-advancing group:', error);
      res.status(500).json({ error: 'Failed to force-advance group' });
      return;
    } finally {
      conn?.release();
    }

    // Audit, not diagnostics: a teacher overriding a gate is a thing someone
    // will need to reconstruct afterwards when a group ends up somewhere
    // unexpected. One line per override, and overrides are rare.
    console.info(
      `[AUDIT] force-advance: ${req.user?.email} moved group ${group_id} in class ${class_id} to ${target_step}`
    );

    const roomId = `group_${group_id}_class_${class_id}`;
    this.io.to(roomId).emit('moveGroup', {
      classId: Number(class_id),
      groupId: Number(group_id),
      targetPage: STEP_TO_ROUTE[target_step],
    });

    // Also re-announce the res-review barrier. A member still sitting on
    // res-review with a disabled button is released by that event, not by
    // moveGroup, and the rows written above have just made it true.
    broadcastGroupBarrier(this.io, this.db, class_id, group_id, RES_REVIEW_BARRIER_STEP).catch(
      (error) => {
        console.error('Error re-announcing the barrier after force-advance:', error);
      }
    );

    res.json({
      message: 'Group force-advanced successfully',
      class_id,
      group_id,
      target_step,
      target_page: STEP_TO_ROUTE[target_step],
    });
  };
}
