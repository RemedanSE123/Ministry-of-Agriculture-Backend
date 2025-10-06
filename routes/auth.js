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
    
    // Insert new user with default 'user' role
    const result = await pool.query(
      `INSERT INTO users 
       (full_name, email, phone, position, kobo_username, kobo_token, password, profile_image, role) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) 
       RETURNING id, full_name, email, phone, position, kobo_username, profile_image, role, created_at`,
      [fullName, email, phone, position, koboUsername || null, koboToken || null, hashedPassword, profileImagePath, 'user'] // Default role is 'user'
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

// POST /api/auth/login - UPDATED WITH ROLE CHECK
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
    
    // Find user by email - INCLUDING ROLE
    const userResult = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    
    if (userResult.rows.length === 0) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    const user = userResult.rows[0];
    console.log('👤 User found:', user.email);
    console.log('🎭 User role:', user.role);

    // 🔒 CHECK: Only allow admin and super_admin to login
    if (!['admin', 'super_admin'].includes(user.role)) {
      console.log('🚫 Access denied for role:', user.role);
      return res.status(403).json({
        success: false,
        message: 'Access denied. Only administrator accounts can access this system.'
      });
    }

    // Check password
    console.log('🔐 Checking password...');
    const isPasswordValid = await bcrypt.compare(password, user.password);
    
    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    console.log('✅ Login successful for admin user:', user.email);

    // Return user data (without password) - INCLUDING ROLE
    const userResponse = {
      id: user.id,
      full_name: user.full_name,
      email: user.email,
      phone: user.phone,
      position: user.position,
      profile_image: user.profile_image,
      kobo_username: user.kobo_username,
      role: user.role, // ✅ Now including role in response
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

// GET /api/auth/check - Check if user is authenticated (for frontend)
router.get('/check', async (req, res) => {
  try {
    // This would normally check JWT token, but for now we'll keep it simple
    res.json({
      success: true,
      message: 'Auth check endpoint'
    });
  } catch (error) {
    console.error('❌ Auth check error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during auth check'
    });
  }
});

// GET /api/auth/users - Get all users (super_admin only)
router.get('/users', async (req, res) => {
  try {
    console.log('🔍 Fetching all users...');
    
    const usersResult = await pool.query(
      `SELECT 
        id, 
        full_name, 
        email, 
        phone, 
        position, 
        profile_image, 
        role,
        kobo_username,
        created_at 
       FROM users 
       ORDER BY 
         CASE 
           WHEN role = 'super_admin' THEN 1
           WHEN role = 'admin' THEN 2
           ELSE 3
         END,
         created_at DESC`
    );
    
    console.log(`✅ Found ${usersResult.rows.length} users`);
    
    res.json({
      success: true,
      users: usersResult.rows
    });
  } catch (error) {
    console.error('❌ Get users error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching users'
    });
  }
});

// PATCH /api/auth/users/:id/role - Update user role (super_admin only)
router.patch('/users/:id/role', async (req, res) => {
  try {
    const { id } = req.params;
    const { role } = req.body;

    console.log(`🎭 Updating user ${id} role to: ${role}`);

    // Validate role
    if (!['user', 'admin', 'super_admin'].includes(role)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid role. Must be user, admin, or super_admin'
      });
    }

    // Update user role
    const result = await pool.query(
      'UPDATE users SET role = $1 WHERE id = $2 RETURNING id, full_name, email, role',
      [role, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const updatedUser = result.rows[0];
    console.log(`✅ User role updated: ${updatedUser.full_name} is now ${updatedUser.role}`);

    res.json({
      success: true,
      message: `User role updated to ${role}`,
      user: updatedUser
    });
  } catch (error) {
    console.error('❌ Update role error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while updating user role'
    });
  }
});

// PATCH /api/auth/users/:id/profile - Update user profile
router.patch('/users/:id/profile', upload.single('profileImage'), async (req, res) => {
  try {
    const { id } = req.params;
    const { full_name, email, phone, position, kobo_username, kobo_token } = req.body;

    console.log(`📝 Updating profile for user ${id}`);
    console.log('📦 Request body:', { full_name, email, phone, position, kobo_username });
    console.log('📁 Uploaded file:', req.file);

    // Check if user exists
    const userCheck = await pool.query('SELECT * FROM users WHERE id = $1', [id]);
    
    if (userCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const currentUser = userCheck.rows[0];
    console.log('👤 Current user data:', currentUser.email);

    // Check if email is already taken by another user
    if (email && email !== currentUser.email) {
      const emailCheck = await pool.query(
        'SELECT id FROM users WHERE email = $1 AND id != $2', 
        [email, id]
      );
      
      if (emailCheck.rows.length > 0) {
        return res.status(400).json({
          success: false,
          message: 'Email is already taken by another user'
        });
      }
    }

    // Build update query dynamically based on provided fields
    let updateFields = [];
    let queryParams = [];
    let paramCount = 1;

    if (full_name) {
      updateFields.push(`full_name = $${paramCount}`);
      queryParams.push(full_name);
      paramCount++;
    }

    if (email) {
      updateFields.push(`email = $${paramCount}`);
      queryParams.push(email);
      paramCount++;
    }

    if (phone) {
      updateFields.push(`phone = $${paramCount}`);
      queryParams.push(phone);
      paramCount++;
    }

    if (position) {
      updateFields.push(`position = $${paramCount}`);
      queryParams.push(position);
      paramCount++;
    }

    if (kobo_username !== undefined) {
      updateFields.push(`kobo_username = $${paramCount}`);
      queryParams.push(kobo_username);
      paramCount++;
    }

    if (kobo_token !== undefined) {
      updateFields.push(`kobo_token = $${paramCount}`);
      queryParams.push(kobo_token);
      paramCount++;
    }

    // Handle profile image
    if (req.file) {
      updateFields.push(`profile_image = $${paramCount}`);
      queryParams.push(req.file.path);
      paramCount++;
      console.log('🖼️ New profile image uploaded:', req.file.path);
    }

    if (updateFields.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No fields to update'
      });
    }

    // Add user ID to query params
    queryParams.push(id);

    const updateQuery = `
      UPDATE users 
      SET ${updateFields.join(', ')}, updated_at = CURRENT_TIMESTAMP
      WHERE id = $${paramCount}
      RETURNING id, full_name, email, phone, position, profile_image, role, kobo_username, created_at
    `;

    console.log('🔧 Executing update query:', updateQuery);
    console.log('📋 Query parameters:', queryParams);

    const result = await pool.query(updateQuery, queryParams);

    const updatedUser = result.rows[0];
    console.log(`✅ Profile updated for user: ${updatedUser.full_name}`);
    console.log('📊 Updated user data:', updatedUser);

    res.json({
      success: true,
      message: 'Profile updated successfully',
      user: updatedUser
    });

  } catch (error) {
    console.error('❌ Update profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while updating profile',
      error: error.message
    });
  }
});

// GET /api/auth/users/count - Get user counts by role
router.get('/users/count', async (req, res) => {
  try {
    console.log('📊 Getting user counts by role...');
    
    const countResult = await pool.query(
      `SELECT 
        role,
        COUNT(*) as count
       FROM users 
       GROUP BY role
       ORDER BY 
         CASE 
           WHEN role = 'super_admin' THEN 1
           WHEN role = 'admin' THEN 2
           ELSE 3
         END`
    );
    
    const totalResult = await pool.query('SELECT COUNT(*) as total FROM users');
    
    const counts = {
      total: parseInt(totalResult.rows[0].total),
      by_role: countResult.rows
    };
    
    console.log(`✅ User counts:`, counts);
    
    res.json({
      success: true,
      counts: counts
    });
  } catch (error) {
    console.error('❌ Get user counts error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching user counts'
    });
  }
});

// DELETE /api/auth/users/:id - Delete user (super_admin only)
router.delete('/users/:id', async (req, res) => {
  try {
    const { id } = req.params;

    console.log(`🗑️ Deleting user ${id}...`);

    // Check if user exists
    const userCheck = await pool.query('SELECT id, full_name FROM users WHERE id = $1', [id]);
    
    if (userCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const userToDelete = userCheck.rows[0];

    // Prevent deleting yourself
    // Note: You might want to add user ID from session/token here
    // For now, we'll skip this check

    // Delete user
    await pool.query('DELETE FROM users WHERE id = $1', [id]);

    console.log(`✅ User deleted: ${userToDelete.full_name}`);

    res.json({
      success: true,
      message: `User ${userToDelete.full_name} deleted successfully`
    });
  } catch (error) {
    console.error('❌ Delete user error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while deleting user'
    });
  }
});

// TEST route
router.get('/test', (req, res) => {
  res.json({ message: 'Auth routes are working!' });
});

module.exports = router;