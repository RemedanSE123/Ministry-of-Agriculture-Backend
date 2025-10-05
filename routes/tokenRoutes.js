const express = require('express');
const router = express.Router();
const tokenController = require('../controllers/tokenController');

// POST /api/tokens - Add new token
router.post('/', tokenController.addToken);

// GET /api/tokens - Get all tokens for user
router.get('/', tokenController.getTokens);

// DELETE /api/tokens/:id - Delete token
router.delete('/:id', tokenController.deleteToken);

module.exports = router;