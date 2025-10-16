const express = require('express');
const router = express.Router();
const { 
  fetchKoboToolboxData, 
  syncProjectData, 
  getImage, 
  getImageBySubmission,
  debugImageAccess 
} = require('../controllers/koboController');

// POST /api/kobo/projects
router.post('/projects', fetchKoboToolboxData);

// POST /api/kobo/projects/:projectUid/sync
router.post('/projects/:projectUid/sync', syncProjectData);

// GET /api/kobo/image/:projectUid/:submissionId/:filename
router.get('/image/:projectUid/:submissionId/:filename', getImage);

// GET /api/kobo/image/:projectUid/:submissionId (uses field query parameter)
router.get('/image/:projectUid/:submissionId', getImageBySubmission);

// GET /api/kobo/debug/:projectUid/:submissionId (debug endpoint)
router.get('/debug/:projectUid/:submissionId', debugImageAccess);

module.exports = router;