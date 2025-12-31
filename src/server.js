const app = require('./app');

const PORT = 4000;

app.listen(PORT, () => {
  console.log(`🖨️⚖️ Servidor local activo en http://localhost:${PORT}`);
});
