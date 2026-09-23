const express = require('express');
const { prepareTicket } = require('../services/ticket-format');
module.exports = function createPrintRoutes(
  printer,
  onPrinterConnected = () => {},
) {
  const router = express.Router();
  router.get('/list', async (_req, res, next) => {
    try {
      res.json(await printer.listPorts());
    } catch (error) {
      next(error);
    }
  });
  router.post('/select', async (req, res, next) => {
    const { path, baudRate = 19200 } = req.body || {};
    if (
      typeof path !== 'string' ||
      !/^COM[1-9]\d*$/i.test(path) ||
      !Number.isInteger(baudRate) ||
      baudRate < 1 ||
      baudRate > 4000000
    ) {
      return res.status(400).json({
        error: 'Se requiere un puerto COM válido y baudRate entero positivo',
      });
    }
    try {
      await printer.connectPrinter(path, baudRate);
      let warning;
      try {
        await onPrinterConnected({ path, baudRate });
      } catch (error) {
        warning =
          'Conectada, pero no se pudo guardar la configuración. Revisa config.json y los registros.';
        console.error('No se pudo guardar la impresora:', error.message);
      }
      console.log('Impresora conectada:', path, baudRate);
      res.json({ status: 'connected', path, warning });
    } catch (error) {
      next(error);
    }
  });
  router.post('/', async (req, res, next) => {
    const { text, cut, openDrawer, path } = req.body || {};
    if (

      (cut !== undefined && typeof cut !== 'boolean') ||
      (openDrawer !== undefined && typeof openDrawer !== 'boolean') ||
      (path !== undefined &&
        (typeof path !== 'string' || !/^COM[1-9]\d*$/i.test(path)))
    ) {
      return res.status(400).json({
        error:
          'Opciones inválidas: cut y openDrawer deben ser booleanos; path debe ser un puerto COM',
      });
    }
    let ticket;
    try { ticket = prepareTicket(text); }
    catch (error) { return next(error); }
    if (!printer.isPrinterOpen())
      return res.status(503).json({ error: 'Impresora no disponible' });
    try {
      await printer.printTicket(ticket, { cut, openDrawer, path });
      console.log('Trabajo enviado a la impresora');
      res.json({ status: 'sent' });
    } catch (error) {
      next(error);
    }
  });
  return router;
};

