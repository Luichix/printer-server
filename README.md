# Agente local de impresión

Servidor local con panel de configuración para impresoras térmicas seriales ESC/POS. Permite guardar varias impresoras, probar tickets y recibir trabajos de aplicaciones web autorizadas.

## Aplicación Windows

Para generar el instalador y el ZIP portable desde una computadora Windows, consulta **[Generación, instalación y futuras actualizaciones](docs/WINDOWS.md)**.

```powershell
npm.cmd run build:windows
```

Incluye Node.js, lanzador con icono junto al reloj, apertura del panel e inicio de sesión opcional. La construcción y la prueba física se realizan en Windows x64.

## Ejecutar desde el código

Requiere Node.js 22 y los controladores de la impresora instalados.

```sh
npm ci
npm start
```

Abre **http://127.0.0.1:4000**. El panel permite buscar puertos, guardar y editar impresoras, elegir la predeterminada, reconectar, imprimir pruebas y consultar actividad. No abre el navegador automáticamente.

El comando `npm start` ejecuta solo el servidor; el instalador Windows se genera por separado siguiendo la guía anterior. Una impresora USB solo es compatible si su controlador la presenta como puerto serial; las colas de impresión de Windows, USB directo, red y protocolos de etiquetas quedan para etapas posteriores.

## Configuración persistente

Se guarda fuera del programa, para conservarla al actualizar:

- Windows: `%LOCALAPPDATA%\PrinterServer`
- macOS: `~/Library/Application Support/PrinterServer`
- Linux: `$XDG_DATA_HOME/printer-server` o `~/.local/share/printer-server`

Puedes cambiarla con `PRINTER_DATA_DIR`. `state.json` contiene impresoras, predeterminada, credencial e historial de trabajos. No guarda el texto de los tickets. Conserva una copia privada de este archivo si necesitas respaldarlo; contiene una credencial de acceso. El agente no sustituye silenciosamente un archivo corrupto.

Al iniciar intenta reconectar cada impresora guardada. Si falla, conserva su configuración y muestra el error. También intenta conectar antes de un nuevo trabajo. Un archivo de bloqueo impide abrir dos agentes con el mismo directorio de datos.

Variables:

| Variable | Predeterminado | Uso |
| --- | --- | --- |
| `PORT` | `4000` | Puerto HTTP local |
| `PRINTER_DATA_DIR` | Directorio del sistema | Configuración e historial |
| `PRINTER_ALLOWED_ORIGINS` | Ninguno | Orígenes web separados por comas, sin barra final |

## Autorizar una aplicación web

El servidor escucha **solo en 127.0.0.1**. No debe exponerse a Internet. Todas las rutas de impresoras y trabajos requieren `Authorization: Bearer <credencial>`, incluso las rutas antiguas `/print`.

1. En el panel local, guarda el origen exacto de tu aplicación en **Conectar una aplicación web**, incluyendo protocolo y puerto si corresponde. También puedes usar la variable `PRINTER_ALLOWED_ORIGINS`.
2. Abre el panel local y pulsa **Mostrar credencial de integración**.
3. Configura esa credencial en la integración de ese equipo. No la publiques en el código ni la compartas entre instalaciones.

Ejemplo en PowerShell (sustituye el dominio):

```powershell
$env:PRINTER_ALLOWED_ORIGINS = 'https://pos.ejemplo.com,https://ropa.ejemplo.com'
npm start
```

En macOS/Linux:

```sh
PRINTER_ALLOWED_ORIGINS=https://pos.ejemplo.com npm start
```

La lista de orígenes **no reemplaza la autenticación**. La credencial de esta etapa concede administración e impresión para toda la instalación local: todavía no hay aislamiento de negocios, roles ni emparejamiento temporal. No la uses como autorización multitenant. Los orígenes guardados desde el panel se aplican inmediatamente. Cambiar la variable de entorno requiere reiniciar el agente; sus valores se suman a los guardados.

El panel obtiene su sesión únicamente desde su propio origen. Las aplicaciones externas no pueden consultar `/api/session`. Se validan tanto el Host como el Origin de las solicitudes. El navegador puede pedir permiso para acceder al equipo/red local; la integración HTTPS debe validarse en el navegador de destino.

## API

Todas las rutas siguientes requieren la credencial:

| Método | Ruta | Función |
| --- | --- | --- |
| GET | `/api/status` | Estado y aplicaciones autorizadas |
| GET / POST | `/api/settings` | Consultar/guardar orígenes, solo desde el panel local |
| GET | `/api/ports` | Puertos seriales detectados |
| GET | `/api/printers` | Configuración, conexión y cola |
| POST | `/api/printers` | Crear o editar por `id`; guarda y espera la conexión |
| POST | `/api/printers/:id/connect` | Reconectar |
| POST | `/api/printers/:id/default` | Elegir predeterminada |
| DELETE | `/api/printers/:id` | Quitar configuración, sin trabajos pendientes |
| POST | `/api/jobs` | Encolar un ticket; devuelve 202 y su estado |
| GET | `/api/jobs` | Últimos 100 trabajos |
| GET | `/api/jobs/:id` | Consultar un trabajo |

Configurar una impresora:

```json
{
  "id": "caja-1",
  "name": "Tickets Caja 1",
  "path": "COM4",
  "baudRate": 19200,
  "encoding": "utf8",
  "cut": true
}
```

El puerto debe aparecer en la lista detectada. Cada puerto solo puede asignarse a una configuración. `id` es opcional al crear. Un fallo de conexión devuelve 503, pero conserva la configuración para reconectarla. Se admiten `utf8`, `ascii` y `latin1`; la página de caracteres de la impresora debe ser compatible. No hay conversión automática a páginas ESC/POS como CP850.

Enviar un trabajo desde la aplicación web:

```js
const response = await fetch('http://127.0.0.1:4000/api/jobs', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${credencialLocal}`,
  },
  body: JSON.stringify({
    jobId: 'venta-123-original',
    printerId: 'caja-1',
    text: 'TIENDA\nProducto      150.00\nTOTAL         150.00',
    openDrawer: false,
  }),
});
const trabajo = await response.json();
if (!response.ok) throw new Error(trabajo.error);
// Consulta /api/jobs/:id con la misma credencial hasta obtener un estado final.
```

`printerId` puede omitirse para usar la predeterminada. Es preferible enviarlo explícitamente en integraciones para evitar cambios de destino. La gaveta **no se abre por defecto**: solicita `openDrawer: true` solo cuando corresponda. El corte sigue la configuración de la impresora. No se permiten comandos ESC/POS incrustados en el texto. El máximo es 32 KB de texto y 100 trabajos pendientes por impresora.

### Cola, duplicados y estados

Cada impresora procesa sus trabajos en orden. Impresoras diferentes pueden trabajar simultáneamente. Se espera la apertura del puerto y la escritura y vaciado del búfer (`drain`); hay un límite de 10 segundos por operación serial.

- `queued`: recibido y guardado en la cola.
- `sending`: comenzó el proceso de envío.
- `sent`: datos entregados al puerto. **No confirma que salió papel**; muchos equipos seriales no reportan ese estado.
- `failed`: no se inició el envío del ticket.
- `uncertain`: pudo enviarse parcial o totalmente; revisa físicamente antes de repetir.

Usa un `jobId` estable por intento de impresión. Reenviar el mismo identificador y contenido devuelve el trabajo existente. Otro contenido con el mismo identificador devuelve 409. Una reimpresión deliberada necesita un identificador nuevo. Si omites el identificador, el servidor genera uno y no puede deduplicar solicitudes posteriores independientes.

Se conservan hasta 1.000 trabajos; la protección contra duplicados solo abarca ese historial. Los resultados se guardan entre reinicios. Los trabajos que estaban enviándose quedan como inciertos; los que estaban en cola quedan fallidos. **No se reimprimen automáticamente al reiniciar**. La cola pendiente conserva el texto únicamente en memoria.

### Migración de la integración anterior

Se conservan `GET /print/list`, `POST /print/select` y `POST /print`.

Cambios necesarios:

1. Autorizar el origen y enviar la credencial en todas las solicitudes.
2. `/print/select` ahora espera la conexión real antes de devolver `connected`.
3. `/print` espera el resultado y devuelve `sent`, `failed` o `uncertain`, con `jobId`. Ya no devuelve `printed`.
4. Enviar `openDrawer: true` cuando la operación deba abrir la gaveta.
5. Añadir un `jobId` estable para evitar duplicados por reintentos de red.

## Verificación

```sh
npm test
```

Pruebas con puertos simulados: persistencia, recuperación tras reinicios, orden de cola, bytes de gaveta/corte, fallos de conexión y drenaje, tiempos de espera, duplicados, validación y protección HTTP. Requieren permiso para abrir un puerto temporal en localhost.

Antes de usar en caja, probar con la impresora real: conexión, tildes, corte, gaveta, desconexión del cable y reinicio. Esta base no implementa todavía impresión de etiquetas, permisos por cajero/administrador ni integración con Clothing SaaS.
