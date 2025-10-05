const db = require('../config/database');

class ProjectSubmission {
  // Store submission data
  static async create(submissionData) {
    const { project_uid, submission_id, submission_data } = submissionData;

    const query = `
      INSERT INTO project_submissions (project_uid, submission_id, submission_data) 
      VALUES ($1, $2, $3) 
      ON CONFLICT (project_uid, submission_id) 
      DO UPDATE SET submission_data = $3, sync_timestamp = CURRENT_TIMESTAMP
      RETURNING *
    `;
    
    const values = [project_uid, submission_id, JSON.stringify(submission_data)];
    const result = await db.query(query, values);
    return result.rows[0];
  }

  // Get submissions for a project
  static async findByProjectUid(project_uid) {
    const query = 'SELECT * FROM project_submissions WHERE project_uid = $1 ORDER BY created_at DESC';
    const result = await db.query(query, [project_uid]);
    return result.rows;
  }

  // Delete submissions for a project
  static async deleteByProjectUid(project_uid) {
    const query = 'DELETE FROM project_submissions WHERE project_uid = $1 RETURNING *';
    const result = await db.query(query, [project_uid]);
    return result.rows;
  }

  // Get submission count for project
  static async getCountByProjectUid(project_uid) {
    const query = 'SELECT COUNT(*) FROM project_submissions WHERE project_uid = $1';
    const result = await db.query(query, [project_uid]);
    return parseInt(result.rows[0].count);
  }
}

module.exports = ProjectSubmission;