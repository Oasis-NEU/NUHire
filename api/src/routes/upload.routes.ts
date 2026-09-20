// src/routes/upload.routes.ts
import { Router } from 'express';
import { UploadController } from '../controller/upload.controller';
import { upload } from '../middleware/upload.middleware';
import { requireAdmin } from '../middleware/auth.middleware';

export default (): Router => {
  const router = Router();
  const uploadController = new UploadController();

  // Uploads are served back verbatim from /uploads, so these are advisor only.
  // Filename sanitisation and type checks are still open (SEC-9).
  router.post('/', requireAdmin, upload.single('file'), uploadController.uploadFile);
  router.post('/resume', requireAdmin, upload.single('resume'), uploadController.uploadResume);
  router.post('/job', requireAdmin, upload.single('jobDescription'), uploadController.uploadJob);

  return router;
};
