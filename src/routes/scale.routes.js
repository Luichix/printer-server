const express = require('express');
const { getLastWeight } = require('../services/scale.service');

const router = express.Router();

router.get('/weight', (req, res) => {
  const weight = getLastWeight();

  if (weight === null) {
    return res.status(404).send('❌ Sin lectura de báscula');
  }

  res.json({
    unit: 'lb',
    weight,
  });
});

module.exports = router;
