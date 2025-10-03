const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();
const koboRoutes = require('./routes/koboRoutes');
// Middleware
app.use(cors());
app.use(express.json());

// Serve static files from uploads folder
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Routes
app.use('/api/auth', require('./routes/auth'));

// Routes
app.use('/api/kobo', koboRoutes);

// Basic route
app.get('/', (req, res) => {
  res.json({ message: 'Welcome to our API!' });
});

// Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});