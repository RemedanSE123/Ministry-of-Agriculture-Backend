const db = require('../config/database');

class KoboToken {
  // Create new token
  static async create(tokenData) {
    const { user_id, name, token, token_preview } = tokenData;
    
    const query = `
      INSERT INTO kobo_tokens (user_id, name, token, token_preview) 
      VALUES ($1, $2, $3, $4) 
      RETURNING *
    `;
    
    const values = [user_id, name, token, token_preview];
    const result = await db.query(query, values);
    return result.rows[0];
  }

  // Get all tokens for a user
  static async findByUserId(user_id) {
    const query = 'SELECT * FROM kobo_tokens WHERE user_id = $1 ORDER BY created_at DESC';
    const result = await db.query(query, [user_id]);
    return result.rows;
  }

  // Get token by ID
  static async findById(id) {
    const query = 'SELECT * FROM kobo_tokens WHERE id = $1';
    const result = await db.query(query, [id]);
    return result.rows[0];
  }

  // Delete token
  static async delete(id) {
    const query = 'DELETE FROM kobo_tokens WHERE id = $1 RETURNING *';
    const result = await db.query(query, [id]);
    return result.rows[0];
  }

  // Update token
  static async update(id, updates) {
    const fields = Object.keys(updates);
    const values = Object.values(updates);
    
    const setClause = fields.map((field, index) => `${field} = $${index + 2}`).join(', ');
    const query = `UPDATE kobo_tokens SET ${setClause} WHERE id = $1 RETURNING *`;
    
    const result = await db.query(query, [id, ...values]);
    return result.rows[0];
  }
}

module.exports = KoboToken;