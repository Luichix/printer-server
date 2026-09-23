# Desarrollo y pruebas en Windows

Node se administra con **nvm-windows**. La versión del proyecto está en `.nvmrc`.
Desde PowerShell, en la raíz del proyecto:

```powershell
$nodeVersion = (Get-Content .nvmrc).Trim()
nvm install $nodeVersion
nvm use $nodeVersion
node --version
pnpm --version
pnpm install --frozen-lockfile
pnpm test
pnpm check
pnpm start
```

Usar pnpm 11.19.0. Si nvm solicita privilegios para cambiar el enlace de Node,
ejecutar ese paso en una terminal con los permisos necesarios. Comprobar con
`Get-Command node -All` que Node proviene de la instalación de nvm.
No instalar Node mediante un instalador independiente para este proyecto.

La pantalla abre en http://127.0.0.1:4000. Para iniciar sin abrir el navegador:

```powershell
$env:OPEN_BROWSER = 'false'
pnpm start
```

## Prueba física

1. Conectar la impresora y verificar su modelo y controlador en Windows.
2. Comprobar si aparece en Administrador de dispositivos como puerto COM.
3. Actualizar puertos en la aplicación, configurar la velocidad del fabricante y conectar.
4. Pulsar Imprimir prueba y comprobar el papel. La gaveta no se abre por defecto.
5. Desconectar la impresora y comprobar que el siguiente envío informa el error.

Una impresora instalada en la cola de impresión de Windows no necesariamente
expone un puerto COM. Esta primera versión solo implementa serial y tickets
ESC/POS; no implementa el spooler de Windows, red ni etiquetas ZPL/TSPL.
El texto utiliza UTF-8: tildes y caracteres especiales requieren comprobar la
codificación admitida por la impresora antes de dar la prueba por aprobada.
`sent` significa que se enviaron los bytes, no que se verificó la salida en papel.

## Conectar una aplicación web

Autorizar orígenes exactos (protocolo, dominio y puerto), separados por comas:

```powershell
$env:ALLOWED_ORIGINS = 'https://pos.example.com,https://inventario.example.com'
pnpm start
```

La API es independiente del framework del SaaS. El navegador del equipo con la
impresora llama al puente local, no el servidor remoto del SaaS.
El navegador puede exigir permisos adicionales de acceso a red local; validar
con el navegador y dominio HTTPS reales antes de distribuir.

| Método | Ruta          | Función                                               |
| ------ | ------------- | ----------------------------------------------------- |
| GET    | /health       | Estado del servicio y conexión                        |
| GET    | /print/list   | Puertos seriales disponibles                          |
| POST   | /print/select | Conectar con `path` y `baudRate`                      |
| POST   | /print        | Enviar `text`, opcionales `path`, `cut`, `openDrawer` |

Los POST requieren `Content-Type: application/json`. Ejemplo en PowerShell:

```powershell
Invoke-RestMethod http://127.0.0.1:4000/print/list
Invoke-RestMethod http://127.0.0.1:4000/print/select -Method Post -ContentType 'application/json' -Body '{"path":"COM4","baudRate":19200}'
Invoke-RestMethod http://127.0.0.1:4000/print -Method Post -ContentType 'application/json' -Body '{"path":"COM4","text":"Ticket de prueba","openDrawer":false}'
```

El servicio escucha solo en loopback y rechaza orígenes desconocidos y hosts
ajenos. Esto no sustituye autenticación: los programas locales pueden llamar a
la API. Todavía no existe aislamiento por tenant, emparejamiento ni identidad
de cliente. Hay una impresora seleccionada globalmente. Enviar `path` permite
rechazar una impresión si otro cliente cambió la selección.

## Siguientes etapas

1. Validar ticket físico y modelo real; definir codificación y transporte.
2. Añadir emparejamiento, permisos por aplicación/tenant, trabajos con identificador,
   prevención de duplicados y selección de impresora por trabajo.
3. Implementar etiquetas y códigos de barras según el lenguaje del hardware.
4. Elegir y probar empaquetado compatible con Node y los módulos nativos seriales.
5. Crear instalador y validar instalación, actualización y desinstalación en otro equipo.

El archivo histórico `dist/printer-server.exe` no representa los cambios actuales.
No se ha regenerado ni validado. `dist/` queda reservado para artefactos generados;
el binario previamente versionado se conserva para no eliminarlo sin revisión.

## Dependencias

`pnpm-lock.yaml` fija las resoluciones. La configuración bloquea scripts de
dependencias no autorizados y solo permite la compilación nativa de
`@serialport/bindings-cpp@12.0.1`; exige un día de antigüedad para nuevas
resoluciones y bloquea subdependencias de fuentes exóticas.
Esto reduce riesgos, no garantiza por sí solo la seguridad de los paquetes.

Referencias: https://github.com/coreybutler/nvm-windows y
https://github.com/pnpm/pnpm.io/blob/main/docs/supply-chain-security.md.

## Recibos enviados desde el SaaS

La API /print no aplica el límite de cuatro líneas de la interfaz manual.
Admite hasta 16 KiB de texto, normaliza CRLF y CR a LF y acepta ESC ! n
como comando de modo de impresión integrado en text. Su parámetro se envía
como un byte, separado de la codificación UTF-8 del texto. Cuando se utiliza,
el modo se establece en cero al principio y se restaura a cero al final para
no dejar la fuente alterada para el siguiente trabajo.

Otros comandos de control se rechazan con un error específico. El corte y
la gaveta se solicitan mediante cut y openDrawer. Esta compatibilidad no
implementa todos los comandos ESC/POS ni lenguajes de etiquetas.
Los acentos siguen dependiendo de la codificación admitida por la impresora.

El SaaS debe leer el JSON de error de la respuesta en lugar de mostrar siempre
que el servidor está apagado: un HTTP 400 significa que la solicitud llegó
pero su contenido u opciones no son válidos.

## Administración exclusiva desde el panel local

Los sitios web externos, aunque estén autorizados para imprimir, reciben 403
al consultar /print/list o modificar /print/select, incluido el preflight.
Solo el panel de localhost/127.0.0.1 en el puerto configurado puede administrar
las impresoras. Las solicitudes administrativas sin Origin necesitan evidencia
del panel local mediante Fetch Metadata o Referer; no basta con omitir Origin.

GET /health devuelve a sitios externos únicamente service y status. No revela
el puerto, velocidad ni estado de la impresora. POST /print continúa imprimiendo
en la conexión seleccionada manualmente. Su campo path opcional solo comprueba
que coincide con ella; no cambia la selección ni abre otro puerto.

Se conserva la reconexión automática de la impresora guardada. El panel no puede
incluirse en un iframe. Estas restricciones protegen frente a sitios externos en
navegadores; no autentican software local capaz de falsificar encabezados HTTP.

Se actualizaron los casos de prueba de acceso; no se ejecutaron en esta entrega.
