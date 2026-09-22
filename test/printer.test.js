import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { request as httpRequest } from 'node:http';
import { Store, acquireLock } from '../src/services/store.js';
import { PrinterManager } from '../src/services/printer.service.js';
import { createApp } from '../src/app.js';

function setup(t, options = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'printer-test-'));
  class Port extends EventEmitter {
    static writes = [];
    static events = [];
    static openFailure = false;
    static drainFailure = false;
    static hangWrite = false;
    static async list() { return [{ path: 'COM1' }, { path: 'COM2' }]; }
    constructor(config) { super(); this.path = config.path; this.isOpen = false; }
    open(callback) { setImmediate(() => { if (Port.openFailure) return callback(new Error('Desconectada')); this.isOpen = true; this.emit('open'); callback(); }); }
    close(callback) { this.isOpen = false; this.emit('close'); setImmediate(callback); }
    write(data, callback) { Port.writes.push({ path: this.path, data }); Port.events.push('write'); if (!Port.hangWrite) setImmediate(callback); }
    drain(callback) { setTimeout(() => { Port.events.push('drain'); callback(Port.drainFailure ? new Error('Cable desconectado') : undefined); }, 5); }
  }
  const store = new Store(directory);
  const manager = new PrinterManager(store, { Port, ...options });
  t.after(async () => { await manager.shutdown(); fs.rmSync(directory, { recursive: true, force: true }); });
  return { directory, store, manager, Port };
}
const config = { id: 'receipt', name: 'Caja 1', path: 'COM1' };

test('persists multiple printers and default, reconnects after restart', async t => {
  const { manager, directory, Port } = setup(t);
  await manager.configure(config);
  await manager.configure({ ...config, id: 'second', path: 'COM2' });
  manager.setDefault('second');
  await manager.shutdown();
  const restored = new PrinterManager(new Store(directory), { Port });
  await restored.restore();
  assert.equal(restored.listPrinters().length, 2);
  assert.ok(restored.listPrinters().every(p => p.connected));
  assert.equal(restored.store.state.defaultPrinterId, 'second');
  await restored.shutdown();
});

test('connection failures never report connected; config is retained', async t => {
  const { manager, Port } = setup(t); Port.openFailure = true;
  await assert.rejects(manager.configure(config), /No se pudo conectar/);
  assert.equal(manager.listPrinters()[0].connected, false);
  assert.equal(manager.listPrinters()[0].path, 'COM1');
  Port.openFailure = false;
  await manager.reconnect('receipt');
  assert.equal(manager.listPrinters()[0].connected, true);
});

test('serializes write and drain, drawer is opt-in and command bytes are correct', async t => {
  const { manager, Port } = setup(t); await manager.configure(config);
  const first = manager.submit({ text: 'Primero', jobId: 'first' }, { wait: true });
  const second = manager.submit({ text: 'Segundo', openDrawer: true, jobId: 'second' }, { wait: true });
  assert.equal((await first).status, 'sent'); assert.equal((await second).status, 'sent');
  assert.deepEqual(Port.events, ['write', 'drain', 'write', 'drain']);
  assert.equal(Port.writes[0].data.includes(Buffer.from([0x1b, 0x70])), false);
  assert.deepEqual([...Port.writes[1].data.subarray(0, 5)], [0x1b, 0x70, 0, 0x19, 0xfa]);
  assert.deepEqual([...Port.writes[0].data.subarray(-4)], [0x1d, 0x56, 0x41, 0x30]);
});

test('same job is deduplicated during processing and across restart; conflicting content rejected', async t => {
  const { manager, Port, directory } = setup(t); await manager.configure(config);
  const payload = { text: 'Venta', jobId: 'sale-1' };
  manager.submit(payload);
  assert.equal((await manager.submit(payload, { wait: true })).status, 'sent');
  assert.equal(Port.writes.length, 1);
  assert.throws(() => manager.submit({ ...payload, text: 'Otra venta' }), /otro contenido/);
  const restored = new PrinterManager(new Store(directory), { Port });
  assert.equal(restored.submit(payload).status, 'sent');
  assert.equal(Port.writes.length, 1);
  await restored.shutdown();
});

test('drain failures and write timeouts are uncertain, never automatically replayed', async t => {
  const { manager, Port } = setup(t, { timeoutMs: 30 }); await manager.configure(config);
  Port.drainFailure = true;
  const payload = { text: 'Venta', jobId: 'uncertain' };
  assert.equal((await manager.submit(payload, { wait: true })).status, 'uncertain');
  assert.equal((await manager.submit(payload, { wait: true })).status, 'uncertain');
  assert.equal(Port.writes.length, 1);
  Port.drainFailure = false; Port.hangWrite = true;
  assert.equal((await manager.submit({ text: 'Otra', jobId: 'timeout' }, { wait: true })).status, 'uncertain');
});

test('jobs interrupted by a restart are marked without replaying', async t => {
  const { manager, store, Port } = setup(t);
  store.save({ ...store.state, jobs: [{ id: 'queued', status: 'queued' }, { id: 'sending', status: 'sending' }] });
  const restored = new PrinterManager(store, { Port });
  assert.equal(restored.getJob('queued').status, 'failed');
  assert.equal(restored.getJob('sending').status, 'uncertain');
  assert.equal(Port.writes.length, 0);
  await restored.shutdown();
});

test('validates ports, duplicate bindings, text commands, encoding, and queue limits', async t => {
  const { manager } = setup(t, { maxQueue: 1 });
  await assert.rejects(manager.configure({ ...config, path: '/tmp/arbitrary-file' }), /no está disponible/);
  await manager.configure({ ...config, encoding: 'latin1' });
  await assert.rejects(manager.configure({ ...config, id: 'duplicate' }), /otra impresora/);
  assert.throws(() => manager.submit({ text: '\x1bp' }), /control/);
  assert.throws(() => manager.submit({ text: '🙂' }), /codificación/);
  assert.throws(() => manager.submit({ text: 'ok', openDrawer: 'yes' }), /booleano/);
  const pending = manager.submit({ text: 'Venta' }, { wait: true });
  assert.throws(() => manager.submit({ text: 'Segunda' }), /llena/);
  await assert.rejects(manager.remove('receipt'), /pendiente/);
  await pending;
});

test('corrupt state is preserved and fails visibly', t => {
  const { directory } = setup(t);
  fs.writeFileSync(path.join(directory, 'state.json'), '{broken');
  assert.throws(() => new Store(directory), /Conserva el archivo/);
  assert.equal(fs.readFileSync(path.join(directory, 'state.json'), 'utf8'), '{broken');
});

test('HTTP authentication, origin and host restrictions; local UI and legacy routes', async t => {
  const { manager, store } = setup(t);
  const app = createApp(manager, { port: 4000, allowedOrigins: ['https://pos.example.com'] });
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  const base = `http://127.0.0.1:${server.address().port}`;
  const request = (url, headers = {}, method = 'GET', body) => new Promise((resolve, reject) => {
    const req = httpRequest(base + url, { method, headers: { Host: '127.0.0.1:4000', ...headers } }, res => {
      let text = '';
      res.setEncoding('utf8'); res.on('data', chunk => { text += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, headers: { get: name => res.headers[name] }, json: async () => JSON.parse(text) }));
    });
    req.on('error', reject); req.end(body);
  });
  assert.equal((await request('/')).status, 200);
  assert.equal((await request('/api/printers')).status, 401);
  const auth = { Authorization: `Bearer ${store.state.token}` };
  assert.equal((await request('/api/printers', auth)).status, 200);
  assert.equal((await request('/api/printers', { ...auth, Origin: 'https://evil.example' })).status, 403);
  assert.equal((await request('/api/printers', { ...auth, Host: 'evil.example:4000' })).status, 403);
  assert.equal((await request('/api/session', { Origin: 'https://pos.example.com' })).status, 403);
  assert.equal((await request('/api/session', { 'Sec-Fetch-Site': 'cross-site' })).status, 403);
  const cors = await request('/api/printers', { ...auth, Origin: 'https://pos.example.com' });
  assert.equal(cors.headers.get('access-control-allow-origin'), 'https://pos.example.com');
  assert.equal((await request('/api/session')).status, 200);
  const headers = { ...auth, 'Content-Type': 'application/json' };
  assert.equal((await request('/print/select', headers, 'POST', JSON.stringify({ path: 'COM1' }))).status, 200);
  const printed = await request('/print', headers, 'POST', JSON.stringify({ text: 'Legacy', jobId: 'legacy-sale' }));
  assert.equal(printed.status, 200); assert.equal((await printed.json()).status, 'sent');
  assert.equal((await request('/api/jobs', headers, 'POST', '{bad')).status, 400);
  assert.equal((await request('/api/settings', { ...headers, Origin: 'https://pos.example.com' }, 'POST', JSON.stringify({ allowedOrigins: [] }))).status, 403);
  assert.equal((await request('/api/settings', headers, 'POST', JSON.stringify({ allowedOrigins: ['https://new.example.com/path'] }))).status, 400);
  assert.equal((await request('/api/settings', headers, 'POST', JSON.stringify({ allowedOrigins: ['https://new.example.com'] }))).status, 200);
  assert.equal((await request('/api/printers', { ...auth, Origin: 'https://new.example.com' })).status, 200);
  assert.deepEqual(new Store(store.directory).state.allowedOrigins, ['https://new.example.com']);
  assert.equal((await request('/api/settings', headers, 'POST', JSON.stringify({ allowedOrigins: [] }))).status, 200);
  assert.equal((await request('/api/printers', { ...auth, Origin: 'https://new.example.com' })).status, 403);
});

test('only one agent can own a data directory', t => {
  const { directory } = setup(t);
  const release = acquireLock(directory);
  assert.throws(() => acquireLock(directory), /Ya hay un agente/);
  release();
  const releaseAgain = acquireLock(directory);
  releaseAgain();
});

test('shutdown waits for a connection in progress and stops startup restoration', async t => {
  const { manager, store, Port } = setup(t);
  store.save({ ...store.state, printers: [config, { ...config, id: 'second', path: 'COM2' }] });
  const restore = manager.restore();
  await manager.shutdown();
  await restore;
  assert.ok(manager.listPrinters().every(printer => !printer.connected));
  assert.equal(manager.ports.size, 0);
  await assert.rejects(manager.reconnect('receipt'), /cerrando/);
});
