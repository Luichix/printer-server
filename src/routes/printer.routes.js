const express = require('express');
const { printTicket } = require('../services/printer.service');

const router = express.Router();

router.post('/', async (req, res) => {
  try {
    const { text } = req.body;
    await printTicket(text);
    res.send('✅ Ticket impreso');
  } catch (err) {
    console.error(err);
    res.status(500).send('❌ Error al imprimir');
  }
});

module.exports = router;
