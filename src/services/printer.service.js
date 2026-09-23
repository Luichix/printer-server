const { SerialPort } = require('serialport');

function createPrinterService(Port = SerialPort) {
  let port = null;
  let queue = Promise.resolve();
  // Serializar conexión e impresión para no cambiar de puerto durante un envío.
  function enqueue(action) {
    const result = queue.then(action);
    queue = result.catch(() => {});
    return result;
  }
  const call = (target, method, ...args) =>
    new Promise((resolve, reject) => {
      target[method](...args, (error) => (error ? reject(error) : resolve()));
    });
  return {
    isPrinterOpen: () => port?.isOpen ?? false,
    getConnection: () =>
      port?.isOpen ? { path: port.path, baudRate: port.baudRate } : null,
    connectPrinter: (path, baudRate = 19200) =>
      enqueue(async () => {
        if (port?.isOpen) await call(port, 'close');
        port = null;
        const candidate = new Port({
          path,
          baudRate,
          dataBits: 8,
          stopBits: 1,
          parity: 'none',
          autoOpen: false,
        });
        candidate.on('error', (error) =>
          console.error('Error de impresora:', error.message),
        );
        await call(candidate, 'open');
        port = candidate;
      }),
    printTicket: (text, { openDrawer = false, cut = true, path } = {}) =>
      enqueue(async () => {
        if (!port?.isOpen) throw new Error('Impresora no disponible');
        if (path && port.path !== path)
          throw new Error('La impresora seleccionada cambió');
        // Comandos binarios: UTF-8 convertiría 0xFA en dos bytes.
        const payload = Buffer.concat([
          (Buffer.isBuffer(text) ? text : Buffer.from(text, 'utf8')),
          Buffer.from('\n\n'),
          cut ? Buffer.from([0x1d, 0x56, 0x41, 0]) : Buffer.alloc(0),
          openDrawer
            ? Buffer.from([0x1b, 0x70, 0, 0x19, 0xfa])
            : Buffer.alloc(0),
        ]);
        await call(port, 'write', payload);
        await call(port, 'drain');
      }),
    close: () =>
      enqueue(async () => {
        if (port?.isOpen) await call(port, 'close');
        port = null;
      }),
    listPorts: async () =>
      (await Port.list()).map(
        ({ path, manufacturer, serialNumber, vendorId, productId }) => ({
          path,
          manufacturer,
          serialNumber,
          vendorId,
          productId,
        }),
      ),
  };
}
module.exports = { ...createPrinterService(), createPrinterService };

