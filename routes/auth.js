const express = require('express');
const bcrypt = require('bcryptjs');
const pool = require('../config/database');
const upload = require('../middleware/upload');

const router = express.Router();

// POST /api/auth/register - with file upload
router.post('/register', upload.single('profileImage'), async (req, res) => {
  try {
    console.log('✅ Register endpoint hit!');
    console.log('📦 Request body:', req.body);
    console.log('📁 Uploaded file:', req.file);

    const { fullName, email, phone, position, koboUsername, koboToken, password } = req.body;

    // Check if all required fields are present
    if (!fullName || !email || !phone || !position || !password) {
      return res.status(400).json({
        success: false,
        message: 'All required fields must be filled'
      });
    }

    console.log('🔍 Checking if user exists...');
    
    // Check if user already exists
    const userExists = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    console.log('User exists result:', userExists.rows);
    
    if (userExists.rows.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'User already exists with this email'
      });
    }

    console.log('🔐 Hashing password...');
    
    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);
    console.log('Password hashed successfully');

    // Handle profile image path
    let profileImagePath = null;
    if (req.file) {
      profileImagePath = req.file.path;
      console.log('🖼️ Profile image saved at:', profileImagePath);
    }

    console.log('💾 Inserting user into database...');
    
    // Insert new user
    const result = await pool.query(
      `INSERT INTO users 
       (full_name, email, phone, position, kobo_username, kobo_token, password, profile_image) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) 
       RETURNING id, full_name, email, phone, position, kobo_username, profile_image, created_at`,
      [fullName, email, phone, position, koboUsername || null, koboToken || null, hashedPassword, profileImagePath]
    );

    const newUser = result.rows[0];
    console.log('✅ User created successfully:', newUser);

    res.status(201).json({
      success: true,
      message: 'User registered successfully',
      user: newUser
    });

  } catch (error) {
    console.error('❌ Registration error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during registration',
      error: error.message
    });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    console.log('✅ Login endpoint hit!');
    console.log('📦 Request body:', req.body);

    const { email, password } = req.body;

    // Check if all required fields are present
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email and password are required'
      });
    }

    console.log('🔍 Finding user by email...');
    
    // Find user by email
    const userResult = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    
    if (userResult.rows.length === 0) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    const user = userResult.rows[0];
    console.log('👤 User found:', user.email);

    // Check password
    console.log('🔐 Checking password...');
    const isPasswordValid = await bcrypt.compare(password, user.password);
    
    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    console.log('✅ Login successful for user:', user.email);

    // Return user data (without password)
    const userResponse = {
      id: user.id,
      full_name: user.full_name,
      email: user.email,
      phone: user.phone,
      position: user.position,
      profile_image: user.profile_image,
      kobo_username: user.kobo_username,
      created_at: user.created_at
    };

    res.json({
      success: true,
      message: 'Login successful',
      user: userResponse
    });

  } catch (error) {
    console.error('❌ Login error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during login'
    });
  }
});

// TEST route
router.get('/test', (req, res) => {
  res.json({ message: 'Auth routes are working!' });
});

module.exports = router;