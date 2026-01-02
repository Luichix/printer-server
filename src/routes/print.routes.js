const express = require('express');
const {
  connectPrinter,
  printTicket,
  isPrinterOpen,
  listPorts,
} = require('../services/printer.service.js');

const router = express.Router();

// Ver listado de impresoras
router.get('/list', async (_req, res) => {
  try {
    const ports = await listPorts();
    res.json(ports);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Seleccionar impresora
router.post('/select', (req, res) => {
  const { path, baudRate } = req.body;

  if (!path) {
    return res.status(400).json({ error: 'Puerto requerido' });
  }

  try {
    connectPrinter(path, baudRate);
    res.json({ status: 'connected', path });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Imprimir ticket
router.post('/', async (req, res) => {
  const { text } = req.body;

  if (!text) return res.status(400).json({ error: 'Texto requerido' });

  if (!isPrinterOpen()) {
    return res.status(503).json({ error: 'Impresora no disponible' });
  }

  try {
    await printTicket(text);
    res.json({ status: 'printed' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
