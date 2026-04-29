const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { Users } = require('../utils/store');
const authMiddleware = require('../middleware/auth');

const router = express.Router();

function signToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );
}

function sanitize(user) {
  const { passwordHash, ...safe } = user;
  return safe;
}

// ── POST /api/auth/register ────────────────────────────
router.post('/register', async (req, res) => {
  try {
    const { firstName, lastName, email, password, organization } = req.body;

    if (!firstName || !lastName || !email || !password) {
      return res.status(400).json({ error: 'All fields are required' });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }
    if (!/\S+@\S+\.\S+/.test(email)) {
      return res.status(400).json({ error: 'Invalid email address' });
    }

    const existing = Users.getByEmail(email);
    if (existing) {
      return res.status(409).json({ error: 'An account with this email already exists' });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const user = Users.create({
      id: uuidv4(),
      firstName,
      lastName,
      email: email.toLowerCase().trim(),
      organization: organization || '',
      passwordHash,
      createdAt: new Date().toISOString(),
      analysisCount: 0,
    });

    const token = signToken(user);
    res.status(201).json({ token, user: sanitize(user) });
  } catch (err) {
    console.error('[register]', err);
    res.status(500).json({ error: 'Registration failed' });
  }
});

// ── POST /api/auth/login ──────────────────────────────
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const user = Users.getByEmail(email);
    if (!user) {
      return res.status(401).json({ error: 'No account found with this email' });
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      return res.status(401).json({ error: 'Incorrect password' });
    }

    const token = signToken(user);
    res.json({ token, user: sanitize(user) });
  } catch (err) {
    console.error('[login]', err);
    res.status(500).json({ error: 'Login failed' });
  }
});

// ── GET /api/auth/me ──────────────────────────────────
router.get('/me', authMiddleware, (req, res) => {
  res.json({ user: req.user });
});

// ── POST /api/auth/demo ───────────────────────────────
router.post('/demo', async (req, res) => {
  try {
    const demoEmail = 'demo@resumeiq.app';
    let user = Users.getByEmail(demoEmail);

    if (!user) {
      const passwordHash = await bcrypt.hash('demo1234', 10);
      user = Users.create({
        id: uuidv4(),
        firstName: 'Demo',
        lastName: 'User',
        email: demoEmail,
        organization: 'ResumeIQ Demo',
        passwordHash,
        createdAt: new Date().toISOString(),
        analysisCount: 0,
      });
    }

    const token = signToken(user);
    res.json({ token, user: sanitize(user) });
  } catch (err) {
    res.status(500).json({ error: 'Demo login failed' });
  }
});

module.exports = router;
