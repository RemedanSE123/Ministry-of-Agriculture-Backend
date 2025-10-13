const KoboToken = require('../models/KoboToken');
const SavedProject = require('../models/SavedProject');

const fetchKoboToolboxData = async (req, res) => {
  try {
    const { token, tokenName } = req.body;
    const user_id = req.user?.id || 'demo-user';

    if (!token) {
      return res.status(400).json({ error: 'API token is required' });
    }

    // Check if token already exists for this user
    const existingTokens = await KoboToken.findByUserId(user_id);
    const existingToken = existingTokens.find(t => t.token === token);
    
    if (existingToken) {
      // Token already exists - fetch fresh data from Kobo to get ALL projects
      const assetsResponse = await fetch('https://kf.kobotoolbox.org/api/v2/assets/', {
        headers: { 
          Authorization: `Token ${token}`,
          'Accept': 'application/json',
          'Content-Type': 'application/json',
        },
      });

      const assetsText = await assetsResponse.text();
      
      if (assetsText.trim().startsWith('<!DOCTYPE') || assetsText.includes('<html')) {
        throw new Error('Invalid API response - received HTML instead of JSON. Please check your API token.');
      }

      let assetsData;
      try {
        assetsData = JSON.parse(assetsText);
      } catch (parseError) {
        throw new Error(`Invalid JSON response: ${assetsText.substring(0, 100)}...`);
      }

      if (!assetsResponse.ok) {
        throw new Error(`API returned ${assetsResponse.status}: ${assetsData.detail || assetsData.message || 'Unknown error'}`);
      }

      if (!assetsData.results) {
        throw new Error('Invalid API response format - missing results field');
      }

      // Get existing saved projects for this token
      const existingProjects = await SavedProject.findByTokenId(existingToken.id);
      const savedProjectUids = existingProjects.map(p => p.project_uid);

      // Fetch data for each project
      const allProjectsWithData = await Promise.all(
        assetsData.results.map(async (project) => {
          try {
            const dataUrl = `https://kf.kobotoolbox.org/api/v2/assets/${project.uid}/data/`;
            const dataResponse = await fetch(dataUrl, {
              headers: { 
                Authorization: `Token ${token}`,
                'Accept': 'application/json',
              },
            });

            let submissions = [];
            let availableColumns = [];
            
            if (dataResponse.ok) {
              const submissionsData = await dataResponse.json();
              submissions = submissionsData.results || [];
              
              if (submissions.length > 0) {
                availableColumns = Object.keys(submissions[0]);
              }
            }

            // Check if this project is already saved
            const isSaved = savedProjectUids.includes(project.uid);
            
            // If saved, get the saved configuration
            let selectedColumns = availableColumns;
            if (isSaved) {
              const savedProject = existingProjects.find(p => p.project_uid === project.uid);
              if (savedProject) {
                try {
                  selectedColumns = typeof savedProject.selected_columns === 'string' 
                    ? JSON.parse(savedProject.selected_columns) 
                    : (savedProject.selected_columns || availableColumns);
                } catch (e) {
                  selectedColumns = availableColumns;
                }
              }
            }

            return {
              uid: project.uid,
              name: project.name || 'Untitled Project',
              owner__username: project.owner__username,
              date_created: project.date_created,
              deployment__active: project.deployment__active,
              submissions: submissions,
              total_submissions: submissions.length,
              available_columns: availableColumns,
              selected_columns: selectedColumns,
              data_url: dataUrl,
              saved: isSaved,
              // Include saved project ID if it exists
              saved_project_id: isSaved ? existingProjects.find(p => p.project_uid === project.uid)?.id : null
            };
          } catch (error) {
            console.error(`Error fetching data for project ${project.uid}:`, error);
            return {
              uid: project.uid,
              name: project.name || 'Untitled Project',
              owner__username: project.owner__username,
              date_created: project.date_created,
              deployment__active: project.deployment__active,
              submissions: [],
              total_submissions: 0,
              available_columns: [],
              selected_columns: [],
              saved: savedProjectUids.includes(project.uid),
              saved_project_id: savedProjectUids.includes(project.uid) ? existingProjects.find(p => p.project_uid === project.uid)?.id : null,
              error: `Failed to fetch form data: ${error.message}`
            };
          }
        })
      );

      return res.json({
        success: true,
        tokenId: existingToken.id,
        tokenName: existingToken.name,
        tokenPreview: existingToken.token_preview,
        projects: allProjectsWithData,
        totalProjects: allProjectsWithData.length,
        totalSubmissions: allProjectsWithData.reduce((sum, project) => sum + project.total_submissions, 0),
        timestamp: new Date().toISOString(),
        message: 'Token already registered. Loaded all projects.'
      });
    }

    // Fetch projects/assets from Kobo for new token
    const assetsResponse = await fetch('https://kf.kobotoolbox.org/api/v2/assets/', {
      headers: { 
        Authorization: `Token ${token}`,
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
    });

    const assetsText = await assetsResponse.text();
    
    if (assetsText.trim().startsWith('<!DOCTYPE') || assetsText.includes('<html')) {
      throw new Error('Invalid API response - received HTML instead of JSON. Please check your API token.');
    }

    let assetsData;
    try {
      assetsData = JSON.parse(assetsText);
    } catch (parseError) {
      throw new Error(`Invalid JSON response: ${assetsText.substring(0, 100)}...`);
    }

    if (!assetsResponse.ok) {
      throw new Error(`API returned ${assetsResponse.status}: ${assetsData.detail || assetsData.message || 'Unknown error'}`);
    }

    if (!assetsData.results) {
      throw new Error('Invalid API response format - missing results field');
    }

    // Fetch data for each project with better error handling
    const projectsWithData = await Promise.all(
      assetsData.results.map(async (project) => {
        try {
          const dataUrl = `https://kf.kobotoolbox.org/api/v2/assets/${project.uid}/data/`;
          const dataResponse = await fetch(dataUrl, {
            headers: { 
              Authorization: `Token ${token}`,
              'Accept': 'application/json',
            },
          });

          let submissions = [];
          let availableColumns = [];
          
          if (dataResponse.ok) {
            const submissionsData = await dataResponse.json();
            submissions = submissionsData.results || [];
            
            if (submissions.length > 0) {
              availableColumns = Object.keys(submissions[0]);
            }
          }

          return {
            uid: project.uid,
            name: project.name || 'Untitled Project',
            owner__username: project.owner__username,
            date_created: project.date_created,
            deployment__active: project.deployment__active,
            submissions: submissions,
            total_submissions: submissions.length,
            available_columns: availableColumns,
            selected_columns: availableColumns,
            data_url: dataUrl,
            saved: false
          };
        } catch (error) {
          console.error(`Error fetching data for project ${project.uid}:`, error);
          return {
            uid: project.uid,
            name: project.name || 'Untitled Project',
            owner__username: project.owner__username,
            date_created: project.date_created,
            deployment__active: project.deployment__active,
            submissions: [],
            total_submissions: 0,
            available_columns: [],
            selected_columns: [],
            saved: false,
            error: `Failed to fetch form data: ${error.message}`
          };
        }
      })
    );

    // Save new token to database
    const tokenPreview = token.substring(0, 8) + '...';
    const savedToken = await KoboToken.create({
      user_id,
      name: tokenName || 'Untitled Token',
      token,
      token_preview: tokenPreview
    });

    return res.json({
      success: true,
      tokenId: savedToken.id,
      tokenName: savedToken.name,
      tokenPreview: savedToken.token_preview,
      projects: projectsWithData,
      totalProjects: projectsWithData.length,
      totalSubmissions: projectsWithData.reduce((sum, project) => sum + project.total_submissions, 0),
      timestamp: new Date().toISOString(),
      message: 'New token registered successfully'
    });
    
  } catch (error) {
    console.error('API Error:', error.message);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch projects'
    });
  }
};

// New function for syncing individual projects
const syncProjectData = async (req, res) => {
  try {
    const { projectUid } = req.params;
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({ error: 'API token is required' });
    }

    // Fetch updated project data
    const dataUrl = `https://kf.kobotoolbox.org/api/v2/assets/${projectUid}/data/`;
    const dataResponse = await fetch(dataUrl, {
      headers: { 
        Authorization: `Token ${token}`,
        'Accept': 'application/json',
      },
    });

    if (!dataResponse.ok) {
      throw new Error(`Failed to fetch data: ${dataResponse.status}`);
    }

    const submissionsData = await dataResponse.json();
    const submissions = submissionsData.results || [];
    
    let availableColumns = [];
    if (submissions.length > 0) {
      availableColumns = Object.keys(submissions[0]);
    }

    // Update project in database
    const ProjectSubmission = require('../models/ProjectSubmission');
    
    // Clear existing submissions
    await ProjectSubmission.deleteByProjectUid(projectUid);
    
    // Store new submissions
    for (const submission of submissions) {
      await ProjectSubmission.create({
        project_uid: projectUid,
        submission_id: submission._id || submission.id || Date.now().toString(),
        submission_data: submission
      });
    }

    // Update project sync time and columns if needed
    await SavedProject.updateSyncTime(projectUid);
    
    // If available columns changed, update them
    const project = await SavedProject.findByUid(projectUid);
    if (project) {
      let currentColumns = [];
      try {
        currentColumns = typeof project.available_columns === 'string' 
          ? JSON.parse(project.available_columns) 
          : (project.available_columns || []);
      } catch (e) {
        currentColumns = [];
      }
      
      // If columns changed, update them
      if (JSON.stringify(currentColumns) !== JSON.stringify(availableColumns)) {
        await SavedProject.updateProjectData(projectUid, {
          available_columns: JSON.stringify(availableColumns),
          total_submissions: submissions.length
        });
      }
    }

    res.json({
      success: true,
      message: 'Project synced successfully',
      submissions: submissions,
      total_submissions: submissions.length,
      available_columns: availableColumns,
      last_sync: new Date().toISOString()
    });

  } catch (error) {
    console.error('Sync error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

module.exports = {
  fetchKoboToolboxData,
  syncProjectData
};