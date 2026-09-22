const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { createPrinterService } = require('../src/services/printer.service');

class Port extends EventEmitter {
  static instances = [];
  constructor({ path }) { super(); this.path = path; this.isOpen = false; Port.instances.push(this); }
  open(cb) { setImmediate(() => { this.isOpen = this.path !== 'COM99'; cb(this.isOpen ? null : new Error('Puerto inexistente')); }); }
  close(cb) { this.isOpen = false; cb(); }
  write(data, cb) { this.data = data; cb(); }
  drain(cb) { setImmediate(() => { this.drained = true; cb(); }); }
}
test('espera apertura, envía bytes correctos y espera drain', async () => {
  const printer = createPrinterService(Port);
  const connecting = printer.connectPrinter('COM4');
  assert.equal(printer.isPrinterOpen(), false);
  await connecting;
  await printer.printTicket('Hola', { openDrawer: true });
  const port = Port.instances.at(-1);
  assert.deepEqual(port.data, Buffer.concat([Buffer.from('Hola\n\n'), Buffer.from([29,86,65,0,27,112,0,25,250])]));
  assert.equal(port.drained, true);
  await printer.printTicket('Hola');
  assert.equal(port.data.includes(Buffer.from([27,112])), false);
  await printer.close();
});
test('fallo de apertura no deja conexión activa y la cola se recupera', async () => {
  const printer = createPrinterService(Port);
  await assert.rejects(printer.connectPrinter('COM99'));
  assert.equal(printer.isPrinterOpen(), false);
  await printer.connectPrinter('COM4');
  await assert.rejects(printer.printTicket('Hola', { path: 'COM5' }), /cambió/);
  await printer.printTicket('Hola', { path: 'COM4' });
  await printer.close();
});
test('la cola termina impresión antes de cambiar de puerto', async () => {
  const printer = createPrinterService(Port);
  await printer.connectPrinter('COM4');
  const original = Port.instances.at(-1);
  await Promise.all([printer.printTicket('Ticket'), printer.connectPrinter('COM5')]);
  assert.equal(original.drained, true);
  assert.equal(original.isOpen, false);
  assert.equal(Port.instances.at(-1).path, 'COM5');
  await printer.close();
});
test('propaga fallos de escritura y drenaje sin bloquear próximos envíos', async () => {
  const printer = createPrinterService(Port);
  await printer.connectPrinter('COM4');
  const port = Port.instances.at(-1);
  port.write = (_data, cb) => cb(new Error('Desconectada'));
  await assert.rejects(printer.printTicket('Ticket'), /Desconectada/);
  port.write = Port.prototype.write;
  port.drain = cb => cb(new Error('Fallo al drenar'));
  await assert.rejects(printer.printTicket('Ticket'), /drenar/);
  port.drain = Port.prototype.drain;
  await printer.printTicket('Recuperado');
  await printer.close();
});

