const express = require('express');
const cors = require('cors');
const path = require('node:path');
const fs = require('node:fs');
const apiRoutes = require('./routes/api.js');
const { initSchema } = require('./db/connection.js');
const { seedInitialData } = require('./db/seed_initial.js');

const app = express();
const PORT = process.env.PORT || 3001;

// Ensure upload directory exists
const uploadDir = (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME)
  ? '/tmp/uploads_staging'
  : path.join(__dirname, '../../uploads_staging');
try {
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }
} catch (e) {
  console.warn('Could not create uploadDir:', e.message);
}

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Initialize DB schema & seed (async for Postgres, sync for SQLite)
Promise.resolve(initSchema()).then(() => {
  return Promise.resolve(seedInitialData());
}).then(() => {
  try {
    const { getDb } = require('./db/connection.js');
    const db = getDb();
    const tgt = db.query('SELECT COUNT(*) as c FROM fact_quantity_target WHERE year = 2026 AND month = 9')[0];
    if (!tgt || tgt.c === 0) {
      const { runSmallIngestion } = require('./db/ingest_small_files.js');
      return Promise.resolve(runSmallIngestion());
    }
  } catch (e) {
    console.warn('Target auto-sync notice:', e.message);
  }
}).catch(err => console.error('DB init error:', err));

// Register API routes
app.use('/api', apiRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    system: 'Sales Garut Intelligence Platform API',
    user: 'Aghia',
    version: '1.0.0',
    timestamp: new Date().toISOString()
  });
});

// Serve public web application
const publicDir = path.join(__dirname, '../public');
app.use(express.static(publicDir));

// Fallback to index.html for SPA routing
app.use((req, res, next) => {
  if (req.method !== 'GET') return next();
  if (req.path.startsWith('/api') || req.path === '/health') return next();
  const indexHtml = path.join(publicDir, 'index.html');
  if (fs.existsSync(indexHtml)) {
    return res.sendFile(indexHtml);
  }
  res.status(404).send('Not Found');
});

let server = null;
if (require.main === module) {
  server = app.listen(PORT, () => {
    console.log(`Sales Garut Intelligence Platform API running on http://localhost:${PORT}`);
  });
}

module.exports = app;
module.exports.app = app;
module.exports.server = server;
