const SavedProject = require('../models/SavedProject');
const ProjectSubmission = require('../models/ProjectSubmission');

const exportController = {
  // Enhanced CSV export with original column names
  async exportProjectData(req, res) {
    try {
      const { projectUid } = req.params;
      const { format = 'csv', includeAllColumns = false } = req.query;

      console.log(`📊 Export request:`, { projectUid, format, includeAllColumns });

      // Get project with submissions
      const project = await SavedProject.findByUid(projectUid);
      if (!project) {
        return res.status(404).json({ 
          success: false,
          error: 'Project not found' 
        });
      }

      const submissions = await ProjectSubmission.findByProjectUid(projectUid);
      
      if (submissions.length === 0) {
        return res.status(400).json({ 
          success: false,
          error: 'No data to export' 
        });
      }

      // Parse the submissions to get original data structure
      const parsedSubmissions = submissions.map(sub => {
        try {
          return typeof sub.submission_data === 'string' 
            ? JSON.parse(sub.submission_data) 
            : sub.submission_data;
        } catch (e) {
          console.error('Error parsing submission:', e);
          return {};
        }
      });

      console.log(`📋 Found ${parsedSubmissions.length} submissions for export`);

      // Get ORIGINAL column names from the first submission's _original_columns
      // or fall back to available_columns
      let originalColumns = [];
      
      if (parsedSubmissions[0] && parsedSubmissions[0]._original_columns) {
        // Use preserved original columns - THIS IS THE KEY FIX
        originalColumns = parsedSubmissions[0]._original_columns;
        console.log(`✅ Using preserved original columns: ${originalColumns.length} columns`);
      } else {
        // Fallback: use available columns from project
        try {
          originalColumns = typeof project.available_columns === 'string'
            ? JSON.parse(project.available_columns)
            : project.available_columns;
          console.log(`⚠️ Using fallback columns: ${originalColumns.length} columns`);
        } catch (e) {
          originalColumns = [];
          console.error('Error parsing available columns:', e);
        }
      }

      // DEBUG: Log what columns we have
      console.log('🔍 Available columns:', originalColumns);

      // FIXED: Use selected_columns when includeAllColumns is false, otherwise use all available columns
      let exportColumns = [];
      
      if (includeAllColumns === 'true') {
        // When includeAllColumns=true, export ALL columns without any filtering
        exportColumns = originalColumns;
        console.log(`📤 Exporting ALL ${exportColumns.length} columns for ${parsedSubmissions.length} submissions (includeAllColumns=true)`);
      } else {
        // When includeAllColumns=false, use the project's selected_columns
        try {
          exportColumns = typeof project.selected_columns === 'string'
            ? JSON.parse(project.selected_columns)
            : (project.selected_columns || []);
          
          console.log(`📤 Exporting ${exportColumns.length} SELECTED columns for ${parsedSubmissions.length} submissions`);
          
          // If no selected columns are configured, use all columns but filter out system columns
          if (exportColumns.length === 0) {
            console.log('⚠️ No selected columns found, using filtered available columns');
            exportColumns = originalColumns.filter(col => 
              !col.startsWith('_') && 
              !col.startsWith('meta/') &&
              !col.includes('_url') &&
              !col.includes('_auth') &&
              !col.includes('_original') &&
              !col.includes('_processed')
            );
          }
        } catch (e) {
          console.error('Error parsing selected columns:', e);
          // Fallback to filtered columns
          exportColumns = originalColumns.filter(col => 
            !col.startsWith('_') && 
            !col.startsWith('meta/') &&
            !col.includes('_url') &&
            !col.includes('_auth') &&
            !col.includes('_original') &&
            !col.includes('_processed')
          );
        }
      }

      // DEBUG: Log final export columns
      console.log('🎯 Final export columns:', exportColumns);

      if (format === 'csv') {
        return exportToCSV(res, project, parsedSubmissions, exportColumns);
      } else if (format === 'excel') {
        return exportToExcel(res, project, parsedSubmissions, exportColumns);
      } else if (format === 'json') {
        return exportToJSON(res, project, parsedSubmissions, exportColumns);
      } else {
        return res.status(400).json({ 
          success: false,
          error: 'Unsupported format. Use csv, excel, or json.' 
        });
      }

    } catch (error) {
      console.error('💥 Export error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
};

// CSV Export function
function exportToCSV(res, project, submissions, columns) {
  try {
    console.log(`📄 Generating CSV with ${columns.length} columns and ${submissions.length} rows`);

    // Create CSV header with ORIGINAL column names
    const headers = ['No.', ...columns];
    
    const csvContent = submissions.map((submission, index) => {
      const rowNumber = index + 1;
      const rowData = columns.map(col => {
        const value = submission[col] || '';
        
        // Handle different data types
        if (value === null || value === undefined || value === '') {
          return '';
        }
        
        // Convert to string and escape for CSV
        let stringValue = String(value);
        
        // Escape quotes
        stringValue = stringValue.replace(/"/g, '""');
        
        // If value contains commas, quotes, or newlines, wrap in quotes
        if (stringValue.includes(',') || stringValue.includes('\n') || stringValue.includes('"') || stringValue.includes('\r')) {
          return `"${stringValue}"`;
        }
        
        return stringValue;
      });
      
      return [rowNumber, ...rowData].join(',');
    }).join('\n');

    const csv = [headers.join(','), csvContent].join('\n');
    
    // Add BOM for UTF-8 to handle Amharic characters in Excel
    const BOM = '\uFEFF';
    const finalCSV = BOM + csv;

    console.log(`✅ CSV generated successfully: ${finalCSV.length} bytes`);

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${project.project_name}_data.csv"`);
    res.send(finalCSV);

  } catch (error) {
    console.error('💥 CSV generation error:', error);
    throw new Error(`CSV generation failed: ${error.message}`);
  }
}

// Excel Export function
function exportToExcel(res, project, submissions, columns) {
  try {
    console.log(`📊 Generating Excel with ${columns.length} columns and ${submissions.length} rows`);

    const headers = ['No.', ...columns];
    const csvContent = submissions.map((submission, index) => {
      const rowNumber = index + 1;
      const rowData = columns.map(col => {
        const value = submission[col] || '';
        
        if (value === null || value === undefined || value === '') {
          return '';
        }
        
        let stringValue = String(value);
        stringValue = stringValue.replace(/"/g, '""');
        
        if (stringValue.includes(',') || stringValue.includes('\n') || stringValue.includes('"') || stringValue.includes('\r')) {
          return `"${stringValue}"`;
        }
        
        return stringValue;
      });
      
      return [rowNumber, ...rowData].join(',');
    }).join('\n');

    const csv = [headers.join(','), csvContent].join('\n');
    const BOM = '\uFEFF';
    const finalCSV = BOM + csv;

    console.log(`✅ Excel file generated successfully: ${finalCSV.length} bytes`);

    // Use .xls extension but CSV content - Excel will open it correctly
    res.setHeader('Content-Type', 'application/vnd.ms-excel');
    res.setHeader('Content-Disposition', `attachment; filename="${project.project_name}_data.xls"`);
    res.send(finalCSV);

  } catch (error) {
    console.error('💥 Excel generation error:', error);
    throw new Error(`Excel generation failed: ${error.message}`);
  }
}

// JSON Export function
function exportToJSON(res, project, submissions, columns) {
  try {
    console.log(`📄 Generating JSON with ${columns.length} columns and ${submissions.length} rows`);

    const exportData = submissions.map((submission, index) => {
      const rowData = { No: index + 1 };
      columns.forEach(col => {
        rowData[col] = submission[col] || '';
      });
      return rowData;
    });

    console.log(`✅ JSON generated successfully: ${exportData.length} records`);

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="${project.project_name}_data.json"`);
    res.send(JSON.stringify(exportData, null, 2));

  } catch (error) {
    console.error('💥 JSON generation error:', error);
    throw new Error(`JSON generation failed: ${error.message}`);
  }
}

module.exports = exportController;