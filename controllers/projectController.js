const SavedProject = require('../models/SavedProject');
const ProjectSubmission = require('../models/ProjectSubmission');
const KoboToken = require('../models/KoboToken');
const autoSyncService = require('../services/autoSyncService');

const projectController = {
  // Save project to database
  async saveProject(req, res) {
    try {
      const {
        token_id,
        uid,
        name,
        owner__username,
        date_created,
        deployment__active,
        submissions,
        available_columns,
        selected_columns,
        data_url
      } = req.body;

      console.log('Saving project:', { uid, name, available_columns });

      // Check if project already exists
      const existingProject = await SavedProject.findByUid(uid);
      if (existingProject) {
        return res.status(400).json({
          success: false,
          error: 'Project already saved'
        });
      }

      const safeAvailableColumns = Array.isArray(available_columns) 
        ? available_columns 
        : (available_columns || []);

      const safeSelectedColumns = Array.isArray(selected_columns) 
        ? selected_columns 
        : (selected_columns || safeAvailableColumns);

      const projectData = {
        token_id: parseInt(token_id),
        project_uid: uid,
        project_name: name,
        owner_username: owner__username,
        date_created: date_created ? new Date(date_created) : new Date(),
        deployment_active: deployment__active || false,
        total_submissions: submissions?.length || 0,
        available_columns: safeAvailableColumns,
        selected_columns: safeSelectedColumns,
        data_url: data_url,
        auto_sync_enabled: false,
        auto_sync_interval: null,
        next_sync_time: null
      };

      const savedProject = await SavedProject.create(projectData);
      console.log('Project saved successfully:', savedProject.id);

      // Store submissions if any
      if (submissions && submissions.length > 0) {
        console.log('Storing submissions:', submissions.length);
        for (const submission of submissions) {
          await ProjectSubmission.create({
            project_uid: uid,
            submission_id: submission._id || submission.id || Date.now().toString(),
            submission_data: submission
          });
        }
      }

      res.json({
        success: true,
        message: 'Project saved successfully',
        project: savedProject
      });

    } catch (error) {
      console.error('Save project error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  },

  // Get saved projects for a token
  async getProjectsByToken(req, res) {
    try {
      const { tokenId } = req.params;
      const projects = await SavedProject.findByTokenId(tokenId);

      const projectsWithData = await Promise.all(
        projects.map(async (project) => {
          try {
            const submissionCount = await ProjectSubmission.getCountByProjectUid(project.project_uid);
            const submissions = await ProjectSubmission.findByProjectUid(project.project_uid);
            
            let availableColumns = [];
            let selectedColumns = [];
            
            try {
              availableColumns = typeof project.available_columns === 'string' 
                ? JSON.parse(project.available_columns) 
                : (project.available_columns || []);
            } catch (e) {
              availableColumns = [];
            }
            
            try {
              selectedColumns = typeof project.selected_columns === 'string' 
                ? JSON.parse(project.selected_columns) 
                : (project.selected_columns || []);
            } catch (e) {
              selectedColumns = availableColumns;
            }

            return {
              ...project,
              available_columns: availableColumns,
              selected_columns: selectedColumns,
              total_submissions: submissionCount,
              submissions: submissions.map(sub => {
                try {
                  return typeof sub.submission_data === 'string' 
                    ? JSON.parse(sub.submission_data) 
                    : sub.submission_data;
                } catch (e) {
                  return {};
                }
              }),
              last_sync: project.last_sync,
              auto_sync_enabled: project.auto_sync_enabled || false,
              auto_sync_interval: project.auto_sync_interval,
              next_sync_time: project.next_sync_time
            };
          } catch (error) {
            console.error('Error processing project:', project.project_uid, error);
            return {
              ...project,
              available_columns: [],
              selected_columns: [],
              total_submissions: 0,
              submissions: [],
              error: 'Failed to process project data'
            };
          }
        })
      );

      res.json({
        success: true,
        projects: projectsWithData
      });

    } catch (error) {
      console.error('Get projects error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  },

  // Get all saved projects for user
  async getUserProjects(req, res) {
    try {
      const user_id = req.user?.id || 'demo-user';
      const projects = await SavedProject.findByUserId(user_id);

      const projectsWithData = await Promise.all(
        projects.map(async (project) => {
          try {
            const submissionCount = await ProjectSubmission.getCountByProjectUid(project.project_uid);
            
            let availableColumns = [];
            let selectedColumns = [];
            
            try {
              availableColumns = typeof project.available_columns === 'string' 
                ? JSON.parse(project.available_columns) 
                : (project.available_columns || []);
            } catch (e) {
              availableColumns = [];
            }
            
            try {
              selectedColumns = typeof project.selected_columns === 'string' 
                ? JSON.parse(project.selected_columns) 
                : (project.selected_columns || []);
            } catch (e) {
              selectedColumns = availableColumns;
            }

            return {
              id: project.id,
              token_id: project.token_id,
              project_uid: project.project_uid,
              project_name: project.project_name,
              owner_username: project.owner_username,
              date_created: project.date_created,
              deployment_active: project.deployment_active,
              total_submissions: submissionCount,
              available_columns: availableColumns,
              selected_columns: selectedColumns,
              data_url: project.data_url,
              last_sync: project.last_sync,
              token_name: project.token_name,
              created_at: project.created_at,
              auto_sync_enabled: project.auto_sync_enabled || false,
              auto_sync_interval: project.auto_sync_interval,
              next_sync_time: project.next_sync_time
            };
          } catch (error) {
            console.error('Error processing project for sidebar:', project.project_uid, error);
            return {
              id: project.id,
              token_id: project.token_id,
              project_uid: project.project_uid,
              project_name: project.project_name,
              owner_username: project.owner_username,
              deployment_active: project.deployment_active,
              total_submissions: 0,
              available_columns: [],
              selected_columns: [],
              token_name: project.token_name,
              error: 'Failed to process project'
            };
          }
        })
      );

      const validProjects = projectsWithData.filter(project => !project.error);

      res.json({
        success: true,
        projects: validProjects
      });

    } catch (error) {
      console.error('Get user projects error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  },

  // Delete saved project
  async deleteProject(req, res) {
    try {
      const { id } = req.params;
      const deletedProject = await SavedProject.delete(id);

      if (!deletedProject) {
        return res.status(404).json({
          success: false,
          error: 'Project not found'
        });
      }

      await ProjectSubmission.deleteByProjectUid(deletedProject.project_uid);

      res.json({
        success: true,
        message: 'Project deleted successfully',
        project: deletedProject
      });

    } catch (error) {
      console.error('Delete project error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  },

  // Update project columns
  async updateColumns(req, res) {
    try {
      const { projectUid } = req.params;
      const { selected_columns } = req.body;

      console.log('Updating columns for project:', projectUid, selected_columns);

      const updatedProject = await SavedProject.updateColumns(projectUid, selected_columns);

      let parsedColumns = [];
      try {
        parsedColumns = typeof updatedProject.selected_columns === 'string'
          ? JSON.parse(updatedProject.selected_columns)
          : updatedProject.selected_columns;
      } catch (e) {
        parsedColumns = selected_columns;
      }

      res.json({
        success: true,
        message: 'Columns updated successfully',
        project: {
          ...updatedProject,
          selected_columns: parsedColumns
        }
      });

    } catch (error) {
      console.error('Update columns error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  },

  // Sync project data
  async syncProject(req, res) {
    try {
      const { projectUid } = req.params;
      
      // Get project with token info
      const project = await SavedProject.findWithToken(projectUid);
      
      if (!project) {
        return res.status(404).json({
          success: false,
          error: 'Project not found'
        });
      }

      if (!project.token) {
        return res.status(400).json({
          success: false,
          error: 'No token available for this project'
        });
      }

      // Use the autoSyncService for manual sync
      const result = await autoSyncService.manualSync(
        projectUid, 
        project.token, 
        project.project_name
      );

      res.json({
        success: true,
        message: 'Project synced successfully',
        total_submissions: result.total_submissions,
        last_sync: new Date().toISOString(),
        submissions: result.submissions
      });

    } catch (error) {
      console.error('Sync project error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  },

  // Get single project details
  async getProject(req, res) {
    try {
      const { projectUid } = req.params;
      const project = await SavedProject.findByUid(projectUid);

      if (!project) {
        return res.status(404).json({
          success: false,
          error: 'Project not found'
        });
      }

      let availableColumns = [];
      let selectedColumns = [];
      
      try {
        availableColumns = typeof project.available_columns === 'string' 
          ? JSON.parse(project.available_columns) 
          : (project.available_columns || []);
      } catch (e) {
        availableColumns = [];
      }
      
      try {
        selectedColumns = typeof project.selected_columns === 'string' 
          ? JSON.parse(project.selected_columns) 
          : (project.selected_columns || []);
      } catch (e) {
        selectedColumns = availableColumns;
      }

      const submissionCount = await ProjectSubmission.getCountByProjectUid(projectUid);
      const submissions = await ProjectSubmission.findByProjectUid(projectUid);

      const projectWithData = {
        ...project,
        available_columns: availableColumns,
        selected_columns: selectedColumns,
        total_submissions: submissionCount,
        submissions: submissions.map(sub => {
          try {
            return typeof sub.submission_data === 'string' 
              ? JSON.parse(sub.submission_data) 
              : sub.submission_data;
          } catch (e) {
            return {};
          }
        })
      };

      res.json({
        success: true,
        project: projectWithData
      });

    } catch (error) {
      console.error('Get project error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  },

  // Configure auto-sync
  async configureAutoSync(req, res) {
    try {
      const { projectUid } = req.params;
      const { enabled, interval } = req.body;

      if (enabled && (!interval || !interval.match(/^\d{2}:\d{2}:\d{2}$/))) {
        return res.status(400).json({
          success: false,
          error: 'Valid interval required in HH:MM:SS format when enabling auto-sync'
        });
      }

      const updates = {
        auto_sync_enabled: enabled,
        auto_sync_interval: interval
      };

      if (enabled && interval) {
        // Calculate next sync time
        const nextSync = new Date();
        const [hours, minutes, seconds] = interval.split(':').map(Number);
        nextSync.setHours(nextSync.getHours() + hours);
        nextSync.setMinutes(nextSync.getMinutes() + minutes);
        nextSync.setSeconds(nextSync.getSeconds() + seconds);
        
        updates.next_sync_time = nextSync.toISOString();
      } else {
        updates.next_sync_time = null;
      }

      const updatedProject = await SavedProject.updateProjectData(projectUid, updates);

      res.json({
        success: true,
        message: enabled ? 'Auto-sync configured successfully' : 'Auto-sync disabled',
        project: updatedProject
      });

    } catch (error) {
      console.error('Configure auto-sync error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  },

  // Get projects due for auto-sync
  async getProjectsDueForSync(req, res) {
    try {
      const projects = await SavedProject.getProjectsForAutoSync();
      
      res.json({
        success: true,
        projects: projects.filter(p => p.auto_sync_enabled && p.next_sync_time && new Date(p.next_sync_time) <= new Date())
      });

    } catch (error) {
      console.error('Get projects due for sync error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  },

  // Get auto-sync service status
  async getAutoSyncStatus(req, res) {
    try {
      const status = autoSyncService.getStatus();
      
      res.json({
        success: true,
        status
      });

    } catch (error) {
      console.error('Get auto-sync status error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
};

module.exports = projectController;