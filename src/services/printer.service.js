import { createHash, randomUUID } from 'node:crypto';
import { SerialPort } from 'serialport';

export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const fail = (status, message) => { throw new HttpError(status, message); };
const terminal = new Set(['sent', 'failed', 'uncertain']);
const CUT = Buffer.from([0x1d, 0x56, 0x41, 0x30]);
const OPEN_DRAWER = Buffer.from([0x1b, 0x70, 0x00, 0x19, 0xfa]);

export class PrinterManager {
  constructor(store, { Port = SerialPort, timeoutMs = 10000, maxJobs = 1000, maxQueue = 100 } = {}) {
    this.store = store;
    this.Port = Port;
    this.timeoutMs = timeoutMs;
    this.maxJobs = maxJobs;
    this.maxQueue = maxQueue;
    this.ports = new Map();
    this.errors = new Map();
    this.tails = new Map();
    this.pending = new Map();
    this.configuring = new Set();
    this.stopping = false;
    const jobs = store.state.jobs.map(job => ['queued', 'sending'].includes(job.status)
      ? { ...job, status: job.status === 'sending' ? 'uncertain' : 'failed', error: 'El agente se cerró antes de terminar. No se reintentó automáticamente.', updatedAt: new Date().toISOString() }
      : job);
    if (jobs.some((job, index) => job !== store.state.jobs[index])) this.update({ jobs });
  }

  update(patch) { this.store.save({ ...this.store.state, ...patch }); }
  async listPorts() {
    return (await this.Port.list()).map(({ path, manufacturer, serialNumber, vendorId, productId }) => ({ path, manufacturer, serialNumber, vendorId, productId }));
  }
  listPrinters() {
    return this.store.state.printers.map(printer => ({ ...printer,
      connected: this.ports.get(printer.id)?.isOpen === true,
      error: this.errors.get(printer.id) || null,
      pending: this.pending.get(printer.id) || 0,
      isDefault: printer.id === this.store.state.defaultPrinterId,
    }));
  }
  getPrinter(id) {
    return this.store.state.printers.find(printer => printer.id === id) || fail(404, 'Impresora no encontrada');
  }
  validatePrinter(input) {
    if (!input || typeof input !== 'object') fail(400, 'Configuración requerida');
    const { id = randomUUID(), name, path, baudRate = 19200, cut = true, encoding = 'utf8' } = input;
    if (typeof id !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(id)) fail(400, 'Identificador inválido');
    if (typeof name !== 'string' || !name.trim() || name.length > 100) fail(400, 'Nombre requerido (máximo 100 caracteres)');
    if (typeof path !== 'string' || !path.trim() || path.length > 256) fail(400, 'Puerto requerido');
    if (!Number.isInteger(baudRate) || baudRate < 50 || baudRate > 4000000) fail(400, 'Velocidad serial inválida');
    if (typeof cut !== 'boolean' || !['utf8', 'ascii', 'latin1'].includes(encoding)) fail(400, 'Formato de impresión inválido');
    return { id, name: name.trim(), path: path.trim(), baudRate, cut, encoding };
  }
  async configure(input) {
    if (this.stopping) fail(503, 'El agente se está cerrando');
    const printer = this.validatePrinter(input);
    if (this.configuring.size || this.pending.get(printer.id)) fail(409, 'Espera a que termine la operación actual');
    if (this.store.state.printers.some(p => p.path.toLowerCase() === printer.path.toLowerCase() && p.id !== printer.id)) fail(409, 'Ese puerto ya pertenece a otra impresora');
    this.configuring.add(printer.id);
    try {
      // Only accept ports discovered by the serial driver, never arbitrary file paths.
      if (!(await this.listPorts()).some(p => p.path === printer.path)) fail(400, 'El puerto no está disponible. Actualiza la lista de puertos');
      await this.disconnect(printer.id);
      this.update({ printers: [...this.store.state.printers.filter(p => p.id !== printer.id), printer],
        defaultPrinterId: this.store.state.defaultPrinterId || printer.id });
      await this.connect(printer.id);
      return this.listPrinters().find(p => p.id === printer.id);
    } finally { this.configuring.delete(printer.id); }
  }
  setDefault(id) { this.getPrinter(id); this.update({ defaultPrinterId: id }); }
  async remove(id) {
    this.getPrinter(id);
    if (this.configuring.size || this.pending.get(id)) fail(409, 'La impresora tiene una operación pendiente');
    this.configuring.add(id);
    try {
      await this.disconnect(id);
      const printers = this.store.state.printers.filter(p => p.id !== id);
      this.update({ printers, defaultPrinterId: this.store.state.defaultPrinterId === id ? printers[0]?.id || null : this.store.state.defaultPrinterId });
      this.errors.delete(id);
    } finally { this.configuring.delete(id); }
  }
  call(port, method, ...args) {
    return new Promise((resolve, reject) => {
      const finish = error => { clearTimeout(timer); port.off('error', onError); error ? reject(error) : resolve(); };
      const onError = error => finish(error);
      const timer = setTimeout(() => finish(new Error(`Tiempo de espera agotado (${method})`)), this.timeoutMs);
      port.once('error', onError);
      try { port[method](...args, finish); } catch (error) { finish(error); }
    });
  }
  async connect(id) {
    const printer = this.getPrinter(id);
    if (this.ports.get(id)?.isOpen) return;
    await this.disconnect(id);
    const port = new this.Port({ path: printer.path, baudRate: printer.baudRate, dataBits: 8, stopBits: 1, parity: 'none', autoOpen: false });
    this.ports.set(id, port);
    port.on('error', error => this.errors.set(id, error.message));
    port.on('close', () => this.errors.set(id, 'Impresora desconectada'));
    try {
      await this.call(port, 'open');
      this.errors.delete(id);
    } catch (error) {
      // If an OS open completes after our timeout, close that late connection.
      port.once('open', () => { if (this.ports.get(id) !== port) port.close(() => {}); });
      this.ports.delete(id);
      if (port.isOpen) port.close(() => {});
      this.errors.set(id, error.message);
      throw new HttpError(503, `No se pudo conectar: ${error.message}. La configuración quedó guardada`);
    }
  }
  async disconnect(id) {
    const port = this.ports.get(id);
    if (port?.isOpen) await this.call(port, 'close');
    this.ports.delete(id);
  }
  async reconnect(id) {
    if (this.stopping) fail(503, 'El agente se está cerrando');
    this.getPrinter(id);
    if (this.configuring.size || this.pending.get(id)) fail(409, 'Espera a que termine la operación actual');
    this.configuring.add(id);
    try { await this.connect(id); } finally { this.configuring.delete(id); }
  }
  async restore() {
    for (const printer of this.store.state.printers) {
      if (this.stopping) break;
      try { await this.reconnect(printer.id); } catch (error) { this.errors.set(printer.id, error.message); }
    }
  }
  getJob(id) { return this.store.state.jobs.find(job => job.id === id) || fail(404, 'Trabajo no encontrado'); }
  publicJob(job) { const { fingerprint, ...publicJob } = job; return publicJob; }
  listJobs() { return this.store.state.jobs.slice(-100).reverse().map(job => this.publicJob(job)); }
  changeJob(id, patch) {
    this.update({ jobs: this.store.state.jobs.map(job => job.id === id ? { ...job, ...patch, updatedAt: new Date().toISOString() } : job) });
  }
  submit(input, { wait = false } = {}) {
    if (this.stopping) fail(503, 'El agente se está cerrando');
    const { text, printerId = this.store.state.defaultPrinterId, openDrawer = false, jobId = randomUUID() } = input;
    if (typeof text !== 'string' || !text.trim() || Buffer.byteLength(text) > 32768) fail(400, 'Texto requerido (máximo 32 KB)');
    if (/[\x00-\x08\x0b-\x1f\x7f]/.test(text)) fail(400, 'El texto contiene comandos o caracteres de control no permitidos');
    if (typeof openDrawer !== 'boolean') fail(400, 'openDrawer debe ser booleano');
    if (typeof jobId !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(jobId)) fail(400, 'jobId inválido');
    const fingerprint = createHash('sha256').update(JSON.stringify({ text, printerId, openDrawer })).digest('hex');
    const existing = this.store.state.jobs.find(job => job.id === jobId);
    if (existing) {
      if (existing.fingerprint !== fingerprint) fail(409, 'Ese jobId ya se usó para otro contenido');
      return wait ? (this.tails.get(existing.printerId) || Promise.resolve()).then(() => this.publicJob(this.getJob(jobId))) : this.publicJob(existing);
    }
    const printer = this.getPrinter(printerId);
    if (this.configuring.has(printerId)) fail(409, 'Se está configurando esta impresora');
    if ((this.pending.get(printerId) || 0) >= this.maxQueue) fail(429, 'La cola de impresión está llena');
    // latin1/ascii conversion must not truncate Unicode into device control bytes.
    if (printer.encoding !== 'utf8' && [...text].some(char => char.codePointAt(0) > (printer.encoding === 'ascii' ? 127 : 255))) fail(400, 'El texto contiene caracteres incompatibles con la codificación elegida');
    const now = new Date().toISOString();
    const job = { id: jobId, printerId, fingerprint, status: 'queued', openDrawer, createdAt: now, updatedAt: now };
    let jobs = [...this.store.state.jobs];
    while (jobs.length >= this.maxJobs) {
      const index = jobs.findIndex(j => terminal.has(j.status));
      if (index < 0) fail(429, 'El historial está lleno de trabajos pendientes');
      jobs.splice(index, 1);
    }
    this.update({ jobs: [...jobs, job] });
    this.pending.set(printerId, (this.pending.get(printerId) || 0) + 1);
    const task = (this.tails.get(printerId) || Promise.resolve()).then(() => this.run(job, text, printer));
    const settled = task.catch(error => { this.errors.set(printerId, `No se pudo guardar el resultado: ${error.message}`); this.stopping = true; }).finally(() => {
      this.pending.set(printerId, this.pending.get(printerId) - 1);
      if (this.tails.get(printerId) === settled) this.tails.delete(printerId);
    });
    this.tails.set(printerId, settled);
    return wait ? settled.then(() => this.publicJob(this.getJob(jobId))) : this.publicJob(job);
  }
  async run(job, text, printer) {
    let sending = false;
    try {
      if (this.stopping) throw new Error('El agente se está cerrando');
      await this.connect(printer.id);
      this.changeJob(job.id, { status: 'sending' });
      const payload = Buffer.concat([job.openDrawer ? OPEN_DRAWER : Buffer.alloc(0), Buffer.from(`${text}\n\n`, printer.encoding), printer.cut ? CUT : Buffer.alloc(0)]);
      sending = true;
      const port = this.ports.get(printer.id);
      await this.call(port, 'write', payload);
      await this.call(port, 'drain');
      this.changeJob(job.id, { status: 'sent' });
    } catch (error) {
      this.changeJob(job.id, { status: sending ? 'uncertain' : 'failed', error: error.message });
      this.errors.set(printer.id, error.message);
      try { await this.disconnect(printer.id); } catch { /* Preserve the failed port so the next connection must close it first. */ }
    }
  }
  async shutdown() {
    this.stopping = true;
    await Promise.allSettled([...this.tails.values()]);
    // A startup/configuration connection may still be opening; wait before closing it.
    const deadline = Date.now() + this.timeoutMs * 3;
    while (this.configuring.size && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 20));
    await Promise.allSettled([...this.ports.keys()].map(id => this.disconnect(id)));
  }
}
