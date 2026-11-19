// src/routes/resume-pdf.routes.ts
import { Router } from 'express';
import { Pool } from 'mysql2';
import { ResumeController } from '../controller/resume.controller';
import { requireAuth, requireClassModerator } from '../middleware/auth.middleware';
import { Server as SocketIOServer } from 'socket.io';
import { Screens } from '../config/screeningQueue';
import { PrismaDb } from '../config/database';
import { ResumePackController } from '../controller/resumePack.controller';
import { createResumePackRepository } from '../repository/resumePack.repository';

export default (db: Pool, prisma: PrismaDb, io: SocketIOServer, screens: Screens): Router => {
  const router = Router();
  const resumeController = new ResumeController(db, io, screens);
  const packController = new ResumePackController(createResumePackRepository(prisma), screens);

  router.get('/', requireAuth, resumeController.getAllResumePdfs);
  // Queues the new resume's screens; professors of this class only.
  router.post('/', requireClassModerator(db), resumeController.createResumePdf);
  router.get('/id/:id', requireAuth, resumeController.getResumePdfById);
  // Adds the fictional sample resumes to a class; professors of this class only.
  router.post('/sample-pack', requireClassModerator(db), packController.load);

  // Deleting a resume file is DELETE /delete/resume/:fileName; reading one is
  // GET /uploads/resumes/:fileName. The duplicate mounts that were here are gone.

  return router;
};
