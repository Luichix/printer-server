import express from 'express';

export function createPrintRoutes(manager) {
  const router = express.Router();
  router.get('/list', async (_req, res) => res.json(await manager.listPorts()));
  router.post('/select', async (req, res) => {
    const { path, baudRate } = req.body || {};
    const existing = manager.store.state.printers.find(printer => printer.path === path);
    const printer = await manager.configure({ ...existing, path, baudRate: baudRate ?? existing?.baudRate ?? 19200, name: existing?.name || 'Impresora POS' });
    manager.setDefault(printer.id);
    res.json({ status: 'connected', path: printer.path, printerId: printer.id });
  });
  router.post('/', async (req, res) => {
    const job = await manager.submit(req.body || {}, { wait: true });
    res.status(job.status === 'sent' ? 200 : 503).json({ ...job, jobId: job.id });
  });
  return router;
}
