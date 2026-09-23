const { SerialPort } = require('serialport');
const { createHash, randomUUID } = require('node:crypto');
const failure = (status, message) =>
  Object.assign(new Error(message), { status });
function createPrinterService(
  Port = SerialPort,
  {
    store,
    timeoutMs = 10000,
    maxQueue = 50,
    maxJobs = 1000,
  } = {},
) {
  let port = null,
    queue = Promise.resolve(),
    pending = 0,
    stopping = false,
    blocked = false;
  const tasks = new Map();
  let jobs = store ? store.load() : [];
  if (!Array.isArray(jobs)) throw new Error('Historial de trabajos inválido');
  jobs = jobs.map((job) =>
    ['queued', 'sending'].includes(job.status)
      ? {
          ...job,
          status: job.status === 'sending' ? 'uncertain' : 'failed',
          error: 'Servicio interrumpido; no se reintentó.',
          updatedAt: new Date().toISOString(),
        }
      : job,
  );
  const persist = () => {
    try {
      store?.save(jobs);
    } catch (error) {
      blocked = true;
      throw error;
    }
  };
  persist();
  const publicJob = ({ fingerprint, scope, ...job }) => job;
  const change = (job, patch) => {
    Object.assign(job, patch, { updatedAt: new Date().toISOString() });
    persist();
  };
  function enqueue(action) {
    const result = queue.then(action);
    queue = result.catch(() => {});
    return result;
  }
  function call(target, method, ...args) {
    return new Promise((resolve, reject) => {
      let settled = false;
      const finish = (error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        target.off('error', onError);
        error ? reject(error) : resolve();
      };
      const onError = (error) => finish(error);
      const timer = setTimeout(
        () =>
          finish(
            Object.assign(failure(503, 'Tiempo de espera agotado: ' + method), {
              code: 'PRINTER_TIMEOUT',
            }),
          ),
        timeoutMs,
      );
      target.once('error', onError);
      try {
        target[method](...args, finish);
      } catch (error) {
        finish(error);
      }
    });
  }
  async function disconnect(target) {
    if (target?.isOpen) {
      try {
        await call(target, 'close');
      } catch (error) {
        blocked = true;
        throw failure(
          503,
          'No se pudo cerrar el puerto. Reinicia Printer Server antes de continuar.',
        );
      }
    }
  }
  const service = {
    isPrinterOpen: () => !blocked && (port?.isOpen ?? false),
    getConnection: () =>
      port?.isOpen ? { path: port.path, baudRate: port.baudRate } : null,
    connectPrinter: (path, baudRate = 19200) =>
      enqueue(async () => {
        if (stopping || blocked)
          throw failure(503, 'Reinicia Printer Server para continuar');
        await disconnect(port);
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
        try {
          await call(candidate, 'open');
          port = candidate;
        } catch (error) {
          // An open that completes after timeout must never become an active connection.
          if (error.code === 'PRINTER_TIMEOUT') blocked = true;
          candidate.once('open', () => {
            void disconnect(candidate).catch(() => {});
          });
          await disconnect(candidate);
          throw failure(
            503,
            (blocked
              ? 'Reinicia el servicio antes de reconectar: '
              : 'No se pudo abrir el puerto: ') + error.message,
          );
        }
      }),
    listJobs: () => jobs.filter(job => job.localPanel === true).slice(-100).reverse().map(publicJob),
    async printTicket(
      text,
      {
        openDrawer = false,
        cut,
        path,
        jobId = randomUUID(),
        scope = 'local',
        localPanel = false,
      } = {},
    ) {
      if (!/^[a-zA-Z0-9_-]{1,100}$/.test(jobId))
        throw failure(400, 'jobId inválido');
      const bytes = Buffer.isBuffer(text) ? text : Buffer.from(text, 'utf8');
      const fingerprint = createHash('sha256')
        .update(
          JSON.stringify({ cut: cut ?? null, openDrawer, path: path ?? null }),
        )
        .update(bytes)
        .digest('hex');
      const existing = jobs.find(
        (job) => job.id === jobId && job.scope === scope && Boolean(job.localPanel) === localPanel,
      );
      if (existing) {
        if (existing.fingerprint !== fingerprint)
          throw failure(
            409,
            'jobId ya utilizado con otro contenido u opciones',
          );
        return tasks.get(existing) || Promise.resolve(publicJob(existing));
      }
      if (stopping || blocked || !port?.isOpen)
        throw failure(503, 'Impresora no disponible; revisa la conexión');
      if (pending >= maxQueue)
        throw failure(429, 'Cola llena; espera antes de volver a enviar');
      const destination = port;
      if (path && path !== destination.path)
        throw failure(409, 'La impresora seleccionada cambió');
      if (jobs.length >= maxJobs) {
        const index = jobs.findIndex(
          (job) => !['queued', 'sending'].includes(job.status),
        );
        if (index < 0)
          throw failure(429, 'Historial lleno de trabajos pendientes');
        jobs.splice(index, 1);
      }
      const job = {
        id: jobId,
        scope,
        fingerprint,
        localPanel,
        ...(localPanel ? { text: bytes.toString('utf8') } : {}),
        path: destination.path,
        status: 'queued',
        createdAt: new Date().toISOString(),
      };
      jobs.push(job);
      persist();
      pending++;
      const task = enqueue(async () => {
        let sending = false;
        try {
          if (
            blocked ||
            stopping ||
            port !== destination ||
            !destination.isOpen
          )
            throw failure(503, 'Conexión cambiada o no disponible');
          const shouldCut = cut !== false;
          const payload = Buffer.concat([
            openDrawer
              ? Buffer.from([0x1b, 0x70, 0, 0x19, 0xfa])
              : Buffer.alloc(0),
            bytes,
            Buffer.from('\n\n'),
            shouldCut
              ? Buffer.from([
                  0x1d,
                  0x56,
                  0x41,
                  0,
                ])
              : Buffer.alloc(0),
          ]);
          change(job, { status: 'sending' });
          sending = true;
          await call(destination, 'write', payload);
          await call(destination, 'drain');
          change(job, { status: 'sent' });
        } catch (error) {
          if (sending) {
            port = null;
            await disconnect(destination).catch(() => {});
          }
          change(job, {
            status: sending ? 'uncertain' : 'failed',
            error: error.message,
          });
        }
        return publicJob(job);
      }).finally(() => {
        pending--;
        tasks.delete(job);
      });
      tasks.set(job, task);
      return task;
    },
    close() {
      stopping = true;
      return enqueue(async () => {
        await disconnect(port);
        port = null;
      });
    },
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
  return service;
}
module.exports = {
  ...createPrinterService(),
  createPrinterService,
};
