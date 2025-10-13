const express = require('express');
const router = express.Router();
const tokenController = require('../controllers/tokenController');

// GET /api/tokens - Get all tokens for user
router.get('/', tokenController.getTokens);

// POST /api/tokens - Add new token
router.post('/', tokenController.addToken);

// DELETE /api/tokens/:id - Delete token
router.delete('/:id', tokenController.deleteToken);

// PUT /api/tokens/:id - Update token
router.put('/:id', tokenController.updateToken);

module.exports = router;