// src/controller/facts.controller.ts
import { Response } from 'express';
import { Server as SocketIOServer } from 'socket.io';
import { AuthRequest } from '../models/AuthRequest';
import { dbErrorStatus, PrismaDb } from '../config/database';
import { User, isAdmin } from '../models/User';

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

  // checks if the admin with the given email is the professor for the given class
  private moderates = async (email: string, classId: number): Promise<boolean> => {
    const moderator = await this.prisma.moderator.findUnique({
      where: { crn: classId },
      select: { admin_email: true },
    });
    return moderator?.admin_email === email;
  };

  getFacts = async (req: AuthRequest, res: Response): Promise<void> => {
    const user: User = req.user!;
    // admin's class comes from the URL (can get any of their class), and student only sees their own class
    const classId = isAdmin(user) ? parseClassId(req.params.class_id) : (user.class ?? null);

    if (classId === null) {
      res.json([]);
      return;
    }

    try {
      // admin can't get a class that's not theirs
      if (isAdmin(user) && !(await this.moderates(user.email, classId))) {
        res.status(403).json({ error: 'Forbidden: not your class' });
        return;
      }
      const facts = await this.prisma.waitingFacts.findUnique({
        where: { class_id: classId },
        select: { one: true, two: true, three: true },
      });
      // An empty array, not null, is what a class with no facts has always got.
      res.json(facts ?? []);
    } catch (error) {
      console.error('Error fetching facts:', error);
      res.status(dbErrorStatus(error)).json({ error: 'Failed to fetch facts' });
    }
  };

  newFacts = async (req: AuthRequest, res: Response): Promise<void> => {
    const user: User = req.user!;
    const classId = parseClassId(req.params.class_id);
    const { one = null, two = null, three = null } = req.body;
    if (classId === null) {
      res.status(400).json({ error: 'Invalid class id' });
      return;
    }
    if ([one, two, three].some((fact) => fact !== null && typeof fact !== 'string')) {
      res.status(400).json({ error: 'Facts must be text' });
      return;
    }

    try {
      if (!(await this.moderates(user.email, classId))) {
        res.status(403).json({ error: 'Forbidden: not your class' });
        return;
      }
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
      res.status(dbErrorStatus(error)).json({ error: 'Failed to save facts' });
    }
  };
}
