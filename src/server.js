#!/usr/bin/env node
import { createInterface } from 'node:readline';
import { createApp } from './app.js';
import { Store, defaultDataDir, acquireLock } from './services/store.js';
import { PrinterManager } from './services/printer.service.js';

const port = Number(process.env.PORT || 4000);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT debe ser un puerto válido');
const directory = defaultDataDir();
const releaseLock = acquireLock(directory);
process.on('exit', releaseLock);
const store = new Store(directory);
const manager = new PrinterManager(store);
const app = createApp(manager, { port, allowedOrigins: (process.env.PRINTER_ALLOWED_ORIGINS || '').split(',').map(value => value.trim()).filter(Boolean) });
// Listen first: a second instance must not open ports used by the running agent.
const server = app.listen(port, '127.0.0.1', async () => {
  console.log(`Panel de impresión: http://127.0.0.1:${port}`);
  if (process.argv.includes('--desktop')) console.log('PRINTER_SERVER_READY');
  console.log(`Configuración: ${store.directory}`);
  await manager.restore();
});
server.on('error', error => {
  console.error(error.code === 'EADDRINUSE' ? `El puerto ${port} ya está en uso. Es posible que el agente ya esté abierto.` : error.message);
  process.exitCode = 1;
  control?.close();
  process.stdin.pause();
});
let closing = false;
let control;
if (process.argv.includes('--desktop')) {
  control = createInterface({ input: process.stdin });
  control.on('line', line => { if (line === 'shutdown') void shutdown(); });
  // The parent closing/crashing closes this pipe too. Do not leave an orphan agent.
  control.on('close', () => { void shutdown(); });
}
async function shutdown() {
  if (closing) return;
  closing = true;
  server.close();
  await manager.shutdown();
  control?.close();
  process.stdin.pause();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
