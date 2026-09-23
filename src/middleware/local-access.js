// El origen identifica al sitio en un navegador, no autentica programas locales.
function createLocalAccess(localHosts) {
  const localOrigins = new Set([...localHosts].map(host => 'http://' + host));
  function isLocalPanel(req) {
    if (!localHosts.has(req.headers.host)) return false;
    const origin = req.headers.origin;
    if (origin !== undefined) {
      if (!localOrigins.has(origin)) return false;
      const site = req.headers['sec-fetch-site'];
      return !site || site === 'same-origin' || site === 'same-site';
    }
    // Los GET del panel pueden omitir Origin. No aceptar su ausencia por sí sola.
    if (req.headers['sec-fetch-site'] === 'same-origin') return true;
    if (req.headers['sec-fetch-site']) return false;
    try {
      return new URL(req.headers.referer).origin === 'http://' + req.headers.host;
    } catch { return false; }
  }
  function requireLocalPanel(req, res, next) {
    if (!isLocalPanel(req)) {
      return res.status(403).json({ error: 'Esta operación solo está disponible desde el panel local de Printer Server' });
    }
    next();
  }
  return { isLocalPanel, requireLocalPanel };
}
module.exports = { createLocalAccess };

