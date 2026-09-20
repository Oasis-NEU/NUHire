// src/routes/resume-pdf.routes.ts
import { Router } from 'express';
import { Pool } from 'mysql2';
import { ResumeController } from '../controller/resume.controller';
import { requireAuth, requireAdmin } from '../middleware/auth.middleware';
import { Server as SocketIOServer } from 'socket.io';

export default (db: Pool, io: SocketIOServer): Router => {
  const router = Router();
  const resumeController = new ResumeController(db, io);

  router.get('/', requireAuth, resumeController.getAllResumePdfs);
  router.post('/', requireAdmin, resumeController.createResumePdf);
  router.delete('/:file_path', requireAdmin, resumeController.deleteResumeFile);
  router.get('/resumes/:fileName', requireAuth, resumeController.getResumeFile);
  router.get('/id/:id', requireAuth, resumeController.getResumePdfById);

  return router;
};
