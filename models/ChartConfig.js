const db = require('../config/database');

class ChartConfig {
  static async create(chartData) {
    const { project_uid, chart_name, chart_type, config_data, is_auto_generated = true, is_enabled = true, display_order = 0 } = chartData;
    
    const query = `
      INSERT INTO chart_configs (project_uid, chart_name, chart_type, config_data, is_auto_generated, is_enabled, display_order)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `;
    
    const values = [project_uid, chart_name, chart_type, JSON.stringify(config_data), is_auto_generated, is_enabled, display_order];
    
    try {
      console.log(`📊 Creating chart: ${chart_name} for project ${project_uid}`);
      const result = await db.query(query, values);
      console.log(`✅ Chart created successfully: ${result.rows[0].id}`);
      return result.rows[0];
    } catch (error) {
      console.error('❌ Error creating chart config:', error);
      throw error;
    }
  }

  static async findById(chartId) {
    const query = 'SELECT * FROM chart_configs WHERE id = $1';
    
    try {
        const result = await db.query(query, [chartId]);
        return result.rows[0];
    } catch (error) {
        console.error('Error finding chart config by ID:', error);
        throw error;
    }
  }

  static async findByProjectUid(projectUid) {
    const query = `
      SELECT * FROM chart_configs 
      WHERE project_uid = $1 
      ORDER BY display_order, created_at
    `;
    
    try {
      console.log(`🔍 Finding charts for project: ${projectUid}`);
      const result = await db.query(query, [projectUid]);
      console.log(`📈 Found ${result.rows.length} existing charts for project ${projectUid}`);
      return result.rows;
    } catch (error) {
      console.error('Error finding chart configs:', error);
      throw error;
    }
  }

  // NEW METHOD: Delete all charts for a project with better error handling
  static async deleteByProjectUid(projectUid) {
    const query = 'DELETE FROM chart_configs WHERE project_uid = $1 RETURNING *';
    
    try {
      console.log(`🗑️ Attempting to delete charts for project: ${projectUid}`);
      const result = await db.query(query, [projectUid]);
      console.log(`✅ Successfully deleted ${result.rows.length} charts for project ${projectUid}`);
      return result.rows;
    } catch (error) {
      console.error('❌ Error deleting charts by project UID:', error);
      console.error('Error details:', error.message);
      console.error('SQL State:', error.code);
      throw error;
    }
  }

  static async update(chartId, updates) {
    const allowedFields = ['chart_name', 'chart_type', 'config_data', 'is_enabled', 'display_order'];
    const setClause = [];
    const values = [];
    let paramCount = 1;

    allowedFields.forEach(field => {
      if (updates[field] !== undefined) {
        setClause.push(`${field} = $${paramCount}`);
        values.push(field === 'config_data' ? JSON.stringify(updates[field]) : updates[field]);
        paramCount++;
      }
    });

    if (setClause.length === 0) {
      throw new Error('No valid fields to update');
    }

    setClause.push('updated_at = CURRENT_TIMESTAMP');
    values.push(chartId);

    const query = `
      UPDATE chart_configs 
      SET ${setClause.join(', ')}
      WHERE id = $${paramCount}
      RETURNING *
    `;

    try {
      const result = await db.query(query, values);
      return result.rows[0];
    } catch (error) {
      console.error('Error updating chart config:', error);
      throw error;
    }
  }

  static async delete(chartId) {
    const query = 'DELETE FROM chart_configs WHERE id = $1 RETURNING *';
    
    try {
      const result = await db.query(query, [chartId]);
      return result.rows[0];
    } catch (error) {
      console.error('Error deleting chart config:', error);
      throw error;
    }
  }

  static async toggleEnabled(chartId, isEnabled) {
    const query = `
      UPDATE chart_configs 
      SET is_enabled = $1, updated_at = CURRENT_TIMESTAMP
      WHERE id = $2
      RETURNING *
    `;
    
    try {
      const result = await db.query(query, [isEnabled, chartId]);
      return result.rows[0];
    } catch (error) {
      console.error('Error toggling chart enabled:', error);
      throw error;
    }
  }
}

module.exports = ChartConfig;