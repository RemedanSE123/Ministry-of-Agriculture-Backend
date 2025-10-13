const KoboToken = require('../models/KoboToken');

const tokenController = {
  // Add new token
  async addToken(req, res) {
    try {
      const { name, token } = req.body;
      const user_id = req.user?.id || 'demo-user'; // You'll replace this with actual user ID from auth

      if (!token) {
        return res.status(400).json({ 
          success: false, 
          error: 'API token is required' 
        });
      }

      const tokenPreview = token.substring(0, 8) + '...';

      const tokenData = {
        user_id,
        name: name || `Token ${Date.now()}`,
        token,
        token_preview: tokenPreview
      };

      const newToken = await KoboToken.create(tokenData);

      res.json({
        success: true,
        message: 'Token added successfully',
        token: newToken
      });

    } catch (error) {
      console.error('Add token error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  },

  // Get all tokens for user
  async getTokens(req, res) {
    try {
      const user_id = req.user?.id || 'demo-user';
      const tokens = await KoboToken.findByUserId(user_id);

      res.json({
        success: true,
        tokens
      });

    } catch (error) {
      console.error('Get tokens error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  },

  // Delete token
  async deleteToken(req, res) {
    try {
      const { id } = req.params;
      const deletedToken = await KoboToken.delete(id);

      if (!deletedToken) {
        return res.status(404).json({
          success: false,
          error: 'Token not found'
        });
      }

      res.json({
        success: true,
        message: 'Token deleted successfully',
        token: deletedToken
      });

    } catch (error) {
      console.error('Delete token error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  },

  // Update token
  async updateToken(req, res) {
    try {
      const { id } = req.params;
      const { name } = req.body;

      if (!name || name.trim() === '') {
        return res.status(400).json({
          success: false,
          error: 'Token name is required'
        });
      }

      const updatedToken = await KoboToken.update(id, { name: name.trim() });
      
      if (!updatedToken) {
        return res.status(404).json({
          success: false,
          error: 'Token not found'
        });
      }

      res.json({
        success: true,
        message: 'Token updated successfully',
        token: updatedToken
      });

    } catch (error) {
      console.error('Update token error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
};

module.exports = tokenController;