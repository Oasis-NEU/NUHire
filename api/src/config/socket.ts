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

    on('joinGroup', (group_id: string) => {
      if (!mayJoin(group_id)) return;
      socket.join(group_id);
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

    on('userCompletedResReview', ({ groupId }: SocketEvents['userCompletedResReview']) => {
      if (!groupId) {
        console.log('No group ID provided for userCompletedResReview');
        return;
      }

      const studentEmail = Object.keys(onlineStudents).find(
        (email) => onlineStudents[email] === socket.id
      );
      if (!studentEmail) {
        console.log('Could not identify student for userCompletedResReview');
        return;
      }

      console.log(`Student ${studentEmail} completed res-review in group ${groupId}`);

      db.query(
        'SELECT class FROM Users WHERE email = ?',
        [studentEmail],
        (err, studentData: any[]) => {
          if (err || !studentData.length) {
            console.error('Error fetching student class:', err);
            return;
          }

          const studentClass = studentData[0].class;
          console.log(`Student ${studentEmail} is in class ${studentClass}`);

          db.query(
            "SELECT f_name, l_name, email, current_page FROM Users WHERE group_id = ? AND class = ? AND affiliation = 'student'",
            [groupId, studentClass],
            (err, groupMembers: any[]) => {
              if (err) {
                console.error('Error fetching group members:', err);
                return;
              }

              console.log(
                `Group ${groupId} in class ${studentClass} has ${groupMembers.length} members`
              );

              if (!(global as any).completedResReview) {
                (global as any).completedResReview = {};
              }

              const groupKey = `${groupId}_${studentClass}`;
              if (!(global as any).completedResReview[groupKey]) {
                (global as any).completedResReview[groupKey] = new Set();
              }

              const wasAlreadyCompleted = (global as any).completedResReview[groupKey].has(
                studentEmail
              );
              (global as any).completedResReview[groupKey].add(studentEmail);

              if (wasAlreadyCompleted) {
                console.log(
                  `Student ${studentEmail} already marked as completed, ignoring duplicate`
                );
                return;
              }

              const completedCount = (global as any).completedResReview[groupKey].size;
              const totalCount = groupMembers.length;
              const allCompleted = completedCount >= totalCount;

              console.log(
                `Group ${groupId} in class ${studentClass} completion: ${completedCount}/${totalCount} completed by: ${Array.from((global as any).completedResReview[groupKey]).join(', ')}`
              );

              if (allCompleted) {
                console.log(
                  `🎉 All members in group ${groupId}, class ${studentClass} have completed res-review! Notifying group members.`
                );

                groupMembers.forEach((member) => {
                  const memberSocketId = onlineStudents[member.email];
                  if (memberSocketId) {
                    console.log(`Sending groupCompletedResReview to ${member.email}`);
                    io.to(memberSocketId).emit('groupCompletedResReview', {
                      groupId,
                      classId: studentClass,
                      completedCount,
                      totalCount,
                      message: 'All group members have completed their individual resume reviews!',
                    });
                  } else {
                    console.log(`Student ${member.email} is not online`);
                  }
                });

                delete (global as any).completedResReview[groupKey];
              } else {
                console.log(
                  `Group ${groupId} in class ${studentClass} still waiting for ${totalCount - completedCount} more members to complete`
                );
              }
            }
          );
        }
      );
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
