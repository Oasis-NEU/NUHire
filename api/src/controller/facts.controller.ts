// src/controller/facts.controller.ts
import { Response } from 'express';
import { Server as SocketIOServer } from 'socket.io';
import { AuthRequest } from '../models/AuthRequest';
import { PrismaDb } from '../config/database';

// Nine digits keep it inside MySQL's INT.
const CLASS_ID = /^\d{1,9}$/;

/**
 * `class_id` comes from the URL as a string. mysql2 let MySQL convert it, but
 * Prisma rejects a string for an Int column, so it is parsed here.
 */
function parseClassId(raw: string): number | null {
  return CLASS_ID.test(raw) ? Number(raw) : null;
}

export class FactsController {
  constructor(
    private prisma: PrismaDb,
    private io: SocketIOServer
  ) {}

  getFacts = async (req: AuthRequest, res: Response): Promise<void> => {
    const classId = parseClassId(req.params.class_id);
    // The facts component asks for /facts/get/undefined before the user has
    // loaded. MySQL matched no class for that, so it still finds nothing.
    if (classId === null) {
      res.json([]);
      return;
    }

    try {
      const facts = await this.prisma.waitingFacts.findUnique({
        where: { class_id: classId },
        select: { one: true, two: true, three: true },
      });
      // An empty array, not null, is what a class with no facts has always got.
      res.json(facts ?? []);
    } catch (error) {
      console.error('Error fetching facts:', error);
      res.status(500).json({ error: 'Failed to fetch facts' });
    }
  };

  newFacts = async (req: AuthRequest, res: Response): Promise<void> => {
    const classId = parseClassId(req.params.class_id);
    const { one = null, two = null, three = null } = req.body;
    if (classId === null) {
      res.status(400).json({ error: 'Invalid class id' });
      return;
    }

    try {
      // One statement, as before. On MySQL Prisma's upsert is a SELECT and then
      // an INSERT or UPDATE, so two first saves for a class can both insert and
      // one fails on the primary key.
      await this.prisma.$executeRaw`
        INSERT INTO WaitingFacts (class_id, one, two, three) VALUES (${classId}, ${one}, ${two}, ${three})
        ON DUPLICATE KEY UPDATE one = ${one}, two = ${two}, three = ${three}`;
      this.io.to(`class_${classId}`).emit('factsUpdated');
      res.status(200).json({ message: 'Facts saved successfully' });
    } catch (error) {
      console.error('Error saving facts:', error);
      res.status(500).json({ error: 'Failed to save facts' });
    }
  };
}
