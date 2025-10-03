const express = require('express');
const router = express.Router();
const { fetchKoboToolboxData } = require('../controllers/koboController');

// POST /api/kobo/projects
router.post('/projects', fetchKoboToolboxData);

module.exports = router;