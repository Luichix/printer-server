import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { randomBytes } from 'node:crypto';

export function defaultDataDir() {
  if (process.env.PRINTER_DATA_DIR) return process.env.PRINTER_DATA_DIR;
  if (process.platform === 'win32') return path.join(process.env.LOCALAPPDATA || os.homedir(), 'PrinterServer');
  if (process.platform === 'darwin') return path.join(os.homedir(), 'Library', 'Application Support', 'PrinterServer');
  return path.join(process.env.XDG_DATA_HOME || path.join(os.homedir(), '.local', 'share'), 'printer-server');
}

export class Store {
  constructor(directory) {
    this.directory = directory;
    fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
    this.file = path.join(directory, 'state.json');
    try {
      this.state = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      if (this.state.version !== 1 || !Array.isArray(this.state.printers) || !Array.isArray(this.state.jobs) || typeof this.state.token !== 'string' || !this.state.token) {
        throw new Error('Formato de configuración inválido');
      }
    } catch (error) {
      if (error.code !== 'ENOENT') throw new Error(`No se pudo leer ${this.file}. Conserva el archivo para recuperarlo. ${error.message}`);
      this.state = { version: 1, token: randomBytes(32).toString('hex'), printers: [], defaultPrinterId: null, jobs: [] };
      this.save(this.state);
    }
  }

  save(next) {
    // Replace in the same directory: a partial write never replaces the previous state.
    const temporary = `${this.file}.tmp`;
    const descriptor = fs.openSync(temporary, 'w', 0o600);
    try {
      fs.writeFileSync(descriptor, JSON.stringify(next, null, 2));
      fs.fsyncSync(descriptor);
    } finally {
      fs.closeSync(descriptor);
    }
    fs.renameSync(temporary, this.file);
    this.state = next;
  }
}

// A data directory has one owner, even if a second process chooses another port.
export function acquireLock(directory) {
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  const file = path.join(directory, 'agent.lock');
  const owner = `${process.pid}`;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      fs.writeFileSync(file, owner, { flag: 'wx', mode: 0o600 });
      return () => {
        if (fs.existsSync(file) && fs.readFileSync(file, 'utf8') === owner) fs.unlinkSync(file);
      };
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      const pid = Number(fs.readFileSync(file, 'utf8'));
      if (!Number.isInteger(pid) || pid <= 0) throw new Error(`El bloqueo ${file} es inválido. Verifica que no haya otro agente abierto antes de quitarlo.`);
      try { process.kill(pid, 0); } catch (probeError) {
        if (probeError.code === 'ESRCH' && attempt === 0) { fs.unlinkSync(file); continue; }
      }
      throw new Error('Ya hay un agente usando esta configuración. Abre su panel local.');
    }
  }
}
