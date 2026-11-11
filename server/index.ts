import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

import { testConnection } from './db/connection.js';
import { ensureDatabaseSchema } from './db/schema.js';
import authRoutes from './routes/authRoutes.js';
import vaultAuthRoutes from './routes/vaultAuthRoutes.js';
import passwordRoutes from './routes/passwordRoutes.js';
import keyRoutes from './routes/keyRoutes.js';
import auditRoutes from './routes/auditRoutes.js';
import userRoutes from './routes/userRoutes.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = parseInt(process.env.PORT || '3001', 10);

// Cabeceras de seguridad estrictas (OWASP Best Practices)
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  if (process.env.NODE_ENV === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  next();
});

app.use(cors({
  origin: true,
  credentials: true,
}));

app.use(express.json({ limit: '2mb' }));
app.use(cookieParser());

// Endpoint de Salud / Healthcheck (útil para Railway y monitoreo)
app.get('/api/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    service: 'f1-keyvault-fortress',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

// Rutas API
app.use('/api/auth', authRoutes);
app.use('/api/vault', vaultAuthRoutes);
app.use('/api/vault/passwords', passwordRoutes);
app.use('/api/vault/keys', keyRoutes);
app.use('/api/vault/audit', auditRoutes);
app.use('/api/users', userRoutes);

// Servir cliente en producción
const clientDistPath = path.resolve(__dirname, '../../dist/client');
const clientAltDistPath = path.resolve(__dirname, '../client');

import fs from 'node:fs';
const staticPath = fs.existsSync(clientDistPath) ? clientDistPath : (fs.existsSync(clientAltDistPath) ? clientAltDistPath : null);

if (staticPath) {
  app.use(express.static(staticPath));
  app.get('*', (req, res) => {
    if (!req.path.startsWith('/api/')) {
      res.sendFile(path.join(staticPath, 'index.html'));
    } else {
      res.status(404).json({ error: 'Endpoint no encontrado.' });
    }
  });
}

// Iniciar servidor
async function startServer() {
  console.log('🚀 Iniciando F1 KeyVault & Fortress...');
  const dbConnected = await testConnection();

  if (dbConnected) {
    try {
      await ensureDatabaseSchema();
    } catch (err) {
      console.error('Error inicializando esquema de BD:', err);
    }
  } else {
    console.warn('⚠️ Se iniciará el servidor Express, pero la conexión a PostgreSQL no está lista todavía.');
  }

  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`🔒 F1 KeyVault & Fortress escuchando en el puerto ${PORT}`);
    console.log(`🌐 Ambiente: ${process.env.NODE_ENV || 'development'}`);
  });

  const shutdown = () => {
    console.log('Cerrando servidor de forma segura...');
    server.close(() => {
      console.log('Servidor cerrado.');
      process.exit(0);
    });
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

startServer();
