const SavedProject = require('../models/SavedProject');
const ProjectSubmission = require('../models/ProjectSubmission');

class AutoSyncService {
  constructor() {
    this.isRunning = false;
    this.syncQueue = [];
    this.currentlySyncing = new Set();
    this.maxConcurrentSyncs = 3;
    this.syncInterval = null;
  }

  async start() {
    if (this.isRunning) return;
    
    this.isRunning = true;
    console.log('Auto-sync service started');
    
    // Check for due syncs every minute
    this.syncInterval = setInterval(() => {
      this.processSyncQueue();
    }, 60000);
    
    // Initial check
    await this.processSyncQueue();
  }

  stop() {
    this.isRunning = false;
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
    }
    console.log('Auto-sync service stopped');
  }

  async processSyncQueue() {
    if (this.currentlySyncing.size >= this.maxConcurrentSyncs) {
      console.log(`Max concurrent syncs reached (${this.currentlySyncing.size}/${this.maxConcurrentSyncs}), waiting...`);
      return;
    }

    try {
      const projectsDue = await SavedProject.getProjectsForAutoSync();
      console.log(`Found ${projectsDue.length} projects due for auto-sync`);
      
      for (const project of projectsDue) {
        if (this.currentlySyncing.has(project.project_uid)) {
          console.log(`Project ${project.project_name} is already syncing, skipping`);
          continue;
        }

        if (this.syncQueue.some(item => item.project_uid === project.project_uid)) {
          console.log(`Project ${project.project_name} is already in queue, skipping`);
          continue;
        }

        // Prioritize by next_sync_time (earlier first)
        this.syncQueue.push(project);
        console.log(`Added project ${project.project_name} to sync queue`);
      }

      // Sort queue by priority (earliest next_sync_time first)
      this.syncQueue.sort((a, b) => 
        new Date(a.next_sync_time) - new Date(b.next_sync_time)
      );

      // Process queue
      while (this.syncQueue.length > 0 && this.currentlySyncing.size < this.maxConcurrentSyncs) {
        const project = this.syncQueue.shift();
        await this.syncProject(project);
      }

    } catch (error) {
      console.error('Error processing sync queue:', error);
    }
  }

  async syncProject(project) {
    this.currentlySyncing.add(project.project_uid);
    
    try {
      console.log(`Starting auto-sync for project: ${project.project_name} (${project.project_uid})`);
      
      // Fetch updated data from Kobo API
      const dataUrl = `https://kf.kobotoolbox.org/api/v2/assets/${project.project_uid}/data/`;
      const dataResponse = await fetch(dataUrl, {
        headers: { 
          Authorization: `Token ${project.token}`,
          'Accept': 'application/json',
        },
      });

      if (!dataResponse.ok) {
        throw new Error(`Kobo API returned ${dataResponse.status}: ${dataResponse.statusText}`);
      }

      const submissionsData = await dataResponse.json();
      const submissions = submissionsData.results || [];
      
      let availableColumns = [];
      if (submissions.length > 0) {
        availableColumns = Object.keys(submissions[0]);
      }

      // Clear existing submissions
      await ProjectSubmission.deleteByProjectUid(project.project_uid);
      
      // Store new submissions
      for (const submission of submissions) {
        await ProjectSubmission.create({
          project_uid: project.project_uid,
          submission_id: submission._id || submission.id || Date.now().toString(),
          submission_data: submission
        });
      }

      // Update project sync time and columns if needed
      await SavedProject.updateSyncTime(project.project_uid);
      
      // If available columns changed, update them
      const currentProject = await SavedProject.findByUid(project.project_uid);
      if (currentProject) {
        let currentColumns = [];
        try {
          currentColumns = typeof currentProject.available_columns === 'string' 
            ? JSON.parse(currentProject.available_columns) 
            : (currentProject.available_columns || []);
        } catch (e) {
          currentColumns = [];
        }
        
        // If columns changed, update them
        if (JSON.stringify(currentColumns) !== JSON.stringify(availableColumns)) {
          await SavedProject.updateProjectData(project.project_uid, {
            available_columns: JSON.stringify(availableColumns),
            total_submissions: submissions.length
          });
        }
      }

      // Update next sync time
      await SavedProject.updateNextSyncTime(project.project_uid, project.auto_sync_interval);
      
      console.log(`Auto-sync completed for project: ${project.project_name}. ${submissions.length} submissions synced.`);
      
      return {
        success: true,
        message: 'Auto-sync completed successfully',
        submissions: submissions,
        total_submissions: submissions.length,
        available_columns: availableColumns
      };
      
    } catch (error) {
      console.error(`Error during auto-sync for project ${project.project_name}:`, error);
      
      // Retry after 10 minutes on error
      const retryTime = new Date();
      retryTime.setMinutes(retryTime.getMinutes() + 10);
      await SavedProject.updateProjectData(project.project_uid, {
        next_sync_time: retryTime.toISOString()
      });
      
      throw error;
      
    } finally {
      this.currentlySyncing.delete(project.project_uid);
    }
  }

  // Manual sync request
  async manualSync(projectUid, token, projectName = 'Unknown Project') {
    if (this.currentlySyncing.has(projectUid)) {
      throw new Error('Project is currently syncing');
    }

    const project = { 
      project_uid: projectUid, 
      token,
      project_name: projectName,
      auto_sync_interval: '00:30:00' // Default 30 minutes for manual sync scheduling
    };
    
    return this.syncProject(project);
  }

  getStatus() {
    return {
      isRunning: this.isRunning,
      currentlySyncing: Array.from(this.currentlySyncing),
      queueLength: this.syncQueue.length,
      maxConcurrent: this.maxConcurrentSyncs,
      queue: this.syncQueue.map(p => ({
        project_uid: p.project_uid,
        project_name: p.project_name,
        next_sync_time: p.next_sync_time
      }))
    };
  }

  // Force sync a project (bypass queue)
  async forceSync(projectUid, token, projectName) {
    console.log(`Force syncing project: ${projectName}`);
    return this.manualSync(projectUid, token, projectName);
  }
}

// Create singleton instance
const autoSyncService = new AutoSyncService();

// Start service when module loads
autoSyncService.start().catch(console.error);

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('Shutting down auto-sync service...');
  autoSyncService.stop();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('Shutting down auto-sync service...');
  autoSyncService.stop();
  process.exit(0);
});

module.exports = autoSyncService;