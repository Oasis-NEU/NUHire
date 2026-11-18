// src/routes/job.routes.ts
import { Router } from 'express';
import { Pool } from 'mysql2';
import { Server as SocketIOServer } from 'socket.io';
import { JobController } from '../controller/job.controller';
import { ScreeningController } from '../controller/screening.controller';
import { Screens } from '../config/screeningQueue';
import { requireAuth, requireClassModerator } from '../middleware/auth.middleware';

export default (
  db: Pool,
  io: SocketIOServer,
  onlineStudents: Record<string, string>,
  screens: Screens
): Router => {
  const router = Router();
  const jobController = new JobController(db, io, onlineStudents, screens);
  const screeningController = new ScreeningController(screens);

  router.get('/', requireAuth, jobController.getAllJobs);
  router.get('/title', requireAuth, jobController.getJobByTitle);
  router.get('/assignment/:groupId/:classId', requireAuth, jobController.getJobAssignment);

  // Assigning a job with `reset: true` deletes the group's work. Advisor only.
  router.get('/reset-preview/:class_id', requireClassModerator(db), jobController.getResetPreview);
  router.post('/', requireClassModerator(db), jobController.createJob);
  router.post('/update-job', requireClassModerator(db), jobController.updateJob);
  router.post('/assign-job-to-all', requireClassModerator(db), jobController.assignJobToAllGroups);
  // Changing a posting's keywords queues its screens again.
  router.put('/:job_id/keywords', requireClassModerator(db), screeningController.setKeywords);

  return router;
};
