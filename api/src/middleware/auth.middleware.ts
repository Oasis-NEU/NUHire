// src/middleware/auth.middleware.ts

import { Response, NextFunction } from 'express';
import { AuthRequest } from '../models/types';

export const requireAuth = (req: AuthRequest, res: Response, next: NextFunction): void => {
  if (!req.isAuthenticated || !req.isAuthenticated()) {
    res.status(401).json({ message: 'Unauthorized: Please log in' });
    return;
  }
  next();
};

export const requireAdmin = (req: AuthRequest, res: Response, next: NextFunction): void => {
  if (!req.isAuthenticated || !req.isAuthenticated()) {
    res.status(401).json({ message: 'Unauthorized: Please log in' });
    return;
  }

  if (req.user?.affiliation !== 'admin') {
    res.status(403).json({ message: 'Forbidden: Admin access required' });
    return;
  }

  next();
};

// Accepts either a Keycloak admin session or the legacy moderator login
// (session.isModerator, set by POST /auth/moderator-login). The /moderator/crns
// routes are driven from /mod-dashboard, which still uses the legacy login.
// When SEC-5 removes that login this collapses into requireAdmin.
export const requireModerator = (req: AuthRequest, res: Response, next: NextFunction): void => {
  if (req.session?.isModerator === true) {
    next();
    return;
  }
  requireAdmin(req, res, next);
};

export const requireStudent = (req: AuthRequest, res: Response, next: NextFunction): void => {
  if (!req.isAuthenticated || !req.isAuthenticated()) {
    res.status(401).json({ message: 'Unauthorized: Please log in' });
    return;
  }

  if (req.user?.affiliation !== 'student') {
    res.status(403).json({ message: 'Forbidden: Student access required' });
    return;
  }

  next();
};
