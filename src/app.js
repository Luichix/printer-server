import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { timingSafeEqual } from 'node:crypto';
import { createPrintRoutes } from './routes/print.routes.js';

export function createApp(manager, { port = 4000, allowedOrigins = [] } = {}) {
  const app = express();
  app.disable('x-powered-by');
  const hosts = new Set([`localhost:${port}`, `127.0.0.1:${port}`]);
  const localOrigins = new Set([...hosts].map(host => `http://${host}`));
  function validateOrigins(values) {
    if (!Array.isArray(values) || values.length > 30 || values.some(value => typeof value !== 'string')) throw Object.assign(new Error('Lista de orígenes inválida'), { status: 400 });
    return values.map(value => {
      const url = new URL(value);
      if (!['http:', 'https:'].includes(url.protocol) || url.origin !== value) throw new Error(`Origen inválido: ${value}`);
      return value;
    });
  }
  const configuredOrigins = validateOrigins(allowedOrigins);
  validateOrigins(manager.store.state.allowedOrigins || []);
  const origins = () => new Set([...configuredOrigins, ...(manager.store.state.allowedOrigins || [])]);
  const localOnly = (req, res, next) => {
    if ((req.headers.origin && !localOrigins.has(req.headers.origin)) || ['cross-site', 'same-site'].includes(req.headers['sec-fetch-site'])) {
      return res.status(403).json({ error: 'Esta operación requiere el panel local' });
    }
    next();
  };
  app.use((req, res, next) => {
    res.set({ 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-store',
      'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'" });
    if (!hosts.has(req.headers.host)) return res.status(403).json({ error: 'Host no autorizado' });
    const origin = req.headers.origin;
    if (origin && !localOrigins.has(origin) && !origins().has(origin)) return res.status(403).json({ error: 'Aplicación no autorizada' });
    if (origin) {
      res.set('Access-Control-Allow-Origin', origin);
      res.vary('Origin');
      res.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    }
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
  });
  // Bootstrap is only readable by our own local UI, never by a linked website.
  app.get('/api/session', localOnly, (_req, res) => {
    res.json({ token: manager.store.state.token });
  });
  const authenticate = (req, res, next) => {
    const supplied = Buffer.from(req.headers.authorization || '');
    const expected = Buffer.from(`Bearer ${manager.store.state.token}`);
    if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return res.status(401).json({ error: 'Credencial local requerida' });
    next();
  };
  app.use(['/api', '/print'], authenticate, express.json({ limit: '64kb' }));
  app.get('/api/status', (_req, res) => res.json({ status: manager.stopping ? 'stopping' : 'ready', version: 1, allowedOrigins: [...origins()], printers: manager.listPrinters() }));
  app.get('/api/settings', localOnly, (_req, res) => res.json({ allowedOrigins: manager.store.state.allowedOrigins || [], environmentOrigins: configuredOrigins }));
  app.post('/api/settings', localOnly, (req, res) => {
    let values;
    try { values = validateOrigins(req.body?.allowedOrigins); }
    catch { return res.status(400).json({ error: 'Usa orígenes como https://pos.ejemplo.com, sin rutas ni barra final' }); }
    manager.update({ allowedOrigins: [...new Set(values)] });
    res.json({ status: 'saved' });
  });
  app.get('/api/ports', async (_req, res) => res.json(await manager.listPorts()));
  app.get('/api/printers', (_req, res) => res.json(manager.listPrinters()));
  app.post('/api/printers', async (req, res) => res.status(201).json(await manager.configure(req.body)));
  app.post('/api/printers/:id/connect', async (req, res) => { await manager.reconnect(req.params.id); res.json({ status: 'connected' }); });
  app.post('/api/printers/:id/default', (req, res) => { manager.setDefault(req.params.id); res.json({ status: 'saved' }); });
  app.delete('/api/printers/:id', async (req, res) => { await manager.remove(req.params.id); res.sendStatus(204); });
  app.get('/api/jobs', (_req, res) => res.json(manager.listJobs()));
  app.get('/api/jobs/:id', (req, res) => res.json(manager.publicJob(manager.getJob(req.params.id))));
  app.post('/api/jobs', (req, res) => res.status(202).json(manager.submit(req.body || {})));
  app.use('/print', createPrintRoutes(manager));
  app.use(express.static(path.join(path.dirname(fileURLToPath(import.meta.url)), 'public')));
  app.use((_req, res) => res.status(404).json({ error: 'Ruta no encontrada' }));
  app.use((error, _req, res, _next) => {
    const status = error.status || 500;
    if (status >= 500) console.error(error.message);
    res.status(status).json({ error: status === 500 ? 'Error interno del agente. Revisa el registro local.' : error.message });
  });
  return app;
}
