// src/routes/group.routes.ts
import { Router } from 'express';
import { Pool } from 'mysql2';
import { Server as SocketIOServer } from 'socket.io';
import { GroupController } from '../controller/group.controller';
import { requireAuth, requireAdmin } from '../middleware/auth.middleware';

export default (db: Pool, io: SocketIOServer): Router => {
  const router = Router();
  const groupController = new GroupController(db, io);

  // Advisor only: anything that changes the class, and the roster reads that
  // return every student's name and email.
  router.get('/', requireAdmin, groupController.getGroups);
  router.post('/update-group', requireAdmin, groupController.updateGroup);
  router.post('/create-groups', requireAdmin, groupController.createGroups);
  router.get('/students-by-class/:classId', requireAdmin, groupController.getStudentsByClass);
  router.patch('/reassign-student', requireAdmin, groupController.reassignStudent);
  router.patch('/remove-from-group', requireAdmin, groupController.removeFromGroup);
  router.patch('/start-all-groups', requireAdmin, groupController.startAllGroups);
  router.patch('/start-group', requireAdmin, groupController.startGroup);
  router.post('/add-student', requireAdmin, groupController.addStudent);
  router.post('/create-single-group', requireAdmin, groupController.createSingleGroup);
  router.delete('/delete-student', requireAdmin, groupController.deleteStudent);

  // Students read their own group's state from these.
  router.get('/class-info/:classId', requireAuth, groupController.getClassInfo);
  router.post('/join-group', requireAuth, groupController.joinGroup);
  router.get('/started/:classId/:groupId', requireAuth, groupController.getGroupStarted);
  router.get('/status/:classId/:groupId', requireAuth, groupController.getGroupStatus);
  router.get('/seen', requireAuth, groupController.getGroupsSeen);
  router.get('/getProgress/:classId/:groupId', requireAuth, groupController.getProgress);
  return router;
};
