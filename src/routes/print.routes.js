const express = require('express');
module.exports = function createPrintRoutes(printer) {
  const router = express.Router();
  router.get('/list', async (_req, res, next) => {
    try { res.json(await printer.listPorts()); } catch (error) { next(error); }
  });
  router.post('/select', async (req, res, next) => {
    const { path, baudRate = 19200 } = req.body || {};
    if (typeof path !== 'string' || !/^COM[1-9]\d*$/i.test(path) ||
        !Number.isInteger(baudRate) || baudRate < 1 || baudRate > 4000000) {
      return res.status(400).json({ error: 'Se requiere un puerto COM válido y baudRate entero positivo' });
    }
    try {
      await printer.connectPrinter(path, baudRate);
      res.json({ status: 'connected', path });
    } catch (error) { next(error); }
  });
  router.post('/', async (req, res, next) => {
    const { text, cut, openDrawer, path } = req.body || {};
    if (typeof text !== 'string' || !text.trim() || Buffer.byteLength(text) > 16384 ||
        /[\x00-\x08\x0b-\x1f\x7f]/.test(text) ||
        (cut !== undefined && typeof cut !== 'boolean') ||
        (openDrawer !== undefined && typeof openDrawer !== 'boolean') ||
        (path !== undefined && (typeof path !== 'string' || !/^COM[1-9]\d*$/i.test(path)))) {
      return res.status(400).json({ error: 'Texto u opciones inválidos (máximo 16 KiB, sin comandos de control)' });
    }
    if (!printer.isPrinterOpen()) return res.status(503).json({ error: 'Impresora no disponible' });
    try {
      await printer.printTicket(text, { cut, openDrawer, path });
      res.json({ status: 'sent' });
    } catch (error) { next(error); }
  });
  return router;
};

