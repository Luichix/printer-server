const { SerialPort } = require('serialport');
const { ReadlineParser } = require('@serialport/parser-readline');
const config = require('../config/serial.config');
const { extractWeightLb } = require('../utils/weight.parser');

let lastWeight = null;

const scalePort = new SerialPort({
  path: config.scale.path,
  baudRate: config.scale.baudRate,
  dataBits: 8,
  stopBits: 1,
  parity: 'none',
});

const parser = scalePort.pipe(new ReadlineParser({ delimiter: '\r\n' }));

parser.on('data', (line) => {
  const weight = extractWeightLb(line);
  if (weight !== null) {
    lastWeight = weight;
    console.log('⚖️ Peso capturado:', weight, 'lb');
  }
});

function getLastWeight() {
  return lastWeight;
}

module.exports = {
  getLastWeight,
};
