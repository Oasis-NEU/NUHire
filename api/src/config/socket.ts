// src/config/socket.ts

import { Server as SocketIOServer, Socket } from 'socket.io';
import { Pool, RowDataPacket } from 'mysql2';
import { SocketEvents } from '../models/types';

// Advisors join a room named after their own email (see 'adminOnline' below),
// so notifying a class's teachers is one emit per Moderator row for that CRN.
// Use this where the advisor dashboard needs to hear about something; it is
// never in the group room, and io.emit reached every client in every class.
export function emitToClassModerators(
  io: SocketIOServer,
  db: Pool,
  classId: number | string,
  event: string,
  payload?: unknown
): void {
  db.query('SELECT admin_email FROM Moderator WHERE crn = ?', [classId], (err, results) => {
    if (err) {
      console.error(`Could not look up moderators for class ${classId}:`, err);
      return;
    }
    (results as RowDataPacket[]).forEach(({ admin_email }) => {
      io.to(admin_email).emit(event, payload);
    });
  });
}

// The authenticated user behind a socket, populated by the io.use below from
// the session that app.ts runs over the handshake.
interface SocketUser {
  id: number;
  email: string;
  affiliation: 'student' | 'admin' | 'none';
  group_id?: number;
  class?: number;
}

// The only barrier the class waits on today: every member of a group must
// finish their own resume review before res-review-group opens. Spelled with
// the `Progress`.`step` vocabulary because `Step_Completion`.`step` stores it,
// and a second spelling would record a completion nobody looks for.
export const RES_REVIEW_BARRIER_STEP = 'res_1';

export interface BarrierStatus {
  step: string;
  completedCount: number;
  totalCount: number;
  released: boolean;
}

// Has every current member of (group_id, class) recorded `step`?
//
// Answered by query every time instead of from a cached count. The count used
// to live in `global.completedResReview`, which an API restart wiped: the
// students who had already finished never re-announced, so the group restarted
// at 0 and could never reach its total again. Rows in MySQL survive a restart,
// so the same question can be asked as often as anyone needs — on completion,
// on room join, on a roster change, and from the barrier-status poll.
export async function evaluateGroupBarrier(
  db: Pool,
  classId: number | string,
  groupId: number | string,
  step: string
): Promise<BarrierStatus> {
  const promiseDb = db.promise();

  const [members] = await promiseDb.query<RowDataPacket[]>(
    "SELECT id FROM Users WHERE group_id = ? AND class = ? AND affiliation = 'student'",
    [groupId, classId]
  );

  const [completions] = await promiseDb.query<RowDataPacket[]>(
    'SELECT student_id FROM Step_Completion WHERE group_id = ? AND class = ? AND step = ?',
    [groupId, classId, step]
  );

  // Count only completions belonging to a CURRENT member. A student moved to
  // another group mid-class leaves their row behind, and counting it would
  // release a group that still has somebody unfinished.
  const memberIds = new Set(members.map((row) => row.id as number));
  const completedCount = completions.filter((row) =>
    memberIds.has(row.student_id as number)
  ).length;

  return {
    step,
    completedCount,
    totalCount: members.length,
    // An empty roster is unknown, not finished. Releasing on 0 >= 0 would walk
    // a student through a barrier before their group has been assigned anyone.
    released: members.length > 0 && completedCount >= members.length,
  };
}

// Re-evaluate the barrier and, if it is open, tell the group.
//
// Emitted to the room rather than to cached socket ids, and nothing is deleted
// afterwards. The release used to be a single shot at one instant: a student
// who was offline right then never received it and there was no retry. Now the
// answer is re-derived from MySQL on every completion, room join and roster
// change, so a student who rejoins picks it up, and GET /groups/barrier-status
// is the same answer over HTTP for a client whose socket never came back.
export function broadcastGroupBarrier(
  io: SocketIOServer,
  db: Pool,
  classId: number | string,
  groupId: number | string,
  step: string
): Promise<BarrierStatus> {
  return evaluateGroupBarrier(db, classId, groupId, step).then((status) => {
    // 'groupCompletedResReview' is the res-review page's release event. Other
    // steps are recorded and counted, but no client listens for them yet, and
    // emitting this name for one would unlock a page the group is not on.
    if (status.released && step === RES_REVIEW_BARRIER_STEP) {
      io.to(`group_${groupId}_class_${classId}`).emit('groupCompletedResReview', {
        groupId: Number(groupId),
        classId: Number(classId),
        completedCount: status.completedCount,
        totalCount: status.totalCount,
        message: 'All group members have completed their individual resume reviews!',
      });
    }
    return status;
  });
}

// Rejecting an unauthenticated socket outright is the right end state, but it
// is also the single change most able to take the whole app down at once: if
// the handshake cookie does not arrive for any reason, every client in the room
// disconnects and the class stops. Nobody has yet run two real browser sessions
// against this, so it ships off. Turn it on in staging, confirm the warning
// below has stopped appearing, then set it in production.
const SOCKET_AUTH_REQUIRED = process.env.SOCKET_AUTH_REQUIRED === 'true';

export function initializeSocketHandlers(io: SocketIOServer, db: Pool): Record<string, string> {
  const onlineStudents: Record<string, string> = {};

  io.use((socket, next) => {
    const user = (socket.request as { user?: SocketUser }).user;

    if (user) {
      socket.data.user = user;
      return next();
    }

    if (SOCKET_AUTH_REQUIRED) {
      return next(new Error('Unauthorized: no session on this socket'));
    }

    // Loud on purpose. Every one of these is a socket the room checks below
    // cannot police, and it is the evidence needed before turning the flag on.
    console.warn(
      `Socket ${socket.id} connected with no session. Room scoping is not enforced for it.`
    );
    next();
  });

  io.on('connection', (socket: Socket) => {
    console.log('New client connected:', socket.id);

    // Register every handler through this instead of socket.on.
    //
    // socket.io does not catch a throw inside a handler. It escapes to the
    // process-level uncaughtException handler in server.ts, which exits. Every
    // handler below destructures its payload, so one client emitting an event
    // with no argument (`socket.emit('adminOnline')` from a browser console)
    // threw a TypeError and took the API down for the whole class, dropping
    // every socket and losing the in-memory group barriers with it.
    //
    // Defaulting the payload stops the destructure from throwing, and the catch
    // contains anything else the handler does. A malformed message is dropped
    // and logged; it can no longer end the class.
    const on = <T>(event: string, handler: (payload: T) => void): void => {
      socket.on(event, (payload: T) => {
        try {
          handler((payload ?? {}) as T);
        } catch (err) {
          console.error(`Socket handler "${event}" threw; dropping this message:`, err);
        }
      });
    };

    // Whether this socket is allowed into this room.
    //
    // socket.join() used to accept any string the client sent, so a student
    // could type another group's room name into a console and receive that
    // group's votes, popups and offer decisions for the rest of the class.
    //
    // A socket with no identity is still let through. SOCKET_AUTH_REQUIRED is
    // off, so those sockets exist, and refusing them here would break exactly
    // the clients that flag is there to protect. The warning above is how you
    // find out whether any are left.
    const mayJoin = (room: string): boolean => {
      const user = socket.data.user as SocketUser | undefined;
      if (!user) return true;
      // Advisors move between groups to help them; that is the job.
      if (user.affiliation === 'admin') return true;

      const ownRoom = `group_${user.group_id}_class_${user.class}`;
      if (room === ownRoom || room === String(user.group_id) || room === `class_${user.class}`) {
        return true;
      }

      console.warn(
        `Refusing to join socket ${socket.id} (${user.email}) to room "${room}". Their own room is "${ownRoom}".`
      );
      return false;
    };

    on('adminOnline', ({ adminEmail }: { adminEmail: string }) => {
      const user = socket.data.user as SocketUser | undefined;

      // This room receives offer requests and every group's progress, so
      // joining it by sending someone else's address was a way to watch a whole
      // class. Trust the session over the payload where there is one.
      if (user && (user.affiliation !== 'admin' || adminEmail !== user.email)) {
        console.warn(`Socket ${socket.id} (${user.email}) tried to join admin room ${adminEmail}.`);
        return;
      }

      socket.join(user?.email ?? adminEmail);
    });

    on('studentOnline', ({ studentId }: { studentId: string }) => {
      // Keyed by email: every reader of this map looks up an email, and the
      // client happens to send one under the name studentId. Prefer the session
      // so a client cannot register itself as somebody else and collect their
      // popups.
      const user = socket.data.user as SocketUser | undefined;
      onlineStudents[user?.email ?? studentId] = socket.id;
      // Previously also ran a DB lookup here and broadcast an
      // 'updateOnlineStudents' event carrying the student's email to EVERY
      // connected client. Nothing listened for it, in any class.
    });

    // Room names arrive as `group_<group_id>_class_<class>` from every page.
    const roomParts = (room: string): { groupId: string; classId: string } | null => {
      const match = /^group_(\d+)_class_(\d+)$/.exec(room);
      return match ? { groupId: match[1], classId: match[2] } : null;
    };

    on('joinGroup', (group_id: string) => {
      if (!mayJoin(group_id)) return;
      socket.join(group_id);

      // Re-evaluate on join, because a reconnected socket is in no rooms and
      // missed whatever was emitted while it was away. The old barrier fired
      // once, at one instant, to cached socket ids; a student who was offline
      // then stayed stuck on a page their whole group had already left.
      const parts = roomParts(group_id);
      if (parts) {
        broadcastGroupBarrier(io, db, parts.classId, parts.groupId, RES_REVIEW_BARRIER_STEP).catch(
          (err) => {
            console.error(`Could not re-evaluate the barrier for room ${group_id}:`, err);
          }
        );
      }
    });

    on('joinClass', ({ classId }: { classId: number }) => {
      if (!mayJoin(`class_${classId}`)) return;
      console.log(`Socket ${socket.id} joining class room: class_${classId}`);
      socket.join(`class_${classId}`);
    });

    on('check', ({ group_id, resume_number, checked }: SocketEvents['check']) => {
      console.log(
        `Checkbox update received: Room ${group_id}, Resume ${resume_number}, Checked: ${checked}`
      );

      let actualGroupId = group_id;
      let classId = null;

      const roomMatch = /group_(\d+)_class_(\d+)/.exec(group_id);
      if (roomMatch) {
        actualGroupId = roomMatch[1];
        classId = roomMatch[2];
      }

      const query = classId
        ? 'UPDATE Resume SET `checked` = ? WHERE group_id = ? AND class = ? AND resume_number = ?'
        : 'UPDATE Resume SET `checked` = ? WHERE group_id = ? AND resume_number = ?';

      const params = classId
        ? [checked, actualGroupId, classId, resume_number]
        : [checked, actualGroupId, resume_number];

      db.query(query, params, (err) => {
        if (err) {
          console.error('Database Error:', err);
          return;
        }

        console.log(`Database updated successfully for resume ${resume_number}`);
        io.to(group_id).emit('checkboxUpdated', { resume_number, checked });
        console.log(
          `Emitted checkboxUpdated to room ${group_id}: Resume ${resume_number}, Checked: ${checked}`
        );
      });
    });

    on('checkint', ({ group_id, interview_number, checked }: SocketEvents['checkint']) => {
      socket.to(group_id).emit('checkboxUpdated', { interview_number, checked });
    });

    on(
      'sendPopupToGroups',
      ({
        groups,
        headline,
        message,
        class: classId,
        candidateId,
      }: SocketEvents['sendPopupToGroups']) => {
        if (!groups || groups.length === 0) return;

        let query = "SELECT email FROM Users WHERE group_id IN (?) AND affiliation = 'student'";
        let params: any[] = [groups];

        if (classId) {
          query += ' AND class = ?';
          params.push(classId);
        }

        db.query(query, params, (err, results: any[]) => {
          if (!err && results.length > 0) {
            results.forEach(({ email }) => {
              const studentSocketId = onlineStudents[email];
              if (studentSocketId) {
                io.to(studentSocketId).emit('receivePopup', { headline, message, candidateId });
              }
            });

            console.log(`Popup sent to Groups: ${groups.join(', ')} in Class ${classId || 'All'}`);
          } else {
            console.log('No online students in the selected groups.');
          }
        });
      }
    );

    on(
      'updateRatingsWithPresetBackend',
      ({
        classId,
        groupId,
        candidateId,
        vote,
        isNoShow,
      }: SocketEvents['updateRatingsWithPresetBackend']) => {
        const roomId = `group_${groupId}_class_${classId}`;

        io.to(roomId).emit('updateRatingsWithPresetFrontend', {
          classId,
          groupId,
          candidateId,
          vote,
          isNoShow,
        });
      }
    );

    on(
      'makeOfferRequest',
      ({ classId, groupId, candidateId }: SocketEvents['makeOfferRequest']) => {
        console.log(
          `Student in class ${classId}, group ${groupId} wants to offer candidate ${candidateId}`
        );

        // First, fetch the candidate information using resume_id
        db.query(
          'SELECT f_name, l_name FROM Candidates WHERE resume_id = ?',
          [candidateId],
          (err, candidates: any[]) => {
            if (err) {
              console.error('Error fetching candidate info:', err);
              return;
            }

            const candidateName =
              candidates.length > 0
                ? `${candidates[0].f_name} ${candidates[0].l_name}`
                : `Candidate #${candidateId}`;

            const firstName = candidates.length > 0 ? candidates[0].f_name : '';
            const lastName = candidates.length > 0 ? candidates[0].l_name : '';

            console.log(`Candidate name: ${candidateName}`);

            // Then fetch moderators and emit with candidate info
            db.query(
              'SELECT admin_email FROM Moderator WHERE crn = ?',
              [classId],
              (err, moderators: any[]) => {
                console.log('Moderator query result:', moderators);
                if (!err && moderators.length > 0) {
                  moderators.forEach(({ admin_email }) => {
                    io.to(admin_email).emit('makeOfferRequest', {
                      classId,
                      groupId,
                      candidateId,
                      candidateName,
                      firstName,
                      lastName,
                    });
                    console.log(
                      `Notified ${admin_email} about offer request for ${candidateName} from group ${groupId}`
                    );
                  });
                } else {
                  console.log(
                    'No assigned admin found for class',
                    classId,
                    'or database error:',
                    err
                  );
                }
              }
            );

            const roomId = `group_${groupId}_class_${classId}`;
            io.to(roomId).emit('groupMemberOffer', {
              candidateId,
              candidateName,
              firstName,
              lastName,
            });
          }
        );
      }
    );

    on(
      'makeOfferResponse',
      ({ classId, groupId, candidateId, accepted }: SocketEvents['makeOfferResponse']) => {
        console.log(
          `Advisor responded to class ${classId}, group ${groupId} for candidate ${candidateId}: accepted=${accepted}`
        );
        // The group hears the decision; the class's advisors hear it so their
        // own pending-offer views update. Nobody else.
        const payload = { classId, groupId, candidateId, accepted };
        io.to(`group_${groupId}_class_${classId}`).emit('makeOfferResponse', payload);
        emitToClassModerators(io, db, classId, 'makeOfferResponse', payload);
      }
    );

    on('moveGroup', ({ classId, groupId, targetPage }: SocketEvents['moveGroup']) => {
      console.log(`Moving group ${groupId} in class ${classId} to ${targetPage}`);
      const roomId = `group_${groupId}_class_${classId}`;
      console.log(`Emitting moveGroup to room: ${roomId}`);
      io.to(roomId).emit('moveGroup', { classId, groupId, targetPage });
    });

    on(
      'submitInterview',
      ({
        currentVideoIndex,
        nextVideoIndex,
        isLastInterview,
        groupId,
        classId,
      }: SocketEvents['submitInterview']) => {
        console.log(
          `Interview ${currentVideoIndex + 1} submitted by group ${groupId}, class ${classId}, moving to video ${nextVideoIndex + 1}, isLast: ${isLastInterview}`
        );
        const roomId = `group_${groupId}_class_${classId}`;
        io.to(roomId).emit('interviewSubmitted', {
          currentVideoIndex,
          nextVideoIndex,
          isLastInterview,
          groupId,
          classId,
        });
      }
    );

    on(
      'offerSelected',
      ({ candidateId, groupId, classId, roomId, checked }: SocketEvents['offerSelected']) => {
        console.log(
          `Candidate ${candidateId} ${checked ? 'selected' : 'deselected'} for offer by group ${groupId}, class ${classId}`
        );
        socket.to(roomId).emit('offerSelected', { candidateId, groupId, classId, checked });
      }
    );

    on(
      'offerSubmitted',
      ({ candidateId, groupId, classId, roomId }: SocketEvents['offerSubmitted']) => {
        console.log(
          `Offer submitted for candidate ${candidateId} by group ${groupId}, class ${classId}`
        );
        socket.to(roomId).emit('offerSubmitted', { candidateId, groupId, classId });
      }
    );

    // Who is on the other end of this socket, read fresh from the roster.
    //
    // Identity comes from the session only. It used to fall back to a
    // reverse-lookup in `onlineStudents`, but that map is keyed by whatever
    // email the client sent in 'studentOnline' when the socket has no session,
    // so a cookieless socket could register as a teammate and then report that
    // teammate's completion. While the barrier was an in-memory Set the damage
    // was a transient early release; now that a completion is a Step_Completion
    // row it would be a forged, restart-surviving record the professor reads.
    // A socket with no session therefore has no identity here, full stop.
    // The session runs over the handshake and survives a reconnect, so a real
    // student is never the one without it.
    //
    // Group and class come from `Users`, not from the session or the payload: a
    // student reassigned mid-class carries a stale group in both, and filing
    // their completion under the old group leaves the new one short a member.
    const identifyStudent = async (): Promise<RowDataPacket | null> => {
      const user = socket.data.user as SocketUser | undefined;
      if (!user) return null;

      const [rows] = await db.promise().query<RowDataPacket[]>(
        `SELECT id, email, group_id, class
           FROM Users
          WHERE email = ? AND affiliation = 'student'`,
        [user.email]
      );
      return rows[0] ?? null;
    };

    const recordResReviewCompletion = async (): Promise<void> => {
      // Refuse before touching the roster. SOCKET_AUTH_REQUIRED is off, so a
      // sessionless socket is still connected and can still emit this event;
      // it just cannot write anyone's completion. The warn is the same signal
      // the io.use above emits: a real client landing here means the cookie is
      // not reaching the handshake, and that is what to fix, not this check.
      if (!socket.data.user) {
        console.warn(
          `Socket ${socket.id} reported a completion with no session; not recording it.`
        );
        return;
      }

      const student = await identifyStudent();
      if (!student) {
        console.warn(`Socket ${socket.id} reported a completion but is not on the roster.`);
        return;
      }
      if (student.group_id == null || student.class == null) {
        console.warn(`Student ${student.email} reported a completion with no group or class.`);
        return;
      }

      // Keeping completed_at on a duplicate means a refresh or a reconnect
      // re-announcing does not rewrite the time the student actually finished,
      // which is what the professor reads when a group stalls.
      await db.promise().query(
        `INSERT INTO Step_Completion (student_id, class, group_id, step)
           VALUES (?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE completed_at = completed_at`,
        [student.id, student.class, student.group_id, RES_REVIEW_BARRIER_STEP]
      );

      await broadcastGroupBarrier(
        io,
        db,
        student.class as number,
        student.group_id as number,
        RES_REVIEW_BARRIER_STEP
      );
    };

    // The payload's groupId is ignored: it is client-supplied, and the roster
    // row read above is the only trustworthy answer to which group this is.
    on('userCompletedResReview', () => {
      recordResReviewCompletion().catch((err) => {
        console.error('Could not record a res-review completion:', err);
      });
    });

    on(
      'confirmOffer',
      ({ groupId, classId, candidateId, studentId, roomId }: SocketEvents['confirmOffer']) => {
        io.to(roomId).emit('confirmOffer', {
          candidateId,
          studentId,
          groupId,
          classId,
        });
      }
    );

    on(
      'sentPresetVotes',
      async ({
        student_id,
        group_id,
        class: classId,
        question1,
        question2,
        question3,
        question4,
        candidate_id,
      }: SocketEvents['sentPresetVotes']) => {
        console.log('inside sentPresetVotes, with data:', {
          student_id,
          group_id,
          classId,
          question1,
          question2,
          question3,
          question4,
          candidate_id,
        });
        try {
          const query = `
          INSERT INTO InterviewPopup 
            (candidate_id, group_id, class, question1, question2, question3, question4)
          VALUES 
            (?, ?, ?, ?, ?, ?, ?)
          ON DUPLICATE KEY UPDATE 
            question1 = question1 + VALUES(question1),
            question2 = question2 + VALUES(question2),
            question3 = question3 + VALUES(question3),
            question4 = question4 + VALUES(question4)`;

          db.query(
            query,
            [candidate_id, group_id, classId, question1, question2, question3, question4],
            (err) => {
              if (err) {
                console.error('Error updating interview popup votes:', err);
              } else {
                console.log(
                  `Updated interview popup votes for candidate ${candidate_id} in group ${group_id} class ${classId}`
                );
              }
            }
          );
        } catch (error) {
          console.error('Error in sentPresetVotes:', error);
        }
      }
    );

    on(
      'teamConfirmSelection',
      ({ groupId, classId, studentId, roomId }: SocketEvents['teamConfirmSelection']) => {
        io.to(roomId).emit('teamConfirmSelection', {
          groupId,
          classId,
          studentId,
          roomId,
        });
      }
    );

    on(
      'teamUnconfirmSelection',
      ({ groupId, classId, studentId, roomId }: SocketEvents['teamUnconfirmSelection']) => {
        io.to(roomId).emit('teamUnconfirmSelection', {
          groupId,
          classId,
          studentId,
          roomId,
        });
      }
    );

    on('allowGroupAssignment', ({ classId, message }: SocketEvents['allowGroupAssignment']) => {
      console.log('Teacher allowing group assignment for class:', classId);
      io.to(`class_${classId}`).emit('allowGroupAssignmentStudent', {
        classId: classId,
        message: message,
      });
    });

    on('groupAssignmentClosed', ({ classId, message }: SocketEvents['groupAssignmentClosed']) => {
      console.log('Teacher closing group assignment for class:', classId);
      io.to(`class_${classId}`).emit('groupAssignmentClosedStudent', {
        classId: classId,
        message: message,
      });
    });

    on('disconnect', () => {
      Object.keys(onlineStudents).forEach((studentId) => {
        if (onlineStudents[studentId] === socket.id) {
          console.log(`Student ${studentId} disconnected`);
          delete onlineStudents[studentId];
        }
      });
    });
  });

  return onlineStudents;
}
