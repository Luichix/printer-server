// Marcar el PE como aplicación Windows para no crear una consola al abrirlo.
// Ejecutar antes de una futura firma digital: modificar el PE invalida su firma.
const fs = require('node:fs');
const path = require('node:path');
const file = path.resolve(__dirname, '../dist/windows/printer-server.exe');
const fd = fs.openSync(file, 'r+');
try {
  const dos = Buffer.alloc(64);
  fs.readSync(fd, dos, 0, dos.length, 0);
  if (dos.toString('ascii', 0, 2) !== 'MZ') throw new Error('Ejecutable inválido');
  const peOffset = dos.readUInt32LE(60);
  const header = Buffer.alloc(96);
  fs.readSync(fd, header, 0, header.length, peOffset);
  if (header.readUInt32LE(0) !== 0x4550 || ![0x10b, 0x20b].includes(header.readUInt16LE(24))) throw new Error('Cabecera PE inválida');
  const subsystem = Buffer.alloc(2);
  subsystem.writeUInt16LE(2);
  fs.writeSync(fd, subsystem, 0, 2, peOffset + 24 + 68);
  console.log('Ejecutable Windows preparado sin consola:', file);
} finally { fs.closeSync(fd); }
