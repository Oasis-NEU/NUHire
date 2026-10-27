import { describe, expect, it, vi } from 'vitest';
import type { Response } from 'express';
import type { Server as SocketIOServer } from 'socket.io';
import { FactsController } from '../src/controller/facts.controller';
import type { PrismaDb } from '../src/config/database';
import type { AuthRequest } from '../src/models/AuthRequest';

// A student sees only their own class's facts, and a professor reads and
// writes only the sections they teach.

const PROF = 'prof@northeastern.edu';
const FACTS = { one: 'a', two: 'b', three: 'c' };

// moderatorEmail is who teaches the class asked for; null means no Moderator row.
function fakePrisma(moderatorEmail: string | null) {
  const moderator = {
    findUnique: vi.fn(async () => (moderatorEmail ? { admin_email: moderatorEmail } : null)),
  };
  const waitingFacts = { findUnique: vi.fn(async () => FACTS) };
  const executeRaw = vi.fn(async () => 1);
  const prisma = { moderator, waitingFacts, $executeRaw: executeRaw } as unknown as PrismaDb;
  return { prisma, moderator, waitingFacts, executeRaw };
}

function fakeIo() {
  const emit = vi.fn();
  const to = vi.fn(() => ({ emit }));
  return { io: { to } as unknown as SocketIOServer, to, emit };
}

function fakeReq(user: object, classId: string, body: object = {}) {
  return { user, params: { class_id: classId }, body } as unknown as AuthRequest;
}

const student = { email: 'student@northeastern.edu', affiliation: 'student', class: 101 };
const admin = { email: PROF, affiliation: 'admin' };

function fakeRes() {
  const res = { status: vi.fn(), json: vi.fn() };
  res.status.mockReturnValue(res);
  return res as unknown as Response & {
    status: ReturnType<typeof vi.fn>;
    json: ReturnType<typeof vi.fn>;
  };
}

describe('getFacts', () => {
  it("gives a student their own class's facts, whatever the URL names", async () => {
    const { prisma, moderator, waitingFacts } = fakePrisma(null);
    const res = fakeRes();
    await new FactsController(prisma, fakeIo().io).getFacts(fakeReq(student, '202'), res);
    expect(waitingFacts.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { class_id: 101 } })
    );
    expect(moderator.findUnique).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(FACTS);
  });

  it('gives a student with no class an empty list without a query', async () => {
    const { prisma, waitingFacts } = fakePrisma(null);
    const res = fakeRes();
    const noClass = { ...student, class: undefined };
    await new FactsController(prisma, fakeIo().io).getFacts(fakeReq(noClass, '101'), res);
    expect(res.json).toHaveBeenCalledWith([]);
    expect(waitingFacts.findUnique).not.toHaveBeenCalled();
  });

  it('gives a professor the facts for a class they teach', async () => {
    const { prisma } = fakePrisma(PROF);
    const res = fakeRes();
    await new FactsController(prisma, fakeIo().io).getFacts(fakeReq(admin, '101'), res);
    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(FACTS);
  });

  it("blocks a professor from another professor's class", async () => {
    const { prisma, waitingFacts } = fakePrisma('other@northeastern.edu');
    const res = fakeRes();
    await new FactsController(prisma, fakeIo().io).getFacts(fakeReq(admin, '202'), res);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(waitingFacts.findUnique).not.toHaveBeenCalled();
  });

  it('blocks a professor from a class with no moderator', async () => {
    const { prisma } = fakePrisma(null);
    const res = fakeRes();
    await new FactsController(prisma, fakeIo().io).getFacts(fakeReq(admin, '303'), res);
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('gives a professor who has not picked a class an empty list', async () => {
    const { prisma, moderator } = fakePrisma(PROF);
    const res = fakeRes();
    await new FactsController(prisma, fakeIo().io).getFacts(fakeReq(admin, 'undefined'), res);
    expect(res.json).toHaveBeenCalledWith([]);
    expect(moderator.findUnique).not.toHaveBeenCalled();
  });
});

describe('newFacts', () => {
  it('saves facts for a class the professor teaches and tells the class', async () => {
    const { prisma, executeRaw } = fakePrisma(PROF);
    const { io, to, emit } = fakeIo();
    const res = fakeRes();
    await new FactsController(prisma, io).newFacts(fakeReq(admin, '101', FACTS), res);
    expect(executeRaw).toHaveBeenCalled();
    expect(to).toHaveBeenCalledWith('class_101');
    expect(emit).toHaveBeenCalledWith('factsUpdated');
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it("does not save to another professor's class", async () => {
    const { prisma, executeRaw } = fakePrisma('other@northeastern.edu');
    const { io, to } = fakeIo();
    const res = fakeRes();
    await new FactsController(prisma, io).newFacts(fakeReq(admin, '202', FACTS), res);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(executeRaw).not.toHaveBeenCalled();
    expect(to).not.toHaveBeenCalled();
  });

  it('rejects a class id that is not a number', async () => {
    const { prisma, moderator } = fakePrisma(PROF);
    const res = fakeRes();
    await new FactsController(prisma, fakeIo().io).newFacts(fakeReq(admin, 'abc', FACTS), res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(moderator.findUnique).not.toHaveBeenCalled();
  });

  it('rejects a fact that is not text', async () => {
    const { prisma, moderator, executeRaw } = fakePrisma(PROF);
    const res = fakeRes();
    const body = { one: { x: 1 }, two: 'b', three: 'c' };
    await new FactsController(prisma, fakeIo().io).newFacts(fakeReq(admin, '101', body), res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(moderator.findUnique).not.toHaveBeenCalled();
    expect(executeRaw).not.toHaveBeenCalled();
  });
});
