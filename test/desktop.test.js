import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { once } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

for (const mode of ['shutdown', 'parent-exit']) {
  test(`desktop process stops cleanly on ${mode}`, { timeout: 15000 }, async t => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'printer-desktop-'));
    const reservation = createServer();
    reservation.listen(0, '127.0.0.1');
    await once(reservation, 'listening');
    const port = reservation.address().port;
    await new Promise(resolve => reservation.close(resolve));
    const child = spawn(process.execPath, [fileURLToPath(new URL('../src/server.js', import.meta.url)), '--desktop'], {
      env: { ...process.env, PORT: String(port), PRINTER_DATA_DIR: directory, PRINTER_ALLOWED_ORIGINS: '' },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const closed = once(child, 'close');
    t.after(async () => {
      if (child.exitCode === null && child.signalCode === null) child.kill();
      await closed;
      fs.rmSync(directory, { recursive: true, force: true });
    });
    let stderr = '';
    child.stderr.on('data', chunk => { stderr += chunk; });
    await new Promise((resolve, reject) => {
      let output = '';
      const timeout = setTimeout(() => reject(new Error(`No inició: ${stderr}`)), 8000);
      child.stdout.on('data', chunk => {
        output += chunk;
        if (output.includes('PRINTER_SERVER_READY')) { clearTimeout(timeout); resolve(); }
      });
      child.once('error', error => { clearTimeout(timeout); reject(error); });
      child.once('exit', code => { clearTimeout(timeout); reject(new Error(`Cierre anticipado ${code}: ${stderr}`)); });
    });
    assert.ok(fs.existsSync(path.join(directory, 'agent.lock')));
    if (mode === 'shutdown') child.stdin.write('shutdown\n');
    child.stdin.end();
    const [code, signal] = await closed;
    assert.equal(signal, null);
    assert.equal(code, 0, stderr);
    assert.equal(fs.existsSync(path.join(directory, 'agent.lock')), false);
    assert.ok(fs.existsSync(path.join(directory, 'state.json')));
  });
}
