const db = require('../config/database');

class SavedProject {
  // Save project to database
  static async create(projectData) {
    const {
      token_id,
      project_uid,
      project_name,
      owner_username,
      date_created,
      deployment_active,
      total_submissions,
      available_columns,
      selected_columns,
      data_url
    } = projectData;

    console.log('Creating project in database:', {
      project_uid,
      project_name,
      available_columns_length: available_columns?.length
    });

    // Ensure columns are properly stringified
    const availableColumnsJson = JSON.stringify(available_columns || []);
    const selectedColumnsJson = JSON.stringify(selected_columns || available_columns || []);

    const query = `
      INSERT INTO saved_projects 
      (token_id, project_uid, project_name, owner_username, date_created, 
       deployment_active, total_submissions, available_columns, selected_columns, data_url) 
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) 
      RETURNING *
    `;
    
    const values = [
      token_id,
      project_uid,
      project_name,
      owner_username,
      date_created,
      deployment_active,
      total_submissions,
      availableColumnsJson,
      selectedColumnsJson,
      data_url
    ];
    
    try {
      const result = await db.query(query, values);
      console.log('Project created successfully in database');
      return result.rows[0];
    } catch (error) {
      console.error('Database error creating project:', error);
      throw error;
    }
  }

  // Get all projects for a token
  static async findByTokenId(token_id) {
    const query = `
      SELECT sp.*, kt.name as token_name, kt.token_preview 
      FROM saved_projects sp 
      JOIN kobo_tokens kt ON sp.token_id = kt.id 
      WHERE sp.token_id = $1 
      ORDER BY sp.created_at DESC
    `;
    const result = await db.query(query, [token_id]);
    return result.rows;
  }

  // Get project by UID
  static async findByUid(project_uid) {
    const query = 'SELECT * FROM saved_projects WHERE project_uid = $1';
    const result = await db.query(query, [project_uid]);
    return result.rows[0];
  }

  // Delete project
  static async delete(id) {
    const query = 'DELETE FROM saved_projects WHERE id = $1 RETURNING *';
    const result = await db.query(query, [id]);
    return result.rows[0];
  }

  // Update project sync time
  static async updateSyncTime(project_uid) {
    const query = 'UPDATE saved_projects SET last_sync = CURRENT_TIMESTAMP WHERE project_uid = $1 RETURNING *';
    const result = await db.query(query, [project_uid]);
    return result.rows[0];
  }

  // Update selected columns
  static async updateColumns(project_uid, selected_columns) {
    const selectedColumnsJson = JSON.stringify(selected_columns || []);
    const query = 'UPDATE saved_projects SET selected_columns = $1 WHERE project_uid = $2 RETURNING *';
    const result = await db.query(query, [selectedColumnsJson, project_uid]);
    return result.rows[0];
  }

  // Get all projects for user
  static async findByUserId(user_id) {
    const query = `
      SELECT sp.*, kt.name as token_name, kt.token_preview 
      FROM saved_projects sp 
      JOIN kobo_tokens kt ON sp.token_id = kt.id 
      WHERE kt.user_id = $1 
      ORDER BY kt.name, sp.project_name
    `;
    const result = await db.query(query, [user_id]);
    return result.rows;
  }

  // Update project data (for sync)
  static async updateProjectData(project_uid, updates) {
    const fields = Object.keys(updates);
    const values = Object.values(updates);
    
    const setClause = fields.map((field, index) => {
      if (field === 'available_columns' || field === 'selected_columns') {
        return `${field} = $${index + 2}::jsonb`;
      }
      return `${field} = $${index + 2}`;
    }).join(', ');
    
    const query = `UPDATE saved_projects SET ${setClause} WHERE project_uid = $1 RETURNING *`;
    
    const result = await db.query(query, [project_uid, ...values]);
    return result.rows[0];
  }

  // Get project with token info
  static async findWithToken(project_uid) {
    const query = `
      SELECT sp.*, kt.name as token_name, kt.token, kt.token_preview 
      FROM saved_projects sp 
      JOIN kobo_tokens kt ON sp.token_id = kt.id 
      WHERE sp.project_uid = $1
    `;
    const result = await db.query(query, [project_uid]);
    return result.rows[0];
  }

  // Check if project exists for user
  static async existsForUser(project_uid, user_id) {
    const query = `
      SELECT sp.id 
      FROM saved_projects sp 
      JOIN kobo_tokens kt ON sp.token_id = kt.id 
      WHERE sp.project_uid = $1 AND kt.user_id = $2
    `;
    const result = await db.query(query, [project_uid, user_id]);
    return result.rows.length > 0;
  }

  // Get projects that need sync (for auto-sync feature)
  static async getProjectsNeedingSync() {
    const query = `
      SELECT sp.*, kt.token, kt.name as token_name 
      FROM saved_projects sp 
      JOIN kobo_tokens kt ON sp.token_id = kt.id 
      WHERE sp.last_sync IS NULL OR sp.last_sync < NOW() - INTERVAL '1 hour'
      ORDER BY sp.last_sync ASC NULLS FIRST
    `;
    const result = await db.query(query);
    return result.rows;
  }
}

module.exports = SavedProject;