(() => {
  const panel = document.getElementById('sites-panel');
  const form = document.getElementById('site-form');
  const input = document.getElementById('site-url');
  const list = document.getElementById('sites-list');
  const status = document.getElementById('sites-status');
  let working = false;
  let readOnly = true;
  function feedback(text, error = false) {
    status.textContent = text;
    status.classList.toggle('invalid', error);
  }
  function controls() {
    input.disabled = working || readOnly;
    form.querySelector('button').disabled = working || readOnly;
    list.querySelectorAll('button').forEach(button => { button.disabled = working || readOnly; });
    document.getElementById('sites-refresh').disabled = working;
  }
  async function request(url, body) {
    const response = await fetch(url, {
      cache: 'no-store', signal: AbortSignal.timeout(10000),
      ...(body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'No se pudo guardar el permiso.');
    return data;
  }
  function render(data) {
    readOnly = data.readOnly;
    list.replaceChildren();
    for (const origin of data.sites) {
      const item = document.createElement('li');
      const name = document.createElement('span');
      name.textContent = origin;
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'button button-secondary';
      remove.textContent = 'Quitar';
      remove.setAttribute('aria-label', 'Quitar permiso a ' + origin);
      remove.addEventListener('click', () => run(async () => {
        render(await request('/settings/sites/remove', { url: origin }));
        feedback('Permiso eliminado. Los nuevos envíos de ese sitio serán rechazados.');
      }));
      item.append(name, remove);
      list.append(item);
    }
    if (!data.sites.length) {
      const item = document.createElement('li');
      item.textContent = 'Todavía no has autorizado ningún sitio.';
      item.className = 'sites-empty';
      list.append(item);
    }
    document.getElementById('sites-locked').hidden = !readOnly;
  }
  async function run(task) {
    if (working) return;
    working = true;
    controls();
    try { await task(); }
    catch (error) { feedback(error.name === 'TimeoutError' ? 'La respuesta tardó demasiado. Actualiza la lista para comprobar si el cambio se guardó.' : error.message, true); }
    finally { working = false; controls(); }
  }
  function reload() {
    return run(async () => { render(await request('/settings/sites')); feedback('Los cambios se guardan y aplican inmediatamente.'); });
  }
  panel.addEventListener('toggle', () => { if (panel.open) reload(); });
  document.getElementById('sites-refresh').addEventListener('click', reload);
  input.addEventListener('input', () => {
    try {
      const url = new URL(input.value.trim());
      document.getElementById('site-preview').textContent = 'Se autorizará: ' + url.origin + ' (todas sus páginas).';
    } catch { document.getElementById('site-preview').textContent = 'Puedes pegar la URL completa; solo se guarda su origen.'; }
  });
  form.addEventListener('submit', event => {
    event.preventDefault();
    run(async () => {
      const data = await request('/settings/sites', { url: input.value });
      render(data);
      input.value = '';
      document.getElementById('site-preview').textContent = 'Puedes pegar la URL completa; solo se guarda su origen.';
      feedback('Autorizado: ' + data.origin + '. Ya puede enviar impresiones.');
    });
  });
  controls();
})();

