require('dotenv').config();
const express = require('express');
const path = require('path');
const config = require('./config');
const { sessionAuth } = require('./middleware/sessionAuth');
const healthRoutes = require('./routes/health');
const authRoutes = require('./routes/auth');
const commitRoutes = require('./routes/commit');
const verifyRoutes = require('./routes/verify');
const dashboardApiRoutes = require('./routes/dashboard-api');

const app = express();

// Health (no auth, no body parsing)
app.use('/health', healthRoutes);

// Auth (JSON body)
app.use('/auth', express.json(), authRoutes);

// Dashboard API (JSON + session auth)
app.use('/api/dashboard', express.json(), sessionAuth, dashboardApiRoutes);

// Commit API (JSON body, apiKeyAuth applied per-route)
app.use('/v1', express.json({ limit: '5mb' }), commitRoutes);

// Verify API (public, no auth)
app.use('/v1', verifyRoutes);

// Static files
const publicDir = path.join(__dirname, '..', 'public');
app.use(express.static(publicDir));

// SPA fallbacks
app.get('/login', (req, res) => res.sendFile(path.join(publicDir, 'login.html')));
app.get('/dashboard', (req, res) => res.sendFile(path.join(publicDir, 'dashboard', 'index.html')));
app.get('/dashboard/*', (req, res) => res.sendFile(path.join(publicDir, 'dashboard', 'index.html')));

// Error handler
app.use((err, req, res, next) => {
  console.error('[ERROR]', err.message);
  res.status(500).json({ error: { message: 'Internal server error.', code: 'INTERNAL' } });
});

app.listen(config.port, () => {
  console.log(`Provifier server on port ${config.port}`);
  console.log(`  Chain: ${config.chain} (${config.sui.network})`);
  console.log(`  API key required: ${config.requireApiKey}`);
  console.log(`  Sui configured: ${!!(config.sui.privateKey && config.sui.packageId)}`);
});
