// Compatibilidad de recibos de texto con ESC ! n (modo de impresión).
// No es un endpoint de datos binarios arbitrarios.
const MAX_TICKET_BYTES = 16384;
function invalid(message) {
  const error = new Error(message);
  error.status = 400;
  return error;
}
function prepareTicket(text) {
  if (typeof text !== 'string') throw invalid('text debe ser una cadena de texto');
  if (Buffer.byteLength(text, 'utf8') > MAX_TICKET_BYTES) throw invalid('El ticket supera el máximo de 16 KiB');
  const chunks = [];
  let plain = '';
  let printable = '';
  let hasMode = false;
  function flush() {
    const normalized = plain.replace(/\r\n?/g, '\n');
    printable += normalized;
    chunks.push(Buffer.from(normalized, 'utf8'));
    plain = '';
  }
  for (let index = 0; index < text.length; index++) {
    const code = text.charCodeAt(index);
    if (code === 0x1b) {
      if (text[index + 1] !== '!' || index + 2 >= text.length || text.charCodeAt(index + 2) > 255) {
        throw invalid('Comando ESC/POS no compatible. En text solo se admite ESC ! n; envía corte y gaveta mediante sus opciones.');
      }
      flush();
      chunks.push(Buffer.from([0x1b, 0x21, text.charCodeAt(index + 2)]));
      hasMode = true;
      index += 2;
    } else {
      if ((code < 32 && ![9, 10, 13].includes(code)) || code === 127) {
        throw invalid('Carácter de control no compatible: 0x' + code.toString(16).padStart(2, '0'));
      }
      plain += text[index];
    }
  }
  flush();
  if (!printable.trim()) throw invalid('El ticket debe contener texto imprimible');
  // Evitar que un recibo deje otro modo de fuente para el siguiente cliente.
  if (hasMode) return Buffer.concat([Buffer.from([27, 33, 0]), ...chunks, Buffer.from([27, 33, 0])]);
  return printable;
}
module.exports = { prepareTicket };

