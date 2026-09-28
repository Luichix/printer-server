const { EventEmitter } = require('node:events');
const { execFile } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
function run(request) {
  if (process.platform !== 'win32') return Promise.reject(new Error('USB00 requiere Windows'));
  const script = fs.readFileSync(path.join(__dirname, 'windows-usb.ps1'), 'utf8');
  return new Promise((resolve, reject) => {
    const child = execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')],
      { windowsHide: true, timeout: 30000, maxBuffer: 1024 * 1024, encoding: 'utf8' }, (error, stdout, stderr) => {
        if (error) return reject(new Error(error.killed ? 'Windows no respondio en 30 segundos. Comprueba la cola de impresion y vuelve a conectar.' : (stderr.trim() || error.message)));
        try { resolve(JSON.parse(stdout.replace(/^\uFEFF/, '').trim())); } catch (error) { reject(error); }
      });
    child.stdin.on('error', () => {});
    child.stdin.end(JSON.stringify(request));
  });
}
class WindowsUsbPort extends EventEmitter {
  static async list() { return process.platform === 'win32' ? run({ action: 'list' }) : []; }
  constructor({ path: destination, runCommand = run }) {
    super(); this.path = destination.toUpperCase(); this.run = runCommand; this.isOpen = false; this.operationTimeoutMs = 35000; this.openAttempt = 0;
  }
  cancelOpen() { this.openAttempt++; this.isOpen = false; }
  open(callback) {
    const attempt = ++this.openAttempt;
    this.run({ action: 'open', path: this.path }).then(result => {
      if (attempt !== this.openAttempt) return callback(new Error('Apertura USB cancelada'));
      this.name = result.name; this.isOpen = true; this.emit('open'); callback();
    }, callback);
  }
  write(data, callback) {
    if (!this.isOpen) return callback(new Error('Impresora USB no conectada'));
    this.run({ action: 'print', path: this.path, name: this.name, data: data.toString('base64') }).then(() => callback(), callback);
  }
  drain(callback) { callback(); }
  close(callback) { this.cancelOpen(); callback(); }
}
module.exports = { WindowsUsbPort };
