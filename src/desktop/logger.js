const fs = require('node:fs');
const path = require('node:path');
const util = require('node:util');

module.exports = function installLogger(directory) {
  fs.mkdirSync(directory, { recursive: true });
  const file = path.join(directory, 'printer-server.log');
  for (const level of ['log', 'warn', 'error']) {
    const original = console[level].bind(console);
    console[level] = (...args) => {
      const line = new Date().toISOString() + ' [' + level.toUpperCase() + '] ' + util.format(...args) + '\n';
      try {
        if (fs.existsSync(file) && fs.statSync(file).size > 2 * 1024 * 1024) {
          fs.rmSync(file + '.1', { force: true });
          fs.renameSync(file, file + '.1');
        }
        fs.appendFileSync(file, line);
      } catch (error) { original('No se pudo guardar el registro:', error.message); }
      original(...args);
    };
  }
};
