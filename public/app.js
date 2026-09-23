const byId = id => document.getElementById(id);
const container = byId('printer-cards');
let selectedPrinter = null;
let busy = false;
let online = false;
const normalize = text => text.replace(/\r\n?/g, '\n');
const editor = () => byId('multiline').checked ? byId('print-textarea') : byId('print-input');
const currentText = () => normalize(editor().value);
function validate(text) {
  if (!text.trim()) return 'Escribe o pega un texto para imprimir.';
  if (text.split('\n').length > 4) return 'Máximo 4 líneas. Edita el texto antes de imprimir.';
  if (text.length > 4000 || new TextEncoder().encode(text).length > 16384) return 'El texto supera el máximo de 4000 caracteres o el tamaño permitido.';
  if (/[\x00-\x08\x0b-\x1f\x7f]/.test(text)) return 'El texto contiene caracteres de control no permitidos.';
  return '';
}
function icon(name) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.classList.add('icon');
  svg.setAttribute('aria-hidden', 'true');
  const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
  use.setAttribute('href', '#i-' + name);
  svg.append(use);
  return svg;
}
function message(text = '', tone = 'info') {
  byId('status').textContent = text;
  byId('status').dataset.tone = tone;
  byId('status').hidden = !text;
}
function serverState(value) {
  online = value;
  byId('server-badge').className = 'server-state ' + (value ? 'online' : 'offline');
  byId('server-label').textContent = value ? 'Servicio activo' : 'Sin conexión';
}
async function request(url, body) {
  let response;
  try {
    response = await fetch(url, {
      ...(body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(15000),
    });
  } catch (error) {
    selectedPrinter = null;
    serverState(false);
    throw new Error(error.name === 'TimeoutError'
      ? 'La operación tardó demasiado. Comprueba el papel antes de repetir el envío para evitar duplicados.'
      : 'No se pudo contactar al servicio. Comprueba que Printer Server siga abierto.');
  }
  let result;
  try { result = await response.json(); }
  catch { throw new Error('El servicio devolvió una respuesta inesperada. Actualiza la página.'); }
  if (!response.ok) throw new Error(result.error || 'No se pudo completar la operación.');
  serverState(true);
  return result;
}
function updateControls() {
  container.querySelectorAll('.printer-card').forEach(card => {
    const active = card.dataset.path === selectedPrinter;
    card.classList.toggle('selected', active);
    const label = card.querySelector('.connection-label');
    label.replaceChildren();
    if (active) label.append(icon('check'));
    label.append(document.createTextNode(active ? 'Conectada' : 'Puerto disponible'));
    const select = card.querySelector('.select-button');
    select.textContent = active ? 'Seleccionada' : 'Seleccionar';
    select.setAttribute('aria-pressed', String(active));
    select.disabled = busy || active || !online;
  });
  document.querySelectorAll('.reprint-button').forEach(button => { button.disabled = busy || !selectedPrinter || !online; });
  byId('refresh-jobs').disabled = busy;
  byId('refresh').disabled = busy;
  byId('reconnect').disabled = busy || !selectedPrinter || !online;
  byId('baud-rate').disabled = busy;
  byId('multiline').disabled = busy;
  byId('print-input').disabled = busy || byId('multiline').checked;
  byId('print-textarea').disabled = busy || !byId('multiline').checked;
  byId('paste-print').disabled = busy || !selectedPrinter || !online;
  const text = currentText();
  byId('print-button').disabled = busy || !selectedPrinter || !online || Boolean(validate(text));
  byId('print-destination').textContent = selectedPrinter ? 'Destino: ' + selectedPrinter : 'Selecciona una impresora para continuar.';
  const lines = text.length ? text.split('\n').length : 0;
  byId('text-limit').textContent = lines + ' de 4 líneas · ' + text.length + ' / 4000 caracteres';
  byId('text-limit').classList.toggle('invalid', Boolean(text && validate(text)));
  editor().setAttribute('aria-invalid', String(Boolean(text && validate(text))));
  container.setAttribute('aria-busy', String(busy));
}
async function action(task) {
  if (busy) return;
  busy = true;
  updateControls();
  try { await task(); }
  catch (error) { message(error.message, 'error'); }
  finally { busy = false; updateControls(); }
}
function setEditorText(text, multiline = text.includes('\n')) {
  byId('multiline').checked = multiline;
  byId('print-input').hidden = multiline;
  byId('print-textarea').hidden = !multiline;
  byId('text-label').htmlFor = multiline ? 'print-textarea' : 'print-input';
  editor().value = text;
  updateControls();
}
function emptyState(title, description) {
  const empty = document.createElement('div');
  empty.className = 'empty-state';
  const heading = document.createElement('h2');
  heading.textContent = title;
  const text = document.createElement('p');
  text.textContent = description;
  empty.append(icon('printer'), heading, text);
  container.replaceChildren(empty);
}
async function connect(path) {
  const baudRate = Number(byId('baud-rate').value);
  if (!Number.isInteger(baudRate) || baudRate < 1 || baudRate > 4000000) {
    showView('settings');
    byId('baud-rate').closest('details').open = true;
    throw new Error('Introduce una velocidad válida en Ajustes de conexión.');
  }
  selectedPrinter = null;
  updateControls();
  message('Conectando con ' + path + '…');
  const result = await request('/print/select', { path, baudRate });
  selectedPrinter = path;

  message(result.warning || 'Impresora ' + path + ' seleccionada.', result.warning ? 'error' : 'success');
}
async function printText(text) {
  const error = validate(text);
  if (error) throw new Error(error);
  if (!selectedPrinter) throw new Error('Selecciona una impresora primero.');
  const path = selectedPrinter;
  message('Enviando a ' + path + '…');
  const jobId = crypto.randomUUID();
  try { await request('/print/local', { path, text, cut: false, openDrawer: false, jobId }); }
  catch (error) { selectedPrinter = null; throw error; }
  await loadJobs().catch(() => {});
  message('Texto enviado a ' + path + '.', 'success');
}
async function loadPrinters() {
  message();
  selectedPrinter = null;
  emptyState('Buscando impresoras…', 'Consultando los puertos de este equipo.');
  try {
    const health = await request('/health');
    if (health.service !== 'printer-server') throw new Error('No se reconoce el servicio local.');
    const printers = await request('/print/list');
    if (!Array.isArray(printers)) throw new Error('No se pudo leer la lista de puertos.');
    if (!printers.length) {
      emptyState('Conecta tu primera impresora', 'Enciende y conecta una impresora con puerto COM; después pulsa Actualizar.');
      return;
    }
    container.replaceChildren();
    for (const printer of printers) {
      const card = document.createElement('article');
      card.className = 'printer-card';
      card.dataset.path = printer.path;
      const heading = document.createElement('div');
      heading.className = 'card-heading';
      const mark = document.createElement('span');
      mark.className = 'device-icon';
      mark.append(icon('printer'));
      const label = document.createElement('span');
      label.className = 'connection-label';
      heading.append(mark, label);
      const name = document.createElement('h2');
      name.textContent = printer.path;
      const meta = document.createElement('p');
      meta.textContent = printer.manufacturer || 'Impresora serial';
      const actions = document.createElement('div');
      actions.className = 'card-actions';
      const select = document.createElement('button');
      select.className = 'button button-primary select-button';
      select.setAttribute('aria-label', 'Seleccionar impresora ' + printer.path);
      select.addEventListener('click', () => action(() => connect(printer.path)));
      actions.append(select);
      card.append(heading, name, meta, actions);
      container.append(card);
    }
    if (health.printerConnected && health.printer && printers.some(printer => printer.path === health.printer.path)) {
      selectedPrinter = health.printer.path;
      if (health.printer.baudRate) byId('baud-rate').value = health.printer.baudRate;
    }
  } catch (error) {
    emptyState('No pudimos cargar las impresoras', 'Comprueba que el servicio siga abierto y vuelve a actualizar.');
    throw error;
  }
}
byId('refresh').addEventListener('click', () => action(async () => { await loadPrinters(); await loadJobs(); }));
byId('reconnect').addEventListener('click', () => action(async () => { if (selectedPrinter) await connect(selectedPrinter); }));
byId('multiline').addEventListener('change', () => {
  const multiline = byId('multiline').checked;
  const text = normalize((multiline ? byId('print-input') : byId('print-textarea')).value);
  if (!multiline && text.includes('\n')) {
    byId('multiline').checked = true;
    message('El texto contiene varias líneas. Elimina los saltos de línea para usar una sola.', 'error');
    return;
  }
  setEditorText(text, multiline);
  editor().focus();
});
for (const id of ['print-input', 'print-textarea']) {
  byId(id).addEventListener('input', updateControls);
  byId(id).addEventListener('paste', event => {
    if (!event.clipboardData) return;
    event.preventDefault();
    const target = event.target;
    const value = normalize(target.value.slice(0, target.selectionStart) + event.clipboardData.getData('text') + target.value.slice(target.selectionEnd));
    setEditorText(value, byId('multiline').checked || value.includes('\n'));
    const error = validate(value);
    message(error, error ? 'error' : 'info');
    editor().focus();
  });
}
byId('print-form').addEventListener('submit', event => {
  event.preventDefault();
  action(() => printText(currentText()));
});
byId('paste-print').addEventListener('click', () => action(async () => {
  if (!navigator.clipboard?.readText) throw new Error('Este navegador no permite leer el portapapeles. Pega el texto en el campo y pulsa Imprimir.');
  let text;
  try { text = normalize(await navigator.clipboard.readText()); }
  catch { throw new Error('No se pudo leer el portapapeles. Autoriza el acceso o pega el texto manualmente.'); }
  setEditorText(text);
  await printText(text);
}));
async function loadJobs() {
  const jobs = await request('/print/jobs');
  const labels = { queued: 'Pendiente', sending: 'Enviando', sent: 'Enviado', failed: 'Fallido', uncertain: 'Resultado incierto: revisa el papel antes de reimprimir' };
  byId('print-history').replaceChildren();
  if (!jobs.length) { const empty = document.createElement('li'); empty.textContent = 'Aún no hay trabajos registrados.'; byId('print-history').append(empty); }
  for (const job of jobs) {
    const row = document.createElement('li');
    row.textContent = job.path + ' · ' + (labels[job.status] || job.status) + ' · ' + new Date(job.createdAt).toLocaleString('es') + ' · ' + job.id;
    if (typeof job.text === 'string') {
      const content = document.createElement('pre'); content.className = 'history-text';
      content.textContent = job.text; row.append(content);
      if (job.status === 'sent') {
        const button = document.createElement('button');
        button.type = 'button'; button.className = 'button button-secondary reprint-button';
        button.textContent = 'Reimprimir';
        button.addEventListener('click', () => action(() => printText(job.text)));
        row.append(button);
      }
    }
    byId('print-history').append(row);
  }
}
function showView(view) {
  byId('printing-view').hidden = view !== 'print';
  byId('settings-view').hidden = view !== 'settings';
  byId('show-print').setAttribute('aria-pressed', String(view === 'print'));
  byId('show-settings').setAttribute('aria-pressed', String(view === 'settings'));
}
byId('show-print').addEventListener('click', () => showView('print'));
byId('show-settings').addEventListener('click', () => showView('settings'));
byId('refresh-jobs').addEventListener('click', () => action(loadJobs));
action(async () => { await loadPrinters(); await loadJobs(); });

