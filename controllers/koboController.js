const KoboToken = require('../models/KoboToken');

const fetchKoboToolboxData = async (req, res) => {
  try {
    const { token, tokenName } = req.body;
    const user_id = req.user?.id || 'demo-user';

    if (!token) {
      return res.status(400).json({ error: 'API token is required' });
    }

    // Fetch projects/assets from Kobo
    const assetsResponse = await fetch('https://kf.kobotoolbox.org/api/v2/assets/', {
      headers: { 
        Authorization: `Token ${token}`,
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
    });

    // Check if response is HTML (error page)
    const assetsText = await assetsResponse.text();
    
    if (assetsText.trim().startsWith('<!DOCTYPE') || assetsText.includes('<html')) {
      throw new Error('Invalid API response - received HTML instead of JSON. Please check your API token.');
    }

    // Parse assets data
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

    // For each project, fetch submissions data
    const projectsWithData = await Promise.all(
      assetsData.results.map(async (project) => {
        try {
          // Fetch submissions/data
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
            
            // Extract available columns from the first submission
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
            selected_columns: availableColumns, // Start with all columns selected
            data_url: dataUrl
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
            error: `Failed to fetch form data: ${error.message}`
          };
        }
      })
    );

    // Save token to database
    const tokenPreview = token.substring(0, 8) + '...';
    const savedToken = await KoboToken.create({
      user_id,
      name: tokenName || 'Untitled Token',
      token,
      token_preview: tokenPreview
    });

    // Return both projects and token info
    return res.json({
      success: true,
      tokenId: savedToken.id,
      tokenName: savedToken.name,
      tokenPreview: savedToken.token_preview,
      projects: projectsWithData,
      totalProjects: projectsWithData.length,
      totalSubmissions: projectsWithData.reduce((sum, project) => sum + project.total_submissions, 0),
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('API Error:', error.message);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch projects'
    });
  }
};

module.exports = {
  fetchKoboToolboxData
};