import express from 'express';
import cors from 'cors';

import printRoutes from './routes/print.routes.js';

const app = express();

app.use(cors());
app.use(express.json());

app.use('/print', printRoutes);

export default app;
