const byId = id => document.getElementById(id);
const container = byId('printer-cards');
const status = byId('status');
let selectedPrinter = null;
let busy = false;
let sentCount = 0;

function icon(name) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.classList.add('icon');
  svg.setAttribute('aria-hidden', 'true');
  const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
  use.setAttribute('href', '#i-' + name);
  svg.append(use);
  return svg;
}
function message(text, tone = 'info') {
  status.textContent = text;
  status.dataset.tone = tone;
}
function log(text, tone = 'info') {
  byId('activity-list').querySelector('.activity-empty')?.remove();
  const item = document.createElement('li');
  const dot = document.createElement('span');
  dot.className = 'activity-dot ' + tone;
  const label = document.createElement('span');
  label.className = 'activity-message';
  label.textContent = text;
  const time = document.createElement('time');
  const now = new Date();
  time.dateTime = now.toISOString();
  time.textContent = now.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' });
  item.append(dot, label, time);
  byId('activity-list').prepend(item);
  while (byId('activity-list').children.length > 12) byId('activity-list').lastElementChild.remove();
}
function serverState(online) {
  byId('server-badge').className = 'badge ' + (online ? 'online' : 'offline');
  byId('server-label').textContent = online ? 'Servicio local activo' : 'Servicio no disponible';
}
async function request(url, body) {
  let response;
  try {
    response = await fetch(url, {
      ...(body === undefined ? {} : {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      }),
      signal: AbortSignal.timeout(15000),
    });
  } catch (error) {
    if (error.name === 'TimeoutError') {
      throw new Error('El servicio tardó demasiado. Comprueba la impresora antes de volver a enviar para evitar duplicados.');
    }
    serverState(false);
    clearSelection();
    throw new Error('No se pudo contactar al servicio. Comprueba que Printer Server siga abierto.');
  }
  let result;
  try { result = await response.json(); }
  catch { throw new Error('El servicio devolvió una respuesta inesperada. Actualiza la página.'); }
  if (!response.ok) throw new Error(result.error || 'No se pudo completar la operación.');
  return result;
}
function clearSelection() {
  selectedPrinter = null;
  byId('selected-name').textContent = 'Sin seleccionar';
  container.querySelectorAll('.printer-card').forEach(card => {
    card.classList.remove('selected');
    card.querySelector('small').textContent = 'Disponible para conectar';
    card.querySelector('button').textContent = 'Conectar';
  });
}
function updateControls() {
  document.querySelectorAll('button').forEach(button => { button.disabled = busy; });
  byId('print-test').disabled = busy || !selectedPrinter || !byId('ticket-text').value.trim();
  byId('baud-rate').disabled = busy;
  byId('ticket-text').disabled = busy;
  byId('cut-paper').disabled = busy;
  byId('print-hint').textContent = selectedPrinter
    ? 'Destino: ' + selectedPrinter + ' · La prueba no abre la gaveta.'
    : 'Conecta una impresora para enviar el ticket.';
  container.setAttribute('aria-busy', String(busy));
}
async function action(task) {
  if (busy) return;
  busy = true;
  updateControls();
  try { await task(); }
  catch (error) { message(error.message, 'error'); log(error.message, 'error'); }
  finally { busy = false; updateControls(); }
}
function emptyState(title, text) {
  const empty = document.createElement('div');
  empty.className = 'empty-state';
  const mark = document.createElement('span');
  mark.className = 'empty-icon';
  mark.append(icon('plug'));
  const heading = document.createElement('h3');
  heading.textContent = title;
  const description = document.createElement('p');
  description.textContent = text;
  empty.append(mark, heading, description);
  container.replaceChildren(empty);
}
async function loadPrinters() {
  clearSelection();
  byId('port-count').textContent = '—';
  message('Buscando puertos disponibles…');
  emptyState('Buscando puertos', 'Consultando los dispositivos de este equipo…');
  let printers;
  try {
    const health = await request('/health');
    if (health.service !== 'printer-server') throw new Error('No se reconoce el servicio local.');
    serverState(true);
    printers = await request('/print/list');
    if (!Array.isArray(printers)) throw new Error('No se pudo leer la lista de puertos.');
  } catch (error) {
    emptyState('No pudimos cargar los puertos', 'Comprueba que el servicio esté abierto y utiliza «Actualizar puertos» para volver a intentarlo.');
    throw error;
  }
  byId('port-count').textContent = printers.length;
  container.replaceChildren();
  if (!printers.length) {
    emptyState('Conecta tu primera impresora', 'Todavía no encontramos puertos COM. Conecta y enciende tu impresora; después, actualiza los puertos.');
    message('Sin puertos disponibles. La guía de conexión puede ayudarte a identificar tu impresora.');
    log('Búsqueda completada: no se encontraron puertos COM.');
    return;
  }
  message('Selecciona un puerto y comprueba la velocidad para conectar tu impresora.');
  log('Búsqueda completada: ' + printers.length + ' puerto(s) disponible(s).');
  for (const printer of printers) {
    const card = document.createElement('article');
    card.className = 'printer-card';
    const mark = document.createElement('span');
    mark.className = 'device-icon';
    mark.append(icon('printer'));
    const info = document.createElement('div');
    info.className = 'device-info';
    const name = document.createElement('h3');
    name.textContent = printer.path;
    const meta = document.createElement('p');
    meta.textContent = printer.manufacturer || 'Dispositivo serial';
    const state = document.createElement('small');
    state.textContent = 'Disponible para conectar';
    info.append(name, meta, state);
    const connect = document.createElement('button');
    connect.className = 'button button-secondary';
    connect.textContent = 'Conectar';
    connect.setAttribute('aria-label', 'Conectar impresora en ' + printer.path);
    connect.addEventListener('click', () => action(async () => {
      if (!byId('baud-rate').reportValidity()) return;
      clearSelection();
      message('Conectando con ' + printer.path + '…');
      connect.textContent = 'Conectando…';
      try {
        await request('/print/select', { path: printer.path, baudRate: Number(byId('baud-rate').value) });
      } catch (error) {
        clearSelection();
        throw error;
      }
      selectedPrinter = printer.path;
      byId('selected-name').textContent = printer.path;
      card.classList.add('selected');
      connect.textContent = 'Reconectar';
      state.textContent = 'Conexión establecida';
      message('Impresora conectada en ' + printer.path + '. Ya puedes enviar un ticket de prueba.', 'success');
      log('Conexión establecida en ' + printer.path + '.', 'success');
    }));
    card.append(mark, info, connect);
    container.append(card);
  }
}
function updatePreview() {
  const text = byId('ticket-text').value;
  byId('ticket-preview').textContent = text || 'Escribe el contenido de tu ticket…';
  byId('character-count').textContent = text.length + ' / 4000';
  updateControls();
}
byId('refresh').addEventListener('click', () => action(loadPrinters));
byId('ticket-text').addEventListener('input', updatePreview);
byId('print-test').addEventListener('click', () => action(async () => {
  if (!selectedPrinter) return;
  const target = selectedPrinter;
  const label = byId('print-test').querySelector('span');
  label.textContent = 'Enviando ticket…';
  message('Enviando el ticket a ' + target + '…');
  try {
    await request('/print', {
      path: target, text: byId('ticket-text').value,
      cut: byId('cut-paper').checked, openDrawer: false,
    });
    sentCount++;
    byId('sent-count').textContent = sentCount;
    message('Datos enviados a ' + target + '. Comprueba que el ticket haya salido correctamente.', 'success');
    log('Ticket de prueba enviado a ' + target + '. Pendiente de comprobación en papel.', 'success');
  } catch (error) {
    clearSelection();
    throw error;
  } finally { label.textContent = 'Enviar prueba de impresión'; }
}));
document.querySelectorAll('.nav-link').forEach(link => {
  link.addEventListener('click', () => {
    document.querySelectorAll('.nav-link').forEach(item => item.classList.remove('active'));
    link.classList.add('active');
  });
});
updatePreview();
action(loadPrinters);

