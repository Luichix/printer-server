const $ = selector => document.querySelector(selector);
let token;
let printers = [];
const statuses = { queued: 'En cola', sending: 'Enviando', sent: 'Enviado', failed: 'Falló', uncertain: 'Resultado incierto' };
function notice(message, error = false) { $('#notice').textContent = message; $('#notice').classList.toggle('error', error); }
async function api(url, method = 'GET', body) {
  const response = await fetch(url, { method, headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
  if (response.status === 204) return;
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'No se pudo completar la operación');
  return data;
}
function element(tag, text, className) { const el = document.createElement(tag); el.textContent = text; if (className) el.className = className; return el; }
function action(label, handler) {
  const button = element('button', label, 'secondary');
  button.type = 'button';
  button.onclick = async () => { button.disabled = true; try { await handler(); await refresh(); } catch (error) { notice(error.message, true); } finally { button.disabled = false; } };
  return button;
}
async function ports() {
  const current = $('#ports').value;
  const values = await api('/api/ports');
  $('#ports').replaceChildren(new Option(values.length ? 'Selecciona un puerto' : 'No se encontraron puertos seriales', ''));
  for (const port of values) $('#ports').add(new Option(`${port.path}${port.manufacturer ? ` · ${port.manufacturer}` : ''}`, port.path));
  $('#ports').value = current;
}
function resetForm() { $('#printer-form').reset(); $('#printer-form').elements.id.value = ''; $('#cancel-edit').hidden = true; }
async function refresh() {
  const [state, jobs] = await Promise.all([api('/api/status'), api('/api/jobs')]);
  $('#connection').textContent = state.status === 'ready' ? 'Agente activo' : 'Agente deteniéndose';
  printers = state.printers;
  $('#origins').textContent = state.allowedOrigins.length ? `Aplicaciones autorizadas: ${state.allowedOrigins.join(', ')}` : 'No hay aplicaciones externas autorizadas.';
  const selected = $('#test-printer').value;
  $('#test-printer').replaceChildren();
  $('#printers').replaceChildren();
  if (!printers.length) $('#printers').textContent = 'Todavía no hay impresoras. Conecta una y agrégala arriba.';
  for (const printer of printers) {
    $('#test-printer').add(new Option(printer.name, printer.id));
    const card = element('div', '', 'printer');
    card.append(element('strong', `${printer.name}${printer.isDefault ? ' · Predeterminada' : ''}`));
    card.append(element('p', `${printer.path} · ${printer.baudRate} baudios · ${printer.connected ? 'Conectada' : 'Desconectada'} · ${printer.pending} en cola${printer.error ? ` · ${printer.error}` : ''}`));
    const actions = element('div', '', 'actions');
    actions.append(action('Reconectar', () => api(`/api/printers/${printer.id}/connect`, 'POST')));
    actions.append(action('Editar', async () => {
      await ports();
      const form = $('#printer-form');
      for (const key of ['id', 'name', 'path', 'baudRate', 'encoding']) {
        if (['path', 'baudRate'].includes(key) && ![...form.elements[key].options].some(o => o.value === String(printer[key]))) form.elements[key].add(new Option(String(printer[key]), String(printer[key])));
        form.elements[key].value = printer[key];
      }
      form.elements.cut.checked = printer.cut; $('#cancel-edit').hidden = false; form.elements.name.focus();
    }));
    if (!printer.isDefault) actions.append(action('Usar por defecto', () => api(`/api/printers/${printer.id}/default`, 'POST')));
    actions.append(action('Quitar', async () => { if (confirm(`¿Quitar la configuración de ${printer.name}?`)) await api(`/api/printers/${printer.id}`, 'DELETE'); }));
    card.append(actions); $('#printers').append(card);
  }
  $('#test-printer').value = printers.some(p => p.id === selected) ? selected : printers.find(p => p.isDefault)?.id || printers[0]?.id || '';
  $('#jobs').replaceChildren();
  if (!jobs.length) $('#jobs').textContent = 'Las impresiones aparecerán aquí.';
  for (const job of jobs) {
    const row = element('div', '', 'job');
    row.append(element('strong', statuses[job.status] || job.status), element('span', `${printers.find(p => p.id === job.printerId)?.name || job.printerId} · ${new Date(job.createdAt).toLocaleString()}`));
    row.append(element('p', `${job.id}${job.error ? ` · ${job.error}` : ''}`, 'hint')); $('#jobs').append(row);
  }
}
$('#origins-form').onsubmit = async event => {
  event.preventDefault();
  const button = event.currentTarget.querySelector('button'); button.disabled = true;
  try {
    await api('/api/settings', 'POST', { allowedOrigins: $('#allowed-origins').value.split(/\r?\n/).map(value => value.trim()).filter(Boolean) });
    notice('Aplicaciones autorizadas guardadas. No es necesario reiniciar.'); await refresh();
  } catch (error) { notice(error.message, true); }
  finally { button.disabled = false; }
};
$('#printer-form').onsubmit = async event => {
  event.preventDefault(); const form = event.currentTarget; const button = form.querySelector('[type=submit]'); button.disabled = true;
  try {
    const values = Object.fromEntries(new FormData(form));
    if (!values.id) delete values.id;
    await api('/api/printers', 'POST', { ...values, baudRate: Number(values.baudRate), cut: form.elements.cut.checked });
    resetForm(); notice('Configuración guardada. Impresora conectada.');
  } catch (error) { notice(error.message, true); }
  finally { button.disabled = false; await refresh().catch(() => {}); }
};
$('#test-form').onsubmit = async event => {
  event.preventDefault(); const button = event.currentTarget.querySelector('button'); button.disabled = true;
  try { const job = await api('/api/jobs', 'POST', { printerId: $('#test-printer').value, text: $('#test-text').value, openDrawer: $('#drawer').checked, jobId: crypto.randomUUID() }); notice(`Prueba en cola: ${job.id}`); await refresh(); }
  catch (error) { notice(error.message, true); }
  finally { button.disabled = false; }
};
$('#refresh-ports').onclick = () => ports().catch(error => notice(error.message, true));
$('#cancel-edit').onclick = resetForm;
$('#show-token').onclick = () => { $('#credential').hidden = !$('#credential').hidden; $('#token').value = token || ''; $('#show-token').textContent = $('#credential').hidden ? 'Mostrar credencial de integración' : 'Ocultar credencial'; };
async function start() {
  try {
    const response = await fetch('/api/session');
    if (!response.ok) throw new Error('No se pudo abrir la sesión local');
    token = (await response.json()).token;
    const settings = await api('/api/settings');
    $('#allowed-origins').value = settings.allowedOrigins.join('\n');
    await Promise.all([ports(), refresh()]);
    setInterval(() => refresh().catch(() => { $('#connection').textContent = 'Agente no disponible'; }), 4000);
  } catch (error) { notice(error.message, true); $('#connection').textContent = 'No disponible'; }
}
start();
