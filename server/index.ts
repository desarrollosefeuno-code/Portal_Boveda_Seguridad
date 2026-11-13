import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ConfigError, loadConfig } from './config.js';
import { createPgDatabase, setDatabase, waitForDatabase } from './db/connection.js';
import { runMigrations } from './db/migrations.js';
import { bootstrapUsers, reencryptLegacyData } from './db/bootstrap.js';
import { initCrypto } from './services/cryptoService.js';
import { createApp } from './app.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  console.log('[arranque] Iniciando F1 KeyVault & Fortress…');

  // 1. Configuración: sin secretos válidos el servidor no arranca (C-03).
  const config = loadConfig();
  initCrypto(config);

  // 2. Base de datos: esperar, migrar y preparar usuarios. Si algo falla, se detiene (M-03).
  const database = createPgDatabase({ connectionString: config.databaseUrl, ssl: config.databaseSsl });
  setDatabase(database);
  await waitForDatabase(database);
  await runMigrations(database);
  await bootstrapUsers(database, config);

  // 3. Servidor
  // dist/server/index.js → dist/client; en desarrollo (tsx server/index.ts) → dist/client del proyecto
  const staticDir = [path.resolve(__dirname, '../client'), path.resolve(__dirname, '../dist/client')].find((p) => fs.existsSync(p)) ?? null;
  const app = createApp(config, { staticDir });
  const server = app.listen(config.port, '0.0.0.0', () => {
    console.log(`[arranque] Escuchando en el puerto ${config.port} (${config.isProduction ? 'producción' : 'desarrollo'}).`);
  });

  // 4. Re-cifrado de datos heredados en segundo plano
  reencryptLegacyData(database).catch((err) => console.error('[cifrado] Falló el re-cifrado en segundo plano:', err));

  const shutdown = (signal: string) => {
    console.log(`[cierre] ${signal} recibido. Cerrando…`);
    server.close(() => {
      database.close().finally(() => process.exit(0));
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((err) => {
  if (err instanceof ConfigError) console.error(`[arranque] Configuración inválida: ${err.message}`);
  else console.error('[arranque] No se pudo iniciar el servidor:', err instanceof Error ? err.message : err);
  process.exit(1);
});
