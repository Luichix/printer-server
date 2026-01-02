// src/services/printer.service.js
import { SerialPort } from 'serialport';

let printerPort = null;

// ESC/POS
const CUT = '\x1DVA0';
const OPEN_DRAWER = '\x1B\x70\x00\x19\xFA';

/**
 * Conecta la impresora al puerto especificado
 * @param {string} path
 * @param {number} baudRate
 */
export function connectPrinter(path, baudRate = 19200) {
  if (printerPort && printerPort.isOpen) {
    printerPort.close(); // cerrar puerto anterior si estaba abierto
  }

  printerPort = new SerialPort({
    path,
    baudRate,
    dataBits: 8,
    stopBits: 1,
    parity: 'none',
    autoOpen: true,
  });

  printerPort.on('open', () => {
    console.log(`✅ Impresora conectada en ${path}`);
  });

  printerPort.on('error', (err) => {
    console.error('❌ Error en la impresora:', err.message);
  });

  return printerPort;
}

/**
 * Envía un ticket a la impresora
 * @param {string} text
 */
export function printTicket(text) {
  return new Promise((resolve, reject) => {
    if (!printerPort || !printerPort.isOpen) {
      return reject(new Error('Impresora no disponible'));
    }

    const ticket = `${text}\n\n${CUT}${OPEN_DRAWER}`;

    printerPort.write(ticket, (err) => {
      if (err) return reject(err);
      resolve();
    });
  });
}

/**
 * Ver estado actual
 */
export function isPrinterOpen() {
  return printerPort?.isOpen ?? false;
}

export async function listPorts() {
  const ports = await SerialPort.list();
  return ports.map((p) => ({
    path: p.path,
    manufacturer: p.manufacturer,
    serialNumber: p.serialNumber,
    vendorId: p.vendorId,
    productId: p.productId,
  }));
}
