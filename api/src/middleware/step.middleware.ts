// src/middleware/step.middleware.ts

import { Response, NextFunction } from 'express';
import { Pool, RowDataPacket } from 'mysql2';
import { AuthRequest } from '../models/AuthRequest';
import { STEP_ORDER } from '../config/steps';

// Refuses the request unless stored step has reached minStep
// Admin can still pass them through manually
export const requireStep =
    (db: Pool, minStep: string) =>
    (req: AuthRequest, res: Response, next: NextFunction): void => {
        if (req.user?.affiliation === 'admin') {
        next();
        return;
        }

        const email = req.user?.email;
        if (!email) {
        res.status(401).json({ error: 'Not signed in' });
        return;
        }

        db.query('SELECT step FROM Progress WHERE email = ?', [email], (err, rows) => {
        if (err) {
            console.error('Error checking step:', err);
            res.status(500).json({ error: 'Could not verify your step' });
            return;
        }

        const stored: string = (rows as RowDataPacket[])[0]?.step ?? 'none';
        if (STEP_ORDER.indexOf(stored) < STEP_ORDER.indexOf(minStep)) {
            res.status(409).json({ error: 'Step not reached yet', currentStep: stored });
            return;
        }
        next();
        });
    };
