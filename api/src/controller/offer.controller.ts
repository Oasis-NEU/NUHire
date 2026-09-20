// ============================================
// src/controllers/offer.controller.ts
// ============================================

import { Response } from 'express';
import { AuthRequest } from '../models/types';
import { Pool } from 'mysql2';

export class OfferController {
  constructor(private db: Pool) {}

  createOffer = (req: AuthRequest, res: Response): void => {
    const { candidate_id } = req.body;

    // The group and section come from the session, never the body. With the new
    // UNIQUE (class_id, group_id) the insert below is an upsert, so a body-supplied
    // group_id would let any logged-in student overwrite another group's offer
    // instead of merely adding a stray row (AGENTS.md rule 1).
    const group_id = req.user?.group_id;
    const class_id = req.user?.class;

    if (!group_id || !class_id) {
      res.status(400).json({ error: 'You are not in a group yet' });
      return;
    }

    if (!candidate_id) {
      res.status(400).json({ error: 'candidate_id is required' });
      return;
    }

    console.log('Creating new offer:', { group_id, class_id, candidate_id });

    // A group submits one offer. Two members hitting submit at the same moment
    // used to insert two pending rows, and the professor's pending-offers list
    // showed the group twice: accepting one left the other pending forever.
    //
    // `status` is not taken from the body. The only caller sends 'pending', and
    // accepting is the professor's call through PUT /offers/:id (requireAdmin);
    // a student posting status: 'accepted' would otherwise accept their own.
    //
    // The ON DUPLICATE clause leaves `status` alone and only moves candidate_id
    // while the row is still pending, so a late second click cannot reopen or
    // repoint an offer the professor already accepted or rejected.
    // LAST_INSERT_ID(id) makes insertId the existing row's id on the update path,
    // where it would otherwise be 0 and the client would store a bogus offer id.
    this.db.query(
      `INSERT INTO Offers (group_id, class_id, candidate_id, status)
       VALUES (?, ?, ?, 'pending')
       ON DUPLICATE KEY UPDATE
         candidate_id = IF(status IN ('pending', 'rejected'), VALUES(candidate_id), candidate_id),
         status       = IF(status = 'rejected', 'pending', status),
         id           = LAST_INSERT_ID(id)`,
      [group_id, class_id, candidate_id],
      (err, result: any) => {
        if (err) {
          console.error('Error creating offer:', err);
          res.status(500).json({ error: err.message });
          return;
        }

        console.log('Offer created successfully:', result.insertId);
        res.json({
          id: result.insertId,
          message: 'Offer submitted successfully',
          offer_id: result.insertId,
        });
      }
    );
  };

  getOffersByGroupAndClass = (req: AuthRequest, res: Response): void => {
    const { group_id, class_id } = req.params;

    console.log('Fetching pending offers for class:', class_id);

    const query = `SELECT * FROM Offers WHERE class_id = ? AND group_id = ?`;

    this.db.query(query, [class_id, group_id], (err, results) => {
      if (err) {
        console.error('Error fetching pending offers:', err);
        res.status(500).json({ error: err.message });
        return;
      }

      res.json(results);
    });
  };

  getOffersByClass = (req: AuthRequest, res: Response): void => {
    const { class_id } = req.params;

    console.log('Fetching pending offers for class:', class_id);

    const query = `SELECT * FROM Offers WHERE class_id = ?`;

    this.db.query(query, [class_id], (err, results) => {
      if (err) {
        console.error('Error fetching pending offers:', err);
        res.status(500).json({ error: err.message });
        return;
      }

      console.log(`Found ${(results as any[]).length} pending offers for class ${class_id}`);
      res.json(results);
    });
  };

  updateOffer = (req: AuthRequest, res: Response): void => {
    const { offer_id } = req.params;
    const { status } = req.body;

    if (!['accepted', 'rejected'].includes(status)) {
      res.status(400).json({ error: "Status must be 'accepted' or 'rejected'" });
      return;
    }

    this.db.query(
      `UPDATE Offers SET status = ? WHERE id = ?`,
      [status, offer_id],
      (err, result: any) => {
        if (err) {
          console.error('Error updating offer:', err);
          res.status(500).json({ error: err.message });
          return;
        }

        if (result.affectedRows === 0) {
          res.status(404).json({ error: 'Offer not found' });
          return;
        }

        console.log('Offer updated successfully');
        res.json({ message: 'Offer updated successfully' });
      }
    );
  };
}
