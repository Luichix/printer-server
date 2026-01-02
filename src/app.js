// app.js
const express = require('express');
const cors = require('cors');

// Importar rutas con require (CommonJS)
const printRoutes = require('./routes/print.routes.js');

const app = express();

app.use(cors());
app.use(express.json());

// Rutas
app.use('/print', printRoutes);

module.exports = app;
