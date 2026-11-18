// src/routes/screening.routes.ts
import { Router } from 'express';
import { Pool } from 'mysql2';
import { ScreeningController } from '../controller/screening.controller';
import { Screens } from '../config/screeningQueue';
import { requireGroupMember } from '../middleware/auth.middleware';

export default (db: Pool, screens: Screens): Router => {
  const router = Router();
  const screeningController = new ScreeningController(screens);

  // A student reads only their own group's results; a professor, any group in a class they teach.
  router.get(
    '/:classId/:groupId/jobs/:jobId',
    requireGroupMember(db),
    screeningController.listResults
  );
  router.get(
    '/:classId/:groupId/jobs/:jobId/resumes/:resumeId',
    requireGroupMember(db),
    screeningController.getResult
  );

  return router;
};
