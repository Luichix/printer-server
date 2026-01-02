const app = require('./app.js');

const PORT = 4000;
app.listen(PORT, () => {
  console.log(`🖨️ Servidor activo en http://localhost:${PORT}`);
});
