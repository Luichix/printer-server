const path = require('node:path');
const { spawn } = require('node:child_process');
const settings = require('./desktop/settings');
const { startTray, showError } = require('./desktop/tray');
const claimInstance = require('./desktop/instance');
const logsDirectory = path.join(settings.dataDirectory, 'logs');
const desktop =
  process.platform === 'win32' &&
  (Boolean(process.pkg) || process.env.PRINTER_TRAY === 'true');
let server, instance, tray, printer;
let stopping = false;
let failing = false;
let url;
let pendingOpen = false;

function openPanel() {
  if (!url || !server?.listening) {
    pendingOpen = true;
    return;
  }
  require('open')(url).catch((error) =>
    console.error('No se pudo abrir el panel:', error.message),
  );
}
async function shutdown(code = 0) {
  if (stopping) return;
  stopping = true;
  console.log('Cerrando Printer Server');
  const deadline = setTimeout(() => process.exit(code), 5000);
  tray?.kill();
  instance?.close();
  if (server) {
    await new Promise((resolve) => {
      server.close(resolve);
      server.closeIdleConnections();
    });
  }
  if (printer)
    await printer.close().catch((error) => console.error(error.message));
  clearTimeout(deadline);
  process.exit(code);
}
async function fatal(error) {
  if (failing || stopping) return;
  failing = true;
  console.error(error.stack || error.message || error);
  if (desktop) {
    const dialog = showError(
      'Printer Server debe cerrarse.\n\n' +
        error.message +
        '\n\nRegistros: ' +
        logsDirectory,
    );
    await new Promise((resolve) => {
      dialog.once('exit', resolve);
      dialog.once('error', resolve);
      setTimeout(resolve, 10000).unref();
    });
  }
  await shutdown(1);
}
function trayAction(action) {
  if (action === 'open') openPanel();
  else if (action === 'quit') void shutdown();
  else if (action === 'status') {
    showError(
      'Servicio local activo\n' +
        url +
        '\nImpresora: ' +
        (printer.isPrinterOpen() ? 'conectada' : 'sin conexión'),
    );
  } else if (action === 'logs') {
    require('open')(logsDirectory).catch((error) =>
      console.error(error.message),
    );
  } else if (action === 'config') {
    const editor = spawn('notepad.exe', [settings.configPath], {
      windowsHide: true,
      stdio: 'ignore',
    });
    editor.on('error', (error) =>
      console.error('No se pudo abrir la configuración:', error.message),
    );
  }
}
async function main() {
  instance = await claimInstance(settings.dataDirectory, openPanel);
  if (!instance) return;
  require('./desktop/logger')(logsDirectory);
  const config = settings.load();
  const effective = settings.validate({
    ...config,
    port: process.env.PORT ? Number(process.env.PORT) : config.port,
    allowedOrigins:
      process.env.ALLOWED_ORIGINS !== undefined
        ? process.env.ALLOWED_ORIGINS.split(',')
            .map((value) => value.trim())
            .filter(Boolean)
        : config.allowedOrigins,
  });
  printer = require('./services/printer.service').createPrinterService(undefined, {
    store: require('./services/job-store').createJobStore(settings.dataDirectory),
  });
  const { createApp } = require('./app');
  url = 'http://localhost:' + effective.port;
  server = createApp({
    port: effective.port,
    allowedOrigins: effective.allowedOrigins,
    printer,
    onPrinterConnected: settings.rememberPrinter,
    onOriginsChanged: settings.rememberOrigins,
    originsReadOnly: process.env.ALLOWED_ORIGINS !== undefined,
  }).listen(effective.port, 'localhost');
  await new Promise((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
  server.on('error', (error) => void fatal(error));
  console.log('Servidor de impresión:', url);
  if (desktop) {
    tray = await startTray(settings.dataDirectory, trayAction, () => {
      if (!stopping)
        void fatal(
          new Error('La bandeja del sistema se cerró inesperadamente'),
        );
    });
  }
  if (config.printer) {
    printer
      .connectPrinter(config.printer.path, config.printer.baudRate)
      .then(() => console.log('Impresora restaurada:', config.printer.path))
      .catch((error) =>
        console.warn('No se pudo restaurar la impresora:', error.message),
      );
  }
  if (
    pendingOpen ||
    (!process.argv.includes('--background') &&
      (process.env.OPEN_BROWSER !== undefined
        ? process.env.OPEN_BROWSER !== 'false'
        : config.openBrowser))
  )
    openPanel();
}
for (const signal of ['SIGINT', 'SIGTERM'])
  process.once(signal, () => void shutdown());
process.once('uncaughtException', (error) => void fatal(error));
process.once(
  'unhandledRejection',
  (error) =>
    void fatal(error instanceof Error ? error : new Error(String(error))),
);
main().catch((error) => void fatal(error));
