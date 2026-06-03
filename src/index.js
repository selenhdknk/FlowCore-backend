/**
 * FlowCore Backend - Ana Uygulama Sunucusu
 * 
 * Express.js tabanlı REST API
 * Flutter FlowCore mobil uygulamasının backend servisi
 */

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');

const { initializeFirebase } = require('./config/firebase');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');

// Route'ları içe aktar
const authRoutes = require('./routes/auth.routes');
const clientRoutes = require('./routes/clients.routes');
const projectRoutes = require('./routes/projects.routes');
const taskRoutes = require('./routes/tasks.routes');
const paymentRoutes = require('./routes/payments.routes');
const storageRoutes = require('./routes/storage.routes');

// ── Firebase Başlat ───────────────────────────────────────────────────────────
try {
  initializeFirebase();
} catch (error) {
  console.error('❌ Firebase başlatılamadı:', error.message);
  process.exit(1);
}

// ── Express Uygulaması ────────────────────────────────────────────────────────
const app = express();
const PORT = process.env.PORT || 3000;

// ── Güvenlik Middleware ───────────────────────────────────────────────────────
app.use(helmet());

// CORS ayarları - Flutter emülatör ve fiziksel cihaz IP'leri
const allowedOrigins = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(',')
  : ['http://localhost:3000', 'http://10.0.2.2:3000', 'http://localhost:8080'];

app.use(cors({
  origin: function (origin, callback) {
    // Geliştirme ortamında tüm kaynaklara izin ver
    if (!origin || process.env.NODE_ENV === 'development') {
      return callback(null, true);
    }
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    callback(new Error('CORS politikası tarafından engellendi.'));
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
}));

// Rate limiting - DDoS koruması
const limiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 dakika
  max: parseInt(process.env.RATE_LIMIT_MAX) || 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Çok fazla istek gönderildi. Lütfen bir dakika bekleyiniz.',
    code: 'RATE_LIMIT_EXCEEDED',
  },
});
app.use('/api/', limiter);

// ── Parser Middleware ─────────────────────────────────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ── Loglama ───────────────────────────────────────────────────────────────────
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

// ── Sağlık Kontrolü ───────────────────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({
    success: true,
    status: 'OK',
    service: 'FlowCore API',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
  });
});

// ── API Route'ları ────────────────────────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/clients', clientRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/storage', storageRoutes);

// ── API Kök Endpoint ──────────────────────────────────────────────────────────
app.get('/api', (req, res) => {
  res.json({
    success: true,
    message: 'FlowCore API\'ye hoş geldiniz!',
    version: '1.0.0',
    endpoints: {
      health: 'GET /health',
      auth: {
        register: 'POST /api/auth/register',
        login: 'POST /api/auth/login',
        profile: 'GET /api/auth/profile',
        updateProfile: 'PUT /api/auth/profile',
        logout: 'POST /api/auth/logout',
        resetPassword: 'POST /api/auth/reset-password',
      },
      clients: {
        list: 'GET /api/clients',
        get: 'GET /api/clients/:id',
        create: 'POST /api/clients',
        update: 'PUT /api/clients/:id',
        delete: 'DELETE /api/clients/:id',
        projects: 'GET /api/clients/:id/projects',
      },
      projects: {
        list: 'GET /api/projects',
        get: 'GET /api/projects/:id',
        create: 'POST /api/projects',
        update: 'PUT /api/projects/:id',
        delete: 'DELETE /api/projects/:id',
        tasks: 'GET /api/projects/:id/tasks',
        payments: 'GET /api/projects/:id/payments',
      },
      tasks: {
        list: 'GET /api/tasks',
        get: 'GET /api/tasks/:id',
        create: 'POST /api/tasks',
        update: 'PUT /api/tasks/:id',
        updateStatus: 'PATCH /api/tasks/:id/status',
        delete: 'DELETE /api/tasks/:id',
      },
      payments: {
        list: 'GET /api/payments',
        get: 'GET /api/payments/:id',
        create: 'POST /api/payments',
        update: 'PUT /api/payments/:id',
        markPaid: 'PATCH /api/payments/:id/mark-paid',
        delete: 'DELETE /api/payments/:id',
      },
      storage: {
        uploadProfilePicture: 'POST /api/storage/profile-picture',
      },
    },
  });
});

// ── Hata Yönetimi ─────────────────────────────────────────────────────────────
app.use(notFoundHandler);
app.use(errorHandler);

// ── Sunucuyu Başlat ───────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log('');
  console.log('╔════════════════════════════════════════════╗');
  console.log('║         FlowCore Backend API v1.0          ║');
  console.log('╚════════════════════════════════════════════╝');
  console.log(`✅ Sunucu çalışıyor: http://localhost:${PORT}`);
  console.log(`📋 API Kılavuzu: http://localhost:${PORT}/api`);
  console.log(`🏥 Sağlık Kontrolü: http://localhost:${PORT}/health`);
  console.log(`🌍 Ortam: ${process.env.NODE_ENV || 'development'}`);
  console.log('');
});

module.exports = app;
