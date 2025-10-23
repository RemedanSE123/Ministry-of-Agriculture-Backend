const KoboToken = require('../models/KoboToken');
const SavedProject = require('../models/SavedProject');

const fetchKoboToolboxData = async (req, res) => {
  try {
    const { token, tokenName } = req.body;
    const user_id = req.user?.id || 'demo-user';

    if (!token) {
      return res.status(400).json({ error: 'API token is required' });
    }

    // ENHANCED: Helper function to process submissions and PRESERVE ORIGINAL DATA
    const processSubmissions = (submissions, projectUid, token) => {
      return submissions.map(submission => {
        // CRITICAL FIX: Preserve original data structure
        const processedSubmission = { 
          ...submission,
          // Store original column names and structure for export
          _original_data: JSON.parse(JSON.stringify(submission)), // Deep clone original
          _original_columns: Object.keys(submission),
          _processed_timestamp: new Date().toISOString()
        };
        
        // Enhanced attachment processing - use the direct download_url from _attachments
        if (submission._attachments && Array.isArray(submission._attachments)) {
          submission._attachments.forEach(attachment => {
            if (attachment.filename && attachment.filename.match(/\.(jpg|jpeg|png|gif|bmp|webp)$/i)) {
              console.log(`📎 Processing attachment:`, {
                filename: attachment.filename,
                download_url: attachment.download_url,
                mimetype: attachment.mimetype
              });

              // Extract the simple filename from the complex path
              const simpleFilename = attachment.filename.split('/').pop();
              console.log(`📝 Extracted simple filename: ${simpleFilename} from ${attachment.filename}`);
             
              // Improved field matching:
              let fieldName = 'attachment';
              Object.keys(submission).forEach(key => {
                const value = submission[key];
                // Better matching: compare simple filenames
                if (value && typeof value === 'string') {
                  const valueSimpleName = value.split('/').pop();
                  if (valueSimpleName === simpleFilename) {
                    fieldName = key;
                    console.log(`🔗 Found matching field "${fieldName}" for attachment`);
                  }
                }
              });

              // Store the DIRECT download URL from KoboToolbox (this is the key fix!)
              processedSubmission[`${fieldName}_attachment_url`] = attachment.download_url;
              processedSubmission[`${fieldName}_attachment_url_auth`] = token;
              
              // Also store with the simple filename for easier access
              processedSubmission[`attachment_${simpleFilename}_url`] = attachment.download_url;
              processedSubmission[`attachment_${simpleFilename}_url_auth`] = token;
              
              // Store the original complex filename for debugging
              processedSubmission[`${fieldName}_original_filename`] = attachment.filename;

              console.log(`✅ Stored direct download URL for ${simpleFilename}: ${attachment.download_url}`);
            }
          });
        }

        // Also process regular image fields (fallback)
        Object.keys(submission).forEach(key => {
          const value = submission[key];
          
          // Check if this field contains image filename(s)
          if (typeof value === 'string' && value.match(/\.(jpg|jpeg|png|gif|bmp|webp)$/i)) {
            console.log(`🖼️ Found image field "${key}": ${value}`);
            
            const simpleFilename = value.split('/').pop();
            
            // Only create constructed URLs if we haven't already processed this via _attachments
            if (!processedSubmission[`${key}_attachment_url`]) {
              // Complex path URL (as stored in _attachments)
              processedSubmission[`${key}_url`] = `https://kf.kobotoolbox.org/api/v2/assets/${projectUid}/data/${submission._id}/attachments/${encodeURIComponent(value)}`;
              processedSubmission[`${key}_url_auth`] = token;
              
              // Simple filename URL (fallback)
              processedSubmission[`${key}_simple_url`] = `https://kf.kobotoolbox.org/api/v2/assets/${projectUid}/data/${submission._id}/attachments/${encodeURIComponent(simpleFilename)}`;
              processedSubmission[`${key}_simple_url_auth`] = token;
            }
          }
        });

        return processedSubmission;
      });
    };

    // [Rest of your existing fetchKoboToolboxData function remains exactly the same...]
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
              const rawSubmissions = submissionsData.results || [];
              
              console.log(`📊 Processing ${rawSubmissions.length} submissions for project ${project.uid}`);
              
              // Process submissions to add image URLs AND PRESERVE ORIGINAL DATA
              submissions = processSubmissions(rawSubmissions, project.uid, token);
              
              if (submissions.length > 0) {
                availableColumns = Object.keys(submissions[0]);
                console.log(`✅ Processed ${submissions.length} submissions with ${availableColumns.length} columns`);
                
                // Log image-related columns for debugging
                const imageColumns = availableColumns.filter(col => col.includes('_url'));
                console.log(`🖼️ Image-related columns:`, imageColumns);
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

    // [Rest of the function for new tokens remains exactly the same...]
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
            const rawSubmissions = submissionsData.results || [];
            
            // Process submissions to add image URLs AND PRESERVE ORIGINAL DATA
            submissions = processSubmissions(rawSubmissions, project.uid, token);
            
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

// [Keep all your other functions exactly the same - getImage, getImageBySubmission, syncProjectData, debugImageAccess]
// COMPLETELY REVISED image fetching - use direct download URLs from submission data
const getImage = async (req, res) => {
  try {
    const { projectUid, submissionId, filename } = req.params;
    const { token } = req.query;

    // Decode the filename properly
    const decodedFilename = decodeURIComponent(filename);
    
    console.log(`🔍 Image request received:`, {
      projectUid,
      submissionId,
      filename,
      decodedFilename,
      tokenPreview: token ? `${token.substring(0, 8)}...` : 'missing'
    });

    if (!token) {
      console.error('❌ Missing token in image request');
      return res.status(400).json({ 
        success: false,
        error: 'API token is required for image access'
      });
    }

    // First, get submission data to find the direct download URL
    console.log(`🔄 Fetching submission data to find direct download URL...`);
    const submissionUrl = `https://kf.kobotoolbox.org/api/v2/assets/${projectUid}/data/${submissionId}/`;
    const submissionResponse = await fetch(submissionUrl, {
      headers: { 
        Authorization: `Token ${token}`,
        'Accept': 'application/json',
      },
    });

    if (!submissionResponse.ok) {
      console.error(`❌ Failed to fetch submission: ${submissionResponse.status}`);
      throw new Error(`Failed to fetch submission data: ${submissionResponse.status}`);
    }

    const submissionData = await submissionResponse.json();
    console.log(`✅ Submission data fetched successfully`);

    // Look for the direct download URL in the processed fields
    let directDownloadUrl = null;
    let fieldUsed = null;

    // Extract simple filename from both encoded and original
    const simpleFilename = decodedFilename.split('/').pop();
    
    // First, check if we have pre-processed URL fields
    Object.keys(submissionData).forEach(key => {
      if (key.includes('_url') && submissionData[key] && !key.includes('_auth')) {
        const urlValue = submissionData[key];
        
        // Check if this URL field matches our filename
        if (urlValue.includes(simpleFilename) || 
            key.includes(simpleFilename.replace('.', '_').replace(/[^a-zA-Z0-9_]/g, '_'))) {
          directDownloadUrl = urlValue;
          fieldUsed = key;
          console.log(`🎯 Found direct download URL in field "${key}": ${urlValue}`);
        }
      }
    });

    // If not found in URL fields, check _attachments array directly with better matching
    if (!directDownloadUrl && submissionData._attachments) {
      console.log(`🔍 Searching in _attachments array...`);
      
      for (const attachment of submissionData._attachments) {
        const attachmentSimpleName = attachment.filename.split('/').pop();
        const decodedAttachmentName = decodeURIComponent(attachmentSimpleName || '');
        
        console.log(`📋 Comparing: "${simpleFilename}" with "${decodedAttachmentName}" (from: ${attachment.filename})`);
        
        // Try multiple matching strategies
        if (decodedAttachmentName === simpleFilename || 
            attachmentSimpleName === simpleFilename ||
            attachment.filename.includes(simpleFilename) ||
            simpleFilename.includes(decodedAttachmentName)) {
          
          directDownloadUrl = attachment.download_url;
          fieldUsed = 'direct_from_attachments';
          console.log(`🎯 Found direct download URL in _attachments: ${directDownloadUrl}`);
          break;
        }
      }
    }

    // Last resort: try to find by field name
    if (!directDownloadUrl) {
      console.log(`🔍 Trying to find by field name...`);
      
      // Look for fields that might contain image data
      Object.keys(submissionData).forEach(key => {
        const value = submissionData[key];
        if (typeof value === 'string' && value.includes(simpleFilename)) {
          console.log(`📋 Found matching field "${key}" with value: ${value}`);
          
          // Check if we have a processed URL for this field
          const processedUrl = submissionData[`${key}_attachment_url`] || 
                              submissionData[`${key}_url`];
          
          if (processedUrl) {
            directDownloadUrl = processedUrl;
            fieldUsed = `field_${key}`;
            console.log(`🎯 Found URL via field match: ${directDownloadUrl}`);
          }
        }
      });
    }

    if (!directDownloadUrl) {
      console.error(`❌ No direct download URL found for filename: ${decodedFilename}`);
      console.log(`📋 Available URL fields:`, 
        Object.keys(submissionData)
          .filter(key => key.includes('_url') && submissionData[key] && !key.includes('_auth'))
          .map(key => ({ field: key, url: submissionData[key] }))
      );
      console.log(`📋 Available attachments:`, 
        submissionData._attachments ? submissionData._attachments.map(a => ({
          filename: a.filename,
          simpleName: a.filename.split('/').pop(),
          download_url: a.download_url
        })) : []
      );
      console.log(`📋 All submission fields:`, Object.keys(submissionData));
      
      return res.status(404).json({
        success: false,
        error: 'Image not found in submission data',
        details: `No direct download URL found for ${decodedFilename}`,
        debug: {
          requestedFilename: filename,
          decodedFilename,
          simpleFilename,
          availableUrlFields: Object.keys(submissionData)
            .filter(key => key.includes('_url') && submissionData[key] && !key.includes('_auth')),
          availableAttachments: submissionData._attachments ? 
            submissionData._attachments.map(a => a.filename) : [],
          submissionFields: Object.keys(submissionData)
        }
      });
    }

    console.log(`🔄 Fetching image from direct download URL: ${directDownloadUrl}`);
    
    // Fetch the image using the DIRECT download URL
    const imageResponse = await fetch(directDownloadUrl, {
      headers: { 
        Authorization: `Token ${token}`,
      },
    });

    if (!imageResponse.ok) {
      console.error(`❌ Failed to fetch image from direct URL: ${imageResponse.status}`);
      throw new Error(`Failed to fetch image: ${imageResponse.status} - ${imageResponse.statusText}`);
    }

    // Get the image data
    const imageBuffer = await imageResponse.arrayBuffer();
    const contentType = imageResponse.headers.get('content-type') || 'image/jpeg';
    const contentLength = imageResponse.headers.get('content-length');

    console.log(`✅ Image fetched successfully via direct download URL:`, {
      contentType,
      contentLength,
      bufferSize: imageBuffer.byteLength,
      source: fieldUsed
    });

    // Set appropriate headers and send the image
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=3600'); // Cache for 1 hour
    res.setHeader('X-Image-Source', 'direct_download_url');
    res.setHeader('X-Field-Used', fieldUsed || 'unknown');
    
    if (contentLength) {
      res.setHeader('Content-Length', contentLength);
    }

    res.send(Buffer.from(imageBuffer));

  } catch (error) {
    console.error('💥 Image fetch error:', {
      message: error.message,
      params: req.params,
      query: req.query
    });
    
    res.status(500).json({
      success: false,
      error: `Failed to fetch image: ${error.message}`
    });
  }
};

// Enhanced getImageBySubmission - use direct download URLs
const getImageBySubmission = async (req, res) => {
  try {
    const { projectUid, submissionId } = req.params;
    const { token, field } = req.query;

    console.log(`🔍 Image by submission request:`, {
      projectUid,
      submissionId,
      field,
      tokenPreview: token ? `${token.substring(0, 8)}...` : 'missing'
    });

    if (!token || !field) {
      return res.status(400).json({ 
        success: false,
        error: 'API token and field name are required'
      });
    }

    // Get submission data
    const submissionUrl = `https://kf.kobotoolbox.org/api/v2/assets/${projectUid}/data/${submissionId}/`;
    const submissionResponse = await fetch(submissionUrl, {
      headers: { 
        Authorization: `Token ${token}`,
        'Accept': 'application/json',
      },
    });

    if (!submissionResponse.ok) {
      throw new Error(`Failed to fetch submission: ${submissionResponse.status}`);
    }

    const submissionData = await submissionResponse.json();
    
    // Look for the direct download URL in processed fields
    const directDownloadUrl = submissionData[`${field}_attachment_url`] || 
                             submissionData[`attachment_${field}_url`] ||
                             submissionData[`${field}_url`];

    if (!directDownloadUrl) {
      throw new Error(`No image URL found for field: ${field}`);
    }

    console.log(`🔄 Fetching image from direct URL: ${directDownloadUrl}`);
    
    // Fetch using the direct download URL
    const imageResponse = await fetch(directDownloadUrl, {
      headers: { 
        Authorization: `Token ${token}`,
      },
    });

    if (!imageResponse.ok) {
      throw new Error(`Failed to fetch image: ${imageResponse.status}`);
    }

    // Get the image data
    const imageBuffer = await imageResponse.arrayBuffer();
    const contentType = imageResponse.headers.get('content-type') || 'image/jpeg';

    console.log(`✅ Image fetched successfully via field "${field}"`);

    // Set headers and send image
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.setHeader('X-Image-Source', 'field_based_direct_url');
    res.send(Buffer.from(imageBuffer));

  } catch (error) {
    console.error('Image by submission fetch error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

// [Keep syncProjectData and debugImageAccess functions the same as before...]
const syncProjectData = async (req, res) => {
  try {
    const { projectUid } = req.params;
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({ error: 'API token is required' });
    }

    // Use the EXACT SAME processing function from fetchKoboToolboxData (with preservation)
    const processSubmissions = (submissions, projectUid, token) => {
      return submissions.map(submission => {
        // CRITICAL FIX: Preserve original data structure during sync too
        const processedSubmission = { 
          ...submission,
          // Store original column names and structure for export
          _original_data: JSON.parse(JSON.stringify(submission)), // Deep clone original
          _original_columns: Object.keys(submission),
          _processed_timestamp: new Date().toISOString()
        };
        
        // Enhanced attachment processing - use direct download_url
        if (submission._attachments && Array.isArray(submission._attachments)) {
          submission._attachments.forEach(attachment => {
            if (attachment.filename && attachment.filename.match(/\.(jpg|jpeg|png|gif|bmp|webp)$/i)) {
              console.log(`📎 Processing attachment during sync:`, {
                filename: attachment.filename,
                download_url: attachment.download_url,
                mimetype: attachment.mimetype
              });

              const simpleFilename = attachment.filename.split('/').pop();
              console.log(`📝 Extracted simple filename during sync: ${simpleFilename} from ${attachment.filename}`);
              
              let fieldName = 'attachment';
              Object.keys(submission).forEach(key => {
                const value = submission[key];
                // Better matching: compare simple filenames
                if (value && typeof value === 'string') {
                  const valueSimpleName = value.split('/').pop();
                  if (valueSimpleName === simpleFilename) {
                    fieldName = key;
                    console.log(`🔗 Found matching field "${fieldName}" for attachment`);
                  }
                }
              });

              // Store the DIRECT download URL from KoboToolbox (same as initial fetch)
              processedSubmission[`${fieldName}_attachment_url`] = attachment.download_url;
              processedSubmission[`${fieldName}_attachment_url_auth`] = token;
              
              processedSubmission[`attachment_${simpleFilename}_url`] = attachment.download_url;
              processedSubmission[`attachment_${simpleFilename}_url_auth`] = token;
              
              processedSubmission[`${fieldName}_original_filename`] = attachment.filename;

              console.log(`✅ Stored direct download URL during sync for ${simpleFilename}: ${attachment.download_url}`);
            }
          });
        }

        // Also process regular image fields (fallback) - same as initial fetch
        Object.keys(submission).forEach(key => {
          const value = submission[key];
          
          if (typeof value === 'string' && value.match(/\.(jpg|jpeg|png|gif|bmp|webp)$/i)) {
            console.log(`🖼️ Found image field "${key}" during sync: ${value}`);
            
            const simpleFilename = value.split('/').pop();
            
            // Only create constructed URLs if we haven't already processed this via _attachments
            if (!processedSubmission[`${key}_attachment_url`]) {
              processedSubmission[`${key}_url`] = `https://kf.kobotoolbox.org/api/v2/assets/${projectUid}/data/${submission._id}/attachments/${encodeURIComponent(value)}`;
              processedSubmission[`${key}_url_auth`] = token;
              
              processedSubmission[`${key}_simple_url`] = `https://kf.kobotoolbox.org/api/v2/assets/${projectUid}/data/${submission._id}/attachments/${encodeURIComponent(simpleFilename)}`;
              processedSubmission[`${key}_simple_url_auth`] = token;
            }
          }
        });

        return processedSubmission;
      });
    };

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
    const rawSubmissions = submissionsData.results || [];
    
    console.log(`🔄 Syncing ${rawSubmissions.length} submissions for project ${projectUid}`);
    
    // Process submissions to add image URLs (USING THE SAME LOGIC AS INITIAL FETCH)
    const submissions = processSubmissions(rawSubmissions, projectUid, token);
    
    let availableColumns = [];
    if (submissions.length > 0) {
      availableColumns = Object.keys(submissions[0]);
      console.log(`✅ Processed ${submissions.length} submissions with ${availableColumns.length} columns during sync`);
      
      // Log image-related columns for debugging
      const imageColumns = availableColumns.filter(col => col.includes('_url'));
      console.log(`🖼️ Image-related columns after sync:`, imageColumns);
    }

    // Update project in database
    const ProjectSubmission = require('../models/ProjectSubmission');
    
    // Clear existing submissions
    await ProjectSubmission.deleteByProjectUid(projectUid);
    
    // Store new submissions WITH PROCESSED IMAGE URLS AND ORIGINAL DATA
    for (const submission of submissions) {
      await ProjectSubmission.create({
        project_uid: projectUid,
        submission_id: submission._id || submission.id || Date.now().toString(),
        submission_data: submission // This now includes the processed image URLs AND original data
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
      submissions: submissions, // Return processed submissions with image URLs
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

const debugImageAccess = async (req, res) => {
  try {
    const { projectUid, submissionId } = req.params;
    const { token } = req.query;

    console.log(`🔧 Debug image access request:`, { projectUid, submissionId });

    if (!token) {
      return res.status(400).json({ error: 'API token is required' });
    }

    // Fetch submission data
    const submissionUrl = `https://kf.kobotoolbox.org/api/v2/assets/${projectUid}/data/${submissionId}/`;
    const submissionResponse = await fetch(submissionUrl, {
      headers: { 
        Authorization: `Token ${token}`,
        'Accept': 'application/json',
      },
    });

    if (!submissionResponse.ok) {
      throw new Error(`Failed to fetch submission: ${submissionResponse.status}`);
    }

    const submissionData = await submissionResponse.json();

    // Extract debug information
    const debugInfo = {
      submission: {
        id: submissionData._id || submissionData.id,
        hasAttachments: !!submissionData._attachments,
        attachmentCount: submissionData._attachments ? submissionData._attachments.length : 0,
        attachments: submissionData._attachments ? submissionData._attachments.map(a => ({
          filename: a.filename,
          simpleFilename: a.filename.split('/').pop(),
          download_url: a.download_url,
          mimetype: a.mimetype
        })) : []
      },
      imageFields: Object.keys(submissionData).filter(key => 
        key.includes('_url') && submissionData[key]
      ).reduce((acc, key) => {
        acc[key] = submissionData[key];
        return acc;
      }, {}),
      allFields: Object.keys(submissionData)
    };

    res.json({
      success: true,
      debug: debugInfo,
      suggestions: [
        'Images should be accessed via the direct download URLs in _attachments array',
        'Use the _attachment_url fields that contain pre-processed direct URLs',
        'The system now stores direct KoboToolbox download URLs during sync'
      ]
    });

  } catch (error) {
    console.error('Debug error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

module.exports = {
  fetchKoboToolboxData,
  syncProjectData,
  getImage,
  getImageBySubmission,
  debugImageAccess
};