// src/routes/job.routes.ts
import { Router } from 'express';
import { Pool } from 'mysql2';
import { Server as SocketIOServer } from 'socket.io';
import { JobController } from '../controller/job.controller';
import { requireAuth, requireAdmin } from '../middleware/auth.middleware';

export default (db: Pool, io: SocketIOServer, onlineStudents: Record<string, string>): Router => {
  const router = Router();
  const jobController = new JobController(db, io, onlineStudents);

  router.get('/', requireAuth, jobController.getAllJobs);
  router.get('/title', requireAuth, jobController.getJobByTitle);
  router.get('/assignment/:groupId/:classId', requireAuth, jobController.getJobAssignment);

  // Assigning a job deletes the group's work. Advisor only.
  router.post('/', requireAdmin, jobController.createJob);
  router.post('/update-job', requireAdmin, jobController.updateJob);
  router.post('/assign-job-to-all', requireAdmin, jobController.assignJobToAllGroups);

  return router;
};
