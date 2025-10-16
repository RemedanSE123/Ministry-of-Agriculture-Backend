const express = require('express');
const router = express.Router();
const chartController = require('../controllers/chartController');

// Chart analysis and generation
router.post('/analyze/:projectUid', chartController.analyzeProjectData);
router.get('/project/:projectUid', chartController.getProjectCharts);
router.get('/data/:chartId', chartController.getChartData);

// Debug and maintenance endpoints
router.get('/debug/:projectUid', chartController.debugProjectCharts);
router.delete('/force-delete/:projectUid', chartController.forceDeleteCharts);

// Chart management
router.put('/config/:chartId', chartController.updateChartConfig);
router.patch('/toggle/:chartId', chartController.toggleChart);
router.delete('/:chartId', chartController.deleteChart);

// Debugging and monitoring
router.get('/logs/:projectUid', chartController.getAnalysisLogs);
router.get('/quality/:projectUid', chartController.getDataQualityReport);

module.exports = router;