const db = require('../config/database');

class DataAnalysisLog {
  static async logAnalysis(logData) {
    const { project_uid, analysis_type, analysis_data, success = true, error_message = null } = logData;
    
    const query = `
      INSERT INTO data_analysis_log (project_uid, analysis_type, analysis_data, success, error_message)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `;
    
    const values = [project_uid, analysis_type, JSON.stringify(analysis_data), success, error_message];
    
    try {
      const result = await db.query(query, values);
      return result.rows[0];
    } catch (error) {
      console.error('Error logging analysis:', error);
      throw error;
    }
  }

  static async getRecentAnalysis(projectUid, limit = 10) {
    const query = `
      SELECT * FROM data_analysis_log 
      WHERE project_uid = $1 
      ORDER BY created_at DESC 
      LIMIT $2
    `;
    
    try {
      const result = await db.query(query, [projectUid, limit]);
      return result.rows;
    } catch (error) {
      console.error('Error getting recent analysis:', error);
      throw error;
    }
  }

  static async getAnalysisStats(projectUid) {
    const query = `
      SELECT 
        COUNT(*) as total_analyses,
        COUNT(CASE WHEN success = true THEN 1 END) as successful_analyses,
        COUNT(CASE WHEN success = false THEN 1 END) as failed_analyses,
        MAX(created_at) as last_analysis
      FROM data_analysis_log 
      WHERE project_uid = $1
    `;
    
    try {
      const result = await db.query(query, [projectUid]);
      return result.rows[0];
    } catch (error) {
      console.error('Error getting analysis stats:', error);
      throw error;
    }
  }
}

module.exports = DataAnalysisLog;