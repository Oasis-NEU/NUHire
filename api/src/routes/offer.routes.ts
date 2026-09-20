import { Router } from 'express';
import { Pool } from 'mysql2';
import { OfferController } from '../controller/offer.controller';
import { requireAuth, requireAdmin } from '../middleware/auth.middleware';

export default (db: Pool): Router => {
  const router = Router();
  const offerController = new OfferController(db);

  router.post('/', requireAuth, offerController.createOffer);
  router.get(
    '/group/:group_id/class/:class_id',
    requireAuth,
    offerController.getOffersByGroupAndClass
  );
  router.get('/class/:class_id', requireAuth, offerController.getOffersByClass);
  // Accept or reject. A student could previously accept their own group's offer.
  router.put('/:offer_id', requireAdmin, offerController.updateOffer);

  return router;
};
