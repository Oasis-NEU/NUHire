// src/routes/resume-pdf.routes.ts
import { Router } from 'express';
import { Pool } from 'mysql2';
import { ResumeController } from '../controller/resume.controller';
import { requireAuth, requireClassModerator } from '../middleware/auth.middleware';
import { Server as SocketIOServer } from 'socket.io';
import { Screens } from '../config/screeningQueue';

export default (db: Pool, io: SocketIOServer, screens: Screens): Router => {
  const router = Router();
  const resumeController = new ResumeController(db, io, screens);

  router.get('/', requireAuth, resumeController.getAllResumePdfs);
  // Queues the new resume's screens; professors of this class only.
  router.post('/', requireClassModerator(db), resumeController.createResumePdf);
  router.get('/id/:id', requireAuth, resumeController.getResumePdfById);

  // Deleting a resume file is DELETE /delete/resume/:fileName; reading one is
  // GET /uploads/resumes/:fileName. The duplicate mounts that were here are gone.

  return router;
};
