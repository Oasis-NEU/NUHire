// src/routes/delete.routes.ts
import { Router } from 'express';
import { Pool } from 'mysql2';
import { ResumeController } from '../controller/resume.controller';
import { JobController } from '../controller/job.controller';
import { requireAdmin } from '../middleware/auth.middleware';
import { Server as SocketIOServer } from 'socket.io';
import { Screens } from '../config/screeningQueue';

export default (
  db: Pool,
  io: SocketIOServer,
  onlineStudents: Record<string, string>,
  screens: Screens
): Router => {
  const router = Router();
  const resumeController = new ResumeController(db, io, screens);
  const jobController = new JobController(db, io, onlineStudents, screens);

  router.delete('/resume/:fileName', requireAdmin, resumeController.deleteResumeFile);
  router.delete('/job/:fileName', requireAdmin, jobController.deleteJobFile);

  return router;
};
