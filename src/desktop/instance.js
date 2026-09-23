const net = require('node:net');
const crypto = require('node:crypto');

module.exports = function claimInstance(directory, onOpen) {
  const id = crypto.createHash('sha256').update(directory.toLowerCase()).digest('hex').slice(0, 24);
  const pipe = '\\\\.\\pipe\\printer-server-' + id;
  return new Promise((resolve, reject) => {
    const server = net.createServer(socket => {
      socket.on('error', () => {});
      socket.setTimeout(3000, () => socket.destroy());
      socket.once('data', data => {
        if (data.toString() === 'open') { onOpen(); socket.end('ok'); }
        else socket.destroy();
      });
    });
    server.once('error', error => {
      if (error.code !== 'EADDRINUSE') return reject(error);
      const client = net.connect(pipe, () => client.write('open'));
      client.setTimeout(5000, () => client.destroy(new Error('La instancia existente no responde')));
      client.once('data', data => {
        client.destroy();
        if (data.toString() === 'ok') resolve(null);
        else reject(new Error('Respuesta inválida de la instancia existente'));
      });
      client.once('error', reject);
      client.once('close', () => reject(new Error('La instancia cerró la conexión')));
    });
    server.listen(pipe, () => resolve(server));
  });
};

