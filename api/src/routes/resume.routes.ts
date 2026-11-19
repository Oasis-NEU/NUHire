// src/routes/resume.routes.ts
import { Router } from 'express';
import { Pool } from 'mysql2';
import { ResumeController } from '../controller/resume.controller';
import { Server as SocketIOServer } from 'socket.io';
import { requireAuth } from '../middleware/auth.middleware';
import { requireStep } from '../middleware/step.middleware';
import { Screens } from '../config/screeningQueue';

export default (db: Pool, io: SocketIOServer, screens: Screens): Router => {
  const router = Router();
  const resumeController = new ResumeController(db, io, screens);

  router.post('/vote', requireAuth, requireStep(db, 'res_1'), resumeController.submitVote);
  router.get('/student/:student_id', requireAuth, resumeController.getResumesByStudent);
  router.get('/group/:group_id', requireAuth, resumeController.getResumesByGroup);
  router.get('/finished-count/:group_id/:class_id', requireAuth, resumeController.getFinishedCount);

  return router;
};
