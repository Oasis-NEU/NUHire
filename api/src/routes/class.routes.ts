// src/routes/class.routes.ts
import { Router } from 'express';
import { Pool } from 'mysql2';
import { Server as SocketIOServer } from 'socket.io';
import { ClassCodeController } from '../controller/classCode.controller';
import { requireAuth, requireClassModerator } from '../middleware/auth.middleware';

export default (db: Pool, io: SocketIOServer): Router => {
  const router = Router();
  const classCodes = new ClassCodeController(db, io);

  // Only the professor who teaches the CRN can see or replace its code; the code
  // is the only thing standing between a logged-in stranger and the class.
  router.get('/:class_id/code', requireClassModerator(db), classCodes.getClassCode);
  router.post(
    '/:class_id/code/regenerate',
    requireClassModerator(db),
    classCodes.regenerateClassCode
  );

  // Any logged-in non-admin: a student not on a roster yet is still 'none', and
  // the code is what makes them a student. Identity comes from the session.
  router.post('/join', requireAuth, classCodes.joinClass);

  return router;
};
