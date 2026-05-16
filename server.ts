require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
import 'reflect-metadata';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import path from 'path';
import http from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { initializeDatabase } from './config/database';
import { initializeRedis } from './config/redis';
import { initializeFirebase } from './config/firebase';
import { swaggerSetup } from './config/swagger';
import { errorHandler } from './middlewares/errorHandler';
import { logger } from './utils/helpers/logger';
import { setupRoutes } from './routes';
import { setupGraphQL } from './graphql';
import { setupWebSocket } from './websocket';
import { startBackgroundJobs } from './services/queue';
import { setupCronJobs } from './services/cron';

const app = express();
const server = http.createServer(app);

// Socket.IO Setup
const io = new SocketIOServer(server, {
  cors: {
    origin: process.env.CORS_ORIGINS?.split(',') || '*',
    methods: ['GET', 'POST'],
    credentials: true,
  },
  pingTimeout: 60000,
  pingInterval: 25000,
});

// Security Middleware
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
}));
app.use(cors({
  origin: process.env.CORS_ORIGINS?.split(',') || '*',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin'],
  exposedHeaders: ['Content-Range', 'X-Content-Range'],
}));

// Rate Limiting
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000'),
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100'),
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    status: 'error',
    message: 'Too many requests, please try again later.',
  },
});
app.use('/api', limiter);

// Body Parsing & Compression
app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());

// Logging
if (process.env.NODE_ENV !== 'production') {
  app.use(morgan('dev'));
} else {
  app.use(morgan('combined', { stream: { write: (message: string) => logger.info(message.trim()) } }));
}

// Static Files
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Swagger Documentation
swaggerSetup(app);

// Health Check
app.get('/health', (_req, res) => {
  res.status(200).json({
    status: 'success',
    message: 'ILM Book Store API is running',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// API Routes
setupRoutes(app);

// GraphQL Setup
setupGraphQL(app);

// WebSocket Setup
setupWebSocket(io);

// Error Handler (must be last)
app.use(errorHandler);

// 404 Handler
app.use((_req, res) => {
  res.status(404).json({
    status: 'error',
    message: 'Route not found',
  });
});

// Server Initialization
const PORT = process.env.PORT || 5000;

async function startServer() {
  try {
    // Initialize Database (PostgreSQL)
    await initializeDatabase();
    logger.info('✅ PostgreSQL database connected successfully');

    // Initialize MongoDB
    const mongoose = await import('mongoose');
    await mongoose.default.connect(process.env.MONGODB_URI || '');
    logger.info('✅ MongoDB connected successfully');

    // Initialize Redis
    await initializeRedis();
    logger.info('✅ Redis connected successfully');

    // Initialize Firebase
    initializeFirebase();
    logger.info('✅ Firebase initialized successfully');

    // Start Background Jobs
    startBackgroundJobs();
    logger.info('✅ Background jobs started');

    // Setup Cron Jobs
    setupCronJobs();
    logger.info('✅ Cron jobs scheduled');

    // Start Server
    server.listen(PORT, () => {
      logger.info(`
      ╔═══════════════════════════════════════════╗
      ║       🚀 ILM Book Store API Server       ║
      ║───────────────────────────────────────────║
      ║  Environment: ${process.env.NODE_ENV || 'development'.padEnd(20)}║
      ║  Port:        ${String(PORT).padEnd(20)}║
      ║  API URL:     ${(process.env.API_URL || `http://localhost:${PORT}`).padEnd(20)}║
      ║  Swagger:     ${(process.env.API_URL || `http://localhost:${PORT}`)}/api-docs  ║
      ║  GraphQL:     ${(process.env.API_URL || `http://localhost:${PORT}`)}/graphql   ║
      ╚═══════════════════════════════════════════╝
      `);
    });

    // Graceful Shutdown
    const gracefulShutdown = async (signal: string) => {
      logger.info(`⚠️ ${signal} received. Shutting down gracefully...`);
      server.close(() => {
        logger.info('HTTP server closed');
        process.exit(0);
      });
      setTimeout(() => {
        logger.error('Forced shutdown after timeout');
        process.exit(1);
      }, 10000);
    };

    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));

  } catch (error) {
    logger.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

startServer();

export { app, server, io };
