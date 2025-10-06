const pool = require('../config/database');

const auth = async (req, res, next) => {
  try {
    // For now, we'll use a simple session check
    // In production, use JWT tokens
    const userData = req.headers['authorization'];
    
    if (!userData) {
      return res.status(401).json({
        success: false,
        message: 'No authorization token provided'
      });
    }

    // Parse user data from header (temporary solution)
    const user = JSON.parse(Buffer.from(userData, 'base64').toString());
    
    // Verify user exists and has admin role
    const userResult = await pool.query(
      'SELECT * FROM users WHERE id = $1 AND role IN ($2, $3)', 
      [user.id, 'admin', 'superadmin']
    );
    
    if (userResult.rows.length === 0) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Admin privileges required.'
      });
    }

    req.user = userResult.rows[0];
    next();
  } catch (error) {
    console.error('❌ Auth middleware error:', error);
    return res.status(401).json({
      success: false,
      message: 'Invalid authentication'
    });
  }
};

module.exports = auth;