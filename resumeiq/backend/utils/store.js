/**
 * Simple file-based data store.
 * In production, replace with PostgreSQL / MongoDB.
 */
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '../data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const HISTORY_FILE = path.join(DATA_DIR, 'history.json');

// Ensure data directory and files exist
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(USERS_FILE)) fs.writeFileSync(USERS_FILE, '{}');
if (!fs.existsSync(HISTORY_FILE)) fs.writeFileSync(HISTORY_FILE, '{}');

function readJSON(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch { return {}; }
}
function writeJSON(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

// ── Users ──────────────────────────────────────────────
const Users = {
  getAll: () => readJSON(USERS_FILE),
  getByEmail: (email) => readJSON(USERS_FILE)[email.toLowerCase()] || null,
  getById: (id) => {
    const users = readJSON(USERS_FILE);
    return Object.values(users).find(u => u.id === id) || null;
  },
  create: (user) => {
    const users = readJSON(USERS_FILE);
    users[user.email.toLowerCase()] = user;
    writeJSON(USERS_FILE, users);
    return user;
  },
  update: (email, updates) => {
    const users = readJSON(USERS_FILE);
    if (!users[email]) return null;
    users[email] = { ...users[email], ...updates };
    writeJSON(USERS_FILE, users);
    return users[email];
  },
};

// ── Analysis History ───────────────────────────────────
const History = {
  getByUserId: (userId) => {
    const all = readJSON(HISTORY_FILE);
    return (all[userId] || []).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  },
  add: (userId, record) => {
    const all = readJSON(HISTORY_FILE);
    if (!all[userId]) all[userId] = [];
    all[userId].unshift(record);
    // keep last 50 per user
    if (all[userId].length > 50) all[userId] = all[userId].slice(0, 50);
    writeJSON(HISTORY_FILE, all);
    return record;
  },
  delete: (userId, recordId) => {
    const all = readJSON(HISTORY_FILE);
    if (!all[userId]) return false;
    const before = all[userId].length;
    all[userId] = all[userId].filter(r => r.id !== recordId);
    writeJSON(HISTORY_FILE, all);
    return all[userId].length < before;
  },
};

module.exports = { Users, History };
