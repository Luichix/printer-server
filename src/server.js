// src/server.js
const app = require('./app');
const open = require('open');
const http = require('http');

const PORT = 4000;
const URL = `http://localhost:${PORT}`;

/**
 * Verifica si el servidor ya está activo
 */
function isServerRunning() {
  return new Promise((resolve) => {
    const req = http.get(`${URL}/health`, (res) => {
      resolve(res.statusCode === 200);
    });

    req.on('error', () => resolve(false));
    req.setTimeout(800, () => {
      req.destroy();
      resolve(false);
    });
  });
}

(async () => {
  const running = await isServerRunning();

  if (running) {
    // 🟢 Ya está activo → solo abrir la UI
    open(URL);
    return;
  }

  // 🚀 Iniciar servidor
  app.listen(PORT, () => {
    console.log(`🖨️ Servidor activo en ${URL}`);
    open(URL);
  });
})();
