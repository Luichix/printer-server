const { test } = require('node:test');
const assert = require('node:assert/strict');
const { WindowsUsbPort } = require('../src/services/windows-usb');
const { createPrinterService } = require('../src/services/printer.service');
const { validate } = require('../src/desktop/settings');
const requests = [];
class Usb extends WindowsUsbPort {
  static async list() { return [{ path: 'USB001', name: 'Ticketera', type: 'usb' }]; }
  constructor(options) { super({ ...options, runCommand: async request => { requests.push(request); return { name: 'Ticketera' }; } }); }
}
class Serial { static async list() { return [{ path: 'COM4' }]; } }
test('USB: enumera, conecta, conserva bytes RAW y evita duplicados', async () => {
  const printer = createPrinterService(Serial, { UsbPort: Usb });
  assert.deepEqual((await printer.listPorts()).map(p => p.path), ['COM4', 'USB001']);
  await printer.connectPrinter('usb001');
  assert.equal(printer.getConnection().path, 'USB001');
  const options = { path: 'usb001', jobId: 'usb-ticket', openDrawer: true };
  assert.equal((await printer.printTicket('Hola', options)).status, 'sent');
  await printer.printTicket('Hola', options);
  const writes = requests.filter(r => r.action === 'print');
  assert.equal(writes.length, 1);
  assert.equal(writes[0].name, 'Ticketera');
  assert.deepEqual(Buffer.from(writes[0].data, 'base64'), Buffer.concat([Buffer.from([27,112,0,25,250]), Buffer.from('Hola\n\n'), Buffer.from([29,86,65,0])]));
  await printer.close();
  assert.equal(printer.isPrinterOpen(), false);
});
test('USB: fallos de envio quedan inciertos y no se reintentan', async () => {
  class Broken extends Usb { write(data, cb) { cb(new Error('Cola no disponible')); } }
  const printer = createPrinterService(Serial, { UsbPort: Broken });
  await printer.connectPrinter('USB001');
  assert.equal((await printer.printTicket('Hola', { jobId: 'fallo' })).status, 'uncertain');
  assert.equal(printer.isPrinterOpen(), false);
  assert.equal((await printer.printTicket('Hola', { jobId: 'fallo' })).status, 'uncertain');
  await printer.close();
});
test('configuracion admite USB y rechaza rutas arbitrarias', () => {
  assert.equal(validate({ printer: { path: 'USB001', baudRate: 19200 } }).printer.path, 'USB001');
  assert.throws(() => validate({ printer: { path: 'USB001;exit', baudRate: 19200 } }));
});

test('API USB: seleccion, persistencia y destino de impresion', async t => {
  const { createApp } = require('../src/app');
  let remembered;
  const printer = createPrinterService(Serial, { UsbPort: Usb });
  const server = createApp({ printer, onPrinterConnected: value => { remembered = value; } }).listen(0, 'localhost');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(async () => { await printer.close(); await new Promise(resolve => server.close(resolve)); });
  const url = 'http://localhost:' + server.address().port;
  const post = (route, body) => new Promise((resolve, reject) => {
    const req = require('node:http').request(url + route, { method: 'POST', headers: { Host: 'localhost:4000', Origin: 'http://localhost:4000', 'Content-Type': 'application/json' } }, res => { res.resume(); res.on('end', () => resolve({ status: res.statusCode })); });
    req.on('error', reject); req.end(JSON.stringify(body));
  });
  assert.equal((await post('/print/select', { path: 'USB001' })).status, 200);
  assert.deepEqual(remembered, { path: 'USB001', baudRate: 19200 });
  assert.equal((await post('/print', { path: 'USB001', text: 'USB' })).status, 200);
  assert.equal((await post('/print/select', { path: 'USB001;exit' })).status, 400);
});

test('USB: apertura tardia cancelada no bloquea reconexion ni queda activa', async () => {
  let complete;
  let attempts = 0;
  const instances = [];
  class SlowUsb extends WindowsUsbPort {
    constructor(options) {
      super({ ...options, runCommand: () => ++attempts === 1 ? new Promise(resolve => { complete = resolve; }) : Promise.resolve({ name: 'Ticketera' }) });
      this.operationTimeoutMs = 20;
      instances.push(this);
    }
  }
  const printer = createPrinterService(Serial, { UsbPort: SlowUsb });
  await assert.rejects(printer.connectPrinter('USB001'), /Tiempo de espera/);
  await printer.connectPrinter('USB001');
  complete({ name: 'Ticketera' });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(instances[0].isOpen, false);
  assert.equal(printer.isPrinterOpen(), true);
  await printer.close();
});
