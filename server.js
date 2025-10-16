const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();

// ⚠️ FIX: Increase payload size limit for large project data
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Improved CORS configuration
app.use(cors({
  origin: ['http://localhost:3000', 'http://127.0.0.1:3000'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

// Import routes
const koboRoutes = require('./routes/koboRoutes');
const tokenRoutes = require('./routes/tokenRoutes');
const projectRoutes = require('./routes/projectRoutes');
const chartRoutes = require('./routes/chartRoutes');

// Serve static files from uploads folder
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/kobo', koboRoutes);
app.use('/api/tokens', tokenRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api/charts', chartRoutes);

// Basic route
app.get('/', (req, res) => {
  res.json({ 
    message: 'Welcome to Kobo Dashboard API!',
    endpoints: {
      kobo: '/api/kobo/projects',
      tokens: '/api/tokens', 
      projects: '/api/projects',
      charts: '/api/charts'
    }
  });
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    message: 'Server is running',
    timestamp: new Date().toISOString()
  });
});

// Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Server is running on port ${PORT}`);
  console.log(`📍 Health check: http://localhost:${PORT}/api/health`);
  console.log(`📍 Kobo API: http://localhost:${PORT}/api/kobo/projects`);
  console.log(`📍 Charts API: http://localhost:${PORT}/api/charts`);
});