const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('../src/app');
const http = require('node:http');

// HTTP permite enviar Host explícito para probar protección contra DNS rebinding.
function fetch(url, options = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request(url, { method: options.method, headers: options.headers }, res => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => resolve({
        status: res.statusCode,
        headers: { get: name => res.headers[name.toLowerCase()] },
        json: async () => JSON.parse(body),
      }));
      res.on('error', reject);
    });
    req.on('error', reject);
    req.end(options.body);
  });
}

test('API: interfaz, validación, orígenes y errores reales de conexión', async t => {
  let connected = false;
  const sent = [];
  const printer = {
    isPrinterOpen: () => connected,
    listPorts: async () => [{ path: 'COM4' }],
    connectPrinter: async path => { connected = false; if (path === 'COM99') throw new Error('No existe'); connected = true; },
    printTicket: async (...args) => sent.push(args),
  };
  const server = createApp({ printer, allowedOrigins: ['https://pos.example.com'] }).listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const url = 'http://127.0.0.1:' + server.address().port;
  const request = (path, body, headers = {}) => fetch(url + path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { Host: '127.0.0.1:4000', ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  assert.equal((await request('/')).status, 200);
  assert.equal((await request('/health')).status, 200);
  const preflight = await fetch(url + '/print', { method: 'OPTIONS', headers: {
    Host: '127.0.0.1:4000', Origin: 'https://pos.example.com',
    'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type',
  } });
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get('access-control-allow-origin'), 'https://pos.example.com');
  assert.equal((await request('/health', undefined, { Host: 'attacker.example:4000' })).status, 403);
  assert.equal((await request('/print', { text: 'Hola' }, { Origin: 'https://unknown.example' })).status, 403);
  assert.equal((await request('/print', { text: 'Hola' }, { 'Content-Type': 'text/plain' })).status, 415);
  assert.equal((await request('/print', { text: 'Hola' })).status, 503);
  assert.equal((await request('/print/select', { path: 'COM4', baudRate: '19200' })).status, 400);
  assert.equal((await request('/print/select', { path: 'COM99' })).status, 500);
  assert.equal((await request('/health').then(r => r.json())).printerConnected, false);
  assert.equal((await request('/print/select', { path: 'COM4' })).status, 200);
  for (const text of [12, ' ', '\u001btest', 'a'.repeat(16385)]) {
    assert.equal((await request('/print', { text })).status, 400);
  }
  const result = await request('/print', { text: 'Hola', path: 'COM4' }, { Origin: 'https://pos.example.com' });
  assert.equal(result.headers.get('access-control-allow-origin'), 'https://pos.example.com');
  assert.deepEqual(await result.json(), { status: 'sent' });
  assert.equal(sent.length, 1);
});

