// src/controller/vote.controller.ts

import { Response } from 'express';
import { Pool } from 'mysql2';
import { Server as SocketIOServer } from 'socket.io';
import { AuthRequest } from '../models/AuthRequest';
import { dbErrorStatus } from '../config/database';
import {
  castBallot,
  classVotes,
  ensureRound,
  evaluateVote,
  isVoteKind,
  myVotes,
  professorDecide,
  voteState,
} from '../config/groupVote';
import { isVoteError } from '../config/votes';

// The HTTP side of the group votes. The socket events in config/socket.ts do
// the same through the same functions; these are the fallback for a client
// whose socket is down, and the poll every gate needs (AGENTS.md rule 3).
export class VoteController {
  constructor(
    private db: Pool,
    private io: SocketIOServer
  ) {}

  // The caller's own group's vote. The group and class are the session's,
  // never the URL's, so there is nothing to point at another group. A student
  // polling also opens round 1 if nobody has, and settles a revote whose time
  // ran out, so the page recovers even when no socket event ever arrived.
  getVoteState = async (req: AuthRequest, res: Response): Promise<void> => {
    const { kind } = req.params;
    const user = req.user!;
    const groupId = user.group_id;
    const classId = user.class;

    if (!isVoteKind(kind)) {
      res.status(400).json({ error: 'Unknown vote' });
      return;
    }
    if (!groupId || !classId) {
      res.status(400).json({ error: 'You are not in a group yet' });
      return;
    }

    try {
      if (user.affiliation === 'student') {
        const opened = await ensureRound(this.io, this.db, classId, groupId, kind);
        if (isVoteError(opened)) {
          res.status(opened.status).json({ error: opened.error });
          return;
        }
      }
      await evaluateVote(this.io, this.db, classId, groupId, kind);
      const state = await voteState(this.db, classId, groupId, kind);
      const mine = await myVotes(this.db, classId, groupId, kind, user.id);
      res.json({ ...state, myVotes: mine });
    } catch (err) {
      console.error(`Error reading the ${kind} vote for group ${groupId} in ${classId}:`, err);
      res.status(dbErrorStatus(err)).json({ error: 'Failed to load the group vote' });
    }
  };

  // A ballot from the logged-in student. The same as the castGroupVote event.
  castVote = async (req: AuthRequest, res: Response): Promise<void> => {
    const { kind } = req.params;
    const user = req.user!;
    const groupId = user.group_id;
    const classId = user.class;

    if (!isVoteKind(kind)) {
      res.status(400).json({ error: 'Unknown vote' });
      return;
    }
    if (!groupId || !classId) {
      res.status(400).json({ error: 'You are not in a group yet' });
      return;
    }

    try {
      const refusal = await castBallot(
        this.io,
        this.db,
        { id: user.id, classId, groupId },
        kind,
        req.body
      );
      if (refusal) {
        res.status(refusal.status).json({ error: refusal.error });
        return;
      }
      const state = await voteState(this.db, classId, groupId, kind);
      const mine = await myVotes(this.db, classId, groupId, kind, user.id);
      res.json({ ...state, myVotes: mine });
    } catch (err) {
      console.error(`Error recording a ${kind} ballot from ${user.email}:`, err);
      res.status(dbErrorStatus(err)).json({ error: 'Failed to record your vote' });
    }
  };

  // The professor's tiebreak or override. requireClassModerator has already
  // checked that class_id is a class this professor teaches.
  decideVote = async (req: AuthRequest, res: Response): Promise<void> => {
    const { kind, winners } = req.body ?? {};
    const classId = Number(req.body?.class_id);
    const groupId = Number(req.body?.group_id);

    if (!isVoteKind(kind)) {
      res.status(400).json({ error: 'Unknown vote' });
      return;
    }
    if (!Number.isInteger(groupId)) {
      res.status(400).json({ error: 'group_id is required' });
      return;
    }

    try {
      const refusal = await professorDecide(this.io, this.db, { classId, groupId, kind, winners });
      if (refusal) {
        res.status(refusal.status).json({ error: refusal.error });
        return;
      }
      res.json(await voteState(this.db, classId, groupId, kind));
    } catch (err) {
      console.error(`Error deciding the ${kind} vote for group ${groupId} in ${classId}:`, err);
      res.status(dbErrorStatus(err)).json({ error: 'Failed to decide the group vote' });
    }
  };

  // Every group's current round in a class, so the professor's dashboard can
  // find escalations after a reload or a dropped socket.
  getClassVotes = async (req: AuthRequest, res: Response): Promise<void> => {
    const classId = Number(req.params.class_id);
    try {
      res.json(await classVotes(this.db, classId));
    } catch (err) {
      console.error(`Error listing the group votes for class ${classId}:`, err);
      res.status(dbErrorStatus(err)).json({ error: 'Failed to load the group votes' });
    }
  };
}
