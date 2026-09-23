const express = require('express');
const { prepareTicket } = require('../services/ticket-format');
module.exports = function createPrintRoutes(
  printer,
  onPrinterConnected = () => {},
) {
  const router = express.Router();
  router.get('/jobs', (req, res) => {
    const jobs = printer.listJobs();
    if (req.query.page === undefined && req.query.pageSize === undefined) return res.json(jobs.slice(0, 100));
    const page = Number(req.query.page ?? 1);
    const pageSize = Number(req.query.pageSize ?? 10);
    if (!Number.isSafeInteger(page) || page < 1 || !Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 50) {
      return res.status(400).json({ error: 'Página inválida; pageSize debe estar entre 1 y 50.' });
    }
    const totalPages = Math.max(1, Math.ceil(jobs.length / pageSize));
    const currentPage = Math.min(page, totalPages);
    res.json({ items: jobs.slice((currentPage - 1) * pageSize, currentPage * pageSize), page: currentPage, pageSize, total: jobs.length, totalPages });
  });
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
  const handlePrint = localPanel => async (req, res, next) => {
    const { text, cut, openDrawer, path, jobId } = req.body || {};
    if (
      (jobId !== undefined && (typeof jobId !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(jobId))) ||
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
    if (localPanel && (typeof text !== 'string' || text.length > 4000 || text.replace(/\r\n?/g, '\n').split('\n').length > 4 || /[\x00-\x08\x0b-\x1f\x7f]/.test(text))) {
      return res.status(400).json({ error: 'La impresión local admite hasta 4 líneas y 4000 caracteres, sin comandos.' });
    }
    let ticket;
    try {
      ticket = prepareTicket(text);
    } catch (error) {
      return next(error);
    }
    try {
      const job = await printer.printTicket(ticket, { cut: localPanel ? false : cut, openDrawer: localPanel ? false : openDrawer, path, jobId, localPanel, scope: localPanel ? 'panel' : (req.headers.origin || 'local') });
      if (job && job.status !== 'sent') return res.status(503).json({ status: job.status, jobId: job.id, error: job.error || 'Trabajo no enviado' });
      console.log('Trabajo enviado a la impresora');
      res.json({ status: 'sent', ...(job ? { jobId: job.id } : {}) });
    } catch (error) {
      next(error);
    }
  };
  router.post('/local', handlePrint(true));
  router.post('/', handlePrint(false));
  return router;
};
