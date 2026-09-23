const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const dataDirectory = path.join(process.env.LOCALAPPDATA || os.homedir(), 'PrinterServer');
const configPath = path.join(dataDirectory, 'config.json');
const defaults = { port: 4000, openBrowser: true, allowedOrigins: [], printer: null };

function validate(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Configuración inválida');
  const config = { ...defaults, ...value };
  if (!Number.isInteger(config.port) || config.port < 1 || config.port > 65535) throw new Error('Puerto inválido en config.json');
  if (typeof config.openBrowser !== 'boolean') throw new Error('openBrowser debe ser true o false');
  if (!Array.isArray(config.allowedOrigins) || config.allowedOrigins.some(origin => {
    try { const url = new URL(origin); return !['http:', 'https:'].includes(url.protocol) || url.origin !== origin; }
    catch { return true; }
  })) throw new Error('allowedOrigins debe contener orígenes HTTP/HTTPS exactos, sin rutas');
  if (config.printer !== null && (typeof config.printer?.path !== 'string' || !/^COM[1-9]\d*$/i.test(config.printer?.path || '') ||
      !Number.isInteger(config.printer.baudRate) || config.printer.baudRate < 1 || config.printer.baudRate > 4000000)) {
    throw new Error('Configuración de impresora inválida');
  }
  return config;
}
function save(config) {
  fs.mkdirSync(dataDirectory, { recursive: true });
  const temporary = configPath + '.' + process.pid + '.tmp';
  fs.writeFileSync(temporary, JSON.stringify(validate(config), null, 2) + '\n');
  fs.renameSync(temporary, configPath);
}
function load() {
  if (!fs.existsSync(configPath)) save(defaults);
  return validate(JSON.parse(fs.readFileSync(configPath, 'utf8').replace(/^\uFEFF/, '')));
}
function rememberPrinter(printer) {
  // Leer de nuevo para conservar las ediciones manuales del usuario.
  save({ ...load(), printer });
}
function rememberOrigins(allowedOrigins) {
  save({ ...load(), allowedOrigins });
}
module.exports = { dataDirectory, configPath, load, rememberPrinter, rememberOrigins, validate };


