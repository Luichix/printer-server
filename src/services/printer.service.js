const { SerialPort } = require('serialport');
const config = require('../config/serial.config');

const printerPort = new SerialPort({
  path: config.printer.path,
  baudRate: config.printer.baudRate,
  dataBits: 8,
  stopBits: 1,
  parity: 'none',
});

// ESC/POS
const CUT = '\x1DVA0';
const OPEN_DRAWER = '\x1B\x70\x00\x19\xFA';

function printTicket(text) {
  return new Promise((resolve, reject) => {
    const ticket = `${text}\n\n${CUT}${OPEN_DRAWER}`;

    printerPort.write(ticket, (err) => {
      if (err) return reject(err);
      resolve();
    });
  });
}

module.exports = {
  printTicket,
};
