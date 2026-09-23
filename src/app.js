const express = require('express');
const cors = require('cors');
const path = require('path');
const createPrintRoutes = require('./routes/print.routes');

function createApp({ printer = require('./services/printer.service'), port = 4000, allowedOrigins = [], onPrinterConnected } = {}) {
  const app = express();
  const localHosts = new Set(['127.0.0.1:' + port, 'localhost:' + port]);
  const origins = new Set([...allowedOrigins, ...[...localHosts].map(host => 'http://' + host)]);
  app.disable('x-powered-by');
  app.use((req, res, next) => {
    if (!localHosts.has(req.headers.host)) return res.status(403).json({ error: 'Host no permitido' });
    if (req.headers.origin && !origins.has(req.headers.origin)) {
      return res.status(403).json({ error: 'Origen no permitido' });
    }
    if (req.method === 'POST' && !req.is('application/json')) {
      return res.status(415).json({ error: 'Utiliza application/json' });
    }
    next();
  });
  app.use(cors({ origin: [...origins], methods: ['GET', 'POST'], allowedHeaders: ['Content-Type'] }));
  app.use(express.json({ limit: '32kb' }));
  app.use(express.static(path.join(__dirname, '..', 'public')));
  app.use('/print', createPrintRoutes(printer, onPrinterConnected));
  app.get('/health', (_req, res) => res.json({ service: 'printer-server', status: 'ok', printerConnected: printer.isPrinterOpen(), printer: printer.getConnection?.() || null }));
  app.use((error, _req, res, _next) => {
    const status = error.status >= 400 && error.status < 500 ? error.status : 500;
    console.error('Solicitud fallida:', status, status >= 500 ? error.message : 'Entrada rechazada');
    res.status(status).json({ error: error.message });
  });
  return app;
}
module.exports = { createApp };



