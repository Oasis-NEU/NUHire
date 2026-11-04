import { Router } from 'express';
import { Pool } from 'mysql2';
import { ModeratorController } from '../controller/moderator.controller';
import { requireAuth, requireAdmin, requireModerator } from '../middleware/auth.middleware';

export default (db: Pool): Router => {
  const router = Router();
  const moderatorController = new ModeratorController(db);

  // Teacher grants. DELETE cascades through the whole class.
  router.post('/crns', requireModerator, moderatorController.addModeratorCRN);
  router.get('/crns', requireModerator, moderatorController.getAllModeratorCRNs);
  router.delete('/crns/:crn', requireModerator, moderatorController.deleteModeratorCRN);
  router.get('/crns/:crn', requireAuth, moderatorController.getModeratorCRN);
  router.get('/classes/:email', requireAuth, moderatorController.getModeratorClasses);
  router.get('/classes-full/:email', requireAuth, moderatorController.getModeratorClassesFull);
  router.post('/add-student', requireAdmin, moderatorController.addStudent);
  router.delete('/del-student', requireAdmin, moderatorController.deleteStudent);

  return router;
};
