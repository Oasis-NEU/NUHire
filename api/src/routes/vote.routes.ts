// src/routes/vote.routes.ts
import { Router } from 'express';
import { Pool } from 'mysql2';
import { Server as SocketIOServer } from 'socket.io';
import { VoteController } from '../controller/vote.controller';
import { requireAuth, requireClassModerator, requireStudent } from '../middleware/auth.middleware';

// Group votes by majority, with a revote and a professor tiebreak (OAS-368).
// `:kind` is resume_review or final_pick.
export default (db: Pool, io: SocketIOServer): Router => {
  const router = Router();
  const voteController = new VoteController(db, io);

  // Teachers of the class only: every group's current round, and settling one.
  // Before '/:kind' so 'class' is never read as a vote kind.
  router.get('/class/:class_id', requireClassModerator(db), voteController.getClassVotes);
  router.post('/decide', requireClassModerator(db), voteController.decideVote);

  // The caller's own group, from the session: the poll, and a ballot.
  router.get('/:kind', requireAuth, voteController.getVoteState);
  router.post('/:kind/ballot', requireStudent, voteController.castVote);

  return router;
};
