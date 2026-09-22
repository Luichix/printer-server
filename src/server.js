const { createApp } = require('./app');
const printer = require('./services/printer.service');
const port = Number(process.env.PORT || 4000);
if (!Number.isInteger(port) || port < 1 || port > 65535)
  throw new Error('PORT inválido');
const allowedOrigins = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);
const server = createApp({ port, allowedOrigins }).listen(
  port,
  '127.0.0.1',
  () => {
    const url = 'http://127.0.0.1:' + port;
    console.log('Servidor de impresión: ' + url);
    if (process.env.OPEN_BROWSER !== 'false') {
      require('open')(url).catch((error) =>
        console.error('Abre la dirección manualmente:', error.message),
      );
    }
  },
);
server.on('error', (error) => {
  console.error(
    error.code === 'EADDRINUSE'
      ? 'El puerto está ocupado. Cierra la otra instancia o cambia PORT.'
      : error.message,
  );
  process.exitCode = 1;
});
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => {
    server.close();
    printer.close().catch((error) => console.error(error.message));
  });
}
