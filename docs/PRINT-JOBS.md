# Trabajos, corte y gaveta

El SaaS controla las acciones mediante parámetros JSON en POST /print. No hay perfiles ni controles de corte o gaveta en el panel.

- `cut: true`: corte completo al terminar. `cut: false`: sin corte. Si se omite, conserva el corte por compatibilidad.
- `openDrawer: true`: pulso de gaveta antes del texto; si se omite o es false, no abre. No requiere habilitación local.
- El panel imprime siempre sin corte ni gaveta mediante POST /print/local, accesible únicamente desde el panel local.
- La pestaña Ajustes contiene la conexión y los sitios autorizados.
- El transporte sigue siendo serial ESC/POS, sin agregar ZPL/TSPL ni calibración de etiquetas. El dispositivo debe ser compatible con los comandos enviados.

## Integración SaaS

```js
// Crear una vez por intento lógico y guardar junto al envío en el SaaS.
const jobId = crypto.randomUUID();
const body = { jobId, text: finalTicket, cut: true, openDrawer: false };
const response = await fetch('http://localhost:4000/print', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});
const result = await response.json();
```

Los reintentos de red deben conservar el mismo jobId, texto y opciones. El mismo identificador con contenido distinto devuelve 409. Una reimpresión intencional debe generar otro jobId. La protección se aplica por origen y a los últimos 1000 trabajos retenidos, incluso después de reiniciar. Sin jobId las llamadas anteriores siguen funcionando, pero no se pueden reconocer sus reintentos. No hay garantía de exactamente una impresión física.

La respuesta enviada conserva `status: "sent"` y añade `jobId`. Los resultados `failed` o `uncertain` devuelven HTTP 503 junto con estado, jobId y error. No generar otro identificador automáticamente ante un 503 ni reenviar automáticamente un resultado incierto: revisar el papel primero. Repetir un identificador ya registrado devuelve su resultado, incluso si actualmente no hay conexión.

Máximo 50 trabajos pendientes; al llenarse responde 429. Cada operación serial tiene 10 segundos de espera. Un fallo durante escritura o drenaje marca el resultado incierto y desconecta la impresora; si no puede cerrar el puerto o una apertura vence, exige reiniciar el servicio. No se reconecta ni reimprime automáticamente un trabajo incierto.

El registro persistente está en `%LOCALAPPDATA%\PrinterServer\jobs.json`. Los trabajos del SaaS guardan metadatos para evitar duplicados, sin guardar el texto ni aparecer en el historial visible.

Solo los trabajos creados mediante la ruta local protegida se muestran en GET /print/jobs. Su texto se conserva para reimprimir después de reiniciar, hasta su eliminación por el límite de 1000 trabajos compartido. Los registros anteriores sin identificación local no se muestran.

El panel muestra los últimos 100 trabajos locales. Los enviados tienen botón Reimprimir: crea un nuevo trabajo hacia la impresora seleccionada actualmente, sin corte ni gaveta. Los fallidos o inciertos no tienen reimpresión directa. La ruta local valida máximo 4 líneas y 4000 caracteres sin comandos. Los sitios externos no pueden usarla ni marcar un trabajo público como local mediante parámetros.

El servidor no conoce las cancelaciones de ventas: la autorización de una nueva impresión solicitada por el SaaS sigue correspondiendo al SaaS. El panel no ofrece acceso ni reimpresión de sus tickets.

## Validación manual pendiente

No se han ejecutado pruebas ni empaquetado durante esta modificación. Verifica parámetros de corte y gaveta desde el SaaS, aislamiento del historial, reimpresión local a la impresora seleccionada, pestaña Ajustes, duplicados y recuperación tras reiniciar. Después reconstruye el ejecutable para distribuir esta versión.
