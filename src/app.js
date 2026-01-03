// app.js
const express = require('express');
const cors = require('cors');
const path = require('path');

// Importar rutas con require (CommonJS)
const printRoutes = require('./routes/print.routes.js');

const app = express();

app.use(cors());
app.use(express.json());
// Servir carpeta public
app.use(express.static(path.join(__dirname, 'public')));

// Rutas
app.use('/print', printRoutes);

app.get('/health', (_req, res) => {
  res.sendStatus(200);
});

module.exports = app;
