const express = require('express');
const router = express.Router();
const projectController = require('../controllers/projectController');
const exportController = require('../controllers/exportController');

// POST /api/projects/save - Save project
router.post('/save', projectController.saveProject);

// GET /api/projects/token/:tokenId - Get projects for token
router.get('/token/:tokenId', projectController.getProjectsByToken);

// GET /api/projects/user - Get all user projects
router.get('/user', projectController.getUserProjects);

// DELETE /api/projects/:id - Delete project
router.delete('/:id', projectController.deleteProject);

// PUT /api/projects/:projectUid/columns - Update columns
router.put('/:projectUid/columns', projectController.updateColumns);

// POST /api/projects/:projectUid/sync - Sync project data
router.post('/:projectUid/sync', projectController.syncProject);

// GET /api/projects/:projectUid - Get single project
router.get('/:projectUid', projectController.getProject);

// PUT /api/projects/:projectUid/auto-sync - Configure auto-sync
router.put('/:projectUid/auto-sync', projectController.configureAutoSync);

// GET /api/projects/auto-sync/due - Get projects due for sync
router.get('/auto-sync/due', projectController.getProjectsDueForSync);

// GET /api/projects/auto-sync/status - Get auto-sync service status
router.get('/auto-sync/status', projectController.getAutoSyncStatus);

// FIXED: Export routes - match the frontend URL pattern
router.get('/:projectUid/export/:format', exportController.exportProjectData);

// Keep the generic export route as fallback
router.get('/:projectUid/export', exportController.exportProjectData);

module.exports = router;