const express = require('express');
const cors = require('cors');
const { createSiteRoutes } = require('./routes/sites.routes');
const path = require('path');
const createPrintRoutes = require('./routes/print.routes');
const { createLocalAccess } = require('./middleware/local-access');

function createApp({
  printer = require('./services/printer.service'),
  port = 4000,
  allowedOrigins = [],
  onPrinterConnected,
  onOriginsChanged,
  originsReadOnly = false,
} = {}) {
  const app = express();
  const localHosts = new Set(['localhost:' + port, '127.0.0.1:' + port]);
  const { isLocalPanel, requireLocalPanel } = createLocalAccess(localHosts);
  const sites = new Set(allowedOrigins);
  const localOrigins = new Set([...localHosts].map((host) => 'http://' + host));
  const origins = new Set([
    ...allowedOrigins,
    ...[...localHosts].map((host) => 'http://' + host),
  ]);
  app.disable('x-powered-by');
  app.use((req, res, next) => {
    if (!localHosts.has(req.headers.host))
      return res.status(403).json({ error: 'Host no permitido' });
    if (req.headers.origin && !origins.has(req.headers.origin)) {
      return res.status(403).json({ error: 'Origen no permitido' });
    }
    if (req.method === 'POST' && !req.is('application/json')) {
      return res.status(415).json({ error: 'Utiliza application/json' });
    }
    next();
  });
  // Mismo enrutamiento que Express: cubre OPTIONS, mayúsculas y barra final.
  // Se verifica antes de CORS y de cualquier acceso a las impresoras.
  app.use(['/print/list', '/print/select', '/settings'], requireLocalPanel);
  app.use((_req, res, next) => {
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Content-Security-Policy', "frame-ancestors 'none'");
    next();
  });
  app.use(
    cors({
      origin: (origin, callback) =>
        callback(null, Boolean(origin && origins.has(origin))),
      methods: ['GET', 'POST'],
      allowedHeaders: ['Content-Type'],
    }),
  );
  app.use(express.json({ limit: '32kb' }));
  app.use(express.static(path.join(__dirname, '..', 'public')));
  app.use(
    '/settings/sites',
    createSiteRoutes({
      sites,
      origins,
      localOrigins,
      saveOrigins: onOriginsChanged,
      readOnly: originsReadOnly || !onOriginsChanged,
    }),
  );
  app.use('/print', createPrintRoutes(printer, onPrinterConnected));
  app.get('/health', (req, res) =>
    res.json({
      service: 'printer-server',
      status: 'ok',
      ...(isLocalPanel(req)
        ? {
            printerConnected: printer.isPrinterOpen(),
            printer: printer.getConnection?.() || null,
          }
        : {}),
    }),
  );
  app.use((error, _req, res, _next) => {
    const status =
      error.status >= 400 && error.status < 500 ? error.status : 500;
    console.error(
      'Solicitud fallida:',
      status,
      status >= 500 ? error.message : 'Entrada rechazada',
    );
    res.status(status).json({ error: error.message });
  });
  return app;
}
module.exports = { createApp };
