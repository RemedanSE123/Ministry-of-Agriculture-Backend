const express = require('express');
const router = express.Router();
const projectController = require('../controllers/projectController');

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

// POST /api/projects/:projectId/sync - Sync project data
router.post('/:projectId/sync', projectController.syncProject);

// Add this line to your projectRoutes.js
router.get('/:projectUid', projectController.getProject);

module.exports = router;