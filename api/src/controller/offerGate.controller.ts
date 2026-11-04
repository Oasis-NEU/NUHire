// src/controller/offerGate.controller.ts

import { Response } from 'express';
import { Pool } from 'mysql2';
import { PoolConnection } from 'mysql2/promise';
import { Server as SocketIOServer } from 'socket.io';
import { AuthRequest } from '../models/AuthRequest';
import { readGroupPosition, recordCompletions } from '../config/steps';

const OFFER_STEP = 'offer';

// The teacher's way past "every member must confirm" on make offer, for a group
// whose last confirmation is never coming: a student who closed their laptop,
// or a confirmation lost while the API was down. Unlike force-advance it does
// not move the group, so the group still picks and sends its own offer.
//
// The release is a Step_Completion row for `offer` per member, the same record
// force-advance leaves behind for a gate it walks a group past. That keeps it
// in MySQL, so it survives a restart, and lets the page ask
// GET /groups/barrier-status?step=offer when it missed the event.
export class OfferGateController {
  constructor(
    private db: Pool,
    private io: SocketIOServer
  ) {}

  release = async (req: AuthRequest, res: Response): Promise<void> => {
    const { class_id, group_id } = req.body;

    if (!class_id || !group_id) {
      res.status(400).json({ error: 'Missing required fields: class_id, group_id' });
      return;
    }

    // Checked out inside the try so a full pool still gets the professor an
    // answer; see forceAdvance.
    let conn: PoolConnection | undefined;

    try {
      conn = await this.db.promise().getConnection();
      await conn.beginTransaction();

      const { members, currentStep } = await readGroupPosition(conn, class_id, group_id);
      if (members.length === 0) {
        await conn.rollback();
        res.status(404).json({
          error: `No students on the roster for group ${group_id} in class ${class_id}`,
        });
        return;
      }

      if (currentStep !== OFFER_STEP) {
        await conn.rollback();
        res.status(400).json({
          error: `Group ${group_id} in class ${class_id} is at ${currentStep}, not make offer`,
          current_step: currentStep,
        });
        return;
      }

      await recordCompletions(conn, class_id, group_id, members, [OFFER_STEP]);
      await conn.commit();
    } catch (error) {
      if (conn) {
        await conn.rollback().catch((rollbackError) => {
          console.error('Rollback failed after releasing the offer gate:', rollbackError);
        });
      }
      console.error('Error releasing the offer gate:', error);
      res.status(500).json({ error: 'Failed to release the offer gate' });
      return;
    } finally {
      conn?.release();
    }

    // Audit, like force-advance: an override someone may need to reconstruct.
    console.info(
      `[AUDIT] release-offer-gate: ${req.user?.email} released group ${group_id} in class ${class_id}`
    );

    this.io.to(`group_${group_id}_class_${class_id}`).emit('offerGateReleased', {
      groupId: Number(group_id),
      classId: Number(class_id),
    });

    res.json({ message: 'Offer gate released', class_id, group_id });
  };
}
