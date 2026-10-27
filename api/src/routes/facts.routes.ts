import { Router } from 'express';
import { PrismaDb } from '../config/database';
import { requireAuth, requireAdmin } from '../middleware/auth.middleware';
import { Server as SocketIOServer } from 'socket.io';
import { FactsController } from '../controller/facts.controller';

export default (prisma: PrismaDb, io: SocketIOServer): Router => {
  const router = Router();
  const factsController = new FactsController(prisma, io);

  router.post('/create/:class_id', requireAdmin, factsController.newFacts);
  router.get('/get/:class_id', requireAuth, factsController.getFacts);

  return router;
};
