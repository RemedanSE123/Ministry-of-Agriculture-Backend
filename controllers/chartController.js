const ChartAnalysisService = require('../services/ChartAnalysisService');
const ChartConfig = require('../models/ChartConfig');
const DataAnalysisLog = require('../models/DataAnalysisLog');
const ProjectSubmission = require('../models/ProjectSubmission');

const chartController = {
  // Analyze project data and generate charts
  analyzeProjectData: async (req, res) => {
    try {
      const { projectUid } = req.params;

      console.log(`🚀 ========== STARTING CHART ANALYSIS ==========`);
      console.log(`📊 Starting SMART chart analysis for project: ${projectUid}`);

      // STEP 1: Get project submissions
      console.log(`🔍 Step 1: Fetching submissions for project ${projectUid}`);
      const submissions = await ProjectSubmission.findByProjectUid(projectUid);
      
      if (!submissions || submissions.length === 0) {
        console.log(`❌ No submissions found for project ${projectUid}`);
        return res.status(404).json({
          success: false,
          error: 'No submissions found for this project'
        });
      }
      console.log(`✅ Found ${submissions.length} submissions`);

      // STEP 2: Check existing charts
      console.log(`🔍 Step 2: Checking existing charts`);
      const existingCharts = await ChartConfig.findByProjectUid(projectUid);
      console.log(`📈 Found ${existingCharts.length} existing charts`);

      // STEP 3: Delete existing charts to avoid duplicates
      console.log(`🔍 Step 3: Deleting existing charts`);
      try {
        await ChartConfig.deleteByProjectUid(projectUid);
        console.log(`✅ Successfully cleared existing charts`);
      } catch (deleteError) {
        console.error(`❌ Failed to delete existing charts:`, deleteError);
        // Continue anyway - we'll try to create new charts
      }

      // STEP 4: Extract available columns
      console.log(`🔍 Step 4: Analyzing data structure`);
      const availableColumns = submissions.length > 0 ? Object.keys(submissions[0].submission_data || {}) : [];
      console.log(`📋 Available columns: ${availableColumns.length}`);
      console.log(`📋 Column names:`, availableColumns.slice(0, 10)); // Show first 10 columns

      if (availableColumns.length === 0) {
        console.log(`❌ No columns found in submission data`);
        return res.status(400).json({
          success: false,
          error: 'No data columns found in submissions'
        });
      }

      // STEP 5: Analyze data and generate chart suggestions
      console.log(`🔍 Step 5: Starting data analysis`);
      const analysisResult = await ChartAnalysisService.analyzeProjectData(
        projectUid, 
        submissions.map(s => s.submission_data), 
        availableColumns
      );

      console.log(`📊 Analysis completed. Suggested charts: ${analysisResult.suggestedCharts.length}`);

      // STEP 6: Save only the best chart configurations (MAX 15)
      console.log(`🔍 Step 6: Saving charts (max 15)`);
      const chartsToSave = analysisResult.suggestedCharts.slice(0, 15);
      const savedCharts = [];

      for (const [index, chartSuggestion] of chartsToSave.entries()) {
        try {
          console.log(`💾 Saving chart ${index + 1}/${chartsToSave.length}: ${chartSuggestion.chartName}`);
          
          const chartConfig = await ChartConfig.create({
            project_uid: projectUid,
            chart_name: chartSuggestion.chartName,
            chart_type: chartSuggestion.chartType,
            config_data: chartSuggestion.config,
            is_auto_generated: true,
            is_enabled: true,
            display_order: index
          });
          
          savedCharts.push(chartConfig);
          console.log(`✅ Chart saved: ${chartConfig.id} - ${chartConfig.chart_name}`);
          
        } catch (chartError) {
          console.error(`❌ Failed to save chart ${chartSuggestion.chartName}:`, chartError);
          // Continue with other charts
        }
      }

      // STEP 7: Verify final chart count
      console.log(`🔍 Step 7: Verifying final chart count`);
      const finalCharts = await ChartConfig.findByProjectUid(projectUid);
      console.log(`📊 Final chart count in database: ${finalCharts.length}`);

      // STEP 8: Return response
      console.log(`✅ ========== ANALYSIS COMPLETE ==========`);
      console.log(`📈 Generated ${savedCharts.length} high-quality charts`);
      console.log(`📊 Total charts in database: ${finalCharts.length}`);

      res.json({
        success: true,
        message: `Generated ${savedCharts.length} high-quality charts from ${analysisResult.suggestedCharts.length} suggestions`,
        generatedCharts: savedCharts.length,
        finalChartCount: finalCharts.length,
        dataQuality: analysisResult.dataQuality,
        analysis: {
          totalSubmissions: submissions.length,
          availableColumns: availableColumns.length,
          suggestedCharts: analysisResult.suggestedCharts.length,
          savedCharts: savedCharts.length
        }
      });

    } catch (error) {
      console.error(`❌ ========== CHART ANALYSIS FAILED ==========`);
      console.error('Chart analysis error:', error);
      console.error('Error stack:', error.stack);
      
      res.status(500).json({
        success: false,
        error: error.message,
        debug: {
          projectUid: req.params.projectUid,
          errorType: error.constructor.name,
          stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        }
      });
    }
  },

  // Get all charts for a project with debugging
  getProjectCharts: async (req, res) => {
    try {
      const { projectUid } = req.params;

      console.log(`🔍 Fetching charts for project: ${projectUid}`);
      const charts = await ChartConfig.findByProjectUid(projectUid);
      const analysisStats = await DataAnalysisLog.getAnalysisStats(projectUid);

      console.log(`📊 Returning ${charts.length} charts for project ${projectUid}`);

      res.json({
        success: true,
        charts,
        analysisStats,
        totalCharts: charts.length,
        enabledCharts: charts.filter(c => c.is_enabled).length,
        autoGeneratedCharts: charts.filter(c => c.is_auto_generated).length,
        chartTypes: [...new Set(charts.map(c => c.chart_type))],
        debug: {
          projectUid,
          chartCount: charts.length,
          fetchTime: new Date().toISOString()
        }
      });

    } catch (error) {
      console.error('Get project charts error:', error);
      res.status(500).json({
        success: false,
        error: error.message,
        debug: {
          projectUid: req.params.projectUid
        }
      });
    }
  },

  // Enhanced getChartData with better error handling
  getChartData: async (req, res) => {
    try {
      const { chartId } = req.params;

      console.log(`📊 Fetching chart data for chart ID: ${chartId}`);

      if (!chartId || isNaN(parseInt(chartId))) {
        return res.status(400).json({
          success: false,
          error: 'Invalid chart ID'
        });
      }

      // Get chart configuration
      const chartConfig = await ChartConfig.findById(parseInt(chartId));
      
      if (!chartConfig) {
        console.log(`❌ Chart not found: ${chartId}`);
        return res.status(404).json({
          success: false,
          error: 'Chart not found'
        });
      }

      // Get project submissions
      const submissions = await ProjectSubmission.findByProjectUid(chartConfig.project_uid);
      
      if (!submissions || submissions.length === 0) {
        console.log(`❌ No submissions found for chart ${chartId}`);
        return res.status(404).json({
          success: false,
          error: 'No submissions found for this project'
        });
      }

      const submissionData = submissions.map(s => s.submission_data);

      console.log(`📈 Preparing chart data for: ${chartConfig.chart_name}`);

      // Prepare chart data
      const chartData = await ChartAnalysisService.prepareChartData(
        chartConfig.project_uid,
        {
          chartType: chartConfig.chart_type,
          config: chartConfig.config_data
        },
        submissionData
      );

      res.json({
        success: true,
        chartConfig: {
          id: chartConfig.id,
          name: chartConfig.chart_name,
          type: chartConfig.chart_type,
          isEnabled: chartConfig.is_enabled,
          isAutoGenerated: chartConfig.is_auto_generated
        },
        chartData,
        metadata: {
          dataPoints: submissionData.length,
          generatedAt: new Date().toISOString(),
          chartId: chartId
        }
      });

    } catch (error) {
      console.error('Get chart data error:', error);
      res.status(500).json({
        success: false,
        error: error.message,
        debug: {
          chartId: req.params.chartId,
          message: error.message,
          stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        }
      });
    }
  },

  // Debug endpoint to check database state
  debugProjectCharts: async (req, res) => {
    try {
      const { projectUid } = req.params;

      console.log(`🐛 DEBUG: Checking charts for project ${projectUid}`);
      
      // Check database directly
      const query = `
        SELECT 
          COUNT(*) as total_charts,
          COUNT(CASE WHEN is_auto_generated = true THEN 1 END) as auto_generated,
          COUNT(CASE WHEN is_enabled = true THEN 1 END) as enabled_charts,
          array_agg(DISTINCT chart_type) as chart_types,
          MIN(created_at) as oldest_chart,
          MAX(created_at) as newest_chart
        FROM chart_configs 
        WHERE project_uid = $1
      `;
      
      const db = require('../config/database');
      const result = await db.query(query, [projectUid]);
      const stats = result.rows[0];

      // Get detailed chart list
      const charts = await ChartConfig.findByProjectUid(projectUid);
      
      const detailedCharts = charts.map(chart => ({
        id: chart.id,
        name: chart.chart_name,
        type: chart.chart_type,
        enabled: chart.is_enabled,
        auto: chart.is_auto_generated,
        created: chart.created_at,
        order: chart.display_order
      }));

      res.json({
        success: true,
        debug: {
          projectUid,
          databaseStats: stats,
          charts: detailedCharts,
          totalCharts: charts.length,
          summary: {
            total: stats.total_charts,
            autoGenerated: stats.auto_generated,
            enabled: stats.enabled_charts,
            chartTypes: stats.chart_types,
            dateRange: {
              oldest: stats.oldest_chart,
              newest: stats.newest_chart
            }
          }
        }
      });

    } catch (error) {
      console.error('Debug endpoint error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  },

  // Force delete all charts for a project
  forceDeleteCharts: async (req, res) => {
    try {
      const { projectUid } = req.params;

      console.log(`🗑️ FORCE DELETING all charts for project: ${projectUid}`);
      
      const deletedCharts = await ChartConfig.deleteByProjectUid(projectUid);
      
      res.json({
        success: true,
        message: `Force deleted ${deletedCharts.length} charts`,
        deletedCount: deletedCharts.length,
        projectUid
      });

    } catch (error) {
      console.error('Force delete error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  },

  // Update chart configuration
  updateChartConfig: async (req, res) => {
    try {
      const { chartId } = req.params;
      const updates = req.body;

      const updatedChart = await ChartConfig.update(parseInt(chartId), updates);

      res.json({
        success: true,
        message: 'Chart updated successfully',
        chart: updatedChart
      });

    } catch (error) {
      console.error('Update chart config error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  },

  // Toggle chart enabled status
  toggleChart: async (req, res) => {
    try {
      const { chartId } = req.params;
      const { isEnabled } = req.body;

      const updatedChart = await ChartConfig.toggleEnabled(parseInt(chartId), isEnabled);

      res.json({
        success: true,
        message: `Chart ${isEnabled ? 'enabled' : 'disabled'} successfully`,
        chart: updatedChart
      });

    } catch (error) {
      console.error('Toggle chart error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  },

  // Delete chart
  deleteChart: async (req, res) => {
    try {
      const { chartId } = req.params;

      const deletedChart = await ChartConfig.delete(parseInt(chartId));

      res.json({
        success: true,
        message: 'Chart deleted successfully',
        chart: deletedChart
      });

    } catch (error) {
      console.error('Delete chart error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  },

  // Get data analysis logs for debugging
  getAnalysisLogs: async (req, res) => {
    try {
      const { projectUid } = req.params;
      const { limit = 20 } = req.query;

      const logs = await DataAnalysisLog.getRecentAnalysis(projectUid, parseInt(limit));

      res.json({
        success: true,
        logs,
        total: logs.length
      });

    } catch (error) {
      console.error('Get analysis logs error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  },

  // Get data quality report
  getDataQualityReport: async (req, res) => {
    try {
      const { projectUid } = req.params;

      const submissions = await ProjectSubmission.findByProjectUid(projectUid);
      
      if (!submissions || submissions.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'No submissions found for this project'
        });
      }

      const availableColumns = submissions.length > 0 ? Object.keys(submissions[0].submission_data) : [];

      const analysisResult = await ChartAnalysisService.analyzeProjectData(
        projectUid, 
        submissions.map(s => s.submission_data), 
        availableColumns
      );

      res.json({
        success: true,
        dataQuality: analysisResult.dataQuality,
        columnAnalysis: analysisResult.columnAnalysis,
        summary: {
          totalSubmissions: submissions.length,
          totalColumns: availableColumns.length,
          analysisTimestamp: new Date().toISOString()
        }
      });

    } catch (error) {
      console.error('Data quality report error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
};

module.exports = chartController;