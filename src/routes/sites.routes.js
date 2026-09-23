const express = require('express');

function normalizeSite(value) {
  if (typeof value !== 'string' || !value.trim() || value.length > 2048) {
    throw Object.assign(new Error('Introduce una URL válida del SaaS'), { status: 400 });
  }
  let url;
  try { url = new URL(value.trim()); }
  catch { throw Object.assign(new Error('Incluye el protocolo, por ejemplo https://ventas.example.com'), { status: 400 }); }
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (url.username || url.password || url.hostname.includes('*') ||
      (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback))) {
    throw Object.assign(new Error('Usa HTTPS sin credenciales ni comodines. HTTP solo se admite para desarrollo en localhost.'), { status: 400 });
  }
  return url.origin;
}

function createSiteRoutes({ sites, origins, localOrigins, saveOrigins, readOnly }) {
  const router = express.Router();
  const snapshot = () => ({ sites: [...sites].sort(), readOnly });
  router.use((_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });
  router.get('/', (_req, res) => res.json(snapshot()));
  function change(remove) {
    return (req, res, next) => {
      try {
        if (readOnly) return res.status(409).json({ error: 'La lista está controlada por ALLOWED_ORIGINS. Retira esa variable y reinicia para editar desde el panel.' });
        // Permitir retirar entradas antiguas aunque ya no cumplan la política de alta.
        const value = req.body?.url;
        const origin = remove && typeof value === 'string' && sites.has(value)
          ? value : normalizeSite(value);
        if (localOrigins.has(origin)) return res.status(400).json({ error: 'El panel local no necesita autorización y no se puede quitar.' });
        const updated = new Set(sites);
        if (remove) updated.delete(origin);
        else updated.add(origin);
        if (updated.size > 100) return res.status(400).json({ error: 'Máximo 100 sitios autorizados' });
        // Persistencia síncrona y atómica antes de aplicar el permiso en memoria.
        // Si falla, la lista activa permanece intacta.
        saveOrigins([...updated]);
        for (const previous of sites) if (!localOrigins.has(previous)) origins.delete(previous);
        sites.clear();
        for (const value of updated) { sites.add(value); origins.add(value); }
        console.log(remove ? 'Sitio revocado:' : 'Sitio autorizado:', origin);
        res.json({ ...snapshot(), origin });
      } catch (error) { next(error); }
    };
  }
  router.post('/', change(false));
  router.post('/remove', change(true));
  return router;
}
module.exports = { createSiteRoutes, normalizeSite };


