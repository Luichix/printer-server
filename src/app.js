const express = require('express');
const cors = require('cors');

const printRoutes = require('./routes/print.routes');
const scaleRoutes = require('./routes/scale.routes');

const app = express();

app.use(cors());
app.use(express.json());

app.use('/print', printRoutes);
app.use('/scale', scaleRoutes);

module.exports = app;
